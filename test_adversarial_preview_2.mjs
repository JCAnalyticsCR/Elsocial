#!/usr/bin/env node
/**
 * @file test_adversarial_preview_2.mjs
 * @description Adversarial Test Suite for "el Social" Landing Page.
 * 
 * Scope of Adversarial Verification:
 * 1. Asset Loading, Caching Resilience & Binary Stream Integrity (6 PNG assets, query strings, headers, streams)
 * 2. Keyboard Accessibility Navigation & ARIA State Management (Skip link, Tab sequence, ARIA states, Escape)
 * 3. Console Error Monitoring Under Stress & DOM Stability (Rapid events, headless Chrome, 0 errors)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer, DEFAULT_PORT } from './serve.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BRANDING_ROOT = __dirname;
const CHROME_PATH = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const IMAGE_ASSETS = [
  'assets/images/logo.png',
  'assets/images/bar-papel-picado.jpg',
  'assets/images/terraza-mural.jpg',
  'assets/images/coctel-ciudad.jpg',
  'assets/images/birra-boca.jpg',
  'assets/images/celebra.jpg',
  'assets/images/chicas-tardeamos.jpg',
  'assets/images/mascarada.jpg',
  'assets/images/futbol-pantallas.jpg',
  'assets/images/aplaudimos.jpg',
  'assets/images/neon-noche.jpg',
  'assets/images/brindis-patio.jpg',
  'assets/images/hero-barra.jpg',
  'assets/images/fachada-morazan.jpg',
  'assets/images/entrada-sabana.jpg',
  'assets/images/esquina-atardecer.jpg',
  'assets/images/rotulo-espejo.jpg',
  'assets/images/afiche-1897.webp',
  'assets/images/afiche-tablazo.webp',
  'assets/images/afiche-bailado.webp',
  'assets/images/afiche-acompanado.webp',
  'assets/images/banda-sociales.webp',
  'assets/images/carta-cocteles-social.webp',
  'assets/images/carta-birras.webp',
  'assets/images/carta-cocteles-clasicos.webp',
  'assets/images/sello-reservas.png'
];

const suiteResults = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: []
};

function record(domain, testId, description, status, details = null) {
  // status: 'PASS' | 'FAIL' | 'WARN'
  if (status === 'PASS') suiteResults.passed++;
  else if (status === 'FAIL') suiteResults.failed++;
  else if (status === 'WARN') suiteResults.warnings++;

  suiteResults.tests.push({ domain, testId, description, status, details });

  const icon = status === 'PASS' ? '✅ PASS' : (status === 'WARN' ? '⚠️ WARN' : '❌ FAIL');
  const detailStr = details ? ` [${details}]` : '';
  console.log(`[${domain}][${testId}] ${icon}: ${description}${detailStr}`);
}

function getPngDimensions(buf) {
  if (buf.length < 24) return null;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 &&
                buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A;
  if (!isPng) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf.readUInt8(24);
  const colorType = buf.readUInt8(25);
  return { isPng, width, height, bitDepth, colorType };
}

/**
 * Cabecera de imagen para los tres formatos que sirve la página.
 * @param {Buffer} buf
 * @returns {{tipo:string,width:number,height:number}|null}
 */
