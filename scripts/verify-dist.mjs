import fs from 'node:fs';
import path from 'node:path';

const DIST_DIR = path.resolve(import.meta.dirname, '..', 'dist');
const TEXT_EXT_RE = /\.(?:html|js|mjs|css|json|svg|txt|webmanifest)$/i;
const FORBIDDEN_PATH_RE = /[A-Za-z]:[/\\]Users[/\\]|\/Users\/[A-Za-z0-9._-]+\//;
const FORBIDDEN_SW_PATTERNS = [/mermaid/i, /minimap/i, /flowchart-/i, /sequence-/i, /erDiagram/i];

function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function fail(message) {
  console.error(`[verify-dist] FAIL: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(DIST_DIR)) {
  fail(`dist directory not found: ${DIST_DIR}`);
}

const indexHtmlPath = path.join(DIST_DIR, 'index.html');
const swPath = path.join(DIST_DIR, 'sw.js');
if (!fs.existsSync(indexHtmlPath)) fail('Missing dist/index.html');
if (!fs.existsSync(swPath)) fail('Missing dist/sw.js');

const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
if (!/http-equiv=["']Content-Security-Policy["']/i.test(indexHtml)) {
  fail('dist/index.html is missing Content-Security-Policy meta tag');
}
if (/unsafe-eval|wasm-unsafe-eval/i.test(indexHtml)) {
  fail('dist/index.html CSP must not contain unsafe-eval or wasm-unsafe-eval');
}
for (const match of indexHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi)) {
  const attrs = match[1] ?? '';
  const body = (match[2] ?? '').trim();
  if (!/\bsrc\s*=/.test(attrs) && body.length > 0) {
    fail('dist/index.html must not contain inline <script> blocks');
  }
}

const assistantFontDir = path.join(DIST_DIR, 'fonts', 'Assistant');
if (fs.existsSync(assistantFontDir)) {
  fail('dist/fonts/Assistant duplicate directory should not exist');
}

const swCode = fs.readFileSync(swPath, 'utf8');
for (const pat of FORBIDDEN_SW_PATTERNS) {
  if (pat.test(swCode)) {
    fail(`dist/sw.js contains excluded chunk reference matching ${pat}`);
  }
}

const allFiles = walkFiles(DIST_DIR);
for (const filePath of allFiles) {
  const rel = path.relative(DIST_DIR, filePath).replace(/\\/g, '/');
  if (rel.endsWith('.map')) {
    fail(`Source map found in dist/: ${rel}`);
  }
  if (TEXT_EXT_RE.test(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('esm.sh')) {
      fail(`Forbidden esm.sh reference found in dist/${rel}`);
    }
    if (FORBIDDEN_PATH_RE.test(content)) {
      fail(`Local absolute user path leaked into dist/${rel}`);
    }
  }
}

console.log(
  `[verify-dist] OK: verified ${allFiles.length} files in dist/ (0 esm.sh, 0 .map, 0 leaked paths, CSP/SW clean)`,
);
