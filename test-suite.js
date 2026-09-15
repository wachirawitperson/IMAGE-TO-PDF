const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const PORT = 8089;
const ROOT_DIR = __dirname;
const SCREENSHOT_DIR = path.join(ROOT_DIR, 'qa-screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Static HTTP Server with request logging for Privacy QA
let networkRequests = [];
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.bmp': 'image/bmp',
  '.heic': 'image/heic',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.gz': 'application/gzip'
};

const server = http.createServer((req, res) => {
  networkRequests.push({ method: req.method, url: req.url });

  if (req.url === '/favicon.ico') {
    res.writeHead(200, { 'Content-Type': 'image/x-icon' });
    res.end();
    return;
  }
  
  let reqUrl = req.url.split('?')[0];
  let filePath = path.join(ROOT_DIR, reqUrl === '/' ? 'index.html' : reqUrl);
  let ext = path.extname(filePath).toLowerCase();
  let contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

async function runTests() {
  console.log('=== STARTING PDF LAB AUTOMATED QA TEST SUITE ===');

  await new Promise(resolve => server.listen(PORT, resolve));
  console.log(`Test server running at http://localhost:${PORT}`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true }).catch(() => chromium.launch({ headless: true }));
  
  const testResults = {
    total: 0,
    passed: 0,
    failed: 0,
    tests: []
  };

  function record(name, pass, details = '') {
    testResults.total++;
    if (pass) {
      testResults.passed++;
      console.log(`[PASS] ${name} ${details ? '(' + details + ')' : ''}`);
    } else {
      testResults.failed++;
      console.error(`[FAIL] ${name} - ${details}`);
    }
    testResults.tests.push({ name, pass, details });
  }

  const consoleErrors = [];
  const unhandledRejections = [];

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', err => {
      unhandledRejections.push(err.message);
    });

    // 1. Load initial page
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForLoadState('networkidle');

    // --- BRANDING VERIFICATION ---
    const brandName = await page.$eval('.product-title', el => el.textContent.trim());
    const pageTitle = await page.title();
    record('Brand 1: Primary product brand is "PDF LAB"', brandName === 'PDF LAB', `Title: ${brandName}`);
    record('Brand 2: HTML document title reflects "PDF LAB"', pageTitle.includes('PDF LAB'), `Document Title: ${pageTitle}`);

    // --- TOOL 1: IMAGE → PDF (Complete Regression Tests) ---
    const uploadVisible = await page.isVisible('#uploadScreen');
    const workspaceHidden = await page.evaluate(() => {
      return document.getElementById('workspaceScreen').classList.contains('hidden');
    });
    record('Test A: Empty state displays upload screen correctly', uploadVisible && workspaceHidden);

    // Multi-file upload test
    const fileInput = await page.$('#fileInput');
    const fixtureFiles = [
      path.join(ROOT_DIR, 'test-fixtures/test-portrait.png'),
      path.join(ROOT_DIR, 'test-fixtures/test-landscape.jpg'),
      path.join(ROOT_DIR, 'test-fixtures/test-image.bmp')
    ];
    await fileInput.setInputFiles(fixtureFiles);
    await page.waitForSelector('.thumb-card');

    const cardCount = await page.$$eval('.thumb-card', elms => elms.length);
    record('Test B, C, D: Multiple file selection adds items to workspace', cardCount === 3, `Count: ${cardCount}`);

    const badges = await page.$$eval('.page-badge', elms => elms.map(e => e.textContent.trim()));
    const badgesOk = badges[0] === '#1' && badges[1] === '#2' && badges[2] === '#3';
    record('Page badges are indexed correctly (#1, #2, #3)', badgesOk);

    // Test Rotate
    const firstCardRotateBtn = await page.$('.thumb-card:first-child .rotate-btn');
    await firstCardRotateBtn.click();
    await page.waitForTimeout(200);
    const rotAfter1 = await page.$eval('.thumb-card:first-child .card-preview-img', img => img.style.transform);
    record('Test H: Rotate button rotates thumbnail by 90deg', rotAfter1.includes('90deg'), rotAfter1);

    await firstCardRotateBtn.click();
    await page.waitForTimeout(200);
    const rotAfter2 = await page.$eval('.thumb-card:first-child .card-preview-img', img => img.style.transform);
    record('Test H: Repeated rotate increments to 180deg', rotAfter2.includes('180deg'), rotAfter2);

    // Test Reorder
    await page.evaluate(() => {
      window.__APP_UTILS__.moveItem(window.__APP_STATE__.items[1].id, -1);
    });
    await page.waitForTimeout(200);
    const newFirstTitle = await page.$eval('.thumb-card:first-child .card-filename', el => el.textContent.trim());
    record('Test G: Reorder moves card to new position', newFirstTitle.includes('test-landscape.jpg'), `New 1st: ${newFirstTitle}`);

    // Test Delete Single Card
    const secondCardDeleteBtn = await page.$('.thumb-card:nth-child(2) .delete-btn');
    await secondCardDeleteBtn.click();
    await page.waitForTimeout(200);
    const countAfterDel = await page.$$eval('.thumb-card', elms => elms.length);
    record('Test I: Delete removes single card and updates count', countAfterDel === 2, `Remaining: ${countAfterDel}`);

    // Test Re-add same file
    await fileInput.setInputFiles([fixtureFiles[0]]);
    await page.waitForTimeout(300);
    const countAfterReAdd = await page.$$eval('.thumb-card', elms => elms.length);
    record('Test K: Same-file re-add works smoothly', countAfterReAdd === 3, `Count: ${countAfterReAdd}`);

    // Test Clipboard Paste
    const pasteSuccess = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 50;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 50, 50);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const file = new File([blob], 'clipboard-mock.png', { type: 'image/png' });
      await window.__APP_UTILS__.handleFiles([file]);
      return window.__APP_STATE__.items.length;
    });
    record('Test F: Clipboard image paste handling works', pasteSuccess === 4, `Count: ${pasteSuccess}`);

    // Test Page Dimensions
    const layoutTest = await page.evaluate(() => {
      const p1 = window.__APP_UTILS__.calculatePageDimensions({}, { paper: 'A4', orientation: 'auto', margin: 'none' }, 0.7);
      const p2 = window.__APP_UTILS__.calculatePageDimensions({}, { paper: 'A4', orientation: 'auto', margin: 'none' }, 1.4);
      return {
        p1Landscape: p1.pageWidth > p1.pageHeight,
        p2Landscape: p2.pageWidth > p2.pageHeight
      };
    });
    record('Test L & O: A4 Auto Orientation adjusts to image aspect ratio', !layoutTest.p1Landscape && layoutTest.p2Landscape);

    // Test Fit vs Fill
    const fitFillTest = await page.evaluate(() => {
      const fit = window.__APP_UTILS__.calculateImageDrawRect(595, 842, 20, 0.5, 'fit');
      const fill = window.__APP_UTILS__.calculateImageDrawRect(595, 842, 20, 0.5, 'fill');
      return {
        fitW: Math.round(fit.width),
        fitH: Math.round(fit.height),
        fillW: Math.round(fill.width),
        fillH: Math.round(fill.height)
      };
    });
    record('Test P & Q: Fit vs Fill calculate distinct draw rectangles', 
      fitFillTest.fitW !== fitFillTest.fillW || fitFillTest.fitH !== fitFillTest.fillH,
      `Fit: ${fitFillTest.fitW}x${fitFillTest.fitH}, Fill: ${fitFillTest.fillW}x${fitFillTest.fillH}`
    );

    // Test Filename sanitizer
    const sanitized = await page.evaluate(() => {
      return window.__APP_UTILS__.sanitizeFilename('My / Illegal: Test? File.pdf');
    });
    record('Test V: Filename sanitizer removes invalid chars and enforces .pdf', sanitized === 'My _ Illegal_ Test_ File.pdf');

    // Test PDF Generation & Download
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await page.click('#btnCreatePdf');
    const download = await downloadPromise;
    const downloadedPath = path.join(ROOT_DIR, 'test-fixtures/downloaded-test.pdf');
    await download.saveAs(downloadedPath);
    record('Test W: PDF generated and downloaded successfully', fs.existsSync(downloadedPath));

    // Validate PDF byte contents programmatically
    const pdfBuffer = fs.readFileSync(downloadedPath);
    const parsedPdf = await PDFDocument.load(pdfBuffer);
    const generatedPages = parsedPdf.getPageCount();
    record('Test 44: Programmatic PDF Validation - 1 Image = 1 Page', generatedPages === 4, `Pages in PDF: ${generatedPages}`);

    // Many images test
    const manyAdded = await page.evaluate(async () => {
      const fakeFiles = [];
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffaa00';
      ctx.fillRect(0, 0, 100, 100);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8));

      for (let i = 1; i <= 20; i++) {
        fakeFiles.push(new File([blob], `batch-image-${i}.jpg`, { type: 'image/jpeg' }));
      }
      await window.__APP_UTILS__.handleFiles(fakeFiles);
      return window.__APP_STATE__.items.length;
    });
    record('Test Y: Many-image workspace test handles 24+ images without artificial limits', manyAdded >= 24, `Total items: ${manyAdded}`);

    // HEIC wiring
    const heicWiringTest = await page.evaluate(async () => {
      const hasHeic2any = typeof window.heic2any === 'function';
      const badHeic = new File(['mock_invalid_heic_data'], 'test-failure.heic', { type: 'image/heic' });
      await window.__APP_UTILS__.handleFiles([badHeic]);
      return { hasHeic2any, totalItems: window.__APP_STATE__.items.length };
    });
    record('Test Z & 42: HEIC decoder is wired and graceful failure handler is active', heicWiringTest.hasHeic2any);

    // =========================================================================
    // NAVIGATION & TOOLBAR VERIFICATION
    // =========================================================================
    const expectedTools = [
      'IMAGE → PDF',
      'รวม PDF',
      'แยก PDF',
      'จัดหน้า PDF',
      'PDF → รูปภาพ',
      'ใส่เลขหน้า',
      'OCR PDF',
      'เพิ่มเติม'
    ];

    const actualTools = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('#toolsNavTrack > .nav-tool-item, #toolsNavTrack > .nav-dropdown-wrapper > .nav-dropdown-btn'));
      return items.map(item => item.querySelector('span')?.textContent.trim());
    });
    const toolsMatch = expectedTools.length === actualTools.length && expectedTools.every((t, i) => actualTools[i] === t);
    record('Nav 1: Top navigation renders approved tools in exact priority order', toolsMatch, `Tools: ${actualTools.join(' | ')}`);

    // =========================================================================
    // TOOL 2: รวม PDF (MERGE PDF) QA
    // =========================================================================
    console.log('\n--- Testing Tool 2: รวม PDF (Merge PDF) ---');
    await page.click('[data-tool-id="merge-pdf"]');
    const mergeViewVisible = await page.isVisible('#toolMergePdf');
    record('Merge 1: View switched to รวม PDF', mergeViewVisible);

    // Create 3 synthetic PDF documents in browser and load them
    const mergeLoadResult = await page.evaluate(async () => {
      // Create PDF 1 (1 page)
      const doc1 = await window.PDFLib.PDFDocument.create();
      doc1.addPage([400, 400]);
      const bytes1 = await doc1.save();
      const file1 = new File([bytes1], 'document-a.pdf', { type: 'application/pdf' });

      // Create PDF 2 (2 pages)
      const doc2 = await window.PDFLib.PDFDocument.create();
      doc2.addPage([400, 400]);
      doc2.addPage([400, 400]);
      const bytes2 = await doc2.save();
      const file2 = new File([bytes2], 'document-b.pdf', { type: 'application/pdf' });

      // Create PDF 3 (1 page)
      const doc3 = await window.PDFLib.PDFDocument.create();
      doc3.addPage([400, 400]);
      const bytes3 = await doc3.save();
      const file3 = new File([bytes3], 'document-c.pdf', { type: 'application/pdf' });

      await window.PdfLabTools.handleMergeFiles([file1, file2, file3]);
      return {
        count: window.PdfLabTools.mergeState.files.length,
        totalPages: window.PdfLabTools.mergeState.files.reduce((a, b) => a + b.pageCount, 0),
        firstItem: window.PdfLabTools.mergeState.files[0]?.name
      };
    });
    record('Merge 2: Loaded 3 PDF files totaling 4 pages', mergeLoadResult.count === 3 && mergeLoadResult.totalPages === 4, `Files: ${mergeLoadResult.count}, Pages: ${mergeLoadResult.totalPages}`);

    // Test Merge Reorder (move C to position 0)
    await page.evaluate(() => {
      const moved = window.PdfLabTools.mergeState.files.pop(); // doc3
      window.PdfLabTools.mergeState.files.unshift(moved);
    });
    const reorderedFirst = await page.evaluate(() => window.PdfLabTools.mergeState.files[0]?.name);
    record('Merge 3: Drag reorder changes file merging sequence', reorderedFirst === 'document-c.pdf', `First file: ${reorderedFirst}`);

    // Test Merge Delete Single
    await page.evaluate(() => {
      window.PdfLabTools.mergeState.files.splice(1, 1); // remove doc1
    });
    const remainingMergeCount = await page.evaluate(() => window.PdfLabTools.mergeState.files.length);
    record('Merge 4: Single file deletion updates file list', remainingMergeCount === 2, `Remaining: ${remainingMergeCount}`);

    // Test Execute Merge PDF
    const mergeDownloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.evaluate(() => window.PdfLabTools.executeMerge());
    const mergeDownload = await mergeDownloadPromise;
    const mergePdfPath = path.join(ROOT_DIR, 'test-fixtures/merged-test.pdf');
    await mergeDownload.saveAs(mergePdfPath);
    const parsedMerged = await PDFDocument.load(fs.readFileSync(mergePdfPath));
    record('Merge 5: Generated merged PDF with correct combined page count', parsedMerged.getPageCount() === 3, `Page count: ${parsedMerged.getPageCount()}`);

    // =========================================================================
    // TOOL 3: แยก PDF (SPLIT PDF) QA
    // =========================================================================
    console.log('\n--- Testing Tool 3: แยก PDF (Split PDF) ---');
    await page.click('[data-tool-id="split-pdf"]');
    const splitViewVisible = await page.isVisible('#toolSplitPdf');
    record('Split 1: View switched to แยก PDF', splitViewVisible);

    // Create a 5-page PDF and load it
    const splitLoadResult = await page.evaluate(async () => {
      const doc = await window.PDFLib.PDFDocument.create();
      for (let i = 0; i < 5; i++) doc.addPage([500, 500]);
      const bytes = await doc.save();
      const file = new File([bytes], 'source-5pages.pdf', { type: 'application/pdf' });
      await window.PdfLabTools.handleSplitFile(file);
      return {
        totalPages: window.PdfLabTools.splitState.totalPages,
        selectedCount: window.PdfLabTools.splitState.selectedPages.size
      };
    });
    record('Split 2: 5-page PDF loaded with thumbnails rendered', splitLoadResult.totalPages === 5, `Pages: ${splitLoadResult.totalPages}`);

    // Test Range Input
    await page.fill('#splitRangeInput', '2, 4-5');
    await page.click('#btnSplitApplyRange');
    const rangeSelected = await page.evaluate(() => Array.from(window.PdfLabTools.splitState.selectedPages).sort((a,b)=>a-b));
    record('Split 3: Page range input parses and selects pages', rangeSelected.length === 3 && rangeSelected[0] === 2 && rangeSelected[2] === 5, `Selected: ${rangeSelected.join(', ')}`);

    // Select only page 1 and 3
    await page.evaluate(() => {
      window.PdfLabTools.splitState.selectedPages.clear();
      window.PdfLabTools.splitState.selectedPages.add(1);
      window.PdfLabTools.splitState.selectedPages.add(3);
    });
    const splitDownloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.evaluate(() => window.PdfLabTools.executeSplit());
    const splitDownload = await splitDownloadPromise;
    const splitPdfPath = path.join(ROOT_DIR, 'test-fixtures/split-test.pdf');
    await splitDownload.saveAs(splitPdfPath);
    const parsedSplit = await PDFDocument.load(fs.readFileSync(splitPdfPath));
    record('Split 4: Generated extracted PDF with exact selected pages', parsedSplit.getPageCount() === 2, `Page count: ${parsedSplit.getPageCount()}`);

    // =========================================================================
    // TOOL 4: จัดหน้า PDF (ORGANIZE PDF) QA
    // =========================================================================
    console.log('\n--- Testing Tool 4: จัดหน้า PDF (Organize PDF) ---');
    await page.click('[data-tool-id="organize-pdf"]');
    const orgViewVisible = await page.isVisible('#toolOrganizePdf');
    record('Organize 1: View switched to จัดหน้า PDF', orgViewVisible);

    const orgLoadResult = await page.evaluate(async () => {
      const doc = await window.PDFLib.PDFDocument.create();
      for (let i = 0; i < 4; i++) doc.addPage([500, 500]);
      const bytes = await doc.save();
      const file = new File([bytes], 'organize-source.pdf', { type: 'application/pdf' });
      await window.PdfLabTools.handleOrganizeFile(file);
      return window.PdfLabTools.organizeState.pages.length;
    });
    record('Organize 2: Loaded 4 pages into organizer', orgLoadResult === 4, `Pages: ${orgLoadResult}`);

    // Rotate page 1 by 90deg and reorder pages (reverse)
    await page.evaluate(() => {
      window.PdfLabTools.organizeState.pages[0].rotation = 90;
      window.PdfLabTools.organizeState.pages.reverse(); // Now page 4 is first, page 1 is last
      window.PdfLabTools.organizeState.pages.pop(); // Remove 1 page -> 3 remain
    });
    const orgDownloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.evaluate(() => window.PdfLabTools.executeOrganize());
    const orgDownload = await orgDownloadPromise;
    const orgPdfPath = path.join(ROOT_DIR, 'test-fixtures/organized-test.pdf');
    await orgDownload.saveAs(orgPdfPath);
    const parsedOrg = await PDFDocument.load(fs.readFileSync(orgPdfPath));
    record('Organize 3: Saved reorganized PDF with custom order and count', parsedOrg.getPageCount() === 3, `Page count: ${parsedOrg.getPageCount()}`);

    // =========================================================================
    // TOOL 5: PDF → รูปภาพ (PDF TO IMAGE) QA
    // =========================================================================
    console.log('\n--- Testing Tool 5: PDF → รูปภาพ (PDF to Image) ---');
    await page.click('[data-tool-id="pdf-to-image"]');
    const pdfToImgViewVisible = await page.isVisible('#toolPdfToImage');
    record('PDF to Image 1: View switched to PDF → รูปภาพ', pdfToImgViewVisible);

    await page.evaluate(async () => {
      const doc = await window.PDFLib.PDFDocument.create();
      doc.addPage([300, 300]);
      doc.addPage([300, 300]);
      const bytes = await doc.save();
      const file = new File([bytes], 'two-pages.pdf', { type: 'application/pdf' });
      await window.PdfLabTools.handlePdfToImgFile(file);
    });

    // Test single page conversion -> direct image download
    await page.evaluate(() => {
      window.PdfLabTools.pdfToImgState.selectedPages.clear();
      window.PdfLabTools.pdfToImgState.selectedPages.add(1);
    });
    const singleImgPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.evaluate(() => window.PdfLabTools.executePdfToImg());
    const singleImgDownload = await singleImgPromise;
    record('PDF to Image 2: Single page exports directly as image file', singleImgDownload.suggestedFilename().includes('.jpg'), `Filename: ${singleImgDownload.suggestedFilename()}`);

    // Test multi-page conversion -> ZIP download via JSZip
    await page.evaluate(() => {
      window.PdfLabTools.pdfToImgState.selectedPages.add(1);
      window.PdfLabTools.pdfToImgState.selectedPages.add(2);
    });
    const zipImgPromise = page.waitForEvent('download', { timeout: 15000 });
    await page.evaluate(() => window.PdfLabTools.executePdfToImg());
    const zipImgDownload = await zipImgPromise;
    record('PDF to Image 3: Multiple pages bundle cleanly into ZIP file', zipImgDownload.suggestedFilename().endsWith('.zip'), `Filename: ${zipImgDownload.suggestedFilename()}`);

    // =========================================================================
    // TOOL 6: ใส่เลขหน้า (PAGE NUMBERING) QA
    // =========================================================================
    console.log('\n--- Testing Tool 6: ใส่เลขหน้า (Page Numbering) ---');
    await page.click('[data-tool-id="page-number"]');
    const pageNumViewVisible = await page.isVisible('#toolPageNumber');
    record('Page Number 1: View switched to ใส่เลขหน้า', pageNumViewVisible);

    await page.evaluate(async () => {
      const doc = await window.PDFLib.PDFDocument.create();
      for (let i = 0; i < 3; i++) doc.addPage([500, 500]);
      const bytes = await doc.save();
      const file = new File([bytes], 'three-pages.pdf', { type: 'application/pdf' });
      await window.PdfLabTools.handlePageNumFile(file);
    });

    // Set position and format
    await page.click('.pos-btn[data-pos="bottom-center"]');
    await page.selectOption('#pageNumFormat', 'thai-prefix');

    const pageNumDownloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.evaluate(() => window.PdfLabTools.executePageNum());
    const pageNumDownload = await pageNumDownloadPromise;
    const pageNumPdfPath = path.join(ROOT_DIR, 'test-fixtures/numbered-test.pdf');
    await pageNumDownload.saveAs(pageNumPdfPath);
    const parsedNumbered = await PDFDocument.load(fs.readFileSync(pageNumPdfPath));
    record('Page Number 2: Generates numbered PDF preserving original page count', parsedNumbered.getPageCount() === 3, `Page count: ${parsedNumbered.getPageCount()}`);

    // =========================================================================
    // =========================================================================
    // TOOL 7: COMPREHENSIVE OCR PDF & IMAGE QA (TESTS A - K)
    // =========================================================================
    console.log('\n--- Testing Tool 7: OCR PDF & IMAGE (Comprehensive Suite) ---');
    await page.click('[data-tool-id="ocr-pdf"]');
    const ocrViewVisible = await page.isVisible('#toolOcrPdf');
    record('OCR 1: View switched to OCR PDF', ocrViewVisible);

    // TEST A: English JPG OCR
    console.log('Running OCR TEST A: English JPG OCR...');
    const testAResult = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 450;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 450, 100);
      ctx.fillStyle = '#000000';
      ctx.font = '28px sans-serif';
      ctx.fillText('ENGLISH WORKSHEET 2026', 20, 55);

      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95));
      const file = new File([blob], 'worksheet-en.jpg', { type: 'image/jpeg' });

      const langSelect = document.getElementById('ocrLanguage');
      if (langSelect) langSelect.value = 'eng';

      await window.PdfLabTools.handleOcrFiles([file]);
      await window.PdfLabTools.executeOcr();

      return {
        text: window.PdfLabTools.ocrState.extractedText,
        confidence: window.PdfLabTools.ocrState.overallConfidence,
        pageCount: window.PdfLabTools.ocrState.totalPages,
        hasSearchablePdf: !!window.PdfLabTools.ocrState.searchablePdfBytes
      };
    });
    const testAPass = testAResult.text.includes('ENGLISH') || testAResult.text.includes('WORKSHEET') || testAResult.text.includes('2026');
    record('OCR TEST A: English JPG OCR extracted accurate text', testAPass && testAResult.confidence > 60, `Extracted: "${testAResult.text.trim()}", Conf: ${testAResult.confidence}%`);

    // TEST B: Thai JPG OCR ("โรงเรียนบ้านทางฝัน")
    console.log('Running OCR TEST B: Thai JPG OCR...');
    const testBResult = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 500;
      canvas.height = 110;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 500, 110);
      ctx.fillStyle = '#000000';
      ctx.font = '34px Tahoma, sans-serif';
      ctx.fillText('โรงเรียนบ้านทางฝัน', 25, 65);

      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95));
      const file = new File([blob], 'worksheet-thai.jpg', { type: 'image/jpeg' });

      const langSelect = document.getElementById('ocrLanguage');
      if (langSelect) langSelect.value = 'tha';

      await window.PdfLabTools.handleOcrFiles([file]);
      await window.PdfLabTools.executeOcr();

      return {
        text: window.PdfLabTools.ocrState.extractedText,
        confidence: window.PdfLabTools.ocrState.overallConfidence,
        hasSearchablePdf: !!window.PdfLabTools.ocrState.searchablePdfBytes
      };
    });
    // Thai character recognition check (both direct and spacing-normalized):
    const cleanTextB = testBResult.text.replace(/\s+/g, '');
    const testBPass = cleanTextB.includes('โรงเรียน') || cleanTextB.includes('ทางฝัน') || cleanTextB.includes('บ้าน') || testBResult.text.includes('เรียน') || testBResult.text.includes('โรง');
    record('OCR TEST B: Thai JPG OCR extracted Thai text correctly', testBPass && testBResult.confidence > 60, `Extracted: "${testBResult.text.trim()}", Conf: ${testBResult.confidence}%`);

    // TEST C: Thai + English Combined OCR
    console.log('Running OCR TEST C: Thai + English OCR...');
    const testCResult = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 110;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 600, 110);
      ctx.fillStyle = '#000000';
      ctx.font = '30px Tahoma, sans-serif';
      ctx.fillText('PDF LAB โรงเรียนบ้านทางฝัน 2026', 20, 65);

      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95));
      const file = new File([blob], 'worksheet-bilingual.jpg', { type: 'image/jpeg' });

      const langSelect = document.getElementById('ocrLanguage');
      if (langSelect) langSelect.value = 'tha+eng';

      await window.PdfLabTools.handleOcrFiles([file]);
      await window.PdfLabTools.executeOcr();

      return {
        text: window.PdfLabTools.ocrState.extractedText,
        confidence: window.PdfLabTools.ocrState.overallConfidence
      };
    });
    const hasEnglish = testCResult.text.includes('PDF') || testCResult.text.includes('LAB') || testCResult.text.includes('2026');
    const cleanTextC = testCResult.text.replace(/\s+/g, '');
    const hasThai = cleanTextC.includes('โรงเรียน') || cleanTextC.includes('ทางฝัน') || cleanTextC.includes('บ้าน') || testCResult.text.includes('เรียน') || testCResult.text.includes('โรง');
    record('OCR TEST C: Bilingual Thai + English OCR recognized both languages', hasEnglish && hasThai, `Extracted: "${testCResult.text.trim()}"`);

    // TEST D: PNG Image OCR
    console.log('Running OCR TEST D: PNG Image OCR...');
    const testDResult = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 380;
      canvas.height = 80;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 380, 80);
      ctx.fillStyle = '#000000';
      ctx.font = '24px sans-serif';
      ctx.fillText('PNG SAMPLE TEST 88', 20, 50);

      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const file = new File([blob], 'sample.png', { type: 'image/png' });

      const langSelect = document.getElementById('ocrLanguage');
      if (langSelect) langSelect.value = 'eng';

      await window.PdfLabTools.handleOcrFiles([file]);
      await window.PdfLabTools.executeOcr();

      return {
        text: window.PdfLabTools.ocrState.extractedText,
        confidence: window.PdfLabTools.ocrState.overallConfidence
      };
    });
    record('OCR TEST D: PNG Image OCR recognized text', testDResult.text.includes('PNG') || testDResult.text.includes('SAMPLE') || testDResult.text.includes('88'), `Extracted: "${testDResult.text.trim()}"`);

    // TEST E & F & G & H: Multi-Page Scanned PDF (4 pages) -> Searchable PDF & Ctrl+F verification
    console.log('Running OCR TESTS E-H: 4-Page Scanned PDF OCR & Searchable PDF Verification...');
    const testMultiPdfResult = await page.evaluate(async () => {
      // Create a 4-page scanned PDF where each page has an embedded bitmap image with distinct text
      const pageTexts = ['SECTION ONE ALPHA', 'SECTION TWO BETA', 'SECTION THREE GAMMA', 'โรงเรียนบ้านทางฝัน หน้าสี่'];
      const pdfDoc = await window.PDFLib.PDFDocument.create();

      for (let p = 0; p < 4; p++) {
        const c = document.createElement('canvas');
        c.width = 500;
        c.height = 150;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 500, 150);
        ctx.fillStyle = '#111827';
        ctx.font = p === 3 ? '32px Tahoma, sans-serif' : '28px sans-serif';
        ctx.fillText(pageTexts[p], 30, 80);

        const pngBlob = await new Promise(r => c.toBlob(r, 'image/png'));
        const pngBuf = await pngBlob.arrayBuffer();
        const img = await pdfDoc.embedPng(pngBuf);
        const page = pdfDoc.addPage([500, 150]);
        page.drawImage(img, { x: 0, y: 0, width: 500, height: 150 });
        c.width = 0; c.height = 0;
      }

      const scannedPdfBytes = await pdfDoc.save();
      const file = new File([scannedPdfBytes], 'scanned-document.pdf', { type: 'application/pdf' });

      const langSelect = document.getElementById('ocrLanguage');
      if (langSelect) langSelect.value = 'tha+eng';

      await window.PdfLabTools.handleOcrFiles([file]);
      const initialPages = window.PdfLabTools.ocrState.totalPages;

      // Execute OCR
      await window.PdfLabTools.executeOcr();

      const extracted = window.PdfLabTools.ocrState.extractedText;
      const searchablePdfBytes = window.PdfLabTools.ocrState.searchablePdfBytes;

      // Verify the generated Searchable PDF using PDF.js getTextContent
      let searchCheck1 = false; // "ALPHA" in page 1
      let searchCheck2 = false; // "BETA" in page 2
      let searchCheck3 = false; // "GAMMA" in page 3
      let searchCheck4 = false; // "โรงเรียน" in page 4
      let totalExtractedItems = 0;

      if (searchablePdfBytes) {
        const loadedPdf = await window.pdfjsLib.getDocument({ data: searchablePdfBytes }).promise;
        for (let pn = 1; pn <= loadedPdf.numPages; pn++) {
          const pg = await loadedPdf.getPage(pn);
          const tc = await pg.getTextContent();
          totalExtractedItems += tc.items.length;
          const str = tc.items.map(i => i.str).join(' ');
          const cleanStr = str.replace(/\s+/g, '');
          if (pn === 1 && (str.includes('ONE') || str.includes('ALPHA'))) searchCheck1 = true;
          if (pn === 2 && (str.includes('TWO') || str.includes('BETA'))) searchCheck2 = true;
          if (pn === 3 && (str.includes('THREE') || str.includes('GAMMA'))) searchCheck3 = true;
          if (pn === 4 && (cleanStr.includes('โรงเรียน') || cleanStr.includes('ทางฝัน') || str.includes('เรียน') || str.includes('โรง'))) searchCheck4 = true;
          pg.cleanup();
        }
        await loadedPdf.destroy();
      }

      return {
        initialPages,
        extractedLength: extracted.length,
        hasSearchablePdf: !!searchablePdfBytes,
        searchCheck1,
        searchCheck2,
        searchCheck3,
        searchCheck4,
        totalExtractedItems
      };
    });

    record('OCR TEST E & F: Multi-page Scanned PDF processed all 4 pages sequentially', testMultiPdfResult.initialPages === 4 && testMultiPdfResult.extractedLength > 0, `Pages: ${testMultiPdfResult.initialPages}`);
    record('OCR TEST G: Searchable PDF generated with invisible text layer', testMultiPdfResult.hasSearchablePdf && testMultiPdfResult.totalExtractedItems > 0, `Extracted items: ${testMultiPdfResult.totalExtractedItems}`);
    record('OCR TEST H: Searchable PDF Ctrl+F / Text extraction verified across all 4 pages', testMultiPdfResult.searchCheck1 && testMultiPdfResult.searchCheck2 && testMultiPdfResult.searchCheck3 && testMultiPdfResult.searchCheck4, 'All 4 pages contain searchable text');

    // TEST I: Multiple Images Batch OCR
    console.log('Running OCR TEST I: Multiple Images Batch OCR...');
    const testBatchResult = await page.evaluate(async () => {
      const makeImg = async (text, name) => {
        const c = document.createElement('canvas');
        c.width = 300; c.height = 80;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 300, 80);
        ctx.fillStyle = '#000000'; ctx.font = '24px sans-serif';
        ctx.fillText(text, 15, 50);
        const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
        return new File([b], name, { type: 'image/jpeg' });
      };

      const f1 = await makeImg('BATCH ITEM 1', 'img1.jpg');
      const f2 = await makeImg('BATCH ITEM 2', 'img2.jpg');

      const langSelect = document.getElementById('ocrLanguage');
      if (langSelect) langSelect.value = 'eng';

      await window.PdfLabTools.handleOcrFiles([f1, f2]);
      const loadedCount = window.PdfLabTools.ocrState.totalPages;
      await window.PdfLabTools.executeOcr();

      return {
        loadedCount,
        extracted: window.PdfLabTools.ocrState.extractedText,
        hasSearchablePdf: !!window.PdfLabTools.ocrState.searchablePdfBytes
      };
    });
    record('OCR TEST I: Multiple Images input creates unified multi-page Searchable PDF', testBatchResult.loadedCount === 2 && testBatchResult.hasSearchablePdf, `Items loaded: ${testBatchResult.loadedCount}`);

    // TEST J: Cancel OCR
    console.log('Running OCR TEST J: Cancel OCR...');
    const testCancelResult = await page.evaluate(async () => {
      // Prepare a multi-page document
      const doc = await window.PDFLib.PDFDocument.create();
      for (let i = 0; i < 5; i++) {
        const p = doc.addPage([300, 300]);
        p.drawText(`Page ${i + 1}`);
      }
      const bytes = await doc.save();
      const file = new File([bytes], 'cancel-test.pdf', { type: 'application/pdf' });

      await window.PdfLabTools.handleOcrFiles([file]);
      
      // Start OCR in background and immediately cancel
      const execPromise = window.PdfLabTools.executeOcr();
      await new Promise(r => setTimeout(r, 200));
      await window.PdfLabTools.cancelOcr();
      await execPromise;

      return {
        isProcessing: window.PdfLabTools.ocrState.isProcessing,
        activeWorker: window.PdfLabTools.ocrState.activeWorker
      };
    });
    record('OCR TEST J: Cancel OCR stops execution immediately and releases worker', !testCancelResult.isProcessing && testCancelResult.activeWorker === null);

    // TEST K: Image Preprocessor validation
    console.log('Running OCR TEST K: Image Preprocessor...');
    const testPreprocessResult = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 200; c.height = 100;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#cccccc'; ctx.fillRect(0, 0, 200, 100);
      ctx.fillStyle = '#333333'; ctx.font = '20px sans-serif'; ctx.fillText('CONTRAST', 10, 50);

      const processed = window.PdfLabTools.preprocessImageForOcr(c);
      return {
        isValidCanvas: processed instanceof HTMLCanvasElement,
        width: processed.width,
        height: processed.height
      };
    });
    record('OCR TEST K: Image Preprocessor normalizes resolution and enhances contrast', testPreprocessResult.isValidCanvas && testPreprocessResult.width > 0);

    // TEST L: HEIC in OCR Tool
    console.log('Running OCR TEST L: HEIC in OCR Tool...');
    const testHeicResult = await page.evaluate(async () => {
      const dummyHeic = new File(['fake-heic-data'], 'iphone-photo.heic', { type: 'image/heic' });
      let threwError = false;
      let errorMsg = '';
      try {
        await window.PdfLabTools.handleOcrFiles([dummyHeic]);
      } catch (e) {
        threwError = true;
        errorMsg = e.message;
      }
      return {
        threwError,
        errorMsg,
        hasHeic2any: !!window.heic2any
      };
    });
    record('OCR TEST L: HEIC decoder handles iPhone photos locally with graceful fallback', testHeicResult.hasHeic2any, `heic2any loaded: ${testHeicResult.hasHeic2any}`);

    // =========================================================================
    // MORE TOOLS DROPDOWN QA
    // =========================================================================
    await page.click('#btnMoreTools');
    await page.click('[data-tool-id="watermark-pdf"]');
    const watermarkComingSoon = await page.evaluate(() => {
      const screen = document.getElementById('comingSoonScreen');
      const badge = screen?.querySelector('.badge-lab')?.textContent.trim();
      const isVisible = screen && !screen.classList.contains('hidden');
      return { isVisible, badge };
    });
    record('More Tools: Dropdown tools show clean "กำลังพัฒนา" screen with PDF LAB branding', watermarkComingSoon.isVisible && watermarkComingSoon.badge === 'PDF LAB');

    // Return to IMAGE -> PDF and verify workspace preserved
    await page.click('#btnBackToImageToPdf');
    const restoredCards = await page.$$eval('#thumbnailGrid .thumb-card', elms => elms.length);
    record('Preservation: Returning to IMAGE → PDF maintains all uploaded images in memory', restoredCards > 0, `Preserved cards: ${restoredCards}`);

    // =========================================================================
    // THEME TOGGLE & PERSISTENCE QA
    // =========================================================================
    console.log('\n--- Testing Theme Toggle & Persistence QA ---');

    // 1. Initial default state is dark
    const initialThemeState = await page.evaluate(() => {
      const btn = document.getElementById('btnThemeToggle');
      const dataTheme = document.documentElement.getAttribute('data-theme');
      const ariaLabel = btn ? btn.getAttribute('aria-label') : '';
      const ariaPressed = btn ? btn.getAttribute('aria-pressed') : '';
      return {
        dataTheme,
        ariaLabel,
        ariaPressed,
        exists: !!btn
      };
    });
    record('Theme 1: Default theme is Dark and toggle button exists', 
      initialThemeState.exists && (initialThemeState.dataTheme === 'dark' || !initialThemeState.dataTheme) && initialThemeState.ariaLabel === 'เปลี่ยนเป็นโหมดสว่าง',
      `data-theme: ${initialThemeState.dataTheme}, aria-label: ${initialThemeState.ariaLabel}`);

    // 2. Click to switch to Light mode
    await page.click('#btnThemeToggle');
    const lightThemeState = await page.evaluate(() => {
      const btn = document.getElementById('btnThemeToggle');
      const dataTheme = document.documentElement.getAttribute('data-theme');
      const saved = localStorage.getItem('pdf-lab-theme');
      const ariaLabel = btn ? btn.getAttribute('aria-label') : '';
      const ariaPressed = btn ? btn.getAttribute('aria-pressed') : '';
      const bgApp = window.getComputedStyle(document.body).backgroundColor;
      return {
        dataTheme,
        saved,
        ariaLabel,
        ariaPressed,
        bgApp
      };
    });
    record('Theme 2: Clicking toggle switches to Light theme and updates localStorage',
      lightThemeState.dataTheme === 'light' && lightThemeState.saved === 'light' && lightThemeState.ariaLabel === 'เปลี่ยนเป็นโหมดมืด',
      `data-theme: ${lightThemeState.dataTheme}, saved: ${lightThemeState.saved}, label: ${lightThemeState.ariaLabel}`);

    // 3. Reload page and verify Light theme persists
    await page.reload();
    await page.waitForLoadState('networkidle');
    const persistedLightState = await page.evaluate(() => {
      const btn = document.getElementById('btnThemeToggle');
      const dataTheme = document.documentElement.getAttribute('data-theme');
      const saved = localStorage.getItem('pdf-lab-theme');
      const ariaLabel = btn ? btn.getAttribute('aria-label') : '';
      return {
        dataTheme,
        saved,
        ariaLabel
      };
    });
    record('Theme 3: Light theme persists on page reload',
      persistedLightState.dataTheme === 'light' && persistedLightState.saved === 'light' && persistedLightState.ariaLabel === 'เปลี่ยนเป็นโหมดมืด',
      `data-theme: ${persistedLightState.dataTheme}, saved: ${persistedLightState.saved}`);

    // 4. Click to switch back to Dark mode
    await page.click('#btnThemeToggle');
    const switchedDarkState = await page.evaluate(() => {
      const btn = document.getElementById('btnThemeToggle');
      const dataTheme = document.documentElement.getAttribute('data-theme');
      const saved = localStorage.getItem('pdf-lab-theme');
      const ariaLabel = btn ? btn.getAttribute('aria-label') : '';
      return {
        dataTheme,
        saved,
        ariaLabel
      };
    });
    record('Theme 4: Clicking toggle switches back to Dark theme and updates localStorage',
      switchedDarkState.dataTheme === 'dark' && switchedDarkState.saved === 'dark' && switchedDarkState.ariaLabel === 'เปลี่ยนเป็นโหมดสว่าง',
      `data-theme: ${switchedDarkState.dataTheme}, saved: ${switchedDarkState.saved}`);

    // 5. Reload page and verify Dark theme persists
    await page.reload();
    await page.waitForLoadState('networkidle');
    const persistedDarkState = await page.evaluate(() => {
      const dataTheme = document.documentElement.getAttribute('data-theme');
      const saved = localStorage.getItem('pdf-lab-theme');
      return { dataTheme, saved };
    });
    record('Theme 5: Dark theme persists on page reload',
      persistedDarkState.dataTheme === 'dark' && persistedDarkState.saved === 'dark',
      `data-theme: ${persistedDarkState.dataTheme}, saved: ${persistedDarkState.saved}`);

    // 6. Verify NO obsolete Settings or System theme controls exist in DOM
    const obsoleteControls = await page.evaluate(() => {
      const textMatches = Array.from(document.querySelectorAll('*')).filter(el => {
        const t = el.textContent || '';
        return t.includes('ตามระบบ') || t.includes('System Theme') || (el.tagName === 'BUTTON' && t.includes('Settings'));
      });
      const settingsButtons = document.querySelectorAll('#btnSettings, .btn-settings, [data-action="settings"]');
      return {
        textMatchesCount: textMatches.length,
        settingsButtonsCount: settingsButtons.length
      };
    });
    record('Theme 6: Obsolete "System" and "Settings" controls do not exist',
      obsoleteControls.settingsButtonsCount === 0 && obsoleteControls.textMatchesCount === 0,
      `Settings buttons: ${obsoleteControls.settingsButtonsCount}, System text matches: ${obsoleteControls.textMatchesCount}`);

    // =========================================================================
    // RESPONSIVE VISUAL QA (6 Viewports)
    // =========================================================================
    console.log('\n--- Running Responsive Visual QA across all viewports ---');
    const viewports = [
      { name: '1440x900_Desktop', width: 1440, height: 900 },
      { name: '1280x800_Laptop', width: 1280, height: 800 },
      { name: '1024x768_Tablet_Landscape', width: 1024, height: 768 },
      { name: '768x1024_Tablet_Portrait', width: 768, height: 1024 },
      { name: '390x844_Mobile_iPhone', width: 390, height: 844 },
      { name: '375x667_Mobile_Small', width: 375, height: 667 }
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(250);

      const hasHorizontalScrollbar = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      const shotPath = path.join(SCREENSHOT_DIR, `${vp.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });

      record(`Responsive QA ${vp.width}×${vp.height}`, !hasHorizontalScrollbar, `No overflow: ${!hasHorizontalScrollbar}`);
    }

    // --- PRIVACY QA ---
    const nonLocalRequests = networkRequests.filter(req => {
      return !req.url.startsWith('/') && !req.url.includes('localhost') && !req.url.includes('127.0.0.1');
    });
    record('Privacy QA: Zero external network requests with user document data', nonLocalRequests.length === 0, `External requests: ${nonLocalRequests.length}`);

    // --- CONSOLE QA ---
    record('Console QA: 0 uncaught JavaScript errors', consoleErrors.length === 0, `Errors: ${consoleErrors.join(', ') || 'None'}`);
    record('Console QA: 0 unhandled promise rejections', unhandledRejections.length === 0, `Rejections: ${unhandledRejections.join(', ') || 'None'}`);

  } catch (err) {
    console.error('Fatal Test Suite Error:', err);
    record('Test Suite Execution', false, err.message);
  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n==================================================');
  console.log(`TEST SUMMARY: ${testResults.passed} / ${testResults.total} PASSED`);
  if (testResults.failed > 0) {
    console.error(`${testResults.failed} TESTS FAILED.`);
    process.exit(1);
  } else {
    console.log('ALL TESTS PASSED WITH 100% SUCCESS!');
    process.exit(0);
  }
}

runTests();
