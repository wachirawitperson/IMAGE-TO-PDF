/**
 * PDF LAB — Client-side Working PDF Tools
 * 100% Local-only processing, 0 external network requests
 * Tools:
 *  - merge-pdf (รวม PDF)
 *  - split-pdf (แยก PDF)
 *  - organize-pdf (จัดหน้า PDF)
 *  - pdf-to-image (PDF → รูปภาพ)
 *  - page-number (ใส่เลขหน้า)
 *  - ocr-pdf (OCR PDF)
 */

(function() {
  'use strict';

  // --- Shared Utilities Access ---
  const utils = () => window.__APP_UTILS__ || {};
  const showToast = (msg, type) => (utils().showToast ? utils().showToast(msg, type) : console.log(msg));
  const downloadBlob = (blob, name) => (utils().downloadBlob ? utils().downloadBlob(blob, name) : null);
  const formatFileSize = (bytes) => (utils().formatFileSize ? utils().formatFileSize(bytes) : `${bytes} B`);
  const showProgressModal = () => utils().showProgressModal && utils().showProgressModal();
  const hideProgressModal = () => utils().hideProgressModal && utils().hideProgressModal();
  const updateProgress = (cur, tot, msg) => utils().updateProgress && utils().updateProgress(cur, tot, msg);

  // --- Helper: Read PDF and detect encryption/password ---
  async function loadPdfDocument(fileOrBlob) {
    let buffer;
    if (fileOrBlob instanceof ArrayBuffer) {
      buffer = fileOrBlob;
    } else {
      buffer = await fileOrBlob.arrayBuffer();
    }

    try {
      if (!window.PDFLib || !window.PDFLib.PDFDocument) {
        throw new Error('ไลบรารี PDF-Lib ไม่พร้อมใช้งาน');
      }
      const pdfDoc = await window.PDFLib.PDFDocument.load(buffer, { ignoreEncryption: false });
      return { buffer, pdfDoc, pageCount: pdfDoc.getPageCount() };
    } catch (err) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('encrypt') || msg.includes('password') || err.name === 'EncryptedPDFError') {
        throw new Error('ไฟล์นี้มีการเข้ารหัสด้วยรหัสผ่าน ไม่สามารถประมวลผลได้');
      }
      throw new Error('ไม่สามารถเปิดไฟล์ PDF นี้ได้ ไฟล์อาจเสียหายหรือไม่สมบูรณ์');
    }
  }

  // --- Helper: Render PDF Page to Canvas / DataURL ---
  async function renderPdfThumbnail(buffer, pageNum = 1, scale = 0.35) {
    if (!window.pdfjsLib) {
      throw new Error('PDF.js renderer not loaded');
    }
    const loadingTask = window.pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl;
  }

  // --- Helper: Render Full Page to Canvas ---
  async function renderPdfPageFull(buffer, pageNum = 1, scale = 2.0) {
    if (!window.pdfjsLib) throw new Error('PDF.js not loaded');
    const loadingTask = window.pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  }

  // --- Helper: Parse Range String (e.g. "1-3, 5, 8-10") ---
  function parsePageRange(rangeStr, maxPages) {
    const selected = new Set();
    if (!rangeStr || !rangeStr.trim()) return selected;
    const parts = rangeStr.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (trimmed.includes('-')) {
        const [startStr, endStr] = trimmed.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          const from = Math.max(1, Math.min(start, end));
          const to = Math.min(maxPages, Math.max(start, end));
          for (let i = from; i <= to; i++) selected.add(i);
        }
      } else {
        const p = parseInt(trimmed, 10);
        if (!isNaN(p) && p >= 1 && p <= maxPages) {
          selected.add(p);
        }
      }
    }
    return selected;
  }

  // ==========================================================================
  // TOOL 2: รวม PDF (Merge PDF)
  // ==========================================================================
  const mergeState = {
    files: [], // Array of { id, file, name, size, pageCount, buffer }
    sortable: null
  };

  function initMergeTool() {
    const fileInput = document.getElementById('fileInputMerge');
    const dropZone = document.getElementById('mergeDropZone');
    const btnSelect = document.getElementById('btnSelectMergePdf');
    const btnAddMore = document.getElementById('btnAddMoreMergePdf');
    const btnClear = document.getElementById('btnClearMergePdf');
    const btnExecute = document.getElementById('btnExecuteMerge');

    if (!fileInput || !dropZone) return;

    btnSelect?.addEventListener('click', () => fileInput.click());
    btnAddMore?.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('click', (e) => {
      if (e.target.closest('#btnSelectMergePdf')) return;
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) await handleMergeFiles(files);
      fileInput.value = '';
    });

    setupDropZoneEvents(dropZone, async (files) => {
      await handleMergeFiles(files);
    });

    btnClear?.addEventListener('click', () => {
      mergeState.files = [];
      renderMergeUI();
      showToast('ล้างรายการไฟล์ PDF ทั้งหมดแล้ว', 'info');
    });

    btnExecute?.addEventListener('click', executeMerge);
  }

  async function handleMergeFiles(files) {
    const pdfFiles = files.filter(f => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf');
    if (pdfFiles.length === 0) {
      showToast('กรุณาเลือกไฟล์เอกสาร PDF เท่านั้น', 'error');
      return;
    }

    showProgressModal();
    updateProgress(0, pdfFiles.length, 'กำลังตรวจสอบไฟล์ PDF...');

    let loaded = 0;
    for (let i = 0; i < pdfFiles.length; i++) {
      const file = pdfFiles[i];
      updateProgress(i + 1, pdfFiles.length, `กำลังอ่าน "${file.name}"...`);
      try {
        const loadedPdf = await loadPdfDocument(file);
        mergeState.files.push({
          id: 'merge_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          file,
          name: file.name,
          size: file.size,
          pageCount: loadedPdf.pageCount,
          buffer: loadedPdf.buffer
        });
        loaded++;
      } catch (err) {
        console.warn('Merge PDF Load Error:', err);
        showToast(err.message || `ไม่สามารถเปิด "${file.name}" ได้`, 'error');
      }
    }

    hideProgressModal();
    if (loaded > 0) {
      renderMergeUI();
      showToast(`เพิ่มไฟล์ PDF สำเร็จ ${loaded} ไฟล์`, 'success');
    }
  }

  function renderMergeUI() {
    const uploadScreen = document.getElementById('mergeUploadScreen');
    const workspaceScreen = document.getElementById('mergeWorkspaceScreen');
    const fileListEl = document.getElementById('mergeFileList');
    const countBadge = document.getElementById('mergeFileCount');
    const summaryFiles = document.getElementById('mergeSummaryFiles');
    const summaryPages = document.getElementById('mergeSummaryPages');

    if (!uploadScreen || !workspaceScreen) return;

    if (mergeState.files.length === 0) {
      uploadScreen.classList.remove('hidden');
      workspaceScreen.classList.add('hidden');
      if (fileListEl) fileListEl.innerHTML = '';
      return;
    }

    uploadScreen.classList.add('hidden');
    workspaceScreen.classList.remove('hidden');

    const totalPages = mergeState.files.reduce((acc, f) => acc + f.pageCount, 0);
    if (countBadge) countBadge.textContent = `${mergeState.files.length} ไฟล์`;
    if (summaryFiles) summaryFiles.textContent = `${mergeState.files.length} ไฟล์`;
    if (summaryPages) summaryPages.textContent = `${totalPages} หน้า`;

    if (fileListEl) {
      fileListEl.innerHTML = '';
      mergeState.files.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = 'pdf-file-item';
        card.dataset.id = item.id;
        card.innerHTML = `
          <div class="pdf-file-handle" title="ลากเพื่อสลับตำแหน่ง">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
          </div>
          <span class="pdf-file-index">#${idx + 1}</span>
          <div class="pdf-file-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div class="pdf-file-info">
            <span class="pdf-file-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
            <div class="pdf-file-meta">
              <span>${item.pageCount} หน้า</span>
              <span>•</span>
              <span>${formatFileSize(item.size)}</span>
            </div>
          </div>
          <button type="button" class="btn-remove-file" title="ลบไฟล์นี้ออก" aria-label="ลบไฟล์">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        `;

        card.querySelector('.btn-remove-file').addEventListener('click', () => {
          const index = mergeState.files.findIndex(f => f.id === item.id);
          if (index !== -1) {
            mergeState.files.splice(index, 1);
            renderMergeUI();
          }
        });

        fileListEl.appendChild(card);
      });

      // Setup SortableJS for drag reorder
      if (window.Sortable) {
        if (mergeState.sortable) mergeState.sortable.destroy();
        mergeState.sortable = new window.Sortable(fileListEl, {
          animation: 150,
          handle: '.pdf-file-handle',
          ghostClass: 'sortable-ghost',
          onEnd: function(evt) {
            if (evt.oldIndex !== evt.newIndex) {
              const [moved] = mergeState.files.splice(evt.oldIndex, 1);
              mergeState.files.splice(evt.newIndex, 0, moved);
              renderMergeUI();
            }
          }
        });
      }
    }
  }

  async function executeMerge() {
    if (mergeState.files.length < 1) {
      showToast('กรุณาเพิ่มไฟล์ PDF ก่อนทำการรวม', 'error');
      return;
    }

    const filenameInput = document.getElementById('mergeOutputFilename');
    let rawName = (filenameInput?.value || 'merged').trim();
    if (rawName.toLowerCase().endsWith('.pdf')) rawName = rawName.slice(0, -4);
    const filename = `${rawName || 'merged'}.pdf`;

    showProgressModal();
    try {
      const mergedPdf = await window.PDFLib.PDFDocument.create();
      const total = mergeState.files.length;

      for (let i = 0; i < total; i++) {
        const item = mergeState.files[i];
        updateProgress(i + 1, total, `กำลังรวม "${item.name}"... (${i + 1}/${total})`);
        const srcDoc = await window.PDFLib.PDFDocument.load(item.buffer);
        const copiedPages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
        copiedPages.forEach(p => mergedPdf.addPage(p));
        await new Promise(r => setTimeout(r, 0));
      }

      updateProgress(total, total, 'กำลังจัดทำไฟล์ PDF รวม...');
      const mergedBytes = await mergedPdf.save();
      downloadBlob(new Blob([mergedBytes], { type: 'application/pdf' }), filename);
      hideProgressModal();
      showToast(`รวม PDF สำเร็จ (${mergedPdf.getPageCount()} หน้า) กำลังเริ่มดาวน์โหลด...`, 'success');
    } catch (err) {
      console.warn('Merge execution error:', err);
      hideProgressModal();
      showToast('เกิดข้อผิดพลาดในการรวมไฟล์: ' + err.message, 'error');
    }
  }

  // ==========================================================================
  // TOOL 3: แยก PDF (Split / Extract PDF)
  // ==========================================================================
  const splitState = {
    file: null,
    buffer: null,
    totalPages: 0,
    selectedPages: new Set()
  };

  function initSplitTool() {
    const fileInput = document.getElementById('fileInputSplit');
    const dropZone = document.getElementById('splitDropZone');
    const btnSelect = document.getElementById('btnSelectSplitPdf');
    const btnClear = document.getElementById('btnClearSplitPdf');
    const btnSelectAll = document.getElementById('btnSplitSelectAll');
    const btnDeselectAll = document.getElementById('btnSplitDeselectAll');
    const btnApplyRange = document.getElementById('btnSplitApplyRange');
    const rangeInput = document.getElementById('splitRangeInput');
    const btnExecute = document.getElementById('btnExecuteSplit');

    if (!fileInput || !dropZone) return;

    btnSelect?.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('click', (e) => {
      if (e.target.closest('#btnSelectSplitPdf')) return;
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      const file = (e.target.files || [])[0];
      if (file) await handleSplitFile(file);
      fileInput.value = '';
    });

    setupDropZoneEvents(dropZone, async (files) => {
      if (files[0]) await handleSplitFile(files[0]);
    });

    btnClear?.addEventListener('click', () => {
      splitState.file = null;
      splitState.buffer = null;
      splitState.totalPages = 0;
      splitState.selectedPages.clear();
      renderSplitUI();
    });

    btnSelectAll?.addEventListener('click', () => {
      for (let i = 1; i <= splitState.totalPages; i++) splitState.selectedPages.add(i);
      updateSplitSelections();
    });

    btnDeselectAll?.addEventListener('click', () => {
      splitState.selectedPages.clear();
      updateSplitSelections();
    });

    btnApplyRange?.addEventListener('click', () => {
      const rangeVal = rangeInput?.value || '';
      const parsed = parsePageRange(rangeVal, splitState.totalPages);
      if (parsed.size === 0) {
        showToast('กรุณาระบุช่วงหน้าที่ถูกต้อง เช่น 1-3, 5', 'error');
        return;
      }
      splitState.selectedPages = parsed;
      updateSplitSelections();
      showToast(`เลือกแล้ว ${parsed.size} หน้า`, 'info');
    });

    btnExecute?.addEventListener('click', executeSplit);
  }

  async function handleSplitFile(file) {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      showToast('กรุณาเลือกไฟล์ PDF เท่านั้น', 'error');
      return;
    }

    showProgressModal();
    updateProgress(0, 1, 'กำลังตรวจสอบไฟล์ PDF...');

    try {
      const loaded = await loadPdfDocument(file);
      splitState.file = file;
      splitState.buffer = loaded.buffer;
      splitState.totalPages = loaded.pageCount;
      splitState.selectedPages.clear();

      for (let i = 1; i <= loaded.pageCount; i++) {
        splitState.selectedPages.add(i);
      }

      hideProgressModal();
      await renderSplitUI();
      showToast(`โหลด PDF สำเร็จ (${loaded.pageCount} หน้า)`, 'success');
    } catch (err) {
      hideProgressModal();
      showToast(err.message || 'ไม่สามารถเปิดไฟล์ PDF นี้ได้', 'error');
    }
  }

  async function renderSplitUI() {
    const uploadScreen = document.getElementById('splitUploadScreen');
    const workspaceScreen = document.getElementById('splitWorkspaceScreen');
    const grid = document.getElementById('splitThumbnailGrid');
    const badge = document.getElementById('splitFileBadge');
    const origName = document.getElementById('splitOriginalName');

    if (!uploadScreen || !workspaceScreen) return;

    if (!splitState.file) {
      uploadScreen.classList.remove('hidden');
      workspaceScreen.classList.add('hidden');
      if (grid) grid.innerHTML = '';
      return;
    }

    uploadScreen.classList.add('hidden');
    workspaceScreen.classList.remove('hidden');

    if (badge) badge.textContent = `${splitState.totalPages} หน้า`;
    if (origName) origName.textContent = splitState.file.name;

    updateSplitSelections();

    if (grid) {
      grid.innerHTML = '';
      for (let i = 1; i <= splitState.totalPages; i++) {
        const card = document.createElement('div');
        card.className = 'thumb-card page-card-selectable' + (splitState.selectedPages.has(i) ? ' selected' : '');
        card.dataset.page = String(i);
        card.setAttribute('role', 'checkbox');
        card.setAttribute('aria-checked', String(splitState.selectedPages.has(i)));
        card.setAttribute('tabindex', '0');

        card.innerHTML = `
          <div class="card-header">
            <span class="page-badge">หน้า ${i}</span>
            <div class="page-select-checkbox">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          </div>
          <div class="card-preview-area">
            <div class="page-loading-skeleton">กำลังโหลด...</div>
          </div>
        `;

        const toggle = () => {
          if (splitState.selectedPages.has(i)) {
            splitState.selectedPages.delete(i);
          } else {
            splitState.selectedPages.add(i);
          }
          updateSplitSelections();
        };

        card.addEventListener('click', toggle);
        card.addEventListener('keydown', (e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            toggle();
          }
        });

        grid.appendChild(card);

        renderPdfThumbnail(splitState.buffer, i, 0.35).then(dataUrl => {
          const previewArea = card.querySelector('.card-preview-area');
          if (previewArea) {
            previewArea.innerHTML = `<img src="${dataUrl}" alt="หน้า ${i}" class="card-preview-img">`;
          }
        }).catch(() => {
          const previewArea = card.querySelector('.card-preview-area');
          if (previewArea) previewArea.innerHTML = `<span class="preview-err">หน้า ${i}</span>`;
        });
      }
    }
  }

  function updateSplitSelections() {
    const summarySelected = document.getElementById('splitSummarySelected');
    if (summarySelected) {
      summarySelected.textContent = `เลือกแล้ว ${splitState.selectedPages.size} จาก ${splitState.totalPages} หน้า`;
    }

    const cards = document.querySelectorAll('#splitThumbnailGrid .page-card-selectable');
    cards.forEach(card => {
      const pageNum = parseInt(card.dataset.page, 10);
      const isSelected = splitState.selectedPages.has(pageNum);
      card.classList.toggle('selected', isSelected);
      card.setAttribute('aria-checked', String(isSelected));
    });
  }

  async function executeSplit() {
    if (!splitState.file || splitState.selectedPages.size === 0) {
      showToast('กรุณาเลือกหน้าที่ต้องการแยกอย่างน้อย 1 หน้า', 'error');
      return;
    }

    const filenameInput = document.getElementById('splitOutputFilename');
    let rawName = (filenameInput?.value || 'selected-pages').trim();
    if (rawName.toLowerCase().endsWith('.pdf')) rawName = rawName.slice(0, -4);
    const filename = `${rawName || 'selected-pages'}.pdf`;

    showProgressModal();
    updateProgress(0, 1, 'กำลังแยกหน้าเอกสาร...');

    try {
      const splitPdf = await window.PDFLib.PDFDocument.create();
      const srcDoc = await window.PDFLib.PDFDocument.load(splitState.buffer);

      const sortedPages = Array.from(splitState.selectedPages).sort((a, b) => a - b);
      const indices = sortedPages.map(p => p - 1); // 0-based

      const copiedPages = await splitPdf.copyPages(srcDoc, indices);
      copiedPages.forEach(p => splitPdf.addPage(p));

      updateProgress(1, 1, 'กำลังสร้างไฟล์ PDF ใหม่...');
      const pdfBytes = await splitPdf.save();
      downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), filename);
      hideProgressModal();
      showToast(`แยก PDF สำเร็จ (${copiedPages.length} หน้า) กำลังเริ่มดาวน์โหลด...`, 'success');
    } catch (err) {
      console.warn('Split execution error:', err);
      hideProgressModal();
      showToast('เกิดข้อผิดพลาดในการแยก PDF: ' + err.message, 'error');
    }
  }

  // ==========================================================================
  // TOOL 4: จัดหน้า PDF (Organize PDF)
  // ==========================================================================
  const organizeState = {
    file: null,
    buffer: null,
    pages: [], // Array of { id, originalIndex, rotation, dataUrl }
    sortable: null
  };

  function initOrganizeTool() {
    const fileInput = document.getElementById('fileInputOrganize');
    const dropZone = document.getElementById('organizeDropZone');
    const btnSelect = document.getElementById('btnSelectOrganizePdf');
    const btnClear = document.getElementById('btnClearOrganizePdf');
    const btnRotateAll = document.getElementById('btnOrganizeRotateAll');
    const btnReset = document.getElementById('btnOrganizeReset');
    const btnExecute = document.getElementById('btnExecuteOrganize');

    if (!fileInput || !dropZone) return;

    btnSelect?.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('click', (e) => {
      if (e.target.closest('#btnSelectOrganizePdf')) return;
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      const file = (e.target.files || [])[0];
      if (file) await handleOrganizeFile(file);
      fileInput.value = '';
    });

    setupDropZoneEvents(dropZone, async (files) => {
      if (files[0]) await handleOrganizeFile(files[0]);
    });

    btnClear?.addEventListener('click', () => {
      organizeState.file = null;
      organizeState.buffer = null;
      organizeState.pages = [];
      renderOrganizeUI();
    });

    btnRotateAll?.addEventListener('click', () => {
      organizeState.pages.forEach(p => {
        p.rotation = (p.rotation + 90) % 360;
      });
      renderOrganizeCards(false);
      showToast('หมุนทุกหน้า 90° เรียบร้อย', 'success');
    });

    btnReset?.addEventListener('click', () => {
      organizeState.pages.sort((a, b) => a.originalIndex - b.originalIndex);
      organizeState.pages.forEach(p => p.rotation = 0);
      renderOrganizeCards(true);
      showToast('รีเซ็ตลำดับและการหมุนกลับสู่ค่าเริ่มต้น', 'info');
    });

    btnExecute?.addEventListener('click', executeOrganize);
  }

  async function handleOrganizeFile(file) {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      showToast('กรุณาเลือกไฟล์ PDF เท่านั้น', 'error');
      return;
    }

    showProgressModal();
    updateProgress(0, 1, 'กำลังตรวจสอบไฟล์ PDF...');

    try {
      const loaded = await loadPdfDocument(file);
      organizeState.file = file;
      organizeState.buffer = loaded.buffer;
      organizeState.pages = [];

      for (let i = 0; i < loaded.pageCount; i++) {
        organizeState.pages.push({
          id: 'org_page_' + i + '_' + Math.random().toString(36).substr(2, 5),
          originalIndex: i,
          rotation: 0,
          dataUrl: null
        });
      }

      hideProgressModal();
      renderOrganizeUI();
      showToast(`โหลด PDF สำหรับจัดหน้าสำเร็จ (${loaded.pageCount} หน้า)`, 'success');
    } catch (err) {
      hideProgressModal();
      showToast(err.message || 'ไม่สามารถเปิดไฟล์ PDF นี้ได้', 'error');
    }
  }

  function renderOrganizeUI() {
    const uploadScreen = document.getElementById('organizeUploadScreen');
    const workspaceScreen = document.getElementById('organizeWorkspaceScreen');
    const badge = document.getElementById('organizeFileBadge');

    if (!uploadScreen || !workspaceScreen) return;

    if (!organizeState.file) {
      uploadScreen.classList.remove('hidden');
      workspaceScreen.classList.add('hidden');
      const grid = document.getElementById('organizeThumbnailGrid');
      if (grid) grid.innerHTML = '';
      return;
    }

    uploadScreen.classList.add('hidden');
    workspaceScreen.classList.remove('hidden');

    if (badge) badge.textContent = `${organizeState.pages.length} หน้า`;
    renderOrganizeCards(true);
  }

  function renderOrganizeCards(fullRebuild = true) {
    const grid = document.getElementById('organizeThumbnailGrid');
    const summaryPages = document.getElementById('organizeSummaryPages');
    const badge = document.getElementById('organizeFileBadge');

    if (badge) badge.textContent = `${organizeState.pages.length} หน้า`;
    if (summaryPages) summaryPages.textContent = `${organizeState.pages.length} หน้า`;

    if (!grid) return;

    if (!fullRebuild) {
      grid.querySelectorAll('.thumb-card').forEach((card, idx) => {
        const id = card.dataset.id;
        const pageItem = organizeState.pages.find(p => p.id === id);
        if (pageItem) {
          const badgeEl = card.querySelector('.page-badge');
          if (badgeEl) badgeEl.textContent = `#${idx + 1}`;
          const img = card.querySelector('.card-preview-img');
          if (img) img.style.transform = `rotate(${pageItem.rotation}deg)`;
        }
      });
      return;
    }

    grid.innerHTML = '';
    organizeState.pages.forEach((pageItem, idx) => {
      const card = document.createElement('div');
      card.className = 'thumb-card';
      card.dataset.id = pageItem.id;

      card.innerHTML = `
        <div class="card-header">
          <span class="page-badge">#${idx + 1}</span>
          <span class="card-orig-tag">หน้าเดิม ${pageItem.originalIndex + 1}</span>
          <div class="card-actions-right">
            <button type="button" class="card-action-btn btn-rotate-page" title="หมุนหน้า 90°" aria-label="หมุน">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            </button>
            <button type="button" class="card-action-btn delete-btn btn-delete-page" title="ลบหน้านี้ออก" aria-label="ลบ">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
        <div class="card-preview-area">
          <div class="page-loading-skeleton">กำลังโหลด...</div>
        </div>
      `;

      card.querySelector('.btn-rotate-page').addEventListener('click', (e) => {
        e.stopPropagation();
        pageItem.rotation = (pageItem.rotation + 90) % 360;
        const img = card.querySelector('.card-preview-img');
        if (img) img.style.transform = `rotate(${pageItem.rotation}deg)`;
      });

      card.querySelector('.btn-delete-page').addEventListener('click', (e) => {
        e.stopPropagation();
        const index = organizeState.pages.findIndex(p => p.id === pageItem.id);
        if (index !== -1) {
          organizeState.pages.splice(index, 1);
          renderOrganizeCards(true);
        }
      });

      grid.appendChild(card);

      if (pageItem.dataUrl) {
        const previewArea = card.querySelector('.card-preview-area');
        if (previewArea) {
          previewArea.innerHTML = `<img src="${pageItem.dataUrl}" alt="หน้า ${pageItem.originalIndex + 1}" class="card-preview-img" style="transform: rotate(${pageItem.rotation}deg)">`;
        }
      } else {
        renderPdfThumbnail(organizeState.buffer, pageItem.originalIndex + 1, 0.35).then(url => {
          pageItem.dataUrl = url;
          const previewArea = card.querySelector('.card-preview-area');
          if (previewArea) {
            previewArea.innerHTML = `<img src="${url}" alt="หน้า ${pageItem.originalIndex + 1}" class="card-preview-img" style="transform: rotate(${pageItem.rotation}deg)">`;
          }
        }).catch(() => {
          const previewArea = card.querySelector('.card-preview-area');
          if (previewArea) previewArea.innerHTML = `<span class="preview-err">หน้า ${pageItem.originalIndex + 1}</span>`;
        });
      }
    });

    if (window.Sortable) {
      if (organizeState.sortable) organizeState.sortable.destroy();
      organizeState.sortable = new window.Sortable(grid, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        filter: 'button, svg, path',
        preventOnFilter: false,
        onEnd: function(evt) {
          if (evt.oldIndex !== evt.newIndex) {
            const [moved] = organizeState.pages.splice(evt.oldIndex, 1);
            organizeState.pages.splice(evt.newIndex, 0, moved);
            renderOrganizeCards(false);
          }
        }
      });
    }
  }

  async function executeOrganize() {
    if (!organizeState.file || organizeState.pages.length === 0) {
      showToast('กรุณาเลือกไฟล์ PDF และต้องมีหน้าอย่างน้อย 1 หน้า', 'error');
      return;
    }

    const filenameInput = document.getElementById('organizeOutputFilename');
    let rawName = (filenameInput?.value || 'organized').trim();
    if (rawName.toLowerCase().endsWith('.pdf')) rawName = rawName.slice(0, -4);
    const filename = `${rawName || 'organized'}.pdf`;

    showProgressModal();
    const total = organizeState.pages.length;
    updateProgress(0, total, 'กำลังจัดเรียงและหมุนหน้า PDF...');

    try {
      const orgDoc = await window.PDFLib.PDFDocument.create();
      const srcDoc = await window.PDFLib.PDFDocument.load(organizeState.buffer);

      for (let i = 0; i < total; i++) {
        const item = organizeState.pages[i];
        updateProgress(i + 1, total, `กำลังจัดหน้า ${i + 1} จาก ${total}...`);
        const [copiedPage] = await orgDoc.copyPages(srcDoc, [item.originalIndex]);
        const origAngle = copiedPage.getRotation().angle;
        copiedPage.setRotation(window.PDFLib.degrees((origAngle + item.rotation) % 360));
        orgDoc.addPage(copiedPage);
        await new Promise(r => setTimeout(r, 0));
      }

      updateProgress(total, total, 'กำลังบันทึกไฟล์เอกสาร...');
      const pdfBytes = await orgDoc.save();
      downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), filename);
      hideProgressModal();
      showToast(`จัดหน้า PDF สำเร็จ (${total} หน้า) กำลังเริ่มดาวน์โหลด...`, 'success');
    } catch (err) {
      console.warn('Organize execution error:', err);
      hideProgressModal();
      showToast('เกิดข้อผิดพลาดในการบันทึก PDF: ' + err.message, 'error');
    }
  }

  // ==========================================================================
  // TOOL 5: PDF → รูปภาพ (PDF to Images)
  // ==========================================================================
  const pdfToImgState = {
    file: null,
    buffer: null,
    totalPages: 0,
    selectedPages: new Set()
  };

  function initPdfToImgTool() {
    const fileInput = document.getElementById('fileInputPdfToImg');
    const dropZone = document.getElementById('pdfToImgDropZone');
    const btnSelect = document.getElementById('btnSelectPdfToImg');
    const btnClear = document.getElementById('btnClearPdfToImg');
    const btnSelectAll = document.getElementById('btnPdfToImgSelectAll');
    const btnDeselectAll = document.getElementById('btnPdfToImgDeselectAll');
    const btnExecute = document.getElementById('btnExecutePdfToImg');

    if (!fileInput || !dropZone) return;

    btnSelect?.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('click', (e) => {
      if (e.target.closest('#btnSelectPdfToImg')) return;
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      const file = (e.target.files || [])[0];
      if (file) await handlePdfToImgFile(file);
      fileInput.value = '';
    });

    setupDropZoneEvents(dropZone, async (files) => {
      if (files[0]) await handlePdfToImgFile(files[0]);
    });

    btnClear?.addEventListener('click', () => {
      pdfToImgState.file = null;
      pdfToImgState.buffer = null;
      pdfToImgState.totalPages = 0;
      pdfToImgState.selectedPages.clear();
      renderPdfToImgUI();
    });

    btnSelectAll?.addEventListener('click', () => {
      for (let i = 1; i <= pdfToImgState.totalPages; i++) pdfToImgState.selectedPages.add(i);
      updatePdfToImgSelections();
    });

    btnDeselectAll?.addEventListener('click', () => {
      pdfToImgState.selectedPages.clear();
      updatePdfToImgSelections();
    });

    document.querySelectorAll('input[name="pdfToImgFormat"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const qualityGroup = document.getElementById('groupImgQuality');
        if (qualityGroup) {
          qualityGroup.style.display = e.target.value === 'image/png' ? 'none' : 'block';
        }
      });
    });

    btnExecute?.addEventListener('click', executePdfToImg);
  }

  async function handlePdfToImgFile(file) {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      showToast('กรุณาเลือกไฟล์ PDF เท่านั้น', 'error');
      return;
    }

    showProgressModal();
    updateProgress(0, 1, 'กำลังตรวจสอบไฟล์ PDF...');

    try {
      const loaded = await loadPdfDocument(file);
      pdfToImgState.file = file;
      pdfToImgState.buffer = loaded.buffer;
      pdfToImgState.totalPages = loaded.pageCount;
      pdfToImgState.selectedPages.clear();

      for (let i = 1; i <= loaded.pageCount; i++) {
        pdfToImgState.selectedPages.add(i);
      }

      hideProgressModal();
      renderPdfToImgUI();
      showToast(`โหลด PDF สำเร็จ (${loaded.pageCount} หน้า)`, 'success');
    } catch (err) {
      hideProgressModal();
      showToast(err.message || 'ไม่สามารถเปิดไฟล์ PDF นี้ได้', 'error');
    }
  }

  function renderPdfToImgUI() {
    const uploadScreen = document.getElementById('pdfToImgUploadScreen');
    const workspaceScreen = document.getElementById('pdfToImgWorkspaceScreen');
    const grid = document.getElementById('pdfToImgThumbnailGrid');
    const badge = document.getElementById('pdfToImgFileBadge');

    if (!uploadScreen || !workspaceScreen) return;

    if (!pdfToImgState.file) {
      uploadScreen.classList.remove('hidden');
      workspaceScreen.classList.add('hidden');
      if (grid) grid.innerHTML = '';
      return;
    }

    uploadScreen.classList.add('hidden');
    workspaceScreen.classList.remove('hidden');

    if (badge) badge.textContent = `${pdfToImgState.totalPages} หน้า`;
    updatePdfToImgSelections();

    if (grid) {
      grid.innerHTML = '';
      for (let i = 1; i <= pdfToImgState.totalPages; i++) {
        const card = document.createElement('div');
        card.className = 'thumb-card page-card-selectable' + (pdfToImgState.selectedPages.has(i) ? ' selected' : '');
        card.dataset.page = String(i);
        card.setAttribute('role', 'checkbox');
        card.setAttribute('aria-checked', String(pdfToImgState.selectedPages.has(i)));
        card.setAttribute('tabindex', '0');

        card.innerHTML = `
          <div class="card-header">
            <span class="page-badge">หน้า ${i}</span>
            <div class="page-select-checkbox">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          </div>
          <div class="card-preview-area">
            <div class="page-loading-skeleton">กำลังโหลด...</div>
          </div>
        `;

        const toggle = () => {
          if (pdfToImgState.selectedPages.has(i)) {
            pdfToImgState.selectedPages.delete(i);
          } else {
            pdfToImgState.selectedPages.add(i);
          }
          updatePdfToImgSelections();
        };

        card.addEventListener('click', toggle);
        card.addEventListener('keydown', (e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            toggle();
          }
        });

        grid.appendChild(card);

        renderPdfThumbnail(pdfToImgState.buffer, i, 0.35).then(url => {
          const previewArea = card.querySelector('.card-preview-area');
          if (previewArea) previewArea.innerHTML = `<img src="${url}" alt="หน้า ${i}" class="card-preview-img">`;
        }).catch(() => {
          const previewArea = card.querySelector('.card-preview-area');
          if (previewArea) previewArea.innerHTML = `<span class="preview-err">หน้า ${i}</span>`;
        });
      }
    }
  }

  function updatePdfToImgSelections() {
    const summarySelected = document.getElementById('pdfToImgSummarySelected');
    if (summarySelected) {
      summarySelected.textContent = `${pdfToImgState.selectedPages.size} หน้า`;
    }

    const cards = document.querySelectorAll('#pdfToImgThumbnailGrid .page-card-selectable');
    cards.forEach(card => {
      const pageNum = parseInt(card.dataset.page, 10);
      const isSelected = pdfToImgState.selectedPages.has(pageNum);
      card.classList.toggle('selected', isSelected);
      card.setAttribute('aria-checked', String(isSelected));
    });
  }

  async function executePdfToImg() {
    if (!pdfToImgState.file || pdfToImgState.selectedPages.size === 0) {
      showToast('กรุณาเลือกหน้าที่ต้องการแปลงเป็นรูปภาพอย่างน้อย 1 หน้า', 'error');
      return;
    }

    const formatRadio = document.querySelector('input[name="pdfToImgFormat"]:checked');
    const mimeType = formatRadio ? formatRadio.value : 'image/jpeg';
    const isPng = mimeType === 'image/png';
    const ext = isPng ? 'png' : 'jpg';

    const qualitySelect = document.getElementById('pdfToImgQuality');
    const quality = isPng ? 1.0 : parseFloat(qualitySelect?.value || '0.9');

    const filenameInput = document.getElementById('pdfToImgOutputFilename');
    let baseName = (filenameInput?.value || 'pdf-images').trim();

    const sortedPages = Array.from(pdfToImgState.selectedPages).sort((a, b) => a - b);
    const totalSelected = sortedPages.length;

    showProgressModal();
    updateProgress(0, totalSelected, 'กำลังเตรียมแปลงหน้า PDF เป็นรูปภาพ...');

    try {
      if (totalSelected === 1) {
        const pageNum = sortedPages[0];
        updateProgress(1, 1, `กำลังเรนเดอร์หน้า ${pageNum}...`);
        const canvas = await renderPdfPageFull(pdfToImgState.buffer, pageNum, 2.0);
        const blob = await new Promise(res => canvas.toBlob(res, mimeType, quality));
        canvas.width = 0;
        canvas.height = 0;

        downloadBlob(blob, `${baseName}-page-${pageNum}.${ext}`);
        hideProgressModal();
        showToast('แปลงรูปภาพสำเร็จ กำลังดาวน์โหลด...', 'success');
      } else {
        if (!window.JSZip) {
          throw new Error('ไลบรารี JSZip ไม่พร้อมใช้งาน');
        }
        const zip = new window.JSZip();

        for (let idx = 0; idx < totalSelected; idx++) {
          const pageNum = sortedPages[idx];
          updateProgress(idx + 1, totalSelected, `กำลังเรนเดอร์ภาพหน้า ${pageNum} (${idx + 1}/${totalSelected})...`);
          const canvas = await renderPdfPageFull(pdfToImgState.buffer, pageNum, 2.0);
          const blob = await new Promise(res => canvas.toBlob(res, mimeType, quality));
          canvas.width = 0;
          canvas.height = 0;

          const imgFilename = `${baseName}_page_${String(pageNum).padStart(3, '0')}.${ext}`;
          zip.file(imgFilename, blob);
          await new Promise(r => setTimeout(r, 0));
        }

        updateProgress(totalSelected, totalSelected, 'กำลังบีบอัดเป็นไฟล์ ZIP...');
        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        downloadBlob(zipBlob, `${baseName}.zip`);
        hideProgressModal();
        showToast(`แปลง ${totalSelected} หน้าเป็นรูปภาพใน ZIP สำเร็จ กำลังเริ่มดาวน์โหลด...`, 'success');
      }
    } catch (err) {
      console.warn('PDF to Image error:', err);
      hideProgressModal();
      showToast('เกิดข้อผิดพลาดในการแปลงภาพ: ' + err.message, 'error');
    }
  }

  // ==========================================================================
  // TOOL 6: ใส่เลขหน้า (Page Numbering)
  // ==========================================================================
  const pageNumState = {
    file: null,
    buffer: null,
    totalPages: 0,
    position: 'bottom-center',
    startNum: 1,
    format: 'plain'
  };

  function initPageNumTool() {
    const fileInput = document.getElementById('fileInputPageNum');
    const dropZone = document.getElementById('pageNumDropZone');
    const btnSelect = document.getElementById('btnSelectPageNum');
    const btnClear = document.getElementById('btnClearPageNum');
    const btnExecute = document.getElementById('btnExecutePageNum');
    const startInput = document.getElementById('pageNumStart');
    const formatSelect = document.getElementById('pageNumFormat');

    if (!fileInput || !dropZone) return;

    btnSelect?.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('click', (e) => {
      if (e.target.closest('#btnSelectPageNum')) return;
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      const file = (e.target.files || [])[0];
      if (file) await handlePageNumFile(file);
      fileInput.value = '';
    });

    setupDropZoneEvents(dropZone, async (files) => {
      if (files[0]) await handlePageNumFile(files[0]);
    });

    btnClear?.addEventListener('click', () => {
      pageNumState.file = null;
      pageNumState.buffer = null;
      pageNumState.totalPages = 0;
      renderPageNumUI();
    });

    document.querySelectorAll('.pos-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        pageNumState.position = btn.dataset.pos || 'bottom-center';
        updatePageNumOverlays();
      });
    });

    startInput?.addEventListener('input', (e) => {
      pageNumState.startNum = parseInt(e.target.value, 10) || 1;
      updatePageNumOverlays();
    });

    formatSelect?.addEventListener('change', (e) => {
      pageNumState.format = e.target.value || 'plain';
      updatePageNumOverlays();
    });

    btnExecute?.addEventListener('click', executePageNum);
  }

  async function handlePageNumFile(file) {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      showToast('กรุณาเลือกไฟล์ PDF เท่านั้น', 'error');
      return;
    }

    showProgressModal();
    updateProgress(0, 1, 'กำลังตรวจสอบไฟล์ PDF...');

    try {
      const loaded = await loadPdfDocument(file);
      pageNumState.file = file;
      pageNumState.buffer = loaded.buffer;
      pageNumState.totalPages = loaded.pageCount;

      hideProgressModal();
      renderPageNumUI();
      showToast(`โหลด PDF สำเร็จ (${loaded.pageCount} หน้า)`, 'success');
    } catch (err) {
      hideProgressModal();
      showToast(err.message || 'ไม่สามารถเปิดไฟล์ PDF นี้ได้', 'error');
    }
  }

  function renderPageNumUI() {
    const uploadScreen = document.getElementById('pageNumUploadScreen');
    const workspaceScreen = document.getElementById('pageNumWorkspaceScreen');
    const grid = document.getElementById('pageNumThumbnailGrid');
    const badge = document.getElementById('pageNumFileBadge');

    if (!uploadScreen || !workspaceScreen) return;

    if (!pageNumState.file) {
      uploadScreen.classList.remove('hidden');
      workspaceScreen.classList.add('hidden');
      if (grid) grid.innerHTML = '';
      return;
    }

    uploadScreen.classList.add('hidden');
    workspaceScreen.classList.remove('hidden');

    if (badge) badge.textContent = `${pageNumState.totalPages} หน้า`;

    if (grid) {
      grid.innerHTML = '';
      for (let i = 1; i <= pageNumState.totalPages; i++) {
        const card = document.createElement('div');
        card.className = 'thumb-card page-num-card';
        card.dataset.page = String(i);

        card.innerHTML = `
          <div class="card-header">
            <span class="page-badge">หน้า ${i}</span>
          </div>
          <div class="card-preview-area page-preview-relative">
            <div class="page-loading-skeleton">กำลังโหลด...</div>
            <div class="page-number-preview-overlay pos-${pageNumState.position}">
              <span class="overlay-num">${getPageNumberText(i)}</span>
            </div>
          </div>
        `;

        grid.appendChild(card);

        renderPdfThumbnail(pageNumState.buffer, i, 0.35).then(url => {
          const previewArea = card.querySelector('.card-preview-area');
          if (previewArea) {
            const skeleton = previewArea.querySelector('.page-loading-skeleton');
            if (skeleton) skeleton.remove();
            const img = document.createElement('img');
            img.src = url;
            img.alt = `หน้า ${i}`;
            img.className = 'card-preview-img';
            previewArea.insertBefore(img, previewArea.firstChild);
          }
        }).catch(() => {
          const previewArea = card.querySelector('.card-preview-area');
          if (previewArea) previewArea.innerHTML = `<span class="preview-err">หน้า ${i}</span>`;
        });
      }
    }
  }

  function getPageNumberText(pageIndex1Based) {
    const currentNum = pageNumState.startNum + pageIndex1Based - 1;
    if (pageNumState.format === 'thai-prefix') {
      return `หน้า ${currentNum}`;
    } else if (pageNumState.format === 'page-total') {
      return `${currentNum} / ${pageNumState.totalPages}`;
    }
    return `${currentNum}`;
  }

  function updatePageNumOverlays() {
    const overlays = document.querySelectorAll('#pageNumThumbnailGrid .page-number-preview-overlay');
    overlays.forEach(overlay => {
      overlay.className = `page-number-preview-overlay pos-${pageNumState.position}`;
      const card = overlay.closest('.page-num-card');
      if (card) {
        const pageNum = parseInt(card.dataset.page, 10) || 1;
        const numSpan = overlay.querySelector('.overlay-num');
        if (numSpan) numSpan.textContent = getPageNumberText(pageNum);
      }
    });
  }

  async function executePageNum() {
    if (!pageNumState.file || pageNumState.totalPages === 0) {
      showToast('กรุณาเลือกไฟล์ PDF ก่อนดำเนินการ', 'error');
      return;
    }

    const filenameInput = document.getElementById('pageNumOutputFilename');
    let rawName = (filenameInput?.value || 'numbered').trim();
    if (rawName.toLowerCase().endsWith('.pdf')) rawName = rawName.slice(0, -4);
    const filename = `${rawName || 'numbered'}.pdf`;

    showProgressModal();
    const total = pageNumState.totalPages;
    updateProgress(0, total, 'กำลังใส่เลขหน้าเอกสาร PDF...');

    try {
      const pdfDoc = await window.PDFLib.PDFDocument.load(pageNumState.buffer);
      const font = await pdfDoc.embedFont(window.PDFLib.StandardFonts.Helvetica);

      // Helper function to render text to PNG bytes via offscreen canvas
      async function renderTextToPngBytes(text, fontSize) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const dpr = 2; // high resolution for crisp print
        const fontStr = `${fontSize * dpr}px 'Prompt', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
        ctx.font = fontStr;
        const metrics = ctx.measureText(text);
        const actualWidth = Math.ceil(metrics.width);
        const actualHeight = Math.ceil(fontSize * 1.5 * dpr);
        canvas.width = actualWidth + 10;
        canvas.height = actualHeight + 10;
        
        ctx.font = fontStr;
        ctx.fillStyle = '#333333';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 5, canvas.height / 2);

        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        const ab = await blob.arrayBuffer();
        return {
          bytes: new Uint8Array(ab),
          width: canvas.width / dpr,
          height: canvas.height / dpr
        };
      }

      for (let i = 0; i < total; i++) {
        const page = pdfDoc.getPage(i);
        const { width, height } = page.getSize();
        const numText = getPageNumberText(i + 1);

        const fontSize = 11;
        const margin = 24;

        // Check if text has non-ASCII characters (e.g. Thai)
        const hasNonAscii = /[^\x00-\x7F]/.test(numText);

        if (hasNonAscii) {
          const rendered = await renderTextToPngBytes(numText, fontSize);
          const embeddedImage = await pdfDoc.embedPng(rendered.bytes);

          let x = margin;
          let y = margin;

          if (pageNumState.position.includes('left')) {
            x = margin;
          } else if (pageNumState.position.includes('center')) {
            x = (width - rendered.width) / 2;
          } else if (pageNumState.position.includes('right')) {
            x = width - margin - rendered.width;
          }

          if (pageNumState.position.includes('top')) {
            y = height - margin - rendered.height;
          } else {
            y = margin;
          }

          page.drawImage(embeddedImage, {
            x,
            y,
            width: rendered.width,
            height: rendered.height
          });
        } else {
          const textWidth = font.widthOfTextAtSize(numText, fontSize);
          const textHeight = font.heightAtSize(fontSize);

          let x = margin;
          let y = margin;

          if (pageNumState.position.includes('left')) {
            x = margin;
          } else if (pageNumState.position.includes('center')) {
            x = (width - textWidth) / 2;
          } else if (pageNumState.position.includes('right')) {
            x = width - margin - textWidth;
          }

          if (pageNumState.position.includes('top')) {
            y = height - margin - textHeight;
          } else {
            y = margin;
          }

          page.drawText(numText, {
            x,
            y,
            size: fontSize,
            font,
            color: window.PDFLib.rgb(0.2, 0.2, 0.2)
          });
        }

        updateProgress(i + 1, total, `ใส่เลขหน้าที่ ${i + 1} จาก ${total}...`);
        await new Promise(r => setTimeout(r, 0));
      }

      updateProgress(total, total, 'กำลังบันทึกเอกสาร PDF...');
      const pdfBytes = await pdfDoc.save();
      downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), filename);
      hideProgressModal();
      showToast(`ใส่เลขหน้าสำเร็จ (${total} หน้า) กำลังเริ่มดาวน์โหลด...`, 'success');
    } catch (err) {
      console.warn('Page numbering execution error:', err);
      hideProgressModal();
      showToast('เกิดข้อผิดพลาดในการใส่เลขหน้า: ' + err.message, 'error');
    }
  }

  // ==========================================================================
  // TOOL 7: OCR PDF (Tesseract.js Local Client-Side OCR)
  // ==========================================================================
  const ocrState = {
    file: null,
    buffer: null,
    isPdf: true,
    totalPages: 0,
    extractedText: ''
  };

  function initOcrTool() {
    const fileInput = document.getElementById('fileInputOcr');
    const dropZone = document.getElementById('ocrDropZone');
    const btnSelect = document.getElementById('btnSelectOcrFile');
    const btnClear = document.getElementById('btnClearOcr');
    const btnExecute = document.getElementById('btnExecuteOcr');
    const btnCopy = document.getElementById('btnOcrCopy');
    const btnDownloadTxt = document.getElementById('btnOcrDownloadTxt');
    const btnDownloadPdf = document.getElementById('btnOcrDownloadPdf');

    if (!fileInput || !dropZone) return;

    btnSelect?.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('click', (e) => {
      if (e.target.closest('#btnSelectOcrFile')) return;
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      const file = (e.target.files || [])[0];
      if (file) await handleOcrFile(file);
      fileInput.value = '';
    });

    setupDropZoneEvents(dropZone, async (files) => {
      if (files[0]) await handleOcrFile(files[0]);
    });

    btnClear?.addEventListener('click', () => {
      ocrState.file = null;
      ocrState.buffer = null;
      ocrState.extractedText = '';
      renderOcrUI();
    });

    btnCopy?.addEventListener('click', () => {
      const textarea = document.getElementById('ocrExtractedText');
      if (textarea && textarea.value) {
        navigator.clipboard.writeText(textarea.value).then(() => {
          showToast('คัดลอกข้อความลงคลิปบอร์ดแล้ว', 'success');
        }).catch(() => {
          textarea.select();
          document.execCommand('copy');
          showToast('คัดลอกข้อความแล้ว', 'success');
        });
      }
    });

    btnDownloadTxt?.addEventListener('click', () => {
      if (!ocrState.extractedText) return;
      const blob = new Blob([ocrState.extractedText], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, 'ocr-extracted-text.txt');
      showToast('ดาวน์โหลดไฟล์ .txt สำเร็จ', 'success');
    });

    btnDownloadPdf?.addEventListener('click', async () => {
      if (!ocrState.extractedText) return;
      await generateOcrPdf();
    });

    btnExecute?.addEventListener('click', executeOcr);
  }

  async function handleOcrFile(file) {
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|bmp)$/i.test(file.name);

    if (!isPdf && !isImage) {
      showToast('รองรับไฟล์ PDF หรือรูปภาพ (JPG, PNG, WebP) เท่านั้น', 'error');
      return;
    }

    showProgressModal();
    updateProgress(0, 1, 'กำลังโหลดเอกสารสำหรับ OCR...');

    try {
      ocrState.file = file;
      ocrState.isPdf = isPdf;
      ocrState.extractedText = '';

      if (isPdf) {
        const loaded = await loadPdfDocument(file);
        ocrState.buffer = loaded.buffer;
        ocrState.totalPages = loaded.pageCount;
      } else {
        ocrState.buffer = await file.arrayBuffer();
        ocrState.totalPages = 1;
      }

      hideProgressModal();
      renderOcrUI();
      showToast(`โหลดเอกสารสำหรับ OCR สำเร็จ (${ocrState.totalPages} หน้า)`, 'success');
    } catch (err) {
      hideProgressModal();
      showToast(err.message || 'ไม่สามารถเปิดเอกสารได้', 'error');
    }
  }

  function renderOcrUI() {
    const uploadScreen = document.getElementById('ocrUploadScreen');
    const workspaceScreen = document.getElementById('ocrWorkspaceScreen');
    const grid = document.getElementById('ocrThumbnailGrid');
    const badge = document.getElementById('ocrFileBadge');
    const resultsBox = document.getElementById('ocrResultsBox');
    const progressCard = document.getElementById('ocrProgressCard');
    const textArea = document.getElementById('ocrExtractedText');

    if (!uploadScreen || !workspaceScreen) return;

    if (!ocrState.file) {
      uploadScreen.classList.remove('hidden');
      workspaceScreen.classList.add('hidden');
      if (grid) grid.innerHTML = '';
      if (resultsBox) resultsBox.classList.add('hidden');
      if (progressCard) progressCard.classList.add('hidden');
      return;
    }

    uploadScreen.classList.add('hidden');
    workspaceScreen.classList.remove('hidden');

    if (badge) badge.textContent = `${ocrState.totalPages} หน้า`;
    if (resultsBox) resultsBox.classList.add('hidden');
    if (progressCard) progressCard.classList.add('hidden');
    if (textArea) textArea.value = '';

    if (grid) {
      grid.innerHTML = '';
      for (let i = 1; i <= ocrState.totalPages; i++) {
        const card = document.createElement('div');
        card.className = 'thumb-card';

        card.innerHTML = `
          <div class="card-header">
            <span class="page-badge">หน้า ${i}</span>
          </div>
          <div class="card-preview-area">
            <div class="page-loading-skeleton">กำลังโหลดตัวอย่าง...</div>
          </div>
        `;
        grid.appendChild(card);

        if (ocrState.isPdf) {
          renderPdfThumbnail(ocrState.buffer, i, 0.35).then(url => {
            const previewArea = card.querySelector('.card-preview-area');
            if (previewArea) previewArea.innerHTML = `<img src="${url}" alt="หน้า ${i}" class="card-preview-img">`;
          }).catch(() => {
            const previewArea = card.querySelector('.card-preview-area');
            if (previewArea) previewArea.innerHTML = `<span class="preview-err">หน้า ${i}</span>`;
          });
        } else {
          const blobUrl = URL.createObjectURL(ocrState.file);
          const previewArea = card.querySelector('.card-preview-area');
          if (previewArea) previewArea.innerHTML = `<img src="${blobUrl}" alt="รูปภาพ" class="card-preview-img">`;
        }
      }
    }
  }

  async function executeOcr() {
    if (!ocrState.file || ocrState.totalPages === 0) {
      showToast('กรุณาเลือกไฟล์เอกสารหรือรูปภาพก่อนทำ OCR', 'error');
      return;
    }

    if (!window.Tesseract) {
      showToast('ไลบรารี Tesseract.js ไม่พร้อมใช้งาน กรุณารีเฟรชหน้าเว็บ', 'error');
      return;
    }

    const langSelect = document.getElementById('ocrLanguage');
    const selectedLang = langSelect ? langSelect.value : 'eng';

    const progressCard = document.getElementById('ocrProgressCard');
    const progressStatus = document.getElementById('ocrProgressStatus');
    const progressBarFill = document.getElementById('ocrProgressBarFill');
    const progressPercent = document.getElementById('ocrProgressPercent');
    const progressPages = document.getElementById('ocrProgressPages');
    const btnExecute = document.getElementById('btnExecuteOcr');
    const resultsBox = document.getElementById('ocrResultsBox');
    const textarea = document.getElementById('ocrExtractedText');

    if (progressCard) progressCard.classList.remove('hidden');
    if (btnExecute) btnExecute.disabled = true;

    let allText = '';
    const total = ocrState.totalPages;
    let worker = null;

    try {
      if (progressStatus) progressStatus.textContent = 'กำลังโหลด OCR Engine ในเครื่อง (Local WASM)...';
      if (progressBarFill) progressBarFill.style.width = '10%';
      if (progressPercent) progressPercent.textContent = '10%';

      worker = await window.Tesseract.createWorker(selectedLang, 1, {
        workerPath: 'vendor/tesseract/worker.min.js',
        corePath: 'vendor/tesseract/tesseract-core-simd-lstm.wasm.js',
        langPath: 'vendor/tesseract/lang-data',
        logger: (m) => {
          if (m.status === 'recognizing text' && m.progress != null) {
            const pct = Math.round(m.progress * 100);
            if (progressBarFill) progressBarFill.style.width = `${pct}%`;
            if (progressPercent) progressPercent.textContent = `${pct}%`;
          }
        }
      });

      for (let i = 1; i <= total; i++) {
        if (progressStatus) progressStatus.textContent = `กำลังอ่านข้อความหน้า ${i} จาก ${total}...`;
        if (progressPages) progressPages.textContent = `${i} / ${total} หน้า`;

        let canvas;
        if (ocrState.isPdf) {
          canvas = await renderPdfPageFull(ocrState.buffer, i, 2.0);
        } else {
          canvas = document.createElement('canvas');
          const img = new Image();
          await new Promise((res, rej) => {
            img.onload = res;
            img.onerror = rej;
            img.src = URL.createObjectURL(ocrState.file);
          });
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
        }

        const ret = await worker.recognize(canvas);
        const pageText = ret.data ? ret.data.text.trim() : '';

        if (total > 1) {
          allText += `\n--- [ หน้า ${i} ] ---\n` + pageText + '\n';
        } else {
          allText += pageText;
        }

        canvas.width = 0;
        canvas.height = 0;
        await new Promise(r => setTimeout(r, 0));
      }

      await worker.terminate();
      worker = null;

      ocrState.extractedText = allText.trim();
      if (textarea) textarea.value = ocrState.extractedText || '(ไม่พบตัวหนังสือในภาพหรือหน้าเอกสารนี้)';
      if (resultsBox) resultsBox.classList.remove('hidden');

      if (progressStatus) progressStatus.textContent = 'ประมวลผล OCR เสร็จสมบูรณ์!';
      if (progressBarFill) progressBarFill.style.width = '100%';
      if (progressPercent) progressPercent.textContent = '100%';

      showToast('ทำ OCR เสร็จสมบูรณ์แล้ว!', 'success');
    } catch (err) {
      console.warn('OCR processing error:', err);
      if (worker) {
        try { await worker.terminate(); } catch (_) {}
      }
      showToast('เกิดข้อผิดพลาดในการทำ OCR: ' + (err.message || 'ไม่สามารถประมวลผลได้'), 'error');
    } finally {
      if (btnExecute) btnExecute.disabled = false;
    }
  }

  async function generateOcrPdf() {
    if (!ocrState.extractedText) return;
    showProgressModal();
    updateProgress(0, 1, 'กำลังสร้าง PDF พร้อมข้อความ...');

    try {
      const pdfDoc = await window.PDFLib.PDFDocument.create();
      const page = pdfDoc.addPage([595.28, 841.89]); // A4
      const font = await pdfDoc.embedFont(window.PDFLib.StandardFonts.Helvetica);

      page.drawText('PDF LAB - OCR Extracted Document', {
        x: 40,
        y: 800,
        size: 14,
        font,
        color: window.PDFLib.rgb(0.96, 0.62, 0.04)
      });

      const lines = ocrState.extractedText.split('\n');
      let currentY = 760;
      let currentPage = page;

      for (const line of lines) {
        if (currentY < 50) {
          currentPage = pdfDoc.addPage([595.28, 841.89]);
          currentY = 790;
        }

        const safeLine = line.replace(/[^\x20-\x7E]/g, ' ').substring(0, 85);
        if (safeLine.trim()) {
          currentPage.drawText(safeLine, {
            x: 40,
            y: currentY,
            size: 10,
            font,
            color: window.PDFLib.rgb(0.15, 0.15, 0.15)
          });
        }
        currentY -= 15;
      }

      updateProgress(1, 1, 'กำลังบันทึก PDF...');
      const pdfBytes = await pdfDoc.save();
      downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), 'ocr-document.pdf');
      hideProgressModal();
      showToast('สร้าง PDF พร้อมข้อความสำเร็จ กำลังดาวน์โหลด...', 'success');
    } catch (err) {
      console.warn('OCR PDF generate error:', err);
      hideProgressModal();
      showToast('เกิดข้อผิดพลาดในการสร้าง PDF: ' + err.message, 'error');
    }
  }

  // --- Dropzone Event Helper ---
  function setupDropZoneEvents(dropZoneEl, onDropFiles) {
    if (!dropZoneEl) return;

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZoneEl.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZoneEl.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZoneEl.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZoneEl.classList.remove('drag-active');
      });
    });

    dropZoneEl.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onDropFiles(Array.from(e.dataTransfer.files));
      }
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- Tool Switch Callback ---
  function onSwitchTool(toolId) {
    if (toolId === 'merge-pdf') renderMergeUI();
    else if (toolId === 'split-pdf') renderSplitUI();
    else if (toolId === 'organize-pdf') renderOrganizeUI();
    else if (toolId === 'pdf-to-image') renderPdfToImgUI();
    else if (toolId === 'page-number') renderPageNumUI();
    else if (toolId === 'ocr-pdf') renderOcrUI();
  }

  // --- Initialize All PDF Lab Tools ---
  function initPdfLab() {
    initMergeTool();
    initSplitTool();
    initOrganizeTool();
    initPdfToImgTool();
    initPageNumTool();
    initOcrTool();
  }

  window.PdfLabTools = {
    onSwitchTool,
    mergeState,
    splitState,
    organizeState,
    pdfToImgState,
    pageNumState,
    ocrState,
    handleMergeFiles,
    handleSplitFile,
    handleOrganizeFile,
    handlePdfToImgFile,
    handlePageNumFile,
    handleOcrFile,
    executeMerge,
    executeSplit,
    executeOrganize,
    executePdfToImg,
    executePageNum,
    executeOcr
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPdfLab);
  } else {
    initPdfLab();
  }

})();
