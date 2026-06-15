import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path/posix';

const PORT = 3000;
const DIR = '/tmp/kanban-dashboard';

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

createServer((req, res) => {
  let file = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  // H-1 fix: resolve path and verify it stays within DIR (prevent path traversal)
  let resolved;
  try {
    resolved = resolve(DIR, file);
    if (!resolved.startsWith(DIR + '/')) {
      throw new Error('Path traversal blocked');
    }
  } catch {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const data = readFileSync(resolved);
    const ext = extname(resolved);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'text/plain',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}).listen(PORT, '127.0.0.1', () => {  // C-1 fix: bind to localhost only
  console.log(`Server running at http://127.0.0.1:${PORT}/`);
});
