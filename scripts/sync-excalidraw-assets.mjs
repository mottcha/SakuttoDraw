import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function parseUnicodeRange(rangeStr) {
  const cps = [];
  for (const part of rangeStr.split(',')) {
    const p = part.trim().replace(/^U\+/i, '');
    if (!p) continue;
    if (p.includes('-')) {
      const [start, end] = p.split('-').map((hex) => parseInt(hex, 16));
      if (!Number.isNaN(start) && !Number.isNaN(end)) {
        for (let cp = start; cp <= end; cp++) cps.push(cp);
      }
    } else {
      const cp = parseInt(p, 16);
      if (!Number.isNaN(cp)) cps.push(cp);
    }
  }
  return cps;
}

function buildJisCodePointSet() {
  const td = new TextDecoder('euc-jp');
  const jisSet = new Set();
  for (let ku = 1; ku <= 84; ku++) {
    for (let ten = 1; ten <= 94; ten++) {
      const ch = td.decode(new Uint8Array([ku + 0xa0, ten + 0xa0]));
      if (ch && ch !== '\uFFFD' && ch.length === 1) {
        jisSet.add(ch.codePointAt(0));
      }
    }
  }
  return jisSet;
}

export function syncExcalidrawAssets(projectRoot = rootDir) {
  const prodDir = path.join(
    projectRoot,
    'node_modules',
    '@excalidraw',
    'excalidraw',
    'dist',
    'prod',
  );
  const srcFontsDir = path.join(prodDir, 'fonts');
  const destFontsDir = path.join(projectRoot, 'public', 'fonts');
  const generatedDir = path.join(projectRoot, 'src', 'generated');

  if (!fs.existsSync(srcFontsDir)) {
    throw new Error(`Excalidraw fonts directory not found: ${srcFontsDir}`);
  }

  fs.mkdirSync(path.dirname(destFontsDir), { recursive: true });
  fs.cpSync(srcFontsDir, destFontsDir, { recursive: true, force: true });

  // Scan chunk-*.js without relying on minified array variable names (e.g. "Vo")
  const jsFiles = fs
    .readdirSync(prodDir)
    .filter((f) => f.startsWith('chunk-') && f.endsWith('.js'));

  const varMap = new Map();
  let matchedChunkContent = '';

  for (const file of jsFiles) {
    const content = fs.readFileSync(path.join(prodDir, file), 'utf8');
    if (!content.includes('./fonts/Xiaolai/')) continue;
    for (const m of content.matchAll(/(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*"(\.\/fonts\/Xiaolai\/[^"]+)"/g)) {
      varMap.set(m[1], m[2].replace(/^\.\//, ''));
    }
    if (varMap.size > 0) {
      matchedChunkContent = content;
      break;
    }
  }

  if (varMap.size === 0 || !matchedChunkContent) {
    throw new Error('Failed to locate Xiaolai font chunk definitions in @excalidraw/excalidraw');
  }

  const jisSet = buildJisCodePointSet();
  const sets = {
    ja: { label: '日本語', files: [], totalBytes: 0 },
    ko: { label: '한국어', files: [], totalBytes: 0 },
    zh: { label: '中文', files: [], totalBytes: 0 },
  };
  const seenFiles = { ja: new Set(), ko: new Set(), zh: new Set() };

  const descriptorRe = /\{\s*uri\s*:\s*([A-Za-z_$][\w$]*)\s*,\s*descriptors\s*:\s*\{\s*unicodeRange\s*:\s*"([^"]+)"\s*\}\s*\}/g;
  for (const m of matchedChunkContent.matchAll(descriptorRe)) {
    const relPath = varMap.get(m[1]);
    if (!relPath) continue;
    const fullPath = path.join(prodDir, relPath);
    if (!fs.existsSync(fullPath)) continue;
    const size = fs.statSync(fullPath).size;
    const cps = parseUnicodeRange(m[2]);

    const hasJa = cps.some(
      (cp) =>
        jisSet.has(cp) ||
        (cp >= 0x3040 && cp <= 0x30ff) ||
        (cp >= 0x3000 && cp <= 0x303f),
    );
    const hasKo = cps.some(
      (cp) =>
        (cp >= 0xac00 && cp <= 0xd7af) ||
        (cp >= 0x3130 && cp <= 0x318f) ||
        (cp >= 0x1100 && cp <= 0x11ff) ||
        (cp >= 0x3000 && cp <= 0x303f),
    );
    const hasZh = cps.some(
      (cp) =>
        (cp >= 0x4e00 && cp <= 0x9fff) ||
        (cp >= 0x3400 && cp <= 0x4dbf) ||
        cp >= 0x20000 ||
        (cp >= 0x3000 && cp <= 0x303f),
    );

    if (hasJa && !seenFiles.ja.has(relPath)) {
      seenFiles.ja.add(relPath);
      sets.ja.files.push(relPath);
      sets.ja.totalBytes += size;
    }
    if (hasKo && !seenFiles.ko.has(relPath)) {
      seenFiles.ko.add(relPath);
      sets.ko.files.push(relPath);
      sets.ko.totalBytes += size;
    }
    if (hasZh && !seenFiles.zh.has(relPath)) {
      seenFiles.zh.add(relPath);
      sets.zh.files.push(relPath);
      sets.zh.totalBytes += size;
    }
  }

  // Fail-fast guard against upstream chunk format changes
  if (sets.ja.files.length === 0 || sets.ko.files.length === 0 || sets.zh.files.length === 0) {
    throw new Error(
      `Unexpected empty CJK font set detected (ja=${sets.ja.files.length}, ko=${sets.ko.files.length}, zh=${sets.zh.files.length})`,
    );
  }

  fs.mkdirSync(generatedDir, { recursive: true });
  const manifestPath = path.join(generatedDir, 'cjkFontManifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ sets }, null, 2), 'utf8');

  console.log(
    `[sync-excalidraw-assets] Synced fonts to public/fonts and generated cjkFontManifest.json (ja=${sets.ja.files.length}, ko=${sets.ko.files.length}, zh=${sets.zh.files.length})`,
  );
  return { sets };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncExcalidrawAssets();
}
