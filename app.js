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

  // --- PDF LAB: Tool Registry ---
  const TOOL_REGISTRY = {
    'image-to-pdf': {
      id: 'image-to-pdf',
      name: 'IMAGE → PDF',
      status: 'ready',
      desc: 'แปลงรูปภาพเป็นเอกสาร PDF ในเครื่องของคุณ 100% รวดเร็ว ปลอดภัย ไม่ส่งไฟล์ขึ้นเซิร์ฟเวอร์'
    },
    'merge-pdf': {
      id: 'merge-pdf',
      name: 'รวม PDF',
      status: 'ready',
      iconSvg: '<path d="M8 2h11a2 2 0 0 1 2 2v11"/><rect x="3" y="7" width="13" height="13" rx="2"/>',
      desc: 'รวมไฟล์ PDF หลายไฟล์เข้าด้วยกันเป็นเอกสารเดียวอย่างรวดเร็ว'
    },
    'split-pdf': {
      id: 'split-pdf',
      name: 'แยก PDF',
      status: 'ready',
      iconSvg: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="2" y1="13" x2="22" y2="13" stroke-dasharray="3 3"/>',
      desc: 'เลือกหน้าที่ต้องการจาก PDF แล้วสร้างเป็นไฟล์ใหม่'
    },
    'organize-pdf': {
      id: 'organize-pdf',
      name: 'จัดหน้า PDF',
      status: 'ready',
      iconSvg: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
      desc: 'จัดเรียง หมุน และลบหน้า PDF ได้อย่างสะดวก'
    },
    'pdf-to-image': {
      id: 'pdf-to-image',
      name: 'PDF → รูปภาพ',
      status: 'ready',
      iconSvg: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
      desc: 'แปลงหน้าเอกสาร PDF เป็นไฟล์ภาพ JPG หรือ PNG คมชัด'
    },
    'page-number': {
      id: 'page-number',
      name: 'ใส่เลขหน้า',
      status: 'ready',
      iconSvg: '<path d="M4 19h16"/><line x1="10" y1="4" x2="8" y2="20"/><line x1="16" y1="4" x2="14" y2="20"/><line x1="6" y1="9" x2="18" y2="9"/><line x1="6" y1="15" x2="18" y2="15"/>',
      desc: 'เพิ่มหมายเลขหน้าลงในเอกสาร PDF ระบุตำแหน่งและรูปแบบเลขหน้า'
    },
    'ocr-pdf': {
      id: 'ocr-pdf',
      name: 'OCR PDF',
      status: 'ready',
      iconSvg: '<path d="M4 7V4h3"/><path d="M20 7V4h-3"/><path d="M4 17v3h3"/><path d="M20 17v3h-3"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="12" y1="9" x2="12" y2="15"/>',
      desc: 'สแกนและแปลงข้อความในรูปภาพหรือ PDF ที่สแกนมาให้เป็นข้อความที่ค้นหาและคัดลอกได้'
    },
    'watermark-pdf': {
      id: 'watermark-pdf',
      name: 'ใส่ลายน้ำ',
      status: 'coming-soon',
      iconSvg: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
      desc: 'ประทับตราหรือใส่ข้อความลายน้ำลงในเอกสาร PDF เพื่อป้องกันการคัดลอกผลงานครู'
    },
    'crop-pdf': {
      id: 'crop-pdf',
      name: 'ครอบตัด PDF',
      status: 'coming-soon',
      iconSvg: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
      desc: 'ครอบตัดส่วนเกินของขอบกระดาษในเอกสาร PDF ปรับขนาดให้เหมาะกับการอ่านบนหน้าจอหรือการพิมพ์'
    },
    'pdf-to-word': {
      id: 'pdf-to-word',
      name: 'PDF → Word',
      status: 'coming-soon',
      iconSvg: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>',
      desc: 'แปลงเอกสาร PDF ให้กลายเป็นไฟล์ Microsoft Word (DOCX) ที่สามารถแก้ไขข้อความได้โดยตรง'
    },
    'pdf-to-powerpoint': {
      id: 'pdf-to-powerpoint',
      name: 'PDF → PowerPoint',
      status: 'coming-soon',
      iconSvg: '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
      desc: 'แปลงเอกสาร PDF เป็นสไลด์ PowerPoint (PPTX) สำหรับนำไปใช้สอนในห้องเรียน'
    },
    'pdf-to-excel': {
      id: 'pdf-to-excel',
      name: 'PDF → Excel',
      status: 'coming-soon',
      iconSvg: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>',
      desc: 'ดึงตารางคะแนนและข้อมูลจากเอกสาร PDF ส่งออกเป็นไฟล์สเปรดชีต Excel (XLSX)'
    }
  };

  // --- Authoritative Application State ---
  const state = {
    activeTool: 'image-to-pdf',
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
    // Navigation & Lab
    navBrand: document.getElementById('navBrand'),
    toolsNav: document.getElementById('toolsNav'),
    btnMoreTools: document.getElementById('btnMoreTools'),
    navDropdownWrapper: document.getElementById('navDropdownWrapper'),
    moreToolsMenu: document.getElementById('moreToolsMenu'),
    
    // Screens
    uploadScreen: document.getElementById('uploadScreen'),
    workspaceScreen: document.getElementById('workspaceScreen'),
    comingSoonScreen: document.getElementById('comingSoonScreen'),
    comingSoonTitle: document.getElementById('comingSoonTitle'),
    comingSoonLead: document.getElementById('comingSoonLead'),
    comingSoonDesc: document.getElementById('comingSoonDesc'),
    comingSoonIcon: document.getElementById('comingSoonIcon'),
    btnBackToImageToPdf: document.getElementById('btnBackToImageToPdf'),

    // File input & Drop zones
    fileInput: document.getElementById('fileInput'),
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
    toastContainer: document.getElementById('toastContainer'),

    // Theme Toggle
    btnThemeToggle: document.getElementById('btnThemeToggle')
  };

  let sortableInstance = null;
  let idCounter = 1;

  // --- Initialization ---
  function init() {
    initTheme();
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

    // Helper to distinguish OS file drag vs internal card reorder drag
    function isFileDrag(e) {
      if (!e.dataTransfer || !e.dataTransfer.types) return false;
      const types = Array.from(e.dataTransfer.types);
      return types.includes('Files') || types.includes('application/x-moz-file');
    }

    let dragDepth = 0;

    // Window-level File Drag & Drop (Works on initial screen & active workspace)
    window.addEventListener('dragenter', (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepth++;
      if (state.items.length > 0) {
        el.workspaceDropArea.classList.add('drag-over');
      } else {
        el.initialDropZone.classList.add('drag-active');
      }
    });

    window.addEventListener('dragover', (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        e.dataTransfer.dropEffect = 'copy';
      } catch (_) {}
      if (state.items.length > 0) {
        el.workspaceDropArea.classList.add('drag-over');
      } else {
        el.initialDropZone.classList.add('drag-active');
      }
    });

    window.addEventListener('dragleave', (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        el.workspaceDropArea.classList.remove('drag-over');
        el.initialDropZone.classList.remove('drag-active');
      }
    });

    window.addEventListener('drop', (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepth = 0;
      el.workspaceDropArea.classList.remove('drag-over');
      el.initialDropZone.classList.remove('drag-active');

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

    // --- Teacher PDF Lab: Navigation Event Listeners ---
    // Brand Click (Return to IMAGE -> PDF)
    if (el.navBrand) {
      el.navBrand.addEventListener('click', () => switchTool('image-to-pdf'));
      el.navBrand.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          switchTool('image-to-pdf');
        }
      });
    }

    // Back to Image to PDF button in coming soon screen
    if (el.btnBackToImageToPdf) {
      el.btnBackToImageToPdf.addEventListener('click', () => switchTool('image-to-pdf'));
    }

    // Top Tool Navigation Buttons
    document.querySelectorAll('.nav-tool-item').forEach(btn => {
      if (btn.id === 'btnMoreTools') return;
      btn.addEventListener('click', () => {
        const toolId = btn.dataset.toolId;
        if (toolId) switchTool(toolId);
      });
    });

    // Dropdown Items
    document.querySelectorAll('.dropdown-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const toolId = btn.dataset.toolId;
        if (toolId) switchTool(toolId);
      });
    });

    // More Tools Dropdown Toggle
    if (el.btnMoreTools && el.navDropdownWrapper && el.moreToolsMenu) {
      el.btnMoreTools.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = el.navDropdownWrapper.classList.toggle('open');
        el.moreToolsMenu.classList.toggle('hidden', !isOpen);
        el.btnMoreTools.setAttribute('aria-expanded', String(isOpen));
      });

      // Close on click outside
      document.addEventListener('click', (e) => {
        if (!el.navDropdownWrapper.contains(e.target)) {
          closeMoreToolsDropdown();
        }
      });

      // Keyboard support: Escape closes dropdown
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && el.navDropdownWrapper.classList.contains('open')) {
          closeMoreToolsDropdown();
          el.btnMoreTools.focus();
        }
      });
    }

    // Theme Toggle (Dark / Light)
    if (el.btnThemeToggle) {
      el.btnThemeToggle.addEventListener('click', () => {
        toggleTheme();
      });
    }
  }

  // --- Theme Management ---
  function getEffectiveTheme() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }

  function applyTheme(theme) {
    const validTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', validTheme);
    try {
      localStorage.setItem('pdf-lab-theme', validTheme);
    } catch (_) {}

    if (el.btnThemeToggle) {
      const isLight = validTheme === 'light';
      const label = isLight ? 'เปลี่ยนเป็นโหมดมืด' : 'เปลี่ยนเป็นโหมดสว่าง';
      el.btnThemeToggle.setAttribute('aria-label', label);
      el.btnThemeToggle.setAttribute('title', `${label} (สลับโหมดมืด/สว่าง)`);
      el.btnThemeToggle.setAttribute('aria-pressed', String(isLight));
    }
  }

  function toggleTheme() {
    const current = getEffectiveTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  }

  function initTheme() {
    let saved = 'dark';
    try {
      saved = localStorage.getItem('pdf-lab-theme') || 'dark';
    } catch (_) {}
    applyTheme(saved);
  }

  // --- SortableJS Initialization ---
  function setupSortable() {
    if (window.Sortable && el.thumbnailGrid) {
      if (sortableInstance) {
        sortableInstance.destroy();
      }
      sortableInstance = new Sortable(el.thumbnailGrid, {
        animation: 180,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        filter: '.card-action-btn, .reorder-btn, button, input, select, svg, path',
        preventOnFilter: false,
        fallbackOnBody: true,
        swapThreshold: 0.65,
        touchStartThreshold: 3,
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
      if (state.activeTool === 'ocr-pdf' && window.PdfLabTools && window.PdfLabTools.handleOcrFiles) {
        showToast(`วางรูปภาพสำหรับ OCR จาก Clipboard สำเร็จ (${imageFiles.length} รูป)`, 'success');
        window.PdfLabTools.handleOcrFiles(imageFiles);
        return;
      }
      showToast(`วางรูปภาพจาก Clipboard สำเร็จ (${imageFiles.length} รูป)`, 'success');
      handleFiles(imageFiles);
    }
  }

  // --- File Processing Core ---
  async function handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    if (state.activeTool !== 'image-to-pdf') {
      switchTool('image-to-pdf');
    }

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

  // --- PDF LAB: Tool Switcher ---
  function switchTool(toolId) {
    if (!TOOL_REGISTRY[toolId]) return;
    state.activeTool = toolId;

    // Update active highlight on nav buttons
    document.querySelectorAll('.nav-tool-item').forEach(btn => {
      if (btn.id === 'btnMoreTools') return;
      const isCurrent = btn.dataset.toolId === toolId;
      btn.classList.toggle('active', isCurrent);
      if (isCurrent) {
        btn.setAttribute('aria-current', 'page');
        try {
          const track = document.getElementById('toolsNavTrack');
          if (track) {
            const btnLeft = btn.offsetLeft;
            const btnWidth = btn.offsetWidth;
            const trackWidth = track.clientWidth;
            if (btnLeft < track.scrollLeft || (btnLeft + btnWidth) > (track.scrollLeft + trackWidth)) {
              track.scrollTo({ left: Math.max(0, btnLeft - 12), behavior: 'smooth' });
            }
          }
        } catch (_) {}
      } else {
        btn.removeAttribute('aria-current');
      }
    });

    closeMoreToolsDropdown();

    const tool = TOOL_REGISTRY[toolId];
    if (toolId === 'image-to-pdf') {
      document.title = 'IMAGE → PDF | PDF LAB';
    } else {
      document.title = `${tool.name} | PDF LAB`;
      if (tool.status === 'coming-soon') {
        renderComingSoon(tool);
      }
    }

    syncUI();

    if (window.PdfLabTools && typeof window.PdfLabTools.onSwitchTool === 'function') {
      window.PdfLabTools.onSwitchTool(toolId);
    }
  }

  function closeMoreToolsDropdown() {
    if (el.navDropdownWrapper) {
      el.navDropdownWrapper.classList.remove('open');
    }
    if (el.moreToolsMenu) {
      el.moreToolsMenu.classList.add('hidden');
    }
    if (el.btnMoreTools) {
      el.btnMoreTools.setAttribute('aria-expanded', 'false');
    }
  }

  function renderComingSoon(tool) {
    if (el.comingSoonTitle) el.comingSoonTitle.textContent = tool.name;
    if (el.comingSoonLead) el.comingSoonLead.textContent = 'เครื่องมือนี้จะพร้อมใช้งานในเร็ว ๆ นี้';
    if (el.comingSoonDesc) el.comingSoonDesc.textContent = tool.desc;
    if (el.comingSoonIcon) {
      el.comingSoonIcon.innerHTML = `
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          ${tool.iconSvg || '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'}
        </svg>
      `;
    }
  }

  // --- UI Synchronization ---
  function syncUI() {
    // Hide all other tool views first
    const allToolViews = [
      'toolMergePdf',
      'toolSplitPdf',
      'toolOrganizePdf',
      'toolPdfToImage',
      'toolPageNumber',
      'toolOcrPdf'
    ];
    allToolViews.forEach(id => {
      const elView = document.getElementById(id);
      if (elView) elView.classList.add('hidden');
    });

    // When viewing IMAGE -> PDF
    if (state.activeTool === 'image-to-pdf') {
      if (el.comingSoonScreen) el.comingSoonScreen.classList.add('hidden');
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
      return;
    }

    // When viewing another tool: hide image-to-pdf screens
    el.uploadScreen.classList.add('hidden');
    el.workspaceScreen.classList.add('hidden');
    el.headerActions.classList.add('hidden');

    const tool = TOOL_REGISTRY[state.activeTool];
    if (tool && tool.status === 'ready') {
      if (el.comingSoonScreen) el.comingSoonScreen.classList.add('hidden');
      const targetViewMap = {
        'merge-pdf': 'toolMergePdf',
        'split-pdf': 'toolSplitPdf',
        'organize-pdf': 'toolOrganizePdf',
        'pdf-to-image': 'toolPdfToImage',
        'page-number': 'toolPageNumber',
        'ocr-pdf': 'toolOcrPdf'
      };
      const viewId = targetViewMap[state.activeTool];
      if (viewId) {
        const targetEl = document.getElementById(viewId);
        if (targetEl) targetEl.classList.remove('hidden');
      }
    } else {
      if (el.comingSoonScreen) el.comingSoonScreen.classList.remove('hidden');
    }
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
      setupSortable();
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
        <img class="card-preview-img" src="${item.objectUrl}" alt="${escapeHtml(item.name)}" draggable="false" style="transform: rotate(${item.rotation}deg);">
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
    calculateImageDrawRect,
    switchTool,
    syncUI,
    showToast,
    downloadBlob,
    showProgressModal,
    hideProgressModal,
    updateProgress,
    formatFileSize,
    escapeHtml,
    applyTheme,
    toggleTheme,
    getEffectiveTheme
  };

  // Start app on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();



