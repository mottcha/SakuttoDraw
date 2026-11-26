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

function syncFontPackDir(projectRoot, destFontsDir, folderName, defaultSourceLabel) {
  const srcDir = path.join(projectRoot, 'assets', 'fonts', folderName);
  const destDir = path.join(destFontsDir, folderName);
  const manifestSrc = path.join(srcDir, 'manifest.json');

  if (!fs.existsSync(srcDir) || !fs.existsSync(manifestSrc)) {
    throw new Error(`${folderName} font assets or manifest not found: ${manifestSrc}`);
  }

  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });

  const rawManifest = JSON.parse(fs.readFileSync(manifestSrc, 'utf8'));
  const rawChunks = Array.isArray(rawManifest.chunks) ? rawManifest.chunks : [];
  if (rawChunks.length === 0) {
    throw new Error(`Unexpected empty ${folderName} font manifest: ${manifestSrc}`);
  }

  const normalizedChunks = [];
  let totalBytes = 0;
  for (const chunk of rawChunks) {
    const relPath = String(chunk.file || '').replace(/^\.?\/+/, '');
    const fileName = path.basename(relPath);
    const srcFile = path.join(srcDir, fileName);
    if (!fs.existsSync(srcFile)) {
      throw new Error(`Missing ${folderName} font chunk file: ${srcFile}`);
    }
    fs.copyFileSync(srcFile, path.join(destDir, fileName));
    const size = fs.statSync(srcFile).size;
    totalBytes += size;
    normalizedChunks.push({
      file: `fonts/${folderName}/${fileName}`,
      unicodeRange: String(chunk.unicodeRange || ''),
      bytes: size,
    });
  }

  return {
    source: rawManifest.source || defaultSourceLabel,
    totalBytes,
    chunks: normalizedChunks,
  };
}

