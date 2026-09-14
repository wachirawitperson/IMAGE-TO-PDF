/**
 * IMAGE → PDF
 * Complete Local-only Client-side Web Application
 */

(function() {
  'use strict';

  // --- Paper Dimensions in Points (72 pt = 1 inch) ---
  const PAPER_SIZES = {
    A4: { width: 595.28, height: 841.89 },
    A3: { width: 841.89, height: 1190.55 },
    A5: { width: 419.53, height: 595.28 },
    Letter: { width: 612.00, height: 792.00 },
    Legal: { width: 612.00, height: 1008.00 },
    Original: null // Calculated dynamically per image
  };

  const MARGIN_PRESETS = {
    none: 0,
    small: 20,
    large: 40
  };

  const QUALITY_SETTINGS = {
    small: { maxDim: 1280, quality: 0.65 },
    balanced: { maxDim: 1920, quality: 0.82 },
    high: { maxDim: 3200, quality: 0.94 }
  };

  // --- Authoritative Application State ---
  const state = {
    items: [], // Array of { id, file, name, size, type, width, height, rotation, objectUrl, originalBlob }
    settings: {
      paper: 'A4',
      orientation: 'auto',
      placement: 'fit',
      margin: 'none',
      quality: 'balanced',
      filename: 'images-to-pdf'
    },
    isProcessing: false
  };

  // --- DOM Elements ---
  const el = {
    fileInput: document.getElementById('fileInput'),
    uploadScreen: document.getElementById('uploadScreen'),
    workspaceScreen: document.getElementById('workspaceScreen'),
    initialDropZone: document.getElementById('initialDropZone'),
    btnSelectInitial: document.getElementById('btnSelectInitial'),
    headerActions: document.getElementById('headerActions'),
    fileCountBadge: document.getElementById('fileCountBadge'),
    btnAddMoreTop: document.getElementById('btnAddMoreTop'),
    btnClearAll: document.getElementById('btnClearAll'),
    btnAddMoreWorkspace: document.getElementById('btnAddMoreWorkspace'),
    btnRotateAll: document.getElementById('btnRotateAll'),
    workspaceCountText: document.getElementById('workspaceCountText'),
    thumbnailGrid: document.getElementById('thumbnailGrid'),
    workspaceDropArea: document.getElementById('workspaceDropArea'),
    workspaceDropOverlay: document.getElementById('workspaceDropOverlay'),
    
    // Settings
    settingPaper: document.getElementById('settingPaper'),
    settingFilename: document.getElementById('settingFilename'),
    btnCreatePdf: document.getElementById('btnCreatePdf'),
    btnCtaSubtext: document.getElementById('btnCtaSubtext'),
    
    // Progress Modal
    progressModal: document.getElementById('progressModal'),
    progressTitle: document.getElementById('progressTitle'),
    progressMessage: document.getElementById('progressMessage'),
    progressBarFill: document.getElementById('progressBarFill'),
    progressPercent: document.getElementById('progressPercent'),
    progressPages: document.getElementById('progressPages'),
    
    // Toast Container
    toastContainer: document.getElementById('toastContainer')
  };

  let sortableInstance = null;
  let idCounter = 1;

  // --- Initialization ---
  function init() {
    setupEventListeners();
    setupSortable();
    syncUI();
  }

  // --- Event Listeners ---
  function setupEventListeners() {
    // File Selection
    el.btnSelectInitial.addEventListener('click', () => el.fileInput.click());
    el.btnAddMoreTop.addEventListener('click', () => el.fileInput.click());
    el.btnAddMoreWorkspace.addEventListener('click', () => el.fileInput.click());
    
    el.initialDropZone.addEventListener('click', (e) => {
      // Prevent double trigger if clicking the button inside
      if (e.target.closest('#btnSelectInitial')) return;
      el.fileInput.click();
    });

    el.initialDropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.fileInput.click();
      }
    });

    el.fileInput.addEventListener('change', handleFileInput);

    // Clear All
    el.btnClearAll.addEventListener('click', handleClearAll);

    // Rotate All
    el.btnRotateAll.addEventListener('click', handleRotateAll);

    // Drag & Drop on Initial Drop Zone
    ['dragenter', 'dragover'].forEach(eventName => {
      el.initialDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.initialDropZone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      el.initialDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.initialDropZone.classList.remove('drag-active');
      });
    });

    el.initialDropZone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files) {
        handleFiles(Array.from(e.dataTransfer.files));
      }
    });

    // Drag & Drop onto entire window/workspace
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (state.items.length > 0) {
        el.workspaceDropArea.classList.add('drag-over');
      }
    });

    ['dragleave', 'drop'].forEach(eventName => {
      window.addEventListener(eventName, (e) => {
        if (e.relatedTarget === null || eventName === 'drop') {
          el.workspaceDropArea.classList.remove('drag-over');
        }
      });
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      el.workspaceDropArea.classList.remove('drag-over');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(Array.from(e.dataTransfer.files));
      }
    });

    // Clipboard Paste (Ctrl+V / Cmd+V)
    window.addEventListener('paste', handleClipboardPaste);

    // Settings Controls
    el.settingPaper.addEventListener('change', (e) => {
      state.settings.paper = e.target.value;
    });

    document.querySelectorAll('input[name="orientation"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        state.settings.orientation = e.target.value;
      });
    });

    document.querySelectorAll('input[name="placement"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        state.settings.placement = e.target.value;
      });
    });

    document.querySelectorAll('input[name="margin"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        state.settings.margin = e.target.value;
      });
    });

    document.querySelectorAll('input[name="quality"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        state.settings.quality = e.target.value;
      });
    });

    el.settingFilename.addEventListener('input', (e) => {
      state.settings.filename = e.target.value;
    });

    // Generate PDF Button
    el.btnCreatePdf.addEventListener('click', generatePdf);
  }

  // --- SortableJS Initialization ---
  function setupSortable() {
    if (window.Sortable && el.thumbnailGrid) {
      sortableInstance = new Sortable(el.thumbnailGrid, {
        animation: 180,
        handle: '.card-preview-container',
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        onEnd: function(evt) {
          if (evt.oldIndex !== evt.newIndex) {
            const [movedItem] = state.items.splice(evt.oldIndex, 1);
            state.items.splice(evt.newIndex, 0, movedItem);
            renderThumbnails(false); // Update page numbers without full re-render
            updateCountBadge();
          }
        }
      });
    }
  }

  // --- File Input Handler ---
  function handleFileInput(e) {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFiles(files);
    }
    // Always reset input value so re-adding the same file triggers change event
    el.fileInput.value = '';
  }

  // --- Clipboard Paste Handler ---
  function handleClipboardPaste(e) {
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;

    const items = clipboardData.items;
    if (!items) return;

    const imageFiles = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          // Give pasted image a clean name
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const namedFile = new File([file], `clipboard-${timestamp}.png`, { type: file.type || 'image/png' });
          imageFiles.push(namedFile);
        }
      }
    }

    if (imageFiles.length > 0) {
      showToast(`วางรูปภาพจาก Clipboard สำเร็จ (${imageFiles.length} รูป)`, 'success');
      handleFiles(imageFiles);
    }
  }

  // --- File Processing Core ---
  async function handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.heic', '.heif'];
    const validMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/heic', 'image/heif'];

    let addedCount = 0;
    let failedCount = 0;

    for (const file of fileList) {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      const isHeic = ext === '.heic' || ext === '.heif' || file.type === 'image/heic' || file.type === 'image/heif';
      const isStandardImage = validMimes.includes(file.type) || validExtensions.includes(ext);

      if (!isStandardImage && !isHeic) {
        showToast(`ไม่รองรับไฟล์ "${file.name}" (รองรับ JPG, PNG, WebP, BMP, HEIC)`, 'error');
        failedCount++;
        continue;
      }

      try {
        let displayBlob = file;
        let isDecodedHeic = false;

        // HEIC / HEIF Client-side Decoding
        if (isHeic) {
          if (window.heic2any) {
            try {
              const converted = await window.heic2any({
                blob: file,
                toType: 'image/jpeg',
                quality: 0.92
              });
              displayBlob = Array.isArray(converted) ? converted[0] : converted;
              isDecodedHeic = true;
            } catch (heicErr) {
              console.warn('HEIC decode error handled:', heicErr);
              showToast(`ไม่สามารถถอดรหัส HEIC "${file.name}" ได้ กรุณาลองใหม่อีกครั้ง`, 'error');
              failedCount++;
              continue;
            }
          } else {
            console.warn('heic2any library not loaded');
            showToast(`โปรแกรมถอดรหัส HEIC ยังไม่พร้อมใช้งานสำหรับ "${file.name}"`, 'error');
            failedCount++;
            continue;
          }
        }

        // Get Dimensions & verify image readability
        const objectUrl = URL.createObjectURL(displayBlob);
        const dimensions = await getImageDimensions(objectUrl);

        state.items.push({
          id: 'img_' + (idCounter++),
          file: file,
          originalBlob: displayBlob,
          name: file.name,
          size: file.size,
          type: isDecodedHeic ? 'image/jpeg' : (file.type || 'image/jpeg'),
          width: dimensions.width,
          height: dimensions.height,
          rotation: 0,
          objectUrl: objectUrl
        });

        addedCount++;
      } catch (err) {
        console.warn('Error reading image file:', file.name, err);
        showToast(`ไม่สามารถเปิดภาพ "${file.name}" ได้ ไฟล์อาจเสียหาย`, 'error');
        failedCount++;
      }
    }

    if (addedCount > 0) {
      syncUI();
    }
  }

  // Helper to load image and extract dimensions
  function getImageDimensions(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        reject(new Error('Image failed to load'));
      };
      img.src = url;
    });
  }

  // --- UI Synchronization ---
  function syncUI() {
    const count = state.items.length;

    if (count === 0) {
      el.uploadScreen.classList.remove('hidden');
      el.workspaceScreen.classList.add('hidden');
      el.headerActions.classList.add('hidden');
      el.thumbnailGrid.innerHTML = '';
      el.fileInput.value = '';
    } else {
      el.uploadScreen.classList.add('hidden');
      el.workspaceScreen.classList.remove('hidden');
      el.headerActions.classList.remove('hidden');
      renderThumbnails(true);
    }

    updateCountBadge();
  }

  function updateCountBadge() {
    const count = state.items.length;
    const text = `${count} รูป`;
    el.fileCountBadge.textContent = text;
    el.workspaceCountText.textContent = `รูปภาพที่เลือก (${count} รูป)`;
    el.btnCtaSubtext.textContent = count > 0 ? `แปลง ${count} รูปภาพเป็น 1 ไฟล์` : 'ไม่มีรูปภาพ';
    el.btnCreatePdf.disabled = count === 0 || state.isProcessing;
  }

  // --- Render Thumbnail Cards ---
  function renderThumbnails(fullRebuild = true) {
    if (fullRebuild) {
      el.thumbnailGrid.innerHTML = '';
      
      state.items.forEach((item, index) => {
        const card = createCardElement(item, index);
        el.thumbnailGrid.appendChild(card);
      });
    } else {
      // Just update existing card badges and indices for performance
      const cards = el.thumbnailGrid.querySelectorAll('.thumb-card');
      cards.forEach((card, index) => {
        const badge = card.querySelector('.page-badge');
        if (badge) badge.textContent = `#${index + 1}`;
        
        // Update keyboard reorder buttons disabled state
        const btnPrev = card.querySelector('.btn-move-prev');
        const btnNext = card.querySelector('.btn-move-next');
        if (btnPrev) btnPrev.disabled = index === 0;
        if (btnNext) btnNext.disabled = index === state.items.length - 1;
      });
    }
  }

  // Create single card element
  function createCardElement(item, index) {
    const card = document.createElement('div');
    card.className = 'thumb-card';
    card.setAttribute('role', 'listitem');
    card.dataset.id = item.id;

    // Formatting size
    const sizeStr = formatFileSize(item.size);

    card.innerHTML = `
      <div class="card-top-bar">
        <span class="page-badge">#${index + 1}</span>
        <div class="card-quick-actions">
          <button type="button" class="card-action-btn rotate-btn" title="หมุน 90° ตามเข็มนาฬิกา" aria-label="หมุนภาพ #${index + 1} 90 องศา">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          </button>
          <button type="button" class="card-action-btn delete-btn" title="ลบรูปภาพนี้" aria-label="ลบภาพ #${index + 1}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
      
      <div class="card-preview-container" title="ลากเพื่อสลับลำดับ">
        <img class="card-preview-img" src="${item.objectUrl}" alt="${escapeHtml(item.name)}" style="transform: rotate(${item.rotation}deg);">
      </div>

      <div class="card-meta">
        <span class="card-filename" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
        <div class="card-details">
          <span>${item.width} × ${item.height}</span>
          <span>${sizeStr}</span>
        </div>
      </div>

      <div class="card-reorder-nav">
        <button type="button" class="reorder-btn btn-move-prev" title="ย้ายไปข้างหน้า" ${index === 0 ? 'disabled' : ''}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          ย้ายหน้า
        </button>
        <button type="button" class="reorder-btn btn-move-next" title="ย้ายไปข้างหลัง" ${index === state.items.length - 1 ? 'disabled' : ''}>
          ย้ายหลัง
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    `;

    // Rotate Button
    const rotateBtn = card.querySelector('.rotate-btn');
    rotateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      item.rotation = (item.rotation + 90) % 360;
      const img = card.querySelector('.card-preview-img');
      img.style.transform = `rotate(${item.rotation}deg)`;
    });

    // Delete Button
    const deleteBtn = card.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteItem(item.id);
    });

    // Keyboard Reorder Buttons
    const btnPrev = card.querySelector('.btn-move-prev');
    btnPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      moveItem(item.id, -1);
    });

    const btnNext = card.querySelector('.btn-move-next');
    btnNext.addEventListener('click', (e) => {
      e.stopPropagation();
      moveItem(item.id, 1);
    });

    return card;
  }

  // --- Delete Item ---
  function deleteItem(id) {
    const idx = state.items.findIndex(it => it.id === id);
    if (idx !== -1) {
      const [removed] = state.items.splice(idx, 1);
      if (removed.objectUrl) {
        URL.revokeObjectURL(removed.objectUrl);
      }
      syncUI();
    }
  }

  // --- Move Item Position ---
  function moveItem(id, offset) {
    const idx = state.items.findIndex(it => it.id === id);
    if (idx === -1) return;
    const targetIdx = idx + offset;
    if (targetIdx < 0 || targetIdx >= state.items.length) return;

    const [moved] = state.items.splice(idx, 1);
    state.items.splice(targetIdx, 0, moved);
    syncUI();
  }

  // --- Rotate All Items ---
  function handleRotateAll() {
    if (state.items.length === 0) return;
    state.items.forEach(it => {
      it.rotation = (it.rotation + 90) % 360;
    });
    const cards = el.thumbnailGrid.querySelectorAll('.thumb-card');
    cards.forEach((card) => {
      const id = card.dataset.id;
      const it = state.items.find(x => x.id === id);
      if (it) {
        const img = card.querySelector('.card-preview-img');
        if (img) img.style.transform = `rotate(${it.rotation}deg)`;
      }
    });
    showToast('หมุนทุกภาพ 90° เรียบร้อย', 'success');
  }

  // --- Clear All Items ---
  function handleClearAll() {
    if (state.items.length === 0) return;
    
    const confirmDelete = window.confirm('คุณแน่ใจหรือไม่ว่าต้องการล้างรูปภาพทั้งหมด?');
    if (!confirmDelete) return;

    state.items.forEach(it => {
      if (it.objectUrl) {
        URL.revokeObjectURL(it.objectUrl);
      }
    });

    state.items = [];
    syncUI();
    showToast('ล้างรูปภาพทั้งหมดเรียบร้อยแล้ว', 'success');
  }

  // --- PDF Generation Engine ---
  async function generatePdf() {
    if (state.items.length === 0 || state.isProcessing) return;

    if (!window.PDFLib || !window.PDFLib.PDFDocument) {
      showToast('ไลบรารีสร้าง PDF ไม่พร้อมใช้งาน กรุณารีเฟรชหน้าเว็บ', 'error');
      return;
    }

    state.isProcessing = true;
    updateCountBadge();
    showProgressModal();

    const totalPages = state.items.length;
    let pdfDoc = null;

    try {
      updateProgress(0, totalPages, 'กำลังเริ่มต้นสร้างเอกสาร PDF...');
      
      pdfDoc = await window.PDFLib.PDFDocument.create();

      // Sequential Processing: 1 Image = 1 PDF Page (Zero Base64 bloat, strictly controlled memory)
      for (let i = 0; i < totalPages; i++) {
        const item = state.items[i];
        updateProgress(i + 1, totalPages, `กำลังประมวลผลรูปที่ ${i + 1} จาก ${totalPages}... (${escapeHtml(item.name)})`);

        // 1. Render processed image onto offscreen canvas with rotation & quality
        const processedImage = await renderImageForPdf(item, state.settings);

        // 2. Determine target page size in points
        const pageDimensions = calculatePageDimensions(item, state.settings, processedImage.aspectRatio);

        // 3. Add page to PDF
        const page = pdfDoc.addPage([pageDimensions.pageWidth, pageDimensions.pageHeight]);

        // 4. Embed JPEG image bytes into pdf-lib
        const embeddedImage = await pdfDoc.embedJpg(processedImage.jpegBytes);

        // 5. Calculate draw rect based on placement (Fit vs Fill) and margins
        const drawRect = calculateImageDrawRect(
          pageDimensions.pageWidth,
          pageDimensions.pageHeight,
          pageDimensions.margin,
          processedImage.aspectRatio,
          state.settings.placement
        );

        // 6. Draw image onto page
        page.drawImage(embeddedImage, {
          x: drawRect.x,
          y: drawRect.y,
          width: drawRect.width,
          height: drawRect.height
        });

        // 7. Clear temporary references immediately
        processedImage.jpegBytes = null;

        // Yield to browser event loop to allow GC and keep UI responsive
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      updateProgress(totalPages, totalPages, 'กำลังบันทึกและรวบรวมไฟล์ PDF...');

      // Save PDF as Uint8Array
      const pdfBytes = await pdfDoc.save();

      // Trigger browser download
      const safeFilename = sanitizeFilename(state.settings.filename);
      downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), safeFilename);

      hideProgressModal();
      showToast(`สร้างไฟล์ PDF สำเร็จ (${totalPages} หน้า) กำลังเริ่มดาวน์โหลด...`, 'success');

    } catch (err) {
      console.warn('PDF Generation Failed:', err);
      hideProgressModal();
      showToast('เกิดข้อผิดพลาดในการสร้าง PDF: ' + (err.message || 'หน่วยความจำไม่เพียงพอ'), 'error');
    } finally {
      state.isProcessing = false;
      updateCountBadge();
    }
  }

  // --- Render Image onto Canvas with Rotation, Resize, Quality ---
  async function renderImageForPdf(item, settings) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const rotation = (item.rotation || 0) % 360;
          const isRotated90or270 = (rotation === 90 || rotation === 270);

          // Original dimensions
          const srcWidth = img.naturalWidth || img.width;
          const srcHeight = img.naturalHeight || img.height;

          // Dimensions after rotation
          const rotWidth = isRotated90or270 ? srcHeight : srcWidth;
          const rotHeight = isRotated90or270 ? srcWidth : srcHeight;

          // Quality settings target
          const qualityConfig = QUALITY_SETTINGS[settings.quality] || QUALITY_SETTINGS.balanced;
          const maxDim = qualityConfig.maxDim;
          const jpegQuality = qualityConfig.quality;

          // Scale down if larger than maxDim to preserve memory & speed
          let scale = 1;
          const maxSide = Math.max(rotWidth, rotHeight);
          if (maxSide > maxDim) {
            scale = maxDim / maxSide;
          }

          const targetWidth = Math.round(rotWidth * scale);
          const targetHeight = Math.round(rotHeight * scale);

          // Create offscreen canvas
          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');

          // White background (in case of transparent PNG/WebP)
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetWidth, targetHeight);

          // Apply rotation transform
          ctx.save();
          ctx.translate(targetWidth / 2, targetHeight / 2);
          ctx.rotate((rotation * Math.PI) / 180);

          const drawW = (isRotated90or270 ? targetHeight : targetWidth);
          const drawH = (isRotated90or270 ? targetWidth : targetHeight);
          ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
          ctx.restore();

          // Convert canvas to JPEG blob / array buffer
          canvas.toBlob(blob => {
            if (!blob) {
              reject(new Error('Canvas export failed'));
              return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
              // Canvas cleanup
              canvas.width = 0;
              canvas.height = 0;
              resolve({
                jpegBytes: new Uint8Array(reader.result),
                aspectRatio: targetWidth / targetHeight,
                width: targetWidth,
                height: targetHeight
              });
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(blob);
          }, 'image/jpeg', jpegQuality);

        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error(`Failed to load image "${item.name}"`));
      img.src = item.objectUrl;
    });
  }

  // --- Calculate Page Dimensions ---
  function calculatePageDimensions(item, settings, imageAspectRatio) {
    const margin = MARGIN_PRESETS[settings.margin] || 0;
    let baseWidth, baseHeight;

    if (settings.paper === 'Original') {
      // Base on original image aspect ratio at standard 72 pt/in
      baseWidth = 595.28;
      baseHeight = 595.28 / imageAspectRatio;
    } else {
      const standardSize = PAPER_SIZES[settings.paper] || PAPER_SIZES.A4;
      baseWidth = standardSize.width;
      baseHeight = standardSize.height;
    }

    let isLandscape = false;
    if (settings.orientation === 'auto') {
      isLandscape = imageAspectRatio > 1.0;
    } else if (settings.orientation === 'landscape') {
      isLandscape = true;
    } else {
      isLandscape = false;
    }

    const pageWidth = isLandscape ? Math.max(baseWidth, baseHeight) : Math.min(baseWidth, baseHeight);
    const pageHeight = isLandscape ? Math.min(baseWidth, baseHeight) : Math.max(baseWidth, baseHeight);

    return {
      pageWidth,
      pageHeight,
      margin
    };
  }

  // --- Calculate Image Draw Rect (Fit vs Fill) ---
  function calculateImageDrawRect(pageWidth, pageHeight, margin, imgAspectRatio, placement) {
    const availWidth = Math.max(10, pageWidth - (margin * 2));
    const availHeight = Math.max(10, pageHeight - (margin * 2));
    const availRatio = availWidth / availHeight;

    let drawWidth, drawHeight;

    if (placement === 'fill') {
      // Fill: scale to cover available area (may overflow/crop outside margin)
      if (imgAspectRatio > availRatio) {
        drawHeight = availHeight;
        drawWidth = availHeight * imgAspectRatio;
      } else {
        drawWidth = availWidth;
        drawHeight = availWidth / imgAspectRatio;
      }
    } else {
      // Fit (default): scale to fit entirely inside available area (no crop)
      if (imgAspectRatio > availRatio) {
        drawWidth = availWidth;
        drawHeight = availWidth / imgAspectRatio;
      } else {
        drawHeight = availHeight;
        drawWidth = availHeight * imgAspectRatio;
      }
    }

    // Center image inside available area
    const x = margin + (availWidth - drawWidth) / 2;
    const y = margin + (availHeight - drawHeight) / 2;

    return { x, y, width: drawWidth, height: drawHeight };
  }

  // --- Download Trigger ---
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 2000);
  }

  // --- Filename Sanitizer ---
  function sanitizeFilename(rawName) {
    let name = (rawName || 'images-to-pdf').trim();
    // Remove invalid filename characters
    name = name.replace(/[\\/:*?"<>|]/g, '_');
    if (name.toLowerCase().endsWith('.pdf')) {
      name = name.slice(0, -4);
    }
    if (!name) name = 'images-to-pdf';
    return `${name}.pdf`;
  }

  // --- Progress Modal Helpers ---
  function showProgressModal() {
    el.progressModal.classList.remove('hidden');
  }

  function hideProgressModal() {
    el.progressModal.classList.add('hidden');
  }

  function updateProgress(current, total, message) {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    el.progressBarFill.style.width = `${percent}%`;
    el.progressPercent.textContent = `${percent}%`;
    el.progressPages.textContent = `${current} / ${total} หน้า`;
    if (message) {
      el.progressMessage.textContent = message;
    }
  }

  // --- Toast Notification System ---
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'error') icon = '⚠️';
    if (type === 'success') icon = '✅';

    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-message">${escapeHtml(message)}</span>
    `;

    el.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 4000);
  }

  // --- Format Utilities ---
  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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

  // Expose state for automated testing & validation
  window.__APP_STATE__ = state;
  window.__APP_UTILS__ = {
    handleFiles,
    deleteItem,
    moveItem,
    generatePdf,
    sanitizeFilename,
    calculatePageDimensions,
    calculateImageDrawRect
  };

  // Start app on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();


