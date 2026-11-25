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

  const srcSetoJpDir = path.join(projectRoot, 'assets', 'fonts', 'SetoJP');
  const destSetoJpDir = path.join(destFontsDir, 'SetoJP');
  const setoJpManifestSrc = path.join(srcSetoJpDir, 'manifest.json');

  if (!fs.existsSync(srcSetoJpDir) || !fs.existsSync(setoJpManifestSrc)) {
    throw new Error(`SetoJP font assets or manifest not found: ${setoJpManifestSrc}`);
  }

  fs.mkdirSync(path.dirname(destFontsDir), { recursive: true });
  fs.cpSync(srcFontsDir, destFontsDir, { recursive: true, force: true });

  fs.rmSync(destSetoJpDir, { recursive: true, force: true });
  fs.mkdirSync(destSetoJpDir, { recursive: true });
  const rawJpManifest = JSON.parse(fs.readFileSync(setoJpManifestSrc, 'utf8'));
  const jpChunks = Array.isArray(rawJpManifest.chunks) ? rawJpManifest.chunks : [];
  if (jpChunks.length === 0) {
    throw new Error(`Unexpected empty SetoJP font manifest: ${setoJpManifestSrc}`);
  }

  const normalizedJpChunks = [];
  for (const chunk of jpChunks) {
    const relPath = String(chunk.file || '').replace(/^\.?\/+/, '');
    const fileName = path.basename(relPath);
    const srcFile = path.join(srcSetoJpDir, fileName);
    if (!fs.existsSync(srcFile)) {
      throw new Error(`Missing SetoJP font chunk file: ${srcFile}`);
    }
    fs.copyFileSync(srcFile, path.join(destSetoJpDir, fileName));
    const size = fs.statSync(srcFile).size;
    normalizedJpChunks.push({
      file: `fonts/SetoJP/${fileName}`,
      unicodeRange: String(chunk.unicodeRange || ''),
      bytes: size,
    });
  }

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

  const sets = {
    ja: { label: '日本語', files: [], totalBytes: 0 },
    ko: { label: '한국어', files: [], totalBytes: 0 },
    zh: { label: '中文', files: [], totalBytes: 0 },
  };
  const seenFiles = { ja: new Set(), ko: new Set(), zh: new Set() };

  // Japanese offline font pack uses the compact, Japanese-glyph SetoJP chunks
  for (const chunk of normalizedJpChunks) {
    if (!seenFiles.ja.has(chunk.file)) {
      seenFiles.ja.add(chunk.file);
      sets.ja.files.push(chunk.file);
      sets.ja.totalBytes += chunk.bytes;
    }
  }

  const descriptorRe = /\{\s*uri\s*:\s*([A-Za-z_$][\w$]*)\s*,\s*descriptors\s*:\s*\{\s*unicodeRange\s*:\s*"([^"]+)"\s*\}\s*\}/g;
  for (const m of matchedChunkContent.matchAll(descriptorRe)) {
    const relPath = varMap.get(m[1]);
    if (!relPath) continue;
    const fullPath = path.join(prodDir, relPath);
    if (!fs.existsSync(fullPath)) continue;
    const size = fs.statSync(fullPath).size;
    const cps = parseUnicodeRange(m[2]);

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

  const jpManifestPath = path.join(generatedDir, 'jpFontManifest.json');
  fs.writeFileSync(
    jpManifestPath,
    JSON.stringify(
      {
        source: rawJpManifest.source || 'KosefontP-JP',
        totalBytes: sets.ja.totalBytes,
        chunks: normalizedJpChunks,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(
    `[sync-excalidraw-assets] Synced fonts (incl. SetoJP) to public/fonts and generated manifests (ja=${sets.ja.files.length}, ko=${sets.ko.files.length}, zh=${sets.zh.files.length})`,
  );
  return { sets, jpChunks: normalizedJpChunks };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncExcalidrawAssets();
}
