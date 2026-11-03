import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const root = resolve(process.cwd(), 'out');
const staticRoot = join(root, '_next', 'static');

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(staticRoot);
const sizeOf = (file) => statSync(file).size;
const gzipOf = (file) => gzipSync(readFileSync(file)).length;
const brotliOf = (file) => brotliCompressSync(readFileSync(file)).length;

const byExtension = {};
for (const file of files) {
  const extension = extname(file) || '(none)';
  byExtension[extension] ??= { files: 0, bytes: 0 };
  byExtension[extension].files += 1;
  byExtension[extension].bytes += sizeOf(file);
}

const cssText = files
  .filter((file) => file.endsWith('.css'))
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');
const fontFiles = [...new Set([...cssText.matchAll(/url\((?:&quot;|"|')?(\/_next\/static\/media\/[^"')&]+\.(?:woff2|woff|ttf))(?:(?:&quot;|"|'))?\)/g)].map((match) => match[1]))];

const htmlFiles = readdirSync(root)
  .filter((file) => file.endsWith('.html'))
  .sort();

const rows = [];
for (const htmlFile of htmlFiles) {
  const html = readFileSync(join(root, htmlFile), 'utf8');
  const legacyScripts = new Set(
    [...html.matchAll(/<script[^>]*src="(\/_next\/static\/[^"]+)"[^>]*noModule[^>]*>/g)].map(
      (match) => match[1],
    ),
  );
  const references = new Set(
    [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((match) => match[1]),
  );
  const modernReferences = [...references].filter((reference) => !legacyScripts.has(reference));
  const preloadedFonts = [
    ...new Set(
      [...html.matchAll(/<link[^>]*rel="preload"[^>]*href="(\/_next\/static\/media\/[^"]+\.woff2)"[^>]*>/g)].map(
        (match) => match[1],
      ),
    ),
  ];
  const fontReferences = preloadedFonts.length ? preloadedFonts : fontFiles;
  let jsBytes = 0;
  let cssBytes = 0;
  let jsGzip = 0;
  let cssGzip = 0;
  for (const reference of modernReferences) {
    const file = join(root, reference.replace(/^\//, ''));
    if (!existsSync(file)) continue;
    if (file.endsWith('.js')) {
      jsBytes += sizeOf(file);
      jsGzip += gzipOf(file);
    } else if (file.endsWith('.css')) {
      cssBytes += sizeOf(file);
      cssGzip += gzipOf(file);
    }
  }
  const fontBytes = fontReferences.reduce(
    (sum, reference) => sum + (existsSync(join(root, reference.replace(/^\//, ''))) ? sizeOf(join(root, reference.replace(/^\//, ''))) : 0),
    0,
  );
  const legacyBytes = [...legacyScripts].reduce((sum, reference) => {
    const file = join(root, reference.replace(/^\//, ''));
    return sum + (existsSync(file) ? sizeOf(file) : 0);
  }, 0);
  rows.push({
    route: htmlFile.replace(/\.html$/, '') || '/',
    js: jsBytes,
    jsGzip,
    css: cssBytes,
    cssGzip,
    fonts: fontBytes,
    fontsGzip: fontBytes,
    legacyBytes,
    totalGzip: jsGzip + cssGzip + fontBytes,
    totalBrotli:
      modernReferences
        .filter((reference) => reference.endsWith('.js') || reference.endsWith('.css'))
        .reduce((sum, reference) => {
          const file = join(root, reference.replace(/^\//, ''));
          return sum + (existsSync(file) ? brotliOf(file) : 0);
        }, 0) + fontBytes,
  });
}

const total = (items, key) => items.reduce((sum, item) => sum + item[key], 0);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

console.log('STATIC ASSETS');
for (const [extension, value] of Object.entries(byExtension).sort()) {
  console.log(`  ${extension.padEnd(8)} ${String(value.files).padStart(3)} files  ${kb(value.bytes)}`);
}
console.log(`  TOTAL    ${files.length} files  ${kb(files.reduce((sum, file) => sum + sizeOf(file), 0))}`);
console.log(
  `  FONTS    ${byExtension['.woff2']?.files ?? 0} woff2    ${kb(byExtension['.woff2']?.bytes ?? 0)}`,
);
console.log(`\nOUT DIRECTORY TOTAL: ${kb(walk(root).reduce((sum, file) => sum + sizeOf(file), 0))}`);

console.log('\nFIRST LOAD PER ROUTE (modern browsers: JS + CSS + preloaded WOFF2)');
console.log('  route        JS gz    CSS gz   fonts    total gzip  total brotli');
for (const row of rows) {
  console.log(
    `  ${row.route.padEnd(12)} ${kb(row.jsGzip).padStart(8)} ${kb(row.cssGzip).padStart(9)} ${kb(row.fontsGzip).padStart(9)} ${kb(row.totalGzip).padStart(10)} ${kb(row.totalBrotli).padStart(12)}`,
  );
}

const uniqueRoutes = rows.filter((row) => !row.route.includes('_not-found'));
console.log('\nAVERAGE ROUTE:', kb(Math.round(total(uniqueRoutes, 'totalGzip') / uniqueRoutes.length)), '(gzip + font bytes)');
console.log(
  'LEGACY FALLBACK (noModule) per route:',
  kb(Math.round(total(uniqueRoutes, 'legacyBytes') / uniqueRoutes.length)),
  '(not fetched by modern browsers)',
);
console.log('LEGACY BASELINE HTML:', kb(229554), 'raw /', kb(68938), 'gzip (plus external CDN scripts).');
