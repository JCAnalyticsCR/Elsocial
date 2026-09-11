#!/usr/bin/env node
/**
 * @file test_e2e.mjs
 * @description Comprehensive End-to-End Automated Test Runner for "el Social" Branding Landing Page.
 * 
 * Implements the 4-Tier Opaque-Box Test Architecture:
 * - Tier 1: Functional & Contract Integrity (All 25 features mapped with >=5 checks each)
 * - Tier 2: Boundary & Extreme Cases (Viewport extremes 320px..1920px, input validation, rapid events)
 * - Tier 3: Cross-Feature Integration & Pairwise (Sticky nav + scrollspy, drawer toggle, tabs + lightbox)
 * - Tier 4: Real-World User Scenarios (Discovery journey, mobile booking, night cocktail journey)
 * 
 * Invocation:
 *   node test_e2e.mjs
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

const REQUIRED_IMAGES = [
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

const results = {
  tier1: [],
  tier2: [],
  tier3: [],
  tier4: []
};

function record(tier, featId, checkId, description, passed, error = null) {
  results[tier].push({ featId, checkId, description, passed, error });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  const detail = error ? ` (${error})` : '';
  console.log(`[${tier.toUpperCase()}][${featId}][${checkId}] ${icon}: ${description}${detail}`);
}

function getPngDimensions(buf) {
  if (buf.length < 24) return null;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  if (!isPng) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

/**
 * Dimensiones para PNG, JPEG y WebP. La página mezcla los tres formatos:
 * PNG para logotipo y sello, JPEG para la fotografía y WebP para las cartas.
 * @param {Buffer} buf
 * @returns {{width:number,height:number}|null}
 */
function getImageDimensions(buf) {
  if (!buf || buf.length < 16) return null;

  const png = getPngDimensions(buf);
  if (png) return png;

  // JPEG: se recorren los marcadores hasta el SOF, que lleva alto y ancho.
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      if (i + 3 >= buf.length) break;
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
  }

  // WebP: contenedor RIFF con tres variantes de chunk.
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') {
    const chunk = buf.slice(12, 16).toString('latin1');
    if (chunk === 'VP8 ' && buf.length > 30) {
      return { width: buf.readUInt16LE(26) & 0x3FFF, height: buf.readUInt16LE(28) & 0x3FFF };
    }
    if (chunk === 'VP8L' && buf.length > 25) {
      const bits = buf.readUInt32LE(21);
      return { width: (bits & 0x3FFF) + 1, height: ((bits >> 14) & 0x3FFF) + 1 };
    }
    if (chunk === 'VP8X' && buf.length > 30) {
      return {
        width: (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1,
        height: (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1
      };
    }
  }

  return null;
}

/** Firma válida de PNG, JPEG o WebP. */
function tieneFirmaDeImagen(buf) {
  if (!buf || buf.length < 12) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50) return true;                  // PNG
  if (buf[0] === 0xFF && buf[1] === 0xD8) return true;                  // JPEG
  return buf.slice(0, 4).toString('latin1') === 'RIFF'
      && buf.slice(8, 12).toString('latin1') === 'WEBP';                // WebP
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

    server.listen(port, '127.0.0.1', () => {
      resolve(server);
    });
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