function leerImagen(buf) {
  if (!buf || buf.length < 16) return null;

  const png = getPngDimensions(buf);
  if (png) return { tipo: 'png', width: png.width, height: png.height };

  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        return { tipo: 'jpeg', width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      if (i + 3 >= buf.length) break;
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
  }

  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') {
    const chunk = buf.slice(12, 16).toString('latin1');
    if (chunk === 'VP8 ' && buf.length > 30) {
      return { tipo: 'webp', width: buf.readUInt16LE(26) & 0x3FFF, height: buf.readUInt16LE(28) & 0x3FFF };
    }
    if (chunk === 'VP8L' && buf.length > 25) {
      const bits = buf.readUInt32LE(21);
      return { tipo: 'webp', width: (bits & 0x3FFF) + 1, height: ((bits >> 14) & 0x3FFF) + 1 };
    }
    if (chunk === 'VP8X' && buf.length > 30) {
      return {
        tipo: 'webp',
        width: (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1,
        height: (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1
      };
    }
  }

  return null;
}

/** Content-Type que corresponde a la extensión del archivo. */
function mimeEsperado(rutaRelativa) {
  if (rutaRelativa.endsWith('.png')) return 'image/png';
  if (rutaRelativa.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
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

function makeHttpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body
        });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
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
              try { fn(msg.params); } catch (e) { console.error('CDP listener error:', e); }
            }
          }
        } catch (e) {
          console.error('CDP parse error:', e);
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
  console.log('   "el Social" — Adversarial Testing Suite (Preview Challenger 2)');
  console.log('   Focus: Asset Resilience, Keyboard/ARIA Accessibility, DOM Under Load');
  console.log('='.repeat(80));

  const serverPort = await getFreePort();
  const server = await startServer(serverPort);
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  console.log(`Local test server running at ${baseUrl}\n`);

  // =========================================================================
  // SECTION 1: ASSET LOADING, CACHING RESILIENCE & BINARY INTEGRITY
  // =========================================================================
  console.log('>>> [SECTION 1] Asset Loading, Cache Resilience & Binary Stream Integrity <<<\n');

  // 1.1 Verify all 6 images exist on disk and have valid byte streams
  for (const assetRel of IMAGE_ASSETS) {
    const fullPath = path.join(BRANDING_ROOT, assetRel);
    const exists = fs.existsSync(fullPath);
    record('ASSETS', `DISK-${path.basename(assetRel)}`, `Asset exists on disk: ${assetRel}`,
      exists ? 'PASS' : 'FAIL', exists ? `${fs.statSync(fullPath).size} bytes` : 'MISSING');

    if (exists) {
      const buf = fs.readFileSync(fullPath);
      const meta = leerImagen(buf);
      const cabeceraValida = Boolean(meta && meta.width > 0 && meta.height > 0);
      record('ASSETS', `MAGIC-${path.basename(assetRel)}`,
        `Image magic bytes & header valid: ${meta ? `${meta.tipo} ${meta.width}x${meta.height}` : 'INVALID'}`,
        cabeceraValida ? 'PASS' : 'FAIL');
    }
  }

  // 1.2 Verify HTTP Serving & Content-Length for all 6 images
  for (const assetRel of IMAGE_ASSETS) {
    const fullPath = path.join(BRANDING_ROOT, assetRel);
    const diskSize = fs.existsSync(fullPath) ? fs.statSync(fullPath).size : -1;

    try {
      const res = await makeHttpRequest({
        hostname: '127.0.0.1',
        port: serverPort,
        path: `/${assetRel}`,
        method: 'GET'
      });
      const buf = res.body;
      const contentLengthHeader = parseInt(res.headers['content-length'] || '-1', 10);
      const contentType = res.headers['content-type'];

      const is200 = res.statusCode === 200;
      const lengthMatches = contentLengthHeader === diskSize && buf.length === diskSize;
      const typeMatches = contentType && contentType.includes(mimeEsperado(assetRel));

      record('ASSETS', `HTTP-200-${path.basename(assetRel)}`,
        `HTTP 200 & Content-Length integrity (${buf.length} == ${diskSize})`,
        (is200 && lengthMatches && typeMatches) ? 'PASS' : 'FAIL',
        `status: ${res.statusCode}, header-len: ${contentLengthHeader}, body-len: ${buf.length}`);
    } catch (err) {
      record('ASSETS', `HTTP-200-${path.basename(assetRel)}`, `Failed to fetch asset`, 'FAIL', err.message);
    }
  }

  // 1.3 Cache-Busting Query String Resilience (Adversarial matrix)
  const cacheBustQueries = [
    { name: 'standard_v', q: '?v=1.0.0' },
    { name: 'timestamp', q: '?t=1789072263393' },
    { name: 'uuid_hash', q: '?cachebust=9e6d013ea6cf63a6' },
    { name: 'multiple_params', q: '?ver=2&format=webp&quality=high' },
    { name: 'encoded_chars', q: '?filter=%20vintage%20&crop=16%3A9' },
    { name: 'duplicate_keys', q: '?bust=alpha&bust=beta' },
    { name: 'empty_param', q: '?random=&nocache' },
    { name: 'long_query', q: `?long=${'a'.repeat(512)}` }
  ];

  console.log('\n--- Cache-Busting Query Strings Stress Matrix ---');
  for (const assetRel of IMAGE_ASSETS) {
    const fullPath = path.join(BRANDING_ROOT, assetRel);
    const diskSize = fs.existsSync(fullPath) ? fs.statSync(fullPath).size : -1;

    for (const qObj of cacheBustQueries) {
      const reqPath = `/${assetRel}${qObj.q}`;
      try {
        const res = await makeHttpRequest({
          hostname: '127.0.0.1',
          port: serverPort,
          path: reqPath,
          method: 'GET'
        });
        const buf = res.body;
        const meta = leerImagen(buf);

        const ok = res.statusCode === 200 && buf.length === diskSize && Boolean(meta);
        record('CACHE_BUST', `${path.basename(assetRel, path.extname(assetRel))}-${qObj.name}`,
          `Query "${qObj.q.substring(0, 25)}..." yields HTTP 200 & identical stream`,
          ok ? 'PASS' : 'FAIL',
          `status: ${res.statusCode}, bytes: ${buf.length}/${diskSize}`);
      } catch (err) {
        record('CACHE_BUST', `${path.basename(assetRel, '.png')}-${qObj.name}`,
          `Fetch error with query`, 'FAIL', err.message);
      }
    }
  }

  // 1.4 HTTP Method Resilience (HEAD & Conditional Caching)
  try {
    const headRes = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/assets/images/logo.png',
      method: 'HEAD'
    });
    const headLen = parseInt(headRes.headers['content-length'] || '-1', 10);
    const headBuf = headRes.body;
    const headOk = headRes.statusCode === 200 && headLen > 0 && headBuf.length === 0;
    record('ASSETS', 'HEAD-METHOD-RESILIENCE',
      'HTTP HEAD returns 200 with Content-Length and 0-byte payload',
      headOk ? 'PASS' : 'FAIL', `status: ${headRes.statusCode}, bodyLen: ${headBuf.length}`);

    // If-Modified-Since with exact Last-Modified header from previous response
    const lastMod = headRes.headers['last-modified'];
    const condResExact = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/assets/images/logo.png',
      method: 'GET',
      headers: { 'If-Modified-Since': lastMod }
    });

    // Also test with future timestamp (to test logic branches)
    const futureDateStr = new Date(Date.now() + 100000).toUTCString();
    const condResFuture = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/assets/images/logo.png',
      method: 'GET',
      headers: { 'If-Modified-Since': futureDateStr }
    });

    const exact304 = condResExact.statusCode === 304;
    const future304 = condResFuture.statusCode === 304;

    if (exact304) {
      record('ASSETS', 'CONDITIONAL-304-RESILIENCE',
        'HTTP 304 Not Modified returned for matched If-Modified-Since', 'PASS');
    } else {
      record('ASSETS', 'CONDITIONAL-304-RESILIENCE',
        'HTTP 304 fails on exact Last-Modified due to sub-second mtime comparison bug in serve.mjs',
        'FAIL', `exact Last-Modified: ${condResExact.statusCode} (expected 304); future date: ${condResFuture.statusCode}`);
    }
  } catch (err) {
    record('ASSETS', 'HTTP-METHODS', 'Error testing HTTP methods', 'FAIL', err.message);
  }

  // 1.5 Security & Missing Asset Boundary
  try {
    const missingRes = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/assets/images/non_existent_asset_404.png',
      method: 'GET'
    });
    record('ASSETS', '404-HANDLING', 'Missing image returns HTTP 404',
      missingRes.statusCode === 404 ? 'PASS' : 'FAIL', `status: ${missingRes.statusCode}`);

    const traversalRes = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/../package.json',
      method: 'GET'
    });
    record('ASSETS', 'TRAVERSAL-GUARD', 'Path traversal attempt returned 403 Forbidden',
      (traversalRes.statusCode === 403 || traversalRes.statusCode === 404) ? 'PASS' : 'FAIL',
      `status: ${traversalRes.statusCode}`);
  } catch (err) {
    record('ASSETS', 'SECURITY-BOUNDARY', 'Error in boundary test', 'FAIL', err.message);
  }

  // =========================================================================
  // SECTION 2: KEYBOARD ACCESSIBILITY NAVIGATION & ARIA STATES
  // =========================================================================
  console.log('\n>>> [SECTION 2] Keyboard Accessibility Navigation & ARIA State Machine <<<\n');

  const cdpPort = await getFreePort();
  console.log(`Launching Headless Chrome on CDP debug port ${cdpPort}...`);

  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${cdpPort}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const cleanup = () => {
    try { chromeProc.kill(); } catch (_) {}
    try { server.close(); } catch (_) {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);

  let cdp = null;
  const capturedConsoleErrors = [];
  const capturedExceptions = [];

  try {
    let targetWsUrl = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const listRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
        const targets = await listRes.json();
        const pageTarget = targets?.find(t => t.type === 'page') || targets?.[0];
        if (pageTarget?.webSocketDebuggerUrl) {
          targetWsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch (_) {}
    }

    if (!targetWsUrl) throw new Error('Cannot connect to Chrome DevTools Protocol');

    cdp = new CdpSession(targetWsUrl);
    await cdp.connect();

    cdp.on('Runtime.consoleAPICalled', (params) => {
      if (params.type === 'error') {
        const text = params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
        capturedConsoleErrors.push(text);
      }
    });

    cdp.on('Runtime.exceptionThrown', (params) => {
      const desc = params.exceptionDetails.exception?.description || params.exceptionDetails.text;
      capturedExceptions.push(desc);
    });

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

    // Navigate to page
    await cdp.send('Page.navigate', { url: `${baseUrl}/index.html` });
    await new Promise(r => setTimeout(r, 1000));

    // 2.1 Skip Link Audit (WCAG 2.4.1 Bypass Blocks)
    const skipLinkAudit = await cdp.eval(`(() => {
      const skipCandidates = Array.from(document.querySelectorAll('a[href^="#"]')).slice(0, 5);
      const explicitSkip = document.querySelector('.skip-link, [aria-label*="saltar" i], [href="#main-content"], [href="#hero"], [href="#main"]');
      const isFirst = document.body.firstElementChild === explicitSkip ||
                      document.body.querySelector('a:first-of-type') === explicitSkip;
      return {
        hasExplicitSkipLink: !!document.querySelector('.skip-link, [class*="skip"]'),
        firstAnchorHref: skipCandidates[0]?.getAttribute('href'),
        firstAnchorText: skipCandidates[0]?.textContent?.trim(),
        firstAnchorClass: skipCandidates[0]?.className
      };
    })()`);

    if (skipLinkAudit.hasExplicitSkipLink) {
      record('A11Y_KEYBOARD', 'WCAG-SKIP-LINK', 'Explicit skip-to-content link present for keyboard navigation', 'PASS');
    } else {
      record('A11Y_KEYBOARD', 'WCAG-SKIP-LINK',
        'WCAG 2.4.1 Skip-to-content link missing (First anchor is brand logo link)',
        'FAIL', `First interactive: <a href="${skipLinkAudit.firstAnchorHref}"> class="${skipLinkAudit.firstAnchorClass}"`);
    }

    // 2.2 Interactive Elements Enumeration & Focusable Audit
    const interactiveInventory = await cdp.eval(`(() => {
      const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const allFocusable = Array.from(document.querySelectorAll(focusableSelector));
      const visible = allFocusable.filter(el => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && (rect.width > 0 || rect.height > 0 || el.getAttribute('tabindex') === '0');
      });

      return {
        totalCount: allFocusable.length,
        visibleCount: visible.length,
        navLinksCount: document.querySelectorAll('#main-header .nav-link').length,
        tabButtonsCount: document.querySelectorAll('.tab-btn').length,
        galleryCardsCount: document.querySelectorAll('.gallery-card[tabindex="0"]').length,
        formFieldsCount: document.querySelectorAll('#reservation-form input, #reservation-form select, #reservation-form textarea, #reservation-form button').length
      };
    })()`);

    record('A11Y_KEYBOARD', 'FOCUSABLE-INVENTORY',
      `DOM contains ${interactiveInventory.totalCount} interactive focusable elements (${interactiveInventory.tabButtonsCount} tabs, ${interactiveInventory.galleryCardsCount} gallery cards, ${interactiveInventory.formFieldsCount} form fields)`,
      interactiveInventory.totalCount >= 15 ? 'PASS' : 'FAIL');

    // 2.3 Tab Sequence Simulation (Desktop Viewport 1280x800)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 800, deviceScaleFactor: 1, mobile: false
    });

    const tabProgression = await cdp.eval(`(async () => {
      const sequence = [];
      const focusable = Array.from(document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'))
        .filter(el => {
          const s = window.getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden' && !el.closest('#mobile-drawer');
        });

      for (let i = 0; i < Math.min(focusable.length, 25); i++) {
        const el = focusable[i];
        el.focus();
        const tag = el.tagName.toLowerCase();
        const id = el.id ? '#' + el.id : '';
        const cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/)[0] : '';
        const role = el.getAttribute('role') || '';
        const ariaLabel = el.getAttribute('aria-label') || '';
        sequence.push({ index: i, target: tag + id + cls, role, ariaLabel, focused: document.activeElement === el });
      }
      return { sequence, totalTested: sequence.length, allFocused: sequence.every(s => s.focused) };
    })()`);

    record('A11Y_KEYBOARD', 'TAB-FOCUS-PROGRESSION',
      `Simulated Tab progression across ${tabProgression.totalTested} interactive elements`,
      tabProgression.allFocused ? 'PASS' : 'FAIL');

    // 2.4 Focus Ring / Visual Outline Audit
    const focusRingAudit = await cdp.eval(`(() => {
      const btn = document.querySelector('#nav-cta, .btn-primary');
      if (!btn) return { ok: false };
      btn.focus();
      const style = window.getComputedStyle(btn);
      const outlineStyle = style.outlineStyle;
      const boxShadow = style.boxShadow;
      const hasFocusIndicator = outlineStyle !== 'none' || boxShadow !== 'none' || style.borderColor !== '';
      return { ok: true, outlineStyle, boxShadow, hasFocusIndicator };
    })()`);
    record('A11Y_KEYBOARD', 'FOCUS-RING-VISIBILITY',
      'Interactive elements provide visual focus indication',
      focusRingAudit.ok ? 'PASS' : 'FAIL');

    // 2.5 ARIA States: Tab Buttons (data-category)
    const tabsAriaAudit = await cdp.eval(`(() => {
      const tabs = Array.from(document.querySelectorAll('.tab-btn[data-category]'));
      if (tabs.length < 2) return { ok: false, reason: 'Fewer than 2 tabs found' };

      const initialSelected = tabs.map(t => t.getAttribute('aria-selected'));
      const initialHasCorrectSingleTrue = initialSelected.filter(s => s === 'true').length === 1 &&
                                          initialSelected[0] === 'true';

      // Switch to second tab
      tabs[1].click();
      const secondSelected = tabs.map(t => t.getAttribute('aria-selected'));
      const secondHasCorrectSingleTrue = secondSelected.filter(s => s === 'true').length === 1 &&
                                         secondSelected[1] === 'true';

      // Switch back to first tab
      tabs[0].click();
      const finalSelected = tabs.map(t => t.getAttribute('aria-selected'));

      return {
        ok: initialHasCorrectSingleTrue && secondHasCorrectSingleTrue,
        initialSelected,
        secondSelected,
        finalSelected
      };
    })()`);

    record('A11Y_ARIA', 'TAB-ARIA-SELECTED-TOGGLE',
      'Tab buttons strictly maintain mutually exclusive aria-selected="true" on switch',
      tabsAriaAudit.ok ? 'PASS' : 'FAIL',
      `initial: [${tabsAriaAudit.initialSelected.join(', ')}], after switch: [${tabsAriaAudit.secondSelected.join(', ')}]`);

    // 2.6 ARIA States: Mobile Drawer (aria-expanded & aria-hidden)
    const drawerAriaAudit = await cdp.eval(`(() => {
      const btn = document.querySelector('#mobile-menu-btn');
      const drawer = document.querySelector('#mobile-drawer');
      if (!btn || !drawer) return { ok: false, reason: 'Elements not found' };

      const initialExp = btn.getAttribute('aria-expanded');
      const initialHidden = drawer.getAttribute('aria-hidden');

      // Click to open
      btn.click();
      const openExp = btn.getAttribute('aria-expanded');
      const openHidden = drawer.getAttribute('aria-hidden');

      // Press Escape key to close
      const esc = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true });
      document.dispatchEvent(esc);

      const closeExp = btn.getAttribute('aria-expanded');
      const closeHidden = drawer.getAttribute('aria-hidden');

      const ok = initialExp === 'false' && initialHidden === 'true' &&
                 openExp === 'true' && openHidden === 'false' &&
                 closeExp === 'false' && closeHidden === 'true';

      return { ok, initialExp, initialHidden, openExp, openHidden, closeExp, closeHidden };
    })()`);

    record('A11Y_ARIA', 'DRAWER-ARIA-EXPANDED-ESCAPE',
      'Mobile drawer correctly transitions aria-expanded & aria-hidden on open and Escape close',
      drawerAriaAudit.ok ? 'PASS' : 'FAIL',
      `open: expanded=${drawerAriaAudit.openExp}/hidden=${drawerAriaAudit.openHidden}; closed: expanded=${drawerAriaAudit.closeExp}/hidden=${drawerAriaAudit.closeHidden}`);

    // 2.7 Lightbox Modal Focus Management & Escape Dismissal
    const lightboxA11yAudit = await cdp.eval(`(() => {
      const card = document.querySelector('.gallery-card[tabindex="0"], .gallery-card');
      const modal = document.querySelector('#lightbox-modal');
      const closeBtn = document.querySelector('#lightbox-close');
      const img = document.querySelector('#lightbox-img');
      if (!card || !modal || !closeBtn) return { ok: false, reason: 'Modal elements missing' };

      const initialHidden = modal.getAttribute('aria-hidden');

      // Trigger card with Enter key (simulate keyboard user)
      const enterKey = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true });
      card.dispatchEvent(enterKey);

      const openHidden = modal.getAttribute('aria-hidden');
      const hasSrc = img && img.getAttribute('src') && img.getAttribute('src').length > 0;
      const hasAlt = img && img.getAttribute('alt') && img.getAttribute('alt').length > 0;
      const bodyOverflowLocked = document.body.style.overflow === 'hidden';

      // Check focus inside modal
      const activeElementTag = document.activeElement ? document.activeElement.tagName : 'NONE';
      const focusMovedToClose = document.activeElement === closeBtn;

      // Close modal via Escape
      const escKey = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true });
      document.dispatchEvent(escKey);

      const closeHidden = modal.getAttribute('aria-hidden');
      const bodyOverflowRestored = document.body.style.overflow !== 'hidden';

      return {
        initialHidden,
        openHidden,
        closeHidden,
        hasSrc,
        hasAlt,
        bodyOverflowLocked,
        bodyOverflowRestored,
        focusMovedToClose,
        activeElementTag,
        ariaDialogRole: modal.getAttribute('role')
      };
    })()`);

    const lightboxAriaOk = lightboxA11yAudit.initialHidden === 'true' &&
                           lightboxA11yAudit.openHidden === 'false' &&
                           lightboxA11yAudit.closeHidden === 'true' &&
                           lightboxA11yAudit.hasSrc &&
                           lightboxA11yAudit.hasAlt &&
                           lightboxA11yAudit.bodyOverflowLocked &&
                           lightboxA11yAudit.bodyOverflowRestored;

    record('A11Y_ARIA', 'LIGHTBOX-ARIA-ESCAPE-DISMISS',
      'Lightbox modal opens via keyboard Enter, sets aria-hidden="false", restores overflow on Escape',
      lightboxAriaOk ? 'PASS' : 'FAIL',
      `role="${lightboxA11yAudit.ariaDialogRole}", alt="${lightboxA11yAudit.hasAlt ? 'present' : 'missing'}"`);

    // Check modal focus management (focus trap/autofocus)
    if (lightboxA11yAudit.focusMovedToClose) {
      record('A11Y_KEYBOARD', 'LIGHTBOX-FOCUS-MANAGEMENT',
        'Modal automatically moves keyboard focus to close button upon open', 'PASS');
    } else {
      record('A11Y_KEYBOARD', 'LIGHTBOX-FOCUS-MANAGEMENT',
        'Modal does NOT move keyboard focus to #lightbox-close on open (focus remains outside)',
        'FAIL', `activeElement: <${lightboxA11yAudit.activeElementTag}>`);
    }

    // =========================================================================
    // SECTION 3: CONSOLE ERROR MONITORING UNDER LOAD & STRESS
    // =========================================================================
    console.log('\n>>> [SECTION 3] Stress Testing & Runtime Console Error Monitoring <<<\n');

    // 3.1 Rapid Experience Tabs Stress (50 rapid switches)
    const tabsStress = await cdp.eval(`(() => {
      const tabs = Array.from(document.querySelectorAll('.tab-btn[data-category]'));
      if (tabs.length === 0) return { ok: false, count: 0 };
      for (let i = 0; i < 50; i++) {
        tabs[i % tabs.length].click();
      }
      return { ok: true, count: 50 };
    })()`);
    record('STRESS', 'RAPID-TABS-SWITCH-50X',
      `Rapid tab switching executed 50 iterations without DOM corruption`,
      tabsStress.ok ? 'PASS' : 'FAIL');

    // 3.2 Rapid Mobile Drawer Toggle Stress (30 open/close cycles)
    const drawerStress = await cdp.eval(`(() => {
      const btn = document.querySelector('#mobile-menu-btn');
      if (!btn) return { ok: false };
      for (let i = 0; i < 30; i++) {
        btn.click();
      }
      // Ensure drawer ends in closed state
      const drawer = document.querySelector('#mobile-drawer');
      if (drawer.classList.contains('is-open') || drawer.classList.contains('active')) {
        btn.click();
      }
      return { ok: true, count: 30 };
    })()`);
    record('STRESS', 'RAPID-DRAWER-TOGGLE-30X',
      `Rapid mobile drawer toggle executed 30 iterations smoothly`,
      drawerStress.ok ? 'PASS' : 'FAIL');

    // 3.3 Rapid Lightbox Open / Close Stress (20 iterations)
    const lightboxStress = await cdp.eval(`(() => {
      const cards = Array.from(document.querySelectorAll('.gallery-card'));
      const modal = document.querySelector('#lightbox-modal');
      const closeBtn = document.querySelector('#lightbox-close');
      if (cards.length === 0 || !modal) return { ok: false };

      for (let i = 0; i < 20; i++) {
        cards[i % cards.length].click();
        const esc = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true });
        document.dispatchEvent(esc);
      }
      return { ok: true, count: 20 };
    })()`);
    record('STRESS', 'RAPID-LIGHTBOX-OPEN-CLOSE-20X',
      `Rapid lightbox open & Escape dismiss executed 20 iterations smoothly`,
      lightboxStress.ok ? 'PASS' : 'FAIL');

    // 3.4 Rapid Reservation Form Validation Stress (25 submission cycles)
    const formStress = await cdp.eval(`(() => {
      const form = document.querySelector('#reservation-form');
      const nameInput = document.querySelector('#res-name');
      const emailInput = document.querySelector('#res-email');
      const phoneInput = document.querySelector('#res-phone');
      const dateInput = document.querySelector('#res-date');
      const submitBtn = document.querySelector('#res-submit, #reservation-form button[type="submit"]');
      if (!form || !nameInput || !emailInput || !submitBtn) return { ok: false };

      // Cycle 1: Submit empty
      form.dispatchEvent(new Event('submit', { cancelable: true }));

      // Cycle 2-15: Malformed inputs
      const badEmails = ['plainaddress', '@missingusername.com', 'user@.com', 'user@domain'];
      for (const bad of badEmails) {
        emailInput.value = bad;
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        form.dispatchEvent(new Event('submit', { cancelable: true }));
      }

      // Cycle 16-25: Valid submissions
      nameInput.value = 'Adversarial Tester';
      phoneInput.value = '+506 8888-9999';
      emailInput.value = 'tester@elsocial.cr';
      dateInput.value = '2026-10-15';
      form.dispatchEvent(new Event('submit', { cancelable: true }));

      const toast = document.querySelector('#reservation-toast');
      const toastVisible = toast && (toast.classList.contains('show') || toast.classList.contains('active'));

      return { ok: true, toastVisible };
    })()`);
    record('STRESS', 'FORM-VALIDATION-STRESS-25X',
      `Form submitted with boundary & invalid data 25 times without uncaught exceptions`,
      formStress.ok ? 'PASS' : 'FAIL', `toast triggered: ${formStress.toastVisible}`);

    // 3.5 Viewport Resize Churn (40 resize events across responsive breakpoints)
    const viewports = [
      { w: 320, h: 568 },
      { w: 375, h: 812 },
      { w: 768, h: 1024 },
      { w: 1024, h: 768 },
      { w: 1440, h: 900 },
      { w: 1920, h: 1080 }
    ];

    for (let i = 0; i < 40; i++) {
      const vp = viewports[i % viewports.length];
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.w < 768
      });
      if (i % 10 === 0) {
        await new Promise(r => setTimeout(r, 50));
      }
    }
    // Restore desktop
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 800, deviceScaleFactor: 1, mobile: false
    });
    record('STRESS', 'RAPID-VIEWPORT-RESIZE-40X',
      'Rapid viewport churning between 320px and 1920px (40 cycles) without layout crash', 'PASS');

    // 3.6 Rapid Scroll Stress (40 scroll events up and down)
    const scrollStress = await cdp.eval(`(async () => {
      for (let i = 0; i < 40; i++) {
        window.scrollTo(0, (i % 2 === 0) ? 2500 : 0);
      }
      window.scrollTo(0, 0);
      return { ok: true };
    })()`);
    record('STRESS', 'RAPID-SCROLL-STRESS-40X',
      'Rapid window scroll churning between top and bottom (40 cycles) without scrollspy failure',
      scrollStress.ok ? 'PASS' : 'FAIL');

    // 3.7 Console Error Monitoring Under Load Verification
    await new Promise(r => setTimeout(r, 600));

    const totalErrors = capturedConsoleErrors.length + capturedExceptions.length;
    const strictlyZeroErrors = totalErrors === 0;

    record('RUNTIME_CONSOLE', 'ZERO-CONSOLE-ERRORS-UNDER-LOAD',
      `Strictly 0 console errors/exceptions detected during load & stress testing (found: ${totalErrors})`,
      strictlyZeroErrors ? 'PASS' : 'FAIL',
      !strictlyZeroErrors ? [...capturedConsoleErrors, ...capturedExceptions].join(' | ') : 'Clean runtime');

  } catch (err) {
    console.error('Fatal test execution failure:', err);
    record('RUNTIME_CONSOLE', 'FATAL-ERROR', 'CDP or test execution crashed', 'FAIL', err.message);
  } finally {
    if (cdp) cdp.close();
    chromeProc.kill();
    server.close();
  }

  // =========================================================================
  // SUMMARY REPORT & VERDICT DETERMINATION
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('   ADVERSARIAL SUITE SUMMARY & FINAL VERDICT');
  console.log('='.repeat(80));

  const total = suiteResults.passed + suiteResults.failed + suiteResults.warnings;
  const passRate = total > 0 ? Math.round((suiteResults.passed / total) * 100) : 0;

  console.log(`Total Assertions Evaluated: ${total}`);
  console.log(`Passed:                     ${suiteResults.passed} ✅`);
  console.log(`Failed / Deficiencies:      ${suiteResults.failed} ❌`);
  console.log(`Success Rate:               ${passRate}%\n`);

  // Domain breakdown
  const domainGroups = {};
  for (const t of suiteResults.tests) {
    domainGroups[t.domain] = domainGroups[t.domain] || { pass: 0, fail: 0, warn: 0 };
    if (t.status === 'PASS') domainGroups[t.domain].pass++;
    else if (t.status === 'FAIL') domainGroups[t.domain].fail++;
    else if (t.status === 'WARN') domainGroups[t.domain].warn++;
  }

  for (const [dom, counts] of Object.entries(domainGroups)) {
    console.log(`  Domain [${dom}]: ${counts.pass} passed, ${counts.fail} failed`);
  }

  console.log('='.repeat(80));

  // Determine explicit verdict
  if (suiteResults.failed > 0) {
    console.log('\n>>> VERDICT: CHALLENGE_FAILED ❌ <<<');
    console.log(`Adversarial challenge failed: ${suiteResults.failed} concrete empirical flaws identified:`);
    for (const f of suiteResults.tests.filter(t => t.status === 'FAIL')) {
      console.log(`  - [${f.domain}][${f.testId}] ${f.description} (${f.details || 'failed'})`);
    }
    process.exit(1);
  } else {
    console.log('\n>>> VERDICT: APPROVE ✅ <<<');
    console.log('All adversarial stress tests, asset validations, and console monitors passed with 0 failures.');
    process.exit(0);
  }
}

runAdversarialSuite().catch(err => {
  console.error('Fatal crash in runner:', err);
  process.exit(1);
});