function syncCascadiaMono(projectRoot, destFontsDir) {
  const srcDir = path.join(projectRoot, 'assets', 'fonts', 'CascadiaMono');
  const destDir = path.join(destFontsDir, 'CascadiaMono');
  const manifestPath = path.join(srcDir, 'manifest.json');
  const codeRangePath = path.join(srcDir, 'cascadia-code-range.json');

  if (!fs.existsSync(manifestPath) || !fs.existsSync(codeRangePath)) {
    throw new Error(`CascadiaMono manifest files not found in: ${srcDir}`);
  }

  const monoMeta = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const codeMeta = JSON.parse(fs.readFileSync(codeRangePath, 'utf8'));
  const fileName = path.basename(String(monoMeta.file || 'CascadiaMono-Regular.woff2'));
  const srcWoff2 = path.join(srcDir, fileName);
  if (!fs.existsSync(srcWoff2)) {
    throw new Error(`Missing CascadiaMono font file: ${srcWoff2}`);
  }

  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(srcWoff2, path.join(destDir, fileName));

  return {
    cascadiaMono: {
      file: `fonts/CascadiaMono/${fileName}`,
      unicodeRange: String(monoMeta.unicodeRange || ''),
      bytes: fs.statSync(srcWoff2).size,
    },
    cascadiaCodeRange: String(codeMeta.unicodeRange || ''),
  };
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

  const setoJp = syncFontPackDir(projectRoot, destFontsDir, 'SetoJP', 'KosefontP-JP');
  const bizUdpGothic = syncFontPackDir(
    projectRoot,
    destFontsDir,
    'BizUdpGothic',
    'BIZ UDPGothic Bold (SIL OFL 1.1)',
  );
  const mochiyPop = syncFontPackDir(
    projectRoot,
    destFontsDir,
    'MochiyPop',
    'Mochiy Pop P One Regular (SIL OFL 1.1)',
  );
  const sakuttoCode = syncFontPackDir(
    projectRoot,
    destFontsDir,
    'SakuttoCode',
    'SakuttoCode (subset of UDEV Gothic, SIL OFL 1.1)',
  );
  const lgMetaPath = path.join(projectRoot, 'assets', 'fonts', 'SakuttoCode', 'latin-lg-manifest.json');
  if (!fs.existsSync(lgMetaPath)) {
    throw new Error(`SakuttoCode LG manifest not found: ${lgMetaPath}`);
  }
  const lgRaw = JSON.parse(fs.readFileSync(lgMetaPath, 'utf8'));
  const lgFileName = path.basename(String(lgRaw.file || ''));
  const lgSrcFile = path.join(projectRoot, 'assets', 'fonts', 'SakuttoCode', lgFileName);
  if (!fs.existsSync(lgSrcFile)) {
    throw new Error(`Missing SakuttoCode LG font file: ${lgSrcFile}`);
  }
  fs.copyFileSync(lgSrcFile, path.join(destFontsDir, 'SakuttoCode', lgFileName));
  const sakuttoCodeLgLatin = {
    file: `fonts/SakuttoCode/${lgFileName}`,
    unicodeRange: String(lgRaw.unicodeRange || ''),
    bytes: fs.statSync(lgSrcFile).size,
  };
  const comicShannsMono500 = syncFontPackDir(
    projectRoot,
    destFontsDir,
    'ComicShannsMono500',
    'Comic Shanns Narrow500 (modified from Comic Shanns, MIT License)',
  );
  const { cascadiaMono, cascadiaCodeRange } = syncCascadiaMono(projectRoot, destFontsDir);

  for (const staleFolder of ['MPlusRounded', 'MPlusU', 'MPlus1Code']) {
    fs.rmSync(path.join(destFontsDir, staleFolder), { recursive: true, force: true });
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
    ja: { label: '日本語（手書き）', files: [], totalBytes: 0 },
    jaStandard: { label: '日本語（標準）', files: [], totalBytes: 0 },
    jaPop: { label: '日本語（ポップ）', files: [], totalBytes: 0 },
    jaCode: { label: '日本語（コード）', files: [], totalBytes: 0 },
    ko: { label: '한국어', files: [], totalBytes: 0 },
    zh: { label: '中文', files: [], totalBytes: 0 },
  };
  const seenFiles = {
    ja: new Set(),
    jaStandard: new Set(),
    jaPop: new Set(),
    jaCode: new Set(),
    ko: new Set(),
    zh: new Set(),
  };

  for (const [setKey, chunks] of [
    ['ja', setoJp.chunks],
    ['jaStandard', bizUdpGothic.chunks],
    ['jaPop', mochiyPop.chunks],
    ['jaCode', [sakuttoCodeLgLatin, ...sakuttoCode.chunks]],
  ]) {
    for (const chunk of chunks) {
      if (!seenFiles[setKey].has(chunk.file)) {
        seenFiles[setKey].add(chunk.file);
        sets[setKey].files.push(chunk.file);
        sets[setKey].totalBytes += chunk.bytes;
      }
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
  if (
    sets.ja.files.length === 0 ||
    sets.jaStandard.files.length === 0 ||
    sets.jaPop.files.length === 0 ||
    sets.jaCode.files.length === 0 ||
    sets.ko.files.length === 0 ||
    sets.zh.files.length === 0
  ) {
    throw new Error(
      `Unexpected empty CJK font set detected (ja=${sets.ja.files.length}, jaStandard=${sets.jaStandard.files.length}, jaPop=${sets.jaPop.files.length}, jaCode=${sets.jaCode.files.length}, ko=${sets.ko.files.length}, zh=${sets.zh.files.length})`,
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
        source: setoJp.source,
        totalBytes: setoJp.totalBytes,
        chunks: setoJp.chunks,
        bizUdpGothic,
        mochiyPop,
        sakuttoCode,
        sakuttoCodeLgLatin,
        comicShannsMono500,
        cascadiaMono,
        cascadiaCodeRange,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(
    `[sync-excalidraw-assets] Synced fonts (SetoJP, BizUdpGothic, MochiyPop, SakuttoCode, ComicShannsMono500, CascadiaMono) and generated manifests (ja=${sets.ja.files.length}, jaStandard=${sets.jaStandard.files.length}, jaPop=${sets.jaPop.files.length}, jaCode=${sets.jaCode.files.length}, ko=${sets.ko.files.length}, zh=${sets.zh.files.length})`,
  );
  return {
    sets,
    jpChunks: setoJp.chunks,
    bizUdpGothic,
    mochiyPop,
    sakuttoCode,
    sakuttoCodeLgLatin,
    comicShannsMono500,
    cascadiaMono,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncExcalidrawAssets();
}
