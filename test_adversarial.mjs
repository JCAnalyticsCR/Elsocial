#!/usr/bin/env node
/**
 * @file test_adversarial.mjs
 * @description Empirical Adversarial Stress Test Suite for "el Social" Landing Page.
 * 
 * Conducts aggressive stress testing across 3 core vectors:
 * 1. Extreme Viewports Stress (240px to 3840px 4K) & Horizontal Bleed Detection
 * 2. Rapid UI State Machine Fuzzing (Rapid drawer toggle, tab switching, lightbox modal race conditions)
 * 3. Form Boundary, Input Overload & Aggressive XSS Payload Injection
 * 
 * Verifiable via:
 *   node branding_page/test_adversarial.mjs
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BRANDING_ROOT = __dirname;

const CHROME_PATH = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const suiteResults = {
  viewports: [],
  interactions: [],
  formBoundary: []
};

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function logResult(category, testId, description, passed, detail = null) {
  totalChecks++;
  if (passed) passedChecks++; else failedChecks++;
  const status = passed ? '✅ PASS' : '❌ FAIL';
  const extra = detail ? ` [Detail: ${detail}]` : '';
  console.log(`[${category}][${testId}] ${status}: ${description}${extra}`);
  suiteResults[category].push({ testId, description, passed, detail });
}

function getFreePort() {
  return new Promise((resolve) => {
    const srv = http.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function startStaticServer(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let reqPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
      if (reqPath.endsWith('/') || reqPath === '') reqPath += 'index.html';
      const cleanPath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
      const filePath = path.join(BRANDING_ROOT, cleanPath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME_MAP[ext] || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*'
        });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`404 Not Found: ${reqPath}`);
      }
    });

    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.pending = new Map();
    this.eventListeners = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.id && this.pending.has(msg.id)) {
            const { resolve, reject } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) {
              reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            } else {
              resolve(msg.result);
            }
          } else if (msg.method) {
            const listeners = this.eventListeners.get(msg.method) || [];
            for (const fn of listeners) {
              try { fn(msg.params); } catch (e) { console.error('CDP handler error:', e); }
            }
          }
        } catch (e) {
          console.error('Error parsing CDP message:', e);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = this.id++;
      this.pending.set(msgId, { resolve, reject });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  on(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(handler);
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
    }
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || 'Runtime.evaluate exception');
    }
    return res.result ? res.result.value : undefined;
  }
}

async function runAdversarialSuite() {
  console.log('='.repeat(80));
  console.log('   "el Social" - Adversarial Empirical Stress Testing Suite');
  console.log('='.repeat(80));
  console.log(`Root:              ${BRANDING_ROOT}`);
  console.log(`Chrome Executable: ${CHROME_PATH}`);

  const httpPort = await getFreePort();
  const server = await startStaticServer(httpPort);
  const baseUrl = `http://127.0.0.1:${httpPort}`;
  console.log(`Static server listening on: ${baseUrl}`);

  const cdpPort = await getFreePort();
  console.log(`Launching Headless Chrome on CDP port: ${cdpPort}`);

  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${cdpPort}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const cleanup = () => {
    try { chromeProc.kill(); } catch (_) {}
    try { server.close(); } catch (_) {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);

  let cdp = null;
  const consoleErrors = [];
  const uncaughtExceptions = [];
  const openedDialogs = [];

  try {
    let targetWsUrl = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const listRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
        const targets = await listRes.json();
        const pageTarget = targets?.find(t => t.type === 'page') || targets?.[0];
        if (pageTarget && pageTarget.webSocketDebuggerUrl) {
          targetWsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch (_) {}
    }

    if (!targetWsUrl) {
      throw new Error(`Chrome DevTools Protocol not reachable on port ${cdpPort}`);
    }

    cdp = new CdpSession(targetWsUrl);
    await cdp.connect();

    // Event listeners
    cdp.on('Runtime.consoleAPICalled', (params) => {
      if (params.type === 'error') {
        const text = params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
        consoleErrors.push(text);
      }
    });

    cdp.on('Runtime.exceptionThrown', (params) => {
      const desc = params.exceptionDetails.exception?.description || params.exceptionDetails.text;
      uncaughtExceptions.push(desc);
    });

    cdp.on('Page.javascriptDialogOpening', (params) => {
      openedDialogs.push(params);
      // Auto-dismiss dialog
      cdp.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    });

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('DOM.enable');

    console.log(`Navigating to ${baseUrl}/index.html...`);
    await cdp.send('Page.navigate', { url: `${baseUrl}/index.html` });
    await new Promise(r => setTimeout(r, 1200));

    // =========================================================================
    // 1. EXTREME VIEWPORTS STRESS TEST (240px to 3840px 4K)
    // =========================================================================
    console.log('\n' + '-'.repeat(80));
    console.log('  TEST SUITE 1: EXTREME VIEWPORTS STRESS TEST & HORIZONTAL BLEED AUDIT');
    console.log('-'.repeat(80));

    const viewports = [
      { name: 'Ultra-Narrow / Smartwatch', width: 240, height: 320, mobile: true, dsf: 1 },
      { name: 'iPhone SE (1st gen)',      width: 320, height: 568, mobile: true, dsf: 2 },
      { name: 'Android Budget Compact',   width: 360, height: 640, mobile: true, dsf: 2 },
      { name: 'iPhone 12 / 13 / 14',       width: 390, height: 844, mobile: true, dsf: 3 },
      { name: 'iPhone Plus / Max',        width: 414, height: 896, mobile: true, dsf: 3 },
      { name: 'iPad Portrait (Tablet)',   width: 768, height: 1024, mobile: true, dsf: 2 },
      { name: 'iPad Landscape / Laptop',  width: 1024, height: 768, mobile: false, dsf: 1 },
      { name: 'Standard Desktop HD',      width: 1440, height: 900, mobile: false, dsf: 1 },
      { name: 'QHD / 2K Display',         width: 2560, height: 1440, mobile: false, dsf: 1 },
      { name: '4K Ultra HD Display',      width: 3840, height: 2160, mobile: false, dsf: 1 }
    ];

    for (const vp of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.dsf,
        mobile: vp.mobile
      });
      await new Promise(r => setTimeout(r, 200));

      const overflowAudit = await cdp.eval(`(() => {
        const docW = document.documentElement.scrollWidth;
        const bodyW = document.body.scrollWidth;
        const winW = window.innerWidth;
        const rootBleed = docW > winW;
        const bodyBleed = bodyW > winW;

        // Scan visible in-flow elements for any element that expands past innerWidth
        const allElements = Array.from(document.querySelectorAll('*'));
        const offendingElements = [];

        // Un hijo más ancho que la ventana no sangra si un ancestro lo recorta;
        // el desborde real ya lo cubren rootBleed y bodyBleed.
        const recortadoPorAncestro = (nodo) => {
          for (let padre = nodo.parentElement; padre && padre !== document.body; padre = padre.parentElement) {
            const cs = window.getComputedStyle(padre);
            if (cs.overflowX === 'hidden' || cs.overflowX === 'clip') return true;
            if (cs.overflow.includes('hidden') || cs.overflow.includes('clip')) return true;
          }
          return false;
        };

        for (const el of allElements) {
          // Skip script, style, head, html, body
          if (['SCRIPT', 'STYLE', 'HEAD', 'HTML', 'BODY', 'BR'].includes(el.tagName)) continue;
          
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          // Skip fixed/absolute offscreen elements (like drawer when closed)
          if (style.position === 'fixed' || style.position === 'absolute') {
            const r = el.getBoundingClientRect();
            if (r.left >= winW || r.right <= 0) continue;
          }

          const rect = el.getBoundingClientRect();
          // Subpixel tolerance 1px
          const seRecortaSolo = style.overflow.includes('hidden') || style.overflow.includes('clip');
          if (rect.width > winW + 1 && !seRecortaSolo && !recortadoPorAncestro(el)) {
            const selector = el.id ? '#' + el.id : (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : el.tagName);
            offendingElements.push({
              tag: el.tagName,
              selector,
              width: Math.round(rect.width),
              winW
            });
            if (offendingElements.length >= 5) break;
          }
        }

        return {
          winW,
          docW,
          bodyW,
          noDocBleed: !rootBleed,
          noBodyBleed: !bodyBleed,
          offendingCount: offendingElements.length,
          sampleOffenders: offendingElements
        };
      })()`);

      const passed = overflowAudit.noDocBleed && overflowAudit.noBodyBleed && overflowAudit.offendingCount === 0;
      const detail = `docW: ${overflowAudit.docW}px, bodyW: ${overflowAudit.bodyW}px, winW: ${overflowAudit.winW}px` +
        (overflowAudit.offendingCount > 0 ? `, Offenders: ${JSON.stringify(overflowAudit.sampleOffenders)}` : '');

      logResult(
        'viewports',
        `VP-${vp.width}px`,
        `${vp.name} (${vp.width}x${vp.height}): Zero horizontal scrollWidth bleed`,
        passed,
        detail
      );
    }

    // Reset viewport to standard desktop
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 800, deviceScaleFactor: 1, mobile: false
    });
    await new Promise(r => setTimeout(r, 200));

    // =========================================================================
    // 2. RAPID UI STATE MACHINE FUZZING & ASYNC INTERACTION STRESS
    // =========================================================================
    console.log('\n' + '-'.repeat(80));
    console.log('  TEST SUITE 2: RAPID ASYNC UI INTERACTION & STATE MACHINE FUZZING');
    console.log('-'.repeat(80));

    // Switch to mobile viewport for mobile drawer fuzzing
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true
    });
    await new Promise(r => setTimeout(r, 200));

    // Subtest 2A: Rapid Mobile Drawer Toggling (50 rapid iterations)
    const drawerFuzz = await cdp.eval(`(async () => {
      const btn = document.getElementById('mobile-menu-btn');
      const drawer = document.getElementById('mobile-drawer');
      const closeBtn = document.getElementById('mobile-drawer-close');
      const backdrop = document.getElementById('mobile-drawer-backdrop');

      let caughtErrors = 0;
      const initialOverflow = document.body.style.overflow;

      for (let i = 0; i < 50; i++) {
        try {
          if (i % 3 === 0 && btn) {
            btn.click();
          } else if (i % 3 === 1 && backdrop) {
            backdrop.click();
          } else if (closeBtn) {
            closeBtn.click();
          }
        } catch (err) {
          caughtErrors++;
        }
        // Micro-delay to simulate rapid finger tapping
        if (i % 5 === 0) {
          await new Promise(r => setTimeout(r, 10));
        }
      }

      // Explicitly close drawer to restore baseline
      if (closeBtn) closeBtn.click();
      await new Promise(r => setTimeout(r, 100));

      const isDrawerClosed = !drawer.classList.contains('is-open') && !drawer.classList.contains('active');
      const isAriaClosed = drawer.getAttribute('aria-hidden') === 'true';
      const isBodyRestored = document.body.style.overflow === '' || document.body.style.overflow === 'auto' || document.body.style.overflow === 'visible';

      return {
        caughtErrors,
        isDrawerClosed,
        isAriaClosed,
        isBodyRestored,
        bodyOverflow: document.body.style.overflow
      };
    })()`);

    const drawerPassed = drawerFuzz.caughtErrors === 0 && drawerFuzz.isDrawerClosed && drawerFuzz.isBodyRestored;
    logResult(
      'interactions',
      'INT-DRAWER-FUZZ',
      '50 rapid mobile drawer open/close toggles without unhandled errors or stuck modal lock',
      drawerPassed,
      `errors=${drawerFuzz.caughtErrors}, closed=${drawerFuzz.isDrawerClosed}, bodyOverflow='${drawerFuzz.bodyOverflow}'`
    );

    // Subtest 2B: Rapid Category Tab Switching (60 rapid clicks)
    const tabFuzz = await cdp.eval(`(async () => {
      const tabs = Array.from(document.querySelectorAll('.tab-btn[data-category]'));
      const cards = Array.from(document.querySelectorAll('.experience-card'));
      let errors = 0;

      if (tabs.length === 0) return { error: 'No tabs found' };

      for (let i = 0; i < 60; i++) {
        const tab = tabs[i % tabs.length];
        try {
          tab.click();
        } catch (e) {
          errors++;
        }
        if (i % 10 === 0) {
          await new Promise(r => setTimeout(r, 10));
        }
      }

      // Se cierra en la primera pestaña que no sea 'todos', sea cual sea la carta.
      const tabFinal = tabs.find(t => t.getAttribute('data-category') !== 'all') || tabs[1];
      const categoria = tabFinal ? tabFinal.getAttribute('data-category') : null;
      if (tabFinal) tabFinal.click();
      await new Promise(r => setTimeout(r, 50));

      const activeTabs = tabs.filter(t => t.classList.contains('active'));
      const visibleCards = cards.filter(c => c.style.display !== 'none');
      const cardsDeLaCategoria = cards.filter(c => c.getAttribute('data-category') === categoria);

      return {
        errors,
        activeTabCount: activeTabs.length,
        activeCategory: categoria,
        categoryCardsCount: cardsDeLaCategoria.length,
        visibleCardsCount: visibleCards.length,
        allVisibleMatchCategory: visibleCards.length > 0
          && visibleCards.every(c => c.getAttribute('data-category') === categoria)
      };
    })()`);

    const tabPassed = tabFuzz.errors === 0 && tabFuzz.activeTabCount === 1 && tabFuzz.allVisibleMatchCategory;
    logResult(
      'interactions',
      'INT-TABS-RAPID',
      '60 rapid tab switch events preserve state machine consistency & card filtering',
      tabPassed,
      `activeTabCount=${tabFuzz.activeTabCount}, visible=${tabFuzz.visibleCardsCount}, matchesCategory=${tabFuzz.allVisibleMatchCategory}`
    );

    // Subtest 2C: Rapid Lightbox Modal Open/Close Fuzzing (40 rapid iterations)
    const lightboxFuzz = await cdp.eval(`(async () => {
      const cards = Array.from(document.querySelectorAll('.gallery-card'));
      const modal = document.getElementById('lightbox-modal');
      const closeBtn = document.getElementById('lightbox-close');
      const backdrop = document.getElementById('lightbox-backdrop');

      let errors = 0;

      for (let i = 0; i < 40; i++) {
        const card = cards[i % cards.length];
        try {
          // Open
          card.click();

          // Rapid dismiss via closeBtn, backdrop, or Escape
          if (i % 3 === 0 && closeBtn) {
            closeBtn.click();
          } else if (i % 3 === 1 && backdrop) {
            backdrop.click();
          } else {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));
          }
        } catch (e) {
          errors++;
        }

        if (i % 8 === 0) {
          await new Promise(r => setTimeout(r, 15));
        }
      }

      // Final close via Escape to ensure closed state
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));
      await new Promise(r => setTimeout(r, 100));

      const isModalClosed = !modal.classList.contains('active') && !modal.classList.contains('is-active') && !modal.classList.contains('is-open');
      const isAriaClosed = modal.getAttribute('aria-hidden') === 'true';
      const isBodyRestored = document.body.style.overflow === '' || document.body.style.overflow === 'auto';

      return {
        errors,
        isModalClosed,
        isAriaClosed,
        isBodyRestored,
        bodyOverflow: document.body.style.overflow
      };
    })()`);

    const lbPassed = lightboxFuzz.errors === 0 && lightboxFuzz.isModalClosed && lightboxFuzz.isBodyRestored;
    logResult(
      'interactions',
      'INT-LIGHTBOX-FUZZ',
      '40 rapid lightbox open/close cycles with multi-vector dismiss (Close, Backdrop, Escape)',
      lbPassed,
      `errors=${lightboxFuzz.errors}, modalClosed=${lightboxFuzz.isModalClosed}, bodyOverflow='${lightboxFuzz.bodyOverflow}'`
    );

    // Reset viewport to desktop
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 800, deviceScaleFactor: 1, mobile: false
    });
    await new Promise(r => setTimeout(r, 200));

    // =========================================================================
    // 3. FORM BOUNDARY, EXTREME INPUT OVERLOAD & AGGRESSIVE XSS PAYLOADS
    // =========================================================================
    console.log('\n' + '-'.repeat(80));
    console.log('  TEST SUITE 3: FORM BOUNDARY, INPUT OVERLOAD & XSS INJECTION AUDIT');
    console.log('-'.repeat(80));

    // Subtest 3A: Empty Form Submission
    const emptyFormTest = await cdp.eval(`(() => {
      const form = document.getElementById('reservation-form');
      const toast = document.getElementById('reservation-toast');
      const nameInput = document.getElementById('res-name');
      const phoneInput = document.getElementById('res-phone');
      const emailInput = document.getElementById('res-email');
      const dateInput = document.getElementById('res-date');

      // Ensure form is clean
      form.reset();

      // Dispatch submit event
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      const defaultPrevented = !form.dispatchEvent(submitEvent);

      const nameInvalid = nameInput.classList.contains('is-invalid');
      const phoneInvalid = phoneInput.classList.contains('is-invalid');
      const emailInvalid = emailInput.classList.contains('is-invalid');
      const dateInvalid = dateInput.classList.contains('is-invalid');
      const toastNotShown = !toast.classList.contains('show') && !toast.classList.contains('active') && !toast.classList.contains('is-visible');

      return {
        defaultPrevented,
        nameInvalid,
        phoneInvalid,
        emailInvalid,
        dateInvalid,
        toastNotShown
      };
    })()`);

    const emptyPassed = emptyFormTest.defaultPrevented &&
      emptyFormTest.nameInvalid &&
      emptyFormTest.phoneInvalid &&
      emptyFormTest.emailInvalid &&
      emptyFormTest.dateInvalid &&
      emptyFormTest.toastNotShown;

    logResult(
      'formBoundary',
      'FORM-EMPTY-SUBMIT',
      'Empty form submission rejected: all 4 required fields marked is-invalid, toast prevented',
      emptyPassed,
      `prevented=${emptyFormTest.defaultPrevented}, fieldsInvalid=${emptyFormTest.nameInvalid && emptyFormTest.phoneInvalid}, toastNotShown=${emptyFormTest.toastNotShown}`
    );

    // Subtest 3B: Malformed Email Variations Matrix
    const malformedEmails = [
      'plainaddress',
      'missingatsign.com',
      '@missingusername.com',
      'user@domain@domain.com',
      'user name@domain.com',
      'user@.com',
      'user@domain.'
    ];

    let emailFailures = 0;
    for (const badEmail of malformedEmails) {
      const emailCheck = await cdp.eval(`(() => {
        const form = document.getElementById('reservation-form');
        const toast = document.getElementById('reservation-toast');
        const nameInput = document.getElementById('res-name');
        const phoneInput = document.getElementById('res-phone');
        const emailInput = document.getElementById('res-email');
        const dateInput = document.getElementById('res-date');

        nameInput.value = 'Carlos Test';
        phoneInput.value = '+506 8888-1234';
        dateInput.value = '2026-10-15';
        emailInput.value = ${JSON.stringify(badEmail)};

        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(submitEvent);

        const isInvalid = emailInput.classList.contains('is-invalid');
        const toastNotShown = !toast.classList.contains('show') && !toast.classList.contains('active') && !toast.classList.contains('is-visible');

        return { isInvalid, toastNotShown };
      })()`);

      if (!emailCheck.isInvalid || !emailCheck.toastNotShown) {
        emailFailures++;
      }
    }

    const emailMatrixPassed = emailFailures === 0;
    logResult(
      'formBoundary',
      'FORM-EMAIL-MATRIX',
      `7 malformed email variations rejected with is-invalid and zero false-positive toasts`,
      emailMatrixPassed,
      `rejectedCount=${malformedEmails.length - emailFailures}/${malformedEmails.length}`
    );

    // Subtest 3C: Extreme Input Lengths Overload (10,000+ chars name, 1,000 chars phone/email)
    const overloadTest = await cdp.eval(`(() => {
      const form = document.getElementById('reservation-form');
      const toast = document.getElementById('reservation-toast');
      const nameInput = document.getElementById('res-name');
      const phoneInput = document.getElementById('res-phone');
      const emailInput = document.getElementById('res-email');
      const dateInput = document.getElementById('res-date');

      // Fill extreme character buffers
      const hugeName = 'Adrian ' + 'A'.repeat(10000);
      const hugePhone = '+506 ' + '9'.repeat(1000);
      const hugeEmail = 'test.' + 'e'.repeat(500) + '@example.com';
      const extremeDate = '2099-12-31';

      nameInput.value = hugeName;
      phoneInput.value = hugePhone;
      emailInput.value = hugeEmail;
      dateInput.value = extremeDate;

      let error = null;
      let submittedOk = false;

      try {
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(submitEvent);
        submittedOk = toast.classList.contains('show') || toast.classList.contains('active') || toast.classList.contains('is-visible');
      } catch (err) {
        error = err.message;
      }

      return {
        submittedOk,
        hasError: error !== null,
        error
      };
    })()`);

    const overloadPassed = !overloadTest.hasError && overloadTest.submittedOk;
    logResult(
      'formBoundary',
      'FORM-OVERLOAD-BUFFER',
      'Massive string buffers (10,000+ chars) processed without memory hang, crash, or DOM corruption',
      overloadPassed,
      `submittedOk=${overloadTest.submittedOk}, hasError=${overloadTest.hasError}`
    );

    // Subtest 3D: Aggressive XSS Payload Injection
    const xssPayloads = [
      '<script>window.__xss_fired=true;</script>',
      '<img src=x onerror="window.__xss_fired=true">',
      '<svg onload="window.__xss_fired=true">',
      '"><script>window.__xss_fired=true</script>',
      'javascript:window.__xss_fired=true'
    ];

    let xssExecutionDetected = false;
    let xssDetails = [];

    for (const payload of xssPayloads) {
      const xssResult = await cdp.eval(`(() => {
        window.__xss_fired = undefined;
        const form = document.getElementById('reservation-form');
        const nameInput = document.getElementById('res-name');
        const phoneInput = document.getElementById('res-phone');
        const emailInput = document.getElementById('res-email');
        const dateInput = document.getElementById('res-date');

        nameInput.value = ${JSON.stringify(payload)};
        phoneInput.value = '+506 8888-9999';
        emailInput.value = 'xss_test@example.com';
        dateInput.value = '2026-10-20';

        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(submitEvent);

        return {
          fired: window.__xss_fired === true,
          bodyHtmlHasUnescapedScript: document.body.innerHTML.includes('<script>window.__xss_fired=true;')
        };
      })()`);

      if (xssResult.fired || xssResult.bodyHtmlHasUnescapedScript || openedDialogs.length > 0) {
        xssExecutionDetected = true;
        xssDetails.push({ payload, fired: xssResult.fired, dialogs: openedDialogs.length });
      }
    }

    const xssPassed = !xssExecutionDetected && openedDialogs.length === 0;
    logResult(
      'formBoundary',
      'FORM-XSS-RESISTANCE',
      'Aggressive XSS payloads submitted safely: zero DOM script execution, zero dialog popups',
      xssPassed,
      xssPassed ? 'All 5 XSS vectors neutralized' : JSON.stringify(xssDetails)
    );

    // Subtest 3E: Newsletter Form Boundary & XSS Stress
    const newsletterTest = await cdp.eval(`(() => {
      const form = document.getElementById('newsletter-form');
      if (!form) return { hasForm: false };

      const emailInput = form.querySelector('input[type="email"]');
      const submitBtn = form.querySelector('button[type="submit"]');
      const initialBtnText = submitBtn ? submitBtn.textContent : '';

      // 1. Submit empty
      emailInput.value = '';
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      const emptyIgnored = submitBtn.textContent === initialBtnText;

      // 2. Submit invalid email
      emailInput.value = 'not-an-email';
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      const invalidIgnored = submitBtn.textContent === initialBtnText;

      // 3. Submit valid email
      emailInput.value = 'valid_subscriber@example.com';
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      const validSubscribed = submitBtn.textContent.includes('¡Suscrito!');

      return {
        hasForm: true,
        emptyIgnored,
        invalidIgnored,
        validSubscribed
      };
    })()`);

    const newsletterPassed = newsletterTest.hasForm &&
      newsletterTest.emptyIgnored &&
      newsletterTest.invalidIgnored &&
      newsletterTest.validSubscribed;

    logResult(
      'formBoundary',
      'FORM-NEWSLETTER-BOUNDARY',
      'Newsletter form input validation: rejects empty & invalid emails, activates on valid format',
      newsletterPassed,
      `emptyIgnored=${newsletterTest.emptyIgnored}, invalidIgnored=${newsletterTest.invalidIgnored}, validSubscribed=${newsletterTest.validSubscribed}`
    );

    // Final check for console errors or unhandled runtime exceptions
    const runtimePassed = consoleErrors.length === 0 && uncaughtExceptions.length === 0;
    logResult(
      'interactions',
      'RUNTIME-ERROR-FREE',
      `Zero browser console errors and zero unhandled exceptions throughout all adversarial trials`,
      runtimePassed,
      `consoleErrors=${consoleErrors.length}, uncaughtExceptions=${uncaughtExceptions.length}`
    );

  } finally {
    if (cdp) cdp.close();
    cleanup();
  }

  // =========================================================================
  // SUITE SUMMARY & FINAL VERDICT
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('   ADVERSARIAL STRESS TESTING EXECUTION SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Checks Executed: ${totalChecks}`);
  console.log(`Passed:                ${passedChecks} ✅`);
  console.log(`Failed:                ${failedChecks} ❌`);
  console.log(`Success Rate:          ${Math.round((passedChecks / totalChecks) * 100)}%`);

  const verdict = failedChecks === 0 ? 'APPROVE' : 'CHALLENGE_FAILED';
  console.log(`\nFinal Verdict:         >>> ${verdict} <<<\n`);
  console.log('='.repeat(80));

  return {
    totalChecks,
    passedChecks,
    failedChecks,
    verdict,
    suiteResults
  };
}

runAdversarialSuite().then(res => {
  if (res.verdict !== 'APPROVE') {
    process.exit(1);
  } else {
    process.exit(0);
  }
}).catch(err => {
  console.error('Fatal error in adversarial test runner:', err);
  process.exit(2);
});
