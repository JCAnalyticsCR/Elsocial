#!/usr/bin/env node
/**
 * @file serve.mjs
 * @description Lightweight zero-dependency static HTTP server for "el Social" branding page.
 * Powered by Node.js native `http` and `fs` modules.
 * Default port: 8000 (configurable via PORT environment variable or CLI argument).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const STATIC_ROOT = __dirname;
export const DEFAULT_PORT = parseInt(process.env.PORT || process.argv[2] || '8000', 10);

export const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jfif': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8'
};

/**
 * Request handler for static file serving with security path-traversal prevention.
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
export function handleRequest(req, res) {
  // Only accept GET and HEAD
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('405 Method Not Allowed');
    return;
  }

  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let decodedPath = decodeURIComponent(parsedUrl.pathname);

    // Map root to index.html
    if (decodedPath.endsWith('/')) {
      decodedPath += 'index.html';
    }

    // Resolve absolute path and guard against directory traversal
    const safePath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(STATIC_ROOT, safePath);

    // Security check: path must remain within STATIC_ROOT
    const rel = path.relative(STATIC_ROOT, filePath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Forbidden: Path traversal prohibited');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>404 No Encontrado - el Social</title>
<style>body{font-family:sans-serif;text-align:center;padding:5rem;background:#FDF8F5;color:#183870;}h1{font-size:2.5rem;color:#F05A40;}p{color:#647087;}</style>
</head>
<body>
<h1>404</h1>
<p>El recurso solicitado no fue encontrado en el servidor.</p>
<p><code>${safePath}</code></p>
<a href="/" style="color:#183870;font-weight:bold;">Volver a el Social</a>
</body>
</html>`);
          return;
        }

        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`500 Internal Server Error: ${err.message}`);
        return;
      }

      // If directory, check for index.html
      if (stats.isDirectory()) {
        const indexHtml = path.join(filePath, 'index.html');
        if (fs.existsSync(indexHtml)) {
          return serveFile(indexHtml, req, res);
        }
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Directory listing forbidden');
        return;
      }

      serveFile(filePath, req, res, stats);
    });
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`400 Bad Request: ${error.message}`);
  }
}

/**
 * Serve an individual file with appropriate headers and caching hints.
 * @param {string} filePath
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {fs.Stats} [fileStats]
 */
function serveFile(filePath, req, res, fileStats) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const stats = fileStats || fs.statSync(filePath);

  const headers = {
    'Content-Type': contentType,
    'Content-Length': stats.size,
    'Last-Modified': stats.mtime.toUTCString(),
    'Access-Control-Allow-Origin': '*',
    // Los nombres de archivo no llevan hash de contenido. Con una hora de
    // caché el navegador se queda con la versión vieja y la página se ve rota
    // sin motivo. 'no-cache' no dice "no guardés": dice "guardá y preguntá
    // antes de usar', y de ahí salen los 304 que ya resuelve If-Modified-Since.
    'Cache-Control': 'no-cache'
  };

  // If Client sent If-Modified-Since and matches (RFC 7231 sub-second normalization)
  const clientModSince = req.headers['if-modified-since'];
  if (clientModSince) {
    const clientTime = Math.floor(new Date(clientModSince).getTime() / 1000);
    const serverTime = Math.floor((stats.mtimeMs || stats.mtime.getTime()) / 1000);
    if (!isNaN(clientTime) && serverTime <= clientTime) {
      res.writeHead(304);
      res.end();
      return;
    }
  }

  res.writeHead(200, headers);

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = fs.createReadStream(filePath);
  stream.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('500 Stream error');
    }
  });
  stream.pipe(res);
}

/**
 * Create and start the static HTTP server.
 * @param {number} [port]
 * @returns {Promise<http.Server>}
 */
export function startServer(port = DEFAULT_PORT) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handleRequest);

    server.on('error', (err) => {
      reject(err);
    });

    server.listen(port, () => {
      console.log(`\n======================================================`);
      console.log(`  "el Social" Brand Landing Page Server Running!`);
      console.log(`  URL:         http://localhost:${port}`);
      console.log(`  Root Dir:    ${STATIC_ROOT}`);
      console.log(`  Press Ctrl+C to stop.`);
      console.log(`======================================================\n`);
      resolve(server);
    });
  });
}

// Auto-run if executed directly as entrypoint
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
