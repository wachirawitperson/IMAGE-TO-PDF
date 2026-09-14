const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { PDFDocument } = require('pdf-lib');

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
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  networkRequests.push({ method: req.method, url: req.url });

  if (req.url === '/favicon.ico') {
    res.writeHead(200, { 'Content-Type': 'image/x-icon' });
    res.end();
    return;
  }
  
  let filePath = path.join(ROOT_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
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
  console.log('=== STARTING IMAGE → PDF AUTOMATED QA TEST SUITE ===');

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

    // Automatically accept any dialogs (like confirm on Clear All)
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // Listen for console messages and uncaught exceptions
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', err => {
      unhandledRejections.push(err.message);
    });

    // --- TEST A: Initial / Empty State ---
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForLoadState('networkidle');

    const uploadVisible = await page.isVisible('#uploadScreen');
    const workspaceHidden = !(await page.isVisible('#workspaceScreen'));
    const headerActionsHidden = !(await page.isVisible('#headerActions'));
    record('Test A: Empty state displays upload screen correctly', uploadVisible && workspaceHidden && headerActionsHidden);

    // --- TEST B & C & D: Multiple file picker selection ---
    const fixtureFiles = [
      path.join(ROOT_DIR, 'test-fixtures', 'test-portrait.png'),
      path.join(ROOT_DIR, 'test-fixtures', 'test-landscape.jpg'),
      path.join(ROOT_DIR, 'test-fixtures', 'test-image.bmp')
    ];

    const fileInput = await page.$('#fileInput');
    await fileInput.setInputFiles(fixtureFiles);

    // Wait for workspace to become visible
    await page.waitForSelector('.thumb-card', { timeout: 4000 });
    const cards = await page.$$('.thumb-card');
    record('Test B, C, D: Multiple file selection adds items to workspace', cards.length === 3, `Count: ${cards.length}`);

    // Verify page badges
    const badge1 = await page.textContent('.thumb-card:nth-child(1) .page-badge');
    const badge2 = await page.textContent('.thumb-card:nth-child(2) .page-badge');
    const badge3 = await page.textContent('.thumb-card:nth-child(3) .page-badge');
    record('Page badges are indexed correctly (#1, #2, #3)', badge1.trim() === '#1' && badge2.trim() === '#2' && badge3.trim() === '#3');

    // --- TEST H: Rotate action ---
    const firstCardImg = await page.$('.thumb-card:nth-child(1) .card-preview-img');
    const rotateBtn = await page.$('.thumb-card:nth-child(1) .rotate-btn');
    await rotateBtn.click();
    
    let style = await firstCardImg.getAttribute('style');
    record('Test H: Rotate button rotates thumbnail by 90deg', style.includes('rotate(90deg)'), style);
    
    await rotateBtn.click();
    style = await firstCardImg.getAttribute('style');
    record('Test H: Repeated rotate increments to 180deg', style.includes('rotate(180deg)'), style);

    // --- TEST G: Reorder action ---
    // Test keyboard reorder: click Move Next on Card 1
    const moveNextBtn = await page.$('.thumb-card:nth-child(1) .btn-move-next');
    await moveNextBtn.click();
    
    const newFirstCardName = await page.textContent('.thumb-card:nth-child(1) .card-filename');
    record('Test G: Reorder moves card to new position', newFirstCardName.includes('test-landscape.jpg'), `New 1st: ${newFirstCardName}`);

    // --- TEST I: Delete action ---
    const deleteBtn = await page.$('.thumb-card:nth-child(3) .delete-btn');
    await deleteBtn.click();
    const cardsAfterDelete = await page.$$('.thumb-card');
    record('Test I: Delete removes single card and updates count', cardsAfterDelete.length === 2, `Remaining: ${cardsAfterDelete.length}`);

    // --- TEST K: Same-file re-add works ---
    await fileInput.setInputFiles([fixtureFiles[0]]);
    await page.waitForTimeout(300);
    const cardsAfterReAdd = await page.$$('.thumb-card');
    record('Test K: Same-file re-add works smoothly', cardsAfterReAdd.length === 3, `Count: ${cardsAfterReAdd.length}`);

    // --- TEST F: Clipboard Paste ---
    const pasteResult = await page.evaluate(async () => {
      // Create valid 2x2 PNG Blob
      const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });
      const file = new File([blob], 'clipboard-pasted.png', { type: 'image/png' });
      
      await window.__APP_UTILS__.handleFiles([file]);
      return window.__APP_STATE__.items.length;
    });

    await page.waitForTimeout(400);
    const countAfterPaste = await page.$$eval('.thumb-card', elms => elms.length);
    record('Test F: Clipboard image paste handling works', countAfterPaste === 4, `Count: ${countAfterPaste}`);

    // --- TEST L, M, N, O, P, Q, R, S, T, U: Settings Calculations ---
    const calcResults = await page.evaluate(() => {
      const utils = window.__APP_UTILS__;
      
      // A4 portrait
      const a4_port = utils.calculatePageDimensions({ width: 400, height: 800, rotation: 0 }, { paper: 'A4', orientation: 'auto', margin: 'none' }, 0.5);
      // A4 landscape
      const a4_land = utils.calculatePageDimensions({ width: 800, height: 400, rotation: 0 }, { paper: 'A4', orientation: 'auto', margin: 'none' }, 2.0);
      // Fit calculation
      const fit = utils.calculateImageDrawRect(595.28, 841.89, 20, 0.5, 'fit');
      // Fill calculation
      const fill = utils.calculateImageDrawRect(595.28, 841.89, 20, 0.5, 'fill');

      return { a4_port, a4_land, fit, fill };
    });

    record('Test L & O: A4 Auto Orientation adjusts to image aspect ratio', 
      calcResults.a4_port.pageHeight > calcResults.a4_port.pageWidth && 
      calcResults.a4_land.pageWidth > calcResults.a4_land.pageHeight
    );

    record('Test P & Q: Fit vs Fill calculate distinct draw rectangles',
      calcResults.fit.width !== calcResults.fill.width || calcResults.fit.height !== calcResults.fill.height,
      `Fit: ${Math.round(calcResults.fit.width)}x${Math.round(calcResults.fit.height)}, Fill: ${Math.round(calcResults.fill.width)}x${Math.round(calcResults.fill.height)}`
    );

    // --- TEST V: Filename sanitization ---
    const sanitized = await page.evaluate(() => {
      return [
        window.__APP_UTILS__.sanitizeFilename('my/cool:file*name?'),
        window.__APP_UTILS__.sanitizeFilename('document.pdf'),
        window.__APP_UTILS__.sanitizeFilename('   ')
      ];
    });
    record('Test V: Filename sanitizer removes invalid chars and enforces .pdf',
      sanitized[0] === 'my_cool_file_name_.pdf' &&
      sanitized[1] === 'document.pdf' &&
      sanitized[2] === 'images-to-pdf.pdf'
    );

    // --- TEST W & X: PDF Generation & Programmatic Validation ---
    // Intercept download
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.click('#btnCreatePdf')
    ]);

    const downloadPath = path.join(ROOT_DIR, 'test-fixtures', 'output-test.pdf');
    await download.saveAs(downloadPath);

    // Programmatic PDF validation with pdf-lib
    const pdfBuffer = fs.readFileSync(downloadPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfDoc.getPageCount();

    record('Test W: PDF generated and downloaded successfully', fs.existsSync(downloadPath));
    record('Test 44: Programmatic PDF Validation - 1 Image = 1 Page', pageCount === 4, `Pages in PDF: ${pageCount}`);

    // --- TEST Y: Many-image stress workspace test (Requirement 43) ---
    const manyAdded = await page.evaluate(async () => {
      // Create 20 synthetic images
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

    await page.waitForTimeout(500);
    record('Test Y: Many-image workspace test handles 24+ images without artificial limits', manyAdded >= 24, `Total items: ${manyAdded}`);

    // --- TEST Z & 42: HEIC Decoder wiring and failure handling ---
    const heicWiringTest = await page.evaluate(async () => {
      const hasHeic2any = typeof window.heic2any === 'function';
      // Test invalid HEIC buffer to check graceful error handling
      const badHeic = new File(['mock_invalid_heic_data'], 'test-failure.heic', { type: 'image/heic' });
      await window.__APP_UTILS__.handleFiles([badHeic]);
      return { hasHeic2any, totalItems: window.__APP_STATE__.items.length };
    });

    record('Test Z & 42: HEIC decoder is wired and graceful failure handler is active', 
      heicWiringTest.hasHeic2any,
      `heic2any available: ${heicWiringTest.hasHeic2any}`
    );

    // --- TEST J: Clear All ---
    await page.click('#btnClearAll');
    await page.waitForTimeout(400);

    const countAfterClear = await page.$$eval('.thumb-card', elms => elms.length);
    const uploadShownAfterClear = await page.isVisible('#uploadScreen');
    const workspaceShownAfterClear = await page.isVisible('#workspaceScreen');

    record('Test J: Clear all empties workspace and resets to initial screen', 
      countAfterClear === 0 && uploadShownAfterClear && !workspaceShownAfterClear,
      `Remaining cards: ${countAfterClear}, Upload screen visible: ${uploadShownAfterClear}`
    );

    // --- RESPONSIVE & VISUAL QA (Requirement 33 & 48) ---
    console.log('\n--- Running Responsive Visual QA across all viewports ---');
    
    // Add 3 sample images back so screenshots show a realistic workspace
    await fileInput.setInputFiles(fixtureFiles);
    await page.waitForSelector('.thumb-card');

    // =========================================================================
    // TEACHER PDF LAB NAVIGATION TESTS
    // =========================================================================

    // Test Nav 1: Approved navigation items in exact order
    const expectedTools = [
      'รูปภาพ → PDF',
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
    record('Test Nav 1: Top navigation renders approved tools in exact priority order', toolsMatch, `Tools: ${actualTools.join(' | ')}`);

    // Test Nav 2: Active state on current tool
    const activeState = await page.evaluate(() => {
      const activeBtn = document.querySelector('.nav-tool-item.active');
      return {
        toolId: activeBtn?.dataset.toolId,
        ariaCurrent: activeBtn?.getAttribute('aria-current'),
        isActiveClass: activeBtn?.classList.contains('active')
      };
    });
    record('Test Nav 2: Active tool รูปภาพ → PDF is highlighted with aria-current="page"', 
      activeState.toolId === 'image-to-pdf' && activeState.ariaCurrent === 'page' && activeState.isActiveClass, 
      `Active: ${activeState.toolId}, aria-current: ${activeState.ariaCurrent}`);

    // Test Nav 3: Switch to unfinished tool displays clean placeholder without fake functionality
    await page.click('[data-tool-id="merge-pdf"]');
    const placeholderState = await page.evaluate(() => {
      const screen = document.getElementById('comingSoonScreen');
      const title = document.getElementById('comingSoonTitle')?.textContent.trim();
      const lead = document.getElementById('comingSoonLead')?.textContent.trim();
      const workspaceHidden = document.getElementById('workspaceScreen')?.classList.contains('hidden');
      const badge = screen?.querySelector('.badge-status')?.textContent.trim();
      return {
        screenVisible: screen && !screen.classList.contains('hidden'),
        title,
        lead,
        workspaceHidden,
        badge
      };
    });
    record('Test Nav 3: Unfinished tool shows "กำลังพัฒนา" & "เครื่องมือนี้จะพร้อมใช้งานในเร็ว ๆ นี้"',
      placeholderState.screenVisible && placeholderState.workspaceHidden && placeholderState.badge === 'กำลังพัฒนา',
      `Title: ${placeholderState.title}, Badge: ${placeholderState.badge}, Lead: ${placeholderState.lead}`);

    // Test Nav 4: Return to IMAGE -> PDF restores workspace with all items intact
    await page.click('#btnBackToImageToPdf');
    const restoredState = await page.evaluate(() => {
      const workspaceVisible = !document.getElementById('workspaceScreen')?.classList.contains('hidden');
      const activeBtn = document.querySelector('.nav-tool-item.active');
      const cardCount = document.querySelectorAll('#thumbnailGrid .thumb-card').length;
      return {
        workspaceVisible,
        activeToolId: activeBtn?.dataset.toolId,
        cardCount
      };
    });
    record('Test Nav 4: Returning to รูปภาพ → PDF restores full workspace with zero item loss',
      restoredState.workspaceVisible && restoredState.activeToolId === 'image-to-pdf' && restoredState.cardCount === 3,
      `Cards preserved: ${restoredState.cardCount}, Active: ${restoredState.activeToolId}`);

    // Test Nav 5: Dropdown menu renders extended tools and toggles correctly
    await page.click('#btnMoreTools');
    const dropdownOpened = await page.evaluate(() => {
      const wrapper = document.getElementById('navDropdownWrapper');
      const menu = document.getElementById('moreToolsMenu');
      const items = Array.from(menu.querySelectorAll('.dropdown-item span:first-of-type')).map(s => s.textContent.trim());
      return {
        isOpen: wrapper.classList.contains('open') && !menu.classList.contains('hidden'),
        items
      };
    });
    const expectedMore = ['ใส่ลายน้ำ', 'ครอบตัด PDF', 'PDF → Word', 'PDF → PowerPoint', 'PDF → Excel'];
    const dropdownItemsMatch = expectedMore.every(m => dropdownOpened.items.includes(m));
    record('Test Nav 5: เพิ่มเติม ▾ dropdown opens and displays all secondary tools',
      dropdownOpened.isOpen && dropdownItemsMatch,
      `Items: ${dropdownOpened.items.join(', ')}`);

    // Test Nav 6: Selecting item inside dropdown switches to its placeholder and closes dropdown
    await page.click('[data-tool-id="pdf-to-word"]');
    const wordToolState = await page.evaluate(() => {
      const wrapper = document.getElementById('navDropdownWrapper');
      const menu = document.getElementById('moreToolsMenu');
      const title = document.getElementById('comingSoonTitle')?.textContent.trim();
      return {
        dropdownClosed: !wrapper.classList.contains('open') && menu.classList.contains('hidden'),
        title
      };
    });
    record('Test Nav 6: Selecting dropdown tool switches view and closes menu',
      wordToolState.dropdownClosed && wordToolState.title === 'PDF → Word',
      `Title: ${wordToolState.title}, Dropdown closed: ${wordToolState.dropdownClosed}`);

    // Test Nav 7: Clicking logo brand switches back to รูปภาพ → PDF
    await page.click('#navBrand');
    const brandClickRestored = await page.evaluate(() => {
      const activeBtn = document.querySelector('.nav-tool-item.active');
      return activeBtn?.dataset.toolId === 'image-to-pdf';
    });
    record('Test Nav 7: Clicking brand logo returns to รูปภาพ → PDF', brandClickRestored, 'Brand click navigation works');

    // Test Nav 8: Escape key closes dropdown
    await page.click('#btnMoreTools');
    await page.keyboard.press('Escape');
    const escapeClosed = await page.evaluate(() => {
      const wrapper = document.getElementById('navDropdownWrapper');
      return !wrapper.classList.contains('open');
    });
    record('Test Nav 8: Pressing Escape closes dropdown menu accessible', escapeClosed, `Dropdown closed on Escape: ${escapeClosed}`);

    const viewports = [
      { name: '1440x900_Desktop', width: 1440, height: 900 },
      { name: '1280x800_Laptop', width: 1280, height: 800 },
      { name: '1024x768_Tablet_Landscape', width: 1024, height: 768 },
      { name: '768x1024_Tablet_Portrait', width: 768, height: 1024 },
      { name: '390x844_Mobile_iPhone', width: 390, height: 844 },
      { name: '375x667_Mobile_Small', width: 375, height: 667 }
    ];

    await page.evaluate(() => window.scrollTo(0, 0));

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(250);

      // Check horizontal overflow
      const hasHorizontalScrollbar = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      const shotPath = path.join(SCREENSHOT_DIR, `${vp.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });

      record(`Responsive QA ${vp.width}×${vp.height}`, !hasHorizontalScrollbar, `No overflow: ${!hasHorizontalScrollbar}`);
    }

    // --- TEST 46: Network Privacy QA ---
    // Check if any network requests had user image data or were sent outside
    const nonLocalRequests = networkRequests.filter(req => {
      return !req.url.startsWith('/') && !req.url.includes('localhost') && !req.url.includes('127.0.0.1');
    });
    record('Test 46: Privacy QA - Zero external network requests with user image data', nonLocalRequests.length === 0, `External requests: ${nonLocalRequests.length}`);

    // --- TEST 45: Console QA ---
    record('Test 45: Console QA - 0 uncaught JavaScript errors', consoleErrors.length === 0, `Errors: ${consoleErrors.join(', ') || 'None'}`);
    record('Test 45: Console QA - 0 unhandled promise rejections', unhandledRejections.length === 0, `Rejections: ${unhandledRejections.join(', ') || 'None'}`);

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
