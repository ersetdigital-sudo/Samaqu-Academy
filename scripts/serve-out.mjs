import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(process.cwd(), 'out');
const port = Number(process.env.PORT || 4173);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^([/\\])+/, '');
  const target = resolve(join(root, clean));
  if (!target.startsWith(root + sep) && target !== root) return null;
  const candidates = [];
  if (!clean) candidates.push(join(root, 'index.html'));
  else {
    if (extname(clean)) candidates.push(target);
    candidates.push(`${target}.html`, join(target, 'index.html'));
  }
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

const server = createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }
  const file = resolveFile(request.url || '/');
  if (!file) {
    const notFound = join(root, '404.html');
    response.writeHead(404, { 'Content-Type': types['.html'], 'Cache-Control': 'no-store' });
    if (request.method === 'HEAD') response.end();
    else createReadStream(notFound).pipe(response);
    return;
  }
  const extension = extname(file);
  const headers = {
    'Content-Type': types[extension] || 'application/octet-stream',
    'Cache-Control': file.includes(`${sep}_next${sep}static${sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-store',
  };
  response.writeHead(200, headers);
  if (request.method === 'HEAD') response.end();
  else createReadStream(file).pipe(response);
});

server.listen(port, () => {
  console.log(`Static preview: http://localhost:${port}`);
});