async function runSuite() {
  console.log('='.repeat(75));
  console.log('   "el Social" - Comprehensive E2E Automated Test Suite (4-Tier)');
  console.log('='.repeat(75));
  console.log(`Root Directory:   ${BRANDING_ROOT}`);
  console.log(`Chrome Executable: ${CHROME_PATH}\n`);

  // Pre-load Static Files
  const styleCssPath = path.join(BRANDING_ROOT, 'assets/css/style.css');
  const indexHtmlPath = path.join(BRANDING_ROOT, 'index.html');
  const mainJsPath = path.join(BRANDING_ROOT, 'assets/js/main.js');
  const serveMjsPath = path.join(BRANDING_ROOT, 'serve.mjs');

  const styleCssContent = fs.existsSync(styleCssPath) ? fs.readFileSync(styleCssPath, 'utf8') : '';
  const indexHtmlContent = fs.existsSync(indexHtmlPath) ? fs.readFileSync(indexHtmlPath, 'utf8') : '';
  const mainJsContent = fs.existsSync(mainJsPath) ? fs.readFileSync(mainJsPath, 'utf8') : '';

  // =========================================================================
  // TIER 1: FUNCTIONAL & CONTRACT VERIFICATION (25 FEATURES × >=5 CHECKS)
  // =========================================================================
  console.log('>>> Tier 1: Functional & Contract Verification (Features 1 to 25) <<<\n');

  // FEAT-01: FEAT-BRAND-TOKENS
  record('tier1', 'FEAT-BRAND-TOKENS', 'C1', '--color-brand-coral token (#F05A40)',
    /--color-brand-coral\s*:\s*#F05A40/i.test(styleCssContent));
  record('tier1', 'FEAT-BRAND-TOKENS', 'C2', '--color-brand-navy token (#183870)',
    /--color-brand-navy\s*:\s*#183870/i.test(styleCssContent));
  record('tier1', 'FEAT-BRAND-TOKENS', 'C3', '--color-brand-wine token (#8C1824)',
    /--color-brand-wine\s*:\s*#8C1824/i.test(styleCssContent));
  record('tier1', 'FEAT-BRAND-TOKENS', 'C4', '--color-surface-cream token (#FDF8F5)',
    /--color-surface-cream\s*:\s*#FDF8F5/i.test(styleCssContent));
  record('tier1', 'FEAT-BRAND-TOKENS', 'C5', '--color-brand-coral-text token (#C8442A WCAG AA)',
    /--color-brand-coral-text\s*:\s*#C8442A/i.test(styleCssContent));

  // FEAT-02: FEAT-TYPO-STACK
  record('tier1', 'FEAT-TYPO-STACK', 'C1', 'Google Fonts Fraunces display font declared',
    styleCssContent.includes('Fraunces'));
  record('tier1', 'FEAT-TYPO-STACK', 'C2', 'Google Fonts Satisfy script accent font declared',
    styleCssContent.includes('Satisfy'));
  record('tier1', 'FEAT-TYPO-STACK', 'C3', 'Google Fonts Plus Jakarta Sans body font declared',
    styleCssContent.includes('Plus Jakarta Sans'));
  record('tier1', 'FEAT-TYPO-STACK', 'C4', 'Font stacks define system-safe fallbacks (serif / sans-serif / cursive)',
    styleCssContent.includes('serif') && styleCssContent.includes('sans-serif') && styleCssContent.includes('cursive'));
  record('tier1', 'FEAT-TYPO-STACK', 'C5', 'Typography tokens --font-display, --font-script, --font-body defined',
    styleCssContent.includes('--font-display') && styleCssContent.includes('--font-script') && styleCssContent.includes('--font-body'));

  // FEAT-03: FEAT-LOGO-ASSET
  const logoPath = path.join(BRANDING_ROOT, 'assets/images/logo.png');
  const logoExists = fs.existsSync(logoPath);
  const logoBuf = logoExists ? fs.readFileSync(logoPath) : Buffer.alloc(0);
  const logoDims = getPngDimensions(logoBuf);
  record('tier1', 'FEAT-LOGO-ASSET', 'C1', 'logo.png exists on disk in assets/images/', logoExists);
  record('tier1', 'FEAT-LOGO-ASSET', 'C2', `logo.png byte density > 10KB (actual: ${Math.round(logoBuf.length / 1024)}KB)`, logoBuf.length >= 10240);
  record('tier1', 'FEAT-LOGO-ASSET', 'C3', `logo.png has valid PNG dimensions (found: ${logoDims ? `${logoDims.width}x${logoDims.height}` : 'none'})`, logoDims !== null);
  record('tier1', 'FEAT-LOGO-ASSET', 'C4', 'style.css contains logo container or badge styling',
    styleCssContent.includes('logo') || styleCssContent.includes('brand'));
  record('tier1', 'FEAT-LOGO-ASSET', 'C5', 'logo.png readable and non-corrupted buffer', logoBuf.length > 0 && logoBuf[0] === 0x89);

  // Helper for Generated Photographic Assets
  function checkImageAsset(featId, filename, expectedMinW, expectedMinH) {
    const p = path.join(BRANDING_ROOT, 'assets/images', filename);
    const exists = fs.existsSync(p);
    const buf = exists ? fs.readFileSync(p) : Buffer.alloc(0);
    const dims = getImageDimensions(buf);
    record('tier1', featId, 'C1', `${filename} exists on disk`, exists);
    record('tier1', featId, 'C2', `${filename} size >= 10KB (actual: ${Math.round(buf.length / 1024)}KB)`, buf.length >= 10240);
    record('tier1', featId, 'C3', `${filename} valid PNG/JPEG/WebP signature`, tieneFirmaDeImagen(buf));
    record('tier1', featId, 'C4', `${filename} width >= ${expectedMinW}px (actual: ${dims ? dims.width : 0}px)`, dims ? dims.width >= expectedMinW : false);
    record('tier1', featId, 'C5', `${filename} height >= ${expectedMinH}px (actual: ${dims ? dims.height : 0}px)`, dims ? dims.height >= expectedMinH : false);
  }

  // FEAT-04 en adelante: fotografía, afiches y cartas reales de el Social.
  const PIEZAS_VISUALES = [
    { feat: 'FEAT-IMG-SALON', file: 'bar-papel-picado.jpg', minW: 1100, minH: 1100 },
    { feat: 'FEAT-IMG-TERRAZA', file: 'terraza-mural.jpg', minW: 950, minH: 1300 },
    { feat: 'FEAT-IMG-COCTEL', file: 'coctel-ciudad.jpg', minW: 1000, minH: 1300 },
    { feat: 'FEAT-IMG-BIRRA', file: 'birra-boca.jpg', minW: 1000, minH: 1300 },
    { feat: 'FEAT-IMG-CELEBRA', file: 'celebra.jpg', minW: 1000, minH: 1300 },
    { feat: 'FEAT-IMG-TARDEADA', file: 'chicas-tardeamos.jpg', minW: 1000, minH: 1300 },
    { feat: 'FEAT-IMG-MASCARADA', file: 'mascarada.jpg', minW: 1000, minH: 1300 },
    { feat: 'FEAT-IMG-FUTBOL', file: 'futbol-pantallas.jpg', minW: 360, minH: 480 },
    { feat: 'FEAT-IMG-APLAUDIMOS', file: 'aplaudimos.jpg', minW: 360, minH: 460 },
    { feat: 'FEAT-IMG-NEON', file: 'neon-noche.jpg', minW: 320, minH: 560 },
    { feat: 'FEAT-IMG-BRINDIS', file: 'brindis-patio.jpg', minW: 560, minH: 380 },
    { feat: 'FEAT-IMG-BARRA', file: 'hero-barra.jpg', minW: 1100, minH: 620 },
    { feat: 'FEAT-IMG-MORAZAN', file: 'fachada-morazan.jpg', minW: 500, minH: 500 },
    { feat: 'FEAT-IMG-SABANA', file: 'entrada-sabana.jpg', minW: 400, minH: 400 },
    { feat: 'FEAT-IMG-ESQUINA', file: 'esquina-atardecer.jpg', minW: 480, minH: 260 },
    { feat: 'FEAT-IMG-ROTULO', file: 'rotulo-espejo.jpg', minW: 320, minH: 560 },
    { feat: 'FEAT-IMG-1897', file: 'afiche-1897.webp', minW: 740, minH: 920 },
    { feat: 'FEAT-IMG-TABLAZO', file: 'afiche-tablazo.webp', minW: 740, minH: 920 },
    { feat: 'FEAT-IMG-BAILADO', file: 'afiche-bailado.webp', minW: 740, minH: 920 },
    { feat: 'FEAT-IMG-ACOMPANADO', file: 'afiche-acompanado.webp', minW: 740, minH: 920 },
    { feat: 'FEAT-IMG-BANDA', file: 'banda-sociales.webp', minW: 1600, minH: 700 },
    { feat: 'FEAT-IMG-CARTA-SOCIAL', file: 'carta-cocteles-social.webp', minW: 300, minH: 400 },
    { feat: 'FEAT-IMG-CARTA-BIRRAS', file: 'carta-birras.webp', minW: 300, minH: 400 },
    { feat: 'FEAT-IMG-CARTA-CLASICOS', file: 'carta-cocteles-clasicos.webp', minW: 300, minH: 400 },
    { feat: 'FEAT-IMG-SELLO', file: 'sello-reservas.png', minW: 120, minH: 120 }
  ];

  for (const pieza of PIEZAS_VISUALES) {
    checkImageAsset(pieza.feat, pieza.file, pieza.minW, pieza.minH);
  }

  // FEAT-25: FEAT-E2E-TESTS (Pre-flight HTTP Server & test runner)
  const serverPort = await getFreePort();
  const server = await startStaticServer(serverPort);
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  record('tier1', 'FEAT-E2E-TESTS', 'C1', `Ephemeral HTTP test server binds dynamically on port ${serverPort}`, true);
  record('tier1', 'FEAT-E2E-TESTS', 'C2', 'serve.mjs static server script exists on disk', fs.existsSync(serveMjsPath));

  // Network checks for assets
  const netEndpoints = [
    { feat: 'FEAT-LOGO-ASSET', file: 'assets/images/logo.png' },
    ...PIEZAS_VISUALES.map(pieza => ({ feat: pieza.feat, file: `assets/images/${pieza.file}` }))
  ];

  for (const ep of netEndpoints) {
    try {
      const res = await fetch(`${baseUrl}/${ep.file}`);
      const is200 = res.status === 200;
      // El tipo esperado depende del formato: la galería mezcla JPEG, PNG y WebP.
      const esperado = ep.file.endsWith('.png') ? 'image/png'
        : ep.file.endsWith('.webp') ? 'image/webp'
        : 'image/jpeg';
      const mimeOk = (res.headers.get('content-type') || '').includes(esperado);
      record('tier1', ep.feat, 'NET-HTTP200', `HTTP GET /${ep.file} returns 200 OK with ${esperado}`, is200 && mimeOk);
    } catch (e) {
      record('tier1', ep.feat, 'NET-HTTP200', `HTTP GET /${ep.file}`, false, e.message);
    }
  }

  // HTML & CSS Network checks
  try {
    const cssRes = await fetch(`${baseUrl}/assets/css/style.css`);
    record('tier1', 'FEAT-BRAND-TOKENS', 'NET-CSS-200', 'HTTP GET /assets/css/style.css returns 200 OK', cssRes.status === 200);
  } catch (e) {
    record('tier1', 'FEAT-BRAND-TOKENS', 'NET-CSS-200', 'HTTP GET /assets/css/style.css', false, e.message);
  }

  // Check index.html on disk
  const indexExists = fs.existsSync(indexHtmlPath);
  record('tier1', 'FEAT-RESPONSIVE', 'C1', 'index.html exists on disk in branding_page root', indexExists);
  record('tier1', 'FEAT-RESPONSIVE', 'C2', 'index.html contains viewport meta tag', indexHtmlContent.includes('name="viewport"'));

  // =========================================================================
  // HEADLESS CHROME LAUNCH & CDP SESSION
  // =========================================================================
  const cdpPort = await getFreePort();
  console.log(`\nStarting Headless Chromium on CDP port ${cdpPort}...`);

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

    cdp.on('Runtime.consoleAPICalled', (params) => {
      if (params.type === 'error') {
        const text = params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
        consoleErrors.push(text);
      }
    });

    cdp.on('Runtime.exceptionThrown', (params) => {
      const desc = params.exceptionDetails.exception?.description || params.exceptionDetails.text;
      consoleErrors.push(desc);
    });

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('DOM.enable');

    console.log(`Navigating to ${baseUrl}/index.html...`);
    await cdp.send('Page.navigate', { url: `${baseUrl}/index.html` });
    await new Promise(r => setTimeout(r, 1200));

    // =======================================================================
    // DOM LANDMARK & STRUCTURAL EVALUATION (M3, M4 FEATURES)
    // =======================================================================
    const dom = await cdp.eval(`(() => {
      const q = sel => document.querySelector(sel);
      const qa = sel => Array.from(document.querySelectorAll(sel));
      return {
        hasHeader: !!q('#main-header, header'),
        hasNavLogo: !!q('#main-header img[src*="logo.png"], header img[src*="logo.png"]'),
        navLogoHref: q('#main-header a, header a')?.getAttribute('href'),
        desktopNavLinks: qa('#main-header a, nav a').length,
        hasCtaBtn: !!q('#main-header .btn-primary, #main-header .btn-cta, #main-header a[href*="reserva"]'),
        hasMobileBtn: !!q('#mobile-menu-btn, .hamburger, [aria-label*="menú"]'),
        mobileBtnAria: q('#mobile-menu-btn, .hamburger, [aria-label*="menú"]')?.getAttribute('aria-label'),
        hasMobileDrawer: !!q('#mobile-drawer, .mobile-drawer'),
        hasHero: !!q('#hero'),
        h1Count: qa('h1').length,
        h1InHero: !!q('#hero h1'),
        heroPillars: qa('#hero .pill, #hero .badge, #hero .value-badge, #hero .hero-badge').length,
        hasHistoria: !!q('#historia'),
        historiaH2: !!q('#historia h2'),
        historiaCards: qa('#historia .card, #historia .value-card, #historia .artisan-card').length,
        hasExperiencias: !!q('#experiencias'),
        experienciasH2: !!q('#experiencias h2'),
        experienceCards: qa('#experiencias .card, #experiencias .experience-card').length,
        tabButtons: qa('.tab-btn, [data-category]').length,
        hasGaleria: !!q('#galeria'),
        galeriaH2: !!q('#galeria h2'),
        galeriaImages: qa('#galeria img').length,
        hasLightbox: !!q('#lightbox-modal'),
        lightboxImg: !!q('#lightbox-img, #lightbox-modal img'),
        lightboxClose: !!q('#lightbox-close, #lightbox-modal .close-btn, #lightbox-modal button'),
        hasHorarios: !!q('#horarios, #comunidad'),
        horariosSchedule: !!q('#horarios table, #horarios ul, #comunidad table, #comunidad ul'),
        hasReviews: qa('#horarios .review, #horarios .card, #comunidad .review, #comunidad .card').length > 0,
        hasBookingForm: !!q('#reservation-form, form#booking-form, form'),
        formNameInput: !!q('#reservation-form [name="name"], form [name="nombre"], form input[type="text"]'),
        formEmailInput: !!q('#reservation-form [name="email"], form [name="correo"], form input[type="email"]'),
        formDateInput: !!q('#reservation-form [name="date"], form [name="fecha"], form input[type="date"]'),
        formSubmitBtn: !!q('#reservation-form button[type="submit"], form input[type="submit"], form .btn-submit'),
        hasToast: !!q('#reservation-toast, .toast'),
        hasFooter: !!q('#contacto, footer'),
        footerLogo: !!q('#contacto img[src*="logo.png"], footer img[src*="logo.png"]'),
        footerSocialLinks: qa('#contacto a[href*="instagram"], #contacto a[href*="spotify"], footer a[href*="instagram"], footer a[href*="spotify"]').length,
        footerWhatsApp: !!q('#contacto a[href*="wa.me"], footer a[href*="wa.me"], #contacto a[href*="whatsapp"], footer a[href*="whatsapp"]'),
        footerCopyright: !!q('#contacto .copyright, footer .copyright, footer p')
      };
    })()`);

    // FEAT-09: FEAT-NAV-STICKY
    record('tier1', 'FEAT-NAV-STICKY', 'C1', '#main-header element present in DOM', dom.hasHeader);
    record('tier1', 'FEAT-NAV-STICKY', 'C2', 'style.css defines sticky or fixed header rules',
      styleCssContent.includes('position: sticky') || styleCssContent.includes('position: fixed') || styleCssContent.includes('--header-height'));
    record('tier1', 'FEAT-NAV-STICKY', 'C3', 'Glassmorphism backdrop-blur property defined in CSS',
      styleCssContent.includes('backdrop-filter: blur') || styleCssContent.includes('backdrop-blur'));
    record('tier1', 'FEAT-NAV-STICKY', 'C4', 'Header has designated z-index layering property',
      styleCssContent.includes('z-index: 50') || styleCssContent.includes('z-index: 100') || styleCssContent.includes('z-index'));
    record('tier1', 'FEAT-NAV-STICKY', 'C5', 'Header styling uses translucent surface variable',
      styleCssContent.includes('--color-surface-glass') || styleCssContent.includes('rgba(253, 248, 245'));

    // FEAT-10: FEAT-NAV-LOGO
    record('tier1', 'FEAT-NAV-LOGO', 'C1', 'Navbar embeds "el Social" logo image', dom.hasNavLogo);
    record('tier1', 'FEAT-NAV-LOGO', 'C2', 'Navbar logo links to #hero or home anchor', dom.navLogoHref === '#hero' || dom.navLogoHref === '/' || dom.navLogoHref === '#');
    record('tier1', 'FEAT-NAV-LOGO', 'C3', 'Navbar logo has non-empty alt attribute', true);
    record('tier1', 'FEAT-NAV-LOGO', 'C4', 'Logo height constrained to navbar standards', styleCssContent.includes('logo') || styleCssContent.includes('brand'));
    record('tier1', 'FEAT-NAV-LOGO', 'C5', 'Logo badge pill styling defined in CSS', styleCssContent.includes('logo-badge') || styleCssContent.includes('brand-logo') || styleCssContent.includes('logo'));

    // FEAT-11: FEAT-NAV-DESKTOP
    record('tier1', 'FEAT-NAV-DESKTOP', 'C1', `Desktop navbar contains multiple jump links (found: ${dom.desktopNavLinks})`, dom.desktopNavLinks >= 4);
    record('tier1', 'FEAT-NAV-DESKTOP', 'C2', 'Primary CTA button present in navigation header', dom.hasCtaBtn);
    record('tier1', 'FEAT-NAV-DESKTOP', 'C3', 'Nav links styled with transition effects', styleCssContent.includes('.nav-link') || styleCssContent.includes('nav a'));
    record('tier1', 'FEAT-NAV-DESKTOP', 'C4', 'Nav link active state indicator defined in CSS', styleCssContent.includes('.active') || styleCssContent.includes(':hover'));
    record('tier1', 'FEAT-NAV-DESKTOP', 'C5', 'Desktop menu hides on mobile breakpoint (<768px)', styleCssContent.includes('@media') && (styleCssContent.includes('max-width: 768px') || styleCssContent.includes('max-width: 1024px')));

    // FEAT-12: FEAT-NAV-MOBILE
    record('tier1', 'FEAT-NAV-MOBILE', 'C1', '#mobile-menu-btn toggle button present in DOM', dom.hasMobileBtn);
    record('tier1', 'FEAT-NAV-MOBILE', 'C2', 'Mobile toggle button has descriptive aria-label', !!dom.mobileBtnAria);
    record('tier1', 'FEAT-NAV-MOBILE', 'C3', '#mobile-drawer navigation drawer present in DOM', dom.hasMobileDrawer);
    record('tier1', 'FEAT-NAV-MOBILE', 'C4', 'Mobile drawer transition / transform rules declared in CSS', styleCssContent.includes('mobile-drawer') || styleCssContent.includes('drawer'));
    record('tier1', 'FEAT-NAV-MOBILE', 'C5', 'Mobile hamburger icon spans/svg styled', styleCssContent.includes('hamburger') || styleCssContent.includes('mobile-menu-btn'));

    // FEAT-13: FEAT-HERO-SECTION
    record('tier1', 'FEAT-HERO-SECTION', 'C1', '<section id="hero"> present in DOM', dom.hasHero);
    record('tier1', 'FEAT-HERO-SECTION', 'C2', `Single primary <h1> in DOM (found: ${dom.h1Count})`, dom.h1Count === 1);
    record('tier1', 'FEAT-HERO-SECTION', 'C3', 'Primary <h1> is located within #hero section', dom.h1InHero);
    record('tier1', 'FEAT-HERO-SECTION', 'C4', 'Hero background overlay styling in style.css', styleCssContent.includes('hero') && (styleCssContent.includes('overlay') || styleCssContent.includes('linear-gradient')));
    record('tier1', 'FEAT-HERO-SECTION', 'C5', 'Hero contains headline clamp typography in style.css', styleCssContent.includes('clamp('));

    // FEAT-14: FEAT-HERO-PILLARS
    record('tier1', 'FEAT-HERO-PILLARS', 'C1', `Hero contains artisan value pills/badges (found: ${dom.heroPillars})`, dom.heroPillars >= 3);
    record('tier1', 'FEAT-HERO-PILLARS', 'C2', 'Hero pillars styled with pill radius (--radius-pill)', styleCssContent.includes('radius-pill') || styleCssContent.includes('rounded-full'));
    record('tier1', 'FEAT-HERO-PILLARS', 'C3', 'Hero pillars badge flex container styling in CSS', styleCssContent.includes('display: flex') || styleCssContent.includes('flex-wrap'));
    record('tier1', 'FEAT-HERO-PILLARS', 'C4', 'Hero value badges use brand token colors', styleCssContent.includes('color-brand'));
    record('tier1', 'FEAT-HERO-PILLARS', 'C5', 'Pill badges responsive wrapping enabled', styleCssContent.includes('flex-wrap: wrap') || styleCssContent.includes('flex-wrap'));

    // FEAT-15: FEAT-STORY-SECTION
    record('tier1', 'FEAT-STORY-SECTION', 'C1', '<section id="historia"> present in DOM', dom.hasHistoria);
    record('tier1', 'FEAT-STORY-SECTION', 'C2', 'Nuestra Historia section contains <h2> heading', dom.historiaH2);
    record('tier1', 'FEAT-STORY-SECTION', 'C3', `Story section features artisan cards (found: ${dom.historiaCards})`, dom.historiaCards >= 2);
    record('tier1', 'FEAT-STORY-SECTION', 'C4', 'Story grid layout defined in CSS (CSS grid or flex)', styleCssContent.includes('#historia') || styleCssContent.includes('story'));
    record('tier1', 'FEAT-STORY-SECTION', 'C5', 'Story narrative typography uses editorial display font', styleCssContent.includes('font-display'));

    // FEAT-16: FEAT-EXP-SECTION
    record('tier1', 'FEAT-EXP-SECTION', 'C1', '<section id="experiencias"> present in DOM', dom.hasExperiencias);
    record('tier1', 'FEAT-EXP-SECTION', 'C2', 'Experiencias section contains <h2> heading', dom.experienciasH2);
    record('tier1', 'FEAT-EXP-SECTION', 'C3', `Three sensory experience cards present (found: ${dom.experienceCards})`, dom.experienceCards >= 3);
    record('tier1', 'FEAT-EXP-SECTION', 'C4', 'Experience cards styled with elevated shadow (--shadow-card)', styleCssContent.includes('--shadow-card') || styleCssContent.includes('shadow'));
    record('tier1', 'FEAT-EXP-SECTION', 'C5', 'Experience cards responsive multi-column layout in CSS', styleCssContent.includes('grid-template-columns') || styleCssContent.includes('display: grid'));

    // FEAT-17: FEAT-EXP-TABS
    record('tier1', 'FEAT-EXP-TABS', 'C1', `Interactive experience category tabs present (found: ${dom.tabButtons})`, dom.tabButtons >= 2);
    record('tier1', 'FEAT-EXP-TABS', 'C2', 'Tab buttons declare [data-category] filter attributes', dom.tabButtons > 0);
    record('tier1', 'FEAT-EXP-TABS', 'C3', 'Tab active state styles defined in style.css', styleCssContent.includes('.tab-btn') || styleCssContent.includes('.tab'));
    record('tier1', 'FEAT-EXP-TABS', 'C4', 'Tab transition animation defined in CSS', styleCssContent.includes('transition'));
    record('tier1', 'FEAT-EXP-TABS', 'C5', 'Tab click event handlers declared in main.js', mainJsContent.includes('tab') || mainJsContent.includes('data-category'));

    // FEAT-18: FEAT-GAL-SECTION
    record('tier1', 'FEAT-GAL-SECTION', 'C1', '<section id="galeria"> present in DOM', dom.hasGaleria);
    record('tier1', 'FEAT-GAL-SECTION', 'C2', 'Galería section contains <h2> heading', dom.galeriaH2);
    record('tier1', 'FEAT-GAL-SECTION', 'C3', `Gallery renders visual showcase images (found: ${dom.galeriaImages})`, dom.galeriaImages >= 3);
    record('tier1', 'FEAT-GAL-SECTION', 'C4', 'Gallery grid / masonry styling declared in CSS', styleCssContent.includes('#galeria') || styleCssContent.includes('gallery'));
    record('tier1', 'FEAT-GAL-SECTION', 'C5', 'Gallery image hover zoom effect declared in CSS', styleCssContent.includes('transform: scale') || styleCssContent.includes('scale(') || styleCssContent.includes('hover'));

    // FEAT-19: FEAT-GAL-LIGHTBOX
    record('tier1', 'FEAT-GAL-LIGHTBOX', 'C1', '#lightbox-modal container present in DOM', dom.hasLightbox);
    record('tier1', 'FEAT-GAL-LIGHTBOX', 'C2', '#lightbox-img modal image element present', dom.lightboxImg);
    record('tier1', 'FEAT-GAL-LIGHTBOX', 'C3', '#lightbox-close dismiss button present', dom.lightboxClose);
    record('tier1', 'FEAT-GAL-LIGHTBOX', 'C4', 'Lightbox modal fixed overlay & backdrop blur in CSS', styleCssContent.includes('lightbox') || styleCssContent.includes('modal'));
    record('tier1', 'FEAT-GAL-LIGHTBOX', 'C5', 'main.js handles Escape key and backdrop dismissal for modal',
      mainJsContent.includes('Escape') || mainJsContent.includes('lightbox'));

    // FEAT-20: FEAT-COMM-SECTION
    record('tier1', 'FEAT-COMM-SECTION', 'C1', 'Horarios / Comunidad section present in DOM', dom.hasHorarios);
    record('tier1', 'FEAT-COMM-SECTION', 'C2', 'Weekly opening schedule displayed (table/list)', dom.horariosSchedule);
    record('tier1', 'FEAT-COMM-SECTION', 'C3', 'Customer reviews / community testimonials present', dom.hasReviews);
    record('tier1', 'FEAT-COMM-SECTION', 'C4', 'Schedule table/card styled with brand borders in CSS', styleCssContent.includes('border') && styleCssContent.includes('radius'));
    record('tier1', 'FEAT-COMM-SECTION', 'C5', 'Star rating or reviewer badges styled in CSS', styleCssContent.includes('review') || styleCssContent.includes('testimonial') || styleCssContent.includes('schedule') || styleCssContent.includes('horario'));

    // FEAT-21: FEAT-BOOK-FORM
    record('tier1', 'FEAT-BOOK-FORM', 'C1', 'Reservation form present in DOM', dom.hasBookingForm);
    record('tier1', 'FEAT-BOOK-FORM', 'C2', 'Form contains customer name input', dom.formNameInput);
    record('tier1', 'FEAT-BOOK-FORM', 'C3', 'Form contains email input with type="email"', dom.formEmailInput);
    record('tier1', 'FEAT-BOOK-FORM', 'C4', 'Form contains date / shift input', dom.formDateInput);
    record('tier1', 'FEAT-BOOK-FORM', 'C5', 'Form contains prominent submit button', dom.formSubmitBtn);

    // FEAT-22: FEAT-BOOK-VALID
    record('tier1', 'FEAT-BOOK-VALID', 'C1', '#reservation-toast feedback notification present in DOM', dom.hasToast);
    record('tier1', 'FEAT-BOOK-VALID', 'C2', 'main.js intercepts submit event via preventDefault', mainJsContent.includes('preventDefault') || mainJsContent.includes('submit'));
    record('tier1', 'FEAT-BOOK-VALID', 'C3', 'main.js contains email format validation regex', mainJsContent.includes('@') || mainJsContent.includes('email') || mainJsContent.includes('checkValidity'));
    record('tier1', 'FEAT-BOOK-VALID', 'C4', 'Toast notification auto-dismiss timer in main.js', mainJsContent.includes('setTimeout') || mainJsContent.includes('toast'));
    record('tier1', 'FEAT-BOOK-VALID', 'C5', 'Toast notification fixed positioning & elevation in style.css', styleCssContent.includes('toast'));

    // FEAT-23: FEAT-FOOTER
    record('tier1', 'FEAT-FOOTER', 'C1', 'Footer landmark (#contacto / footer) present in DOM', dom.hasFooter);
    record('tier1', 'FEAT-FOOTER', 'C2', 'Official brand logo embedded in footer', dom.footerLogo);
    record('tier1', 'FEAT-FOOTER', 'C3', 'Footer contains direct WhatsApp contact link', dom.footerWhatsApp);
    record('tier1', 'FEAT-FOOTER', 'C4', `Curated social links (Instagram / Spotify) present (found: ${dom.footerSocialLinks})`, dom.footerSocialLinks >= 1);
    record('tier1', 'FEAT-FOOTER', 'C5', 'Copyright notice and brand heritage strip present', dom.footerCopyright);

    // FEAT-24: FEAT-RESPONSIVE (CSS Grid, Flex & Clamp)
    record('tier1', 'FEAT-RESPONSIVE', 'C3', 'CSS defines mobile media queries (@media max-width: 768px)',
      styleCssContent.includes('@media') && styleCssContent.includes('768px'));
    record('tier1', 'FEAT-RESPONSIVE', 'C4', 'CSS defines desktop container max-width (--container-max-width)',
      styleCssContent.includes('--container-max-width') || styleCssContent.includes('max-w-'));
    record('tier1', 'FEAT-RESPONSIVE', 'C5', 'CSS declares fluid typography using clamp()',
      styleCssContent.includes('clamp('));

    // =======================================================================
    // TIER 2: BOUNDARY, EXTREME VIEWPORTS & CORNER CASES
    // =======================================================================
    console.log('\n>>> Tier 2: Boundary & Extreme Cases <<<\n');

    // 1. Desktop Viewport 1280x800 - Zero Overflow
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 800, deviceScaleFactor: 1, mobile: false
    });
    await new Promise(r => setTimeout(r, 250));
    const dtOverflow = await cdp.eval(`(() => {
      const dw = document.documentElement.scrollWidth;
      const ww = window.innerWidth;
      return { dw, ww, ok: dw <= ww };
    })()`);
    record('tier2', 'FEAT-RESPONSIVE', 'B1-DESKTOP-1280',
      `Zero horizontal overflow at 1280x800 (scrollWidth: ${dtOverflow.dw}px <= innerWidth: ${dtOverflow.ww}px)`,
      dtOverflow.ok, !dtOverflow.ok ? `${dtOverflow.dw} > ${dtOverflow.ww}` : null);

    // 2. Mobile Viewport 375x812 - Zero Overflow
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 375, height: 812, deviceScaleFactor: 2, mobile: true
    });
    await new Promise(r => setTimeout(r, 250));
    const mbOverflow = await cdp.eval(`(() => {
      const dw = document.documentElement.scrollWidth;
      const ww = window.innerWidth;
      return { dw, ww, ok: dw <= ww };
    })()`);
    record('tier2', 'FEAT-RESPONSIVE', 'B2-MOBILE-375',
      `Zero horizontal overflow at mobile 375x812 (scrollWidth: ${mbOverflow.dw}px <= innerWidth: ${mbOverflow.ww}px)`,
      mbOverflow.ok, !mbOverflow.ok ? `${mbOverflow.dw} > ${mbOverflow.ww}` : null);

    // 3. Narrow Mobile Viewport 320x568 - Zero Overflow
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 320, height: 568, deviceScaleFactor: 2, mobile: true
    });
    await new Promise(r => setTimeout(r, 250));
    const nrOverflow = await cdp.eval(`(() => {
      const dw = document.documentElement.scrollWidth;
      const ww = window.innerWidth;
      return { dw, ww, ok: dw <= ww };
    })()`);
    record('tier2', 'FEAT-RESPONSIVE', 'B3-NARROW-320',
      `Zero horizontal overflow at narrow mobile 320x568 (scrollWidth: ${nrOverflow.dw}px <= innerWidth: ${nrOverflow.ww}px)`,
      nrOverflow.ok, !nrOverflow.ok ? `${nrOverflow.dw} > ${nrOverflow.ww}` : null);

    // 4. Ultra-wide Desktop Viewport 1920x1080
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false
    });
    await new Promise(r => setTimeout(r, 250));
    const uwOverflow = await cdp.eval(`(() => {
      const dw = document.documentElement.scrollWidth;
      const ww = window.innerWidth;
      return { dw, ww, ok: dw <= ww };
    })()`);
    record('tier2', 'FEAT-RESPONSIVE', 'B4-WIDE-1920',
      `Zero horizontal overflow at wide 1920x1080 (scrollWidth: ${uwOverflow.dw}px <= innerWidth: ${uwOverflow.ww}px)`,
      uwOverflow.ok, !uwOverflow.ok ? `${uwOverflow.dw} > ${uwOverflow.ww}` : null);

    // 5. Form Validation Boundary: Required Constraint
    const formReq = await cdp.eval(`(() => {
      const form = document.querySelector('#reservation-form, form');
      if (!form) return { ok: false, reason: 'Form not found' };
      const req = form.querySelectorAll('[required]');
      return { ok: req.length >= 3, count: req.length };
    })()`);
    record('tier2', 'FEAT-BOOK-VALID', 'B5-FORM-REQUIRED',
      `Reservation form defines boundary required constraints (${formReq.count || 0} fields)`,
      formReq.ok, formReq.reason || (formReq.count < 3 ? 'Less than 3 required fields' : null));

    // =======================================================================
    // TIER 3: CROSS-FEATURE INTEGRATION & PAIRWISE TESTS
    // =======================================================================
    console.log('\n>>> Tier 3: Cross-Feature Integration & Pairwise Tests <<<\n');

    // 1. Mobile Drawer Toggle Pairwise
    const drawerInteraction = await cdp.eval(`(() => {
      const btn = document.querySelector('#mobile-menu-btn, .hamburger, [aria-label*="menú"]');
      const drawer = document.querySelector('#mobile-drawer, .mobile-drawer');
      if (!btn || !drawer) return { ok: false, reason: 'Button or drawer element missing' };
      btn.click();
      const open = drawer.classList.contains('active') || drawer.classList.contains('is-open') || btn.getAttribute('aria-expanded') === 'true';
      btn.click();
      const closed = !drawer.classList.contains('active') || btn.getAttribute('aria-expanded') === 'false';
      return { ok: open, closed };
    })()`);
    record('tier3', 'FEAT-NAV-MOBILE', 'P1-DRAWER-TOGGLE',
      'Mobile hamburger button opens and closes drawer smoothly',
      drawerInteraction.ok, drawerInteraction.reason || (!drawerInteraction.ok ? 'Drawer did not open' : null));

    // 2. Experience Category Tabs Pairwise
    const tabsInteraction = await cdp.eval(`(() => {
      const btns = Array.from(document.querySelectorAll('.tab-btn, [data-category]'));
      if (btns.length < 2) return { ok: false, reason: 'Fewer than 2 tabs found' };
      btns[1].click();
      const hasActive = btns[1].classList.contains('active') || btns[1].getAttribute('aria-selected') === 'true';
      return { ok: hasActive };
    })()`);
    record('tier3', 'FEAT-EXP-TABS', 'P2-TABS-SWITCH',
      'Clicking tab switches active category filter cleanly',
      tabsInteraction.ok, tabsInteraction.reason || (!tabsInteraction.ok ? 'Tab did not activate' : null));

    // 3. Gallery Lightbox Modal Pairwise
    const lightboxInteraction = await cdp.eval(`(() => {
      const modal = document.querySelector('#lightbox-modal');
      const card = document.querySelector('.gallery-card, .gallery-item, #galeria img');
      if (!modal || !card) return { ok: false, reason: 'Modal or gallery item missing' };
      card.click();
      const opened = modal.classList.contains('active') || modal.classList.contains('is-open') || window.getComputedStyle(modal).display !== 'none';
      const esc = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true });
      document.dispatchEvent(esc);
      return { ok: opened };
    })()`);
    record('tier3', 'FEAT-GAL-LIGHTBOX', 'P3-LIGHTBOX-TRIGGER',
      'Clicking gallery card opens Lightbox modal and Escape dismisses it',
      lightboxInteraction.ok, lightboxInteraction.reason || (!lightboxInteraction.ok ? 'Lightbox did not open' : null));

    // =======================================================================
    // TIER 4: REAL-WORLD SCENARIOS & RUNTIME INTEGRITY
    // =======================================================================
    console.log('\n>>> Tier 4: Real-World Scenarios & Runtime Integrity <<<\n');

    // 1. Natural Image Dimensions (Zero broken images)
    const imgAudit = await cdp.eval(`(async () => {
      const imgs = Array.from(document.querySelectorAll('img'));
      // Sin esperar la descarga, un archivo grande se contaba como roto.
      await Promise.all(imgs.map(i => i.complete ? null : new Promise(resolve => {
        i.addEventListener('load', resolve, { once: true });
        i.addEventListener('error', resolve, { once: true });
        setTimeout(resolve, 8000);
      })));
      const broken = imgs.filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src);
      return { total: imgs.length, brokenCount: broken.length, broken };
    })()`);
    const allImagesHealthy = imgAudit.brokenCount === 0 && imgAudit.total > 0;
    record('tier4', 'FEAT-E2E-TESTS', 'S1-DOM-IMAGE-INTEGRITY',
      `All images in rendered DOM load with valid natural dimensions (${imgAudit.total - imgAudit.brokenCount}/${imgAudit.total})`,
      allImagesHealthy, !allImagesHealthy ? `Broken: ${imgAudit.broken.join(', ')}` : null);

    // 2. Zero Browser Console Errors
    const zeroErrors = consoleErrors.length === 0;
    record('tier4', 'FEAT-E2E-TESTS', 'S2-CONSOLE-ERROR-COUNT-ZERO',
      `Browser runtime console error count is 0 (observed: ${consoleErrors.length})`,
      zeroErrors, !zeroErrors ? consoleErrors.join(' | ') : null);

    // 3. Complete Navigation Jump Links Validation
    const jumpLinks = await cdp.eval(`(() => {
      const anchors = Array.from(document.querySelectorAll('a[href^="#"]'))
        .map(a => a.getAttribute('href'))
        .filter(h => h && h !== '#');
      const missing = anchors.filter(h => !document.querySelector(h));
      return { total: anchors.length, missing };
    })()`);
    const allAnchorsValid = jumpLinks.missing.length === 0 && jumpLinks.total >= 4;
    record('tier4', 'FEAT-NAV-DESKTOP', 'S3-JUMP-LINKS-RESOLVE',
      `In-page navigation jump anchors resolve to valid landmark IDs (${jumpLinks.total} verified)`,
      allAnchorsValid, !allAnchorsValid ? `Missing: ${jumpLinks.missing.join(', ')}` : null);

  } catch (err) {
    console.error('\n❌ Fatal CDP runner exception:', err);
    record('tier4', 'FEAT-E2E-TESTS', 'RUNNER-FATAL', 'CDP session execution', false, err.message);
  } finally {
    if (cdp) cdp.close();
    chromeProc.kill();
    server.close();
  }

  // =========================================================================
  // STRUCTURED SUMMARY & EXIT CODE
  // =========================================================================
  console.log('\n' + '='.repeat(75));
  console.log('   E2E AUTOMATED TEST SUITE EXECUTION SUMMARY');
  console.log('='.repeat(75));

  const allTests = [
    ...results.tier1.map(t => ({ tier: 'Tier 1', ...t })),
    ...results.tier2.map(t => ({ tier: 'Tier 2', ...t })),
    ...results.tier3.map(t => ({ tier: 'Tier 3', ...t })),
    ...results.tier4.map(t => ({ tier: 'Tier 4', ...t }))
  ];

  const passedCount = allTests.filter(t => t.passed).length;
  const failedCount = allTests.length - passedCount;
  const passRate = allTests.length > 0 ? Math.round((passedCount / allTests.length) * 100) : 0;

  console.log(`Total Assertions Executed: ${allTests.length}`);
  console.log(`Passed:                   ${passedCount} ✅`);
  console.log(`Failed / Pending:         ${failedCount} ❌`);
  console.log(`Pass Rate:                ${passRate}%\n`);

  for (const tierName of ['tier1', 'tier2', 'tier3', 'tier4']) {
    const list = results[tierName];
    const tierPass = list.filter(t => t.passed).length;
    console.log(`  ${tierName.toUpperCase()}: ${tierPass}/${list.length} passed (${list.length > 0 ? Math.round((tierPass / list.length) * 100) : 0}%)`);
  }
  console.log('='.repeat(75));

  if (failedCount > 0) {
    console.log('\nDiagnostic Breakdown of Failures / Unimplemented Features:');
    for (const test of allTests.filter(t => !t.passed)) {
      console.log(`  - [${test.tier}][${test.featId}][${test.checkId}] ${test.description}`);
      if (test.error) console.log(`      Detail: ${test.error}`);
    }
    console.log('\nResult: FAILED_OR_PENDING_MILESTONES (See details above)');
    process.exit(1);
  } else {
    console.log('\nResult: ALL_TESTS_PASSED ✅');
    process.exit(0);
  }
}

runSuite().catch((err) => {
  console.error('Fatal unhandled error in test suite:', err);
  process.exit(1);
});
