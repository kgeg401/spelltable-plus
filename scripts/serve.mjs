import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('.');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png':'image/png' };
createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (req.method === 'POST' && pathname === '/__qa/screenshot' && req.headers.origin === 'http://127.0.0.1:4173') {
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 5_000_000) { res.writeHead(413).end(); return; } }
    try { const payload = JSON.parse(body); if (!['desktop', 'mobile'].includes(payload.name)) throw new Error('name');
      const bytes = Buffer.from(payload.data, 'base64'); if (bytes.subarray(1,4).toString() !== 'PNG') throw new Error('format');
      await mkdir('.qa', {recursive:true}); await writeFile(`.qa/${payload.name}.png`, bytes); res.writeHead(200).end('saved');
    } catch { res.writeHead(400).end(); } return;
  }
  const file = resolve(root, pathname === '/' || /^\/(lobby|game\/)/.test(pathname) ? 'demo/index.html' : '.' + pathname);
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  // Serve only public demo/build/documentation assets, never local research or dotfiles.
  if (!['demo', 'dist', 'docs'].some(dir => file.startsWith(resolve(root, dir) + sep))) { res.writeHead(404).end(); return; }
  try { const bytes = await readFile(file); res.writeHead(200, { 'Content-Type': types[extname(file)] || 'text/plain', 'Cache-Control': 'no-store' }); res.end(bytes); }
  catch { res.writeHead(404).end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('SpellTable Plus demo: http://127.0.0.1:4173/lobby'));
