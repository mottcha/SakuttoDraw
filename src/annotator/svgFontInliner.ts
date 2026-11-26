import { FONT_FAMILY, Fonts } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { findXiaolaiFamilyId, type RegisteredFontsMap } from '../excalidraw/fontsAdapter';
import { matchesUnicodeRange } from '../utils/unicodeRange';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CJK_FALLBACK_CHAR_RE = /[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7ff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef\u{20000}-\u{2ffff}]/u;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function formatCssFontFamily(family: string): string {
  const trimmed = family.trim();
  if (/\s/.test(trimmed) && !/^["'].*["']$/.test(trimmed)) {
    return `"${trimmed}"`;
  }
  return trimmed;
}

interface PendingFaceDecl {
  family: string;
  urlStr: string;
  unicodeRange?: string;
  weight?: string;
  style?: string;
}

/**
 * Inlines pre-split local WOFF2 font chunks matching the exact characters used
 * in the exported SVG, avoiding WASM/Emscripten `new Function` calls under strict CSP.
 */
export async function inlinePreSplitFontsIntoSvg(
  svgNode: SVGSVGElement,
  elements: readonly ExcalidrawElement[],
  {
    fetchFn = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
    registeredFonts,
  }: {
    fetchFn?: typeof fetch | null;
    registeredFonts?: RegisteredFontsMap;
  } = {},
): Promise<number> {
  if (!fetchFn) return 0;

  const charsByFamily = new Map<number, Set<string>>();
  for (const el of elements) {
    if (el.type === 'text' && !el.isDeleted) {
      const textEl = el as ExcalidrawElement & { fontFamily?: number; originalText?: string; text?: string };
      const familyId = textEl.fontFamily;
      const content = textEl.originalText || textEl.text || '';
      if (typeof familyId === 'number' && content) {
        let charSet = charsByFamily.get(familyId);
        if (!charSet) {
          charSet = new Set();
          charsByFamily.set(familyId, charSet);
        }
        for (const ch of content) charSet.add(ch);
      }
    }
  }

  if (charsByFamily.size === 0) return 0;

  const fontsMap = registeredFonts ?? Fonts.registered;

  // Include Xiaolai CJK fallback only for characters not already covered by Excalifont itself
  const xiaolaiId = findXiaolaiFamilyId(fontsMap);
  if (xiaolaiId !== null) {
    const usedChars = charsByFamily.get(FONT_FAMILY.Excalifont);
    if (usedChars) {
      const joined = Array.from(usedChars).join('');
      if (CJK_FALLBACK_CHAR_RE.test(joined)) {
        const excalifontEntry = fontsMap.get(FONT_FAMILY.Excalifont);
        const excalifontRanges = (excalifontEntry?.fontFaces ?? [])
          .map((face) => face.fontFace?.unicodeRange)
          .filter((r): r is string => Boolean(r));
        let fallbackSet = charsByFamily.get(xiaolaiId);
        if (!fallbackSet) {
          fallbackSet = new Set();
          charsByFamily.set(xiaolaiId, fallbackSet);
        }
        for (const ch of usedChars) {
          const coveredByPrimary = excalifontRanges.some((range) => matchesUnicodeRange(range, ch));
          if (!coveredByPrimary || CJK_FALLBACK_CHAR_RE.test(ch)) {
            fallbackSet.add(ch);
          }
        }
      }
    }
  }

  // Deduplicate @font-face declarations by (family, url, weight, style, range)
  const emittedFaceKeys = new Set<string>();
  const pendingDecls: PendingFaceDecl[] = [];
  const urlsToFetch = new Set<string>();

  for (const [familyId, charSet] of charsByFamily.entries()) {
    const entry = fontsMap.get(familyId);
    if (!entry || entry.metadata?.local) continue;
    const text = Array.from(charSet).join('');

    for (const face of entry.fontFaces) {
      const unicodeRange = face.fontFace?.unicodeRange;
      if (!matchesUnicodeRange(unicodeRange, text)) continue;
      const rawUrl = face.urls[0];
      if (!rawUrl) continue;
      const urlStr = typeof rawUrl === 'string' ? rawUrl : rawUrl.toString();
      const family = face.fontFace.family;
      const weight = face.fontFace.weight;
      const style = face.fontFace.style;
      const emitKey = `${family}::${urlStr}::${weight ?? ''}::${style ?? ''}::${unicodeRange ?? ''}`;
      if (emittedFaceKeys.has(emitKey)) continue;
      emittedFaceKeys.add(emitKey);

      pendingDecls.push({ family, urlStr, unicodeRange, weight, style });
      if (!urlStr.startsWith('data:')) {
        urlsToFetch.add(urlStr);
      }
    }
  }

  if (pendingDecls.length === 0) return 0;

  const dataUrlByUrl = new Map<string, string>();
  const fetchQueue = Array.from(urlsToFetch);
  let fetchCursor = 0;
  const workerCount = Math.min(6, fetchQueue.length);
  if (workerCount > 0) {
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        for (;;) {
          const idx = fetchCursor++;
          if (idx >= fetchQueue.length) break;
          const urlStr = fetchQueue[idx];
          try {
            const resp = await fetchFn(urlStr, { credentials: 'same-origin', cache: 'force-cache' });
            if (!resp.ok) continue;
            const buf = await resp.arrayBuffer();
            dataUrlByUrl.set(urlStr, `data:font/woff2;base64,${arrayBufferToBase64(buf)}`);
          } catch {
            // Skip unreadable chunk silently so SVG export always succeeds
          }
        }
      }),
    );
  }

  const declarations: string[] = [];
  for (const decl of pendingDecls) {
    const dataUrl = decl.urlStr.startsWith('data:') ? decl.urlStr : dataUrlByUrl.get(decl.urlStr);
    if (!dataUrl) continue;
    const cssFamily = formatCssFontFamily(decl.family);
    const isWoff2Data = !dataUrl.startsWith('data:') || dataUrl.startsWith('data:font/woff2');
    const srcPart = isWoff2Data ? `url(${dataUrl}) format('woff2')` : `url(${dataUrl})`;
    const styleRule = decl.style && decl.style !== 'normal' ? ` font-style: ${decl.style};` : '';
    const weightRule = decl.weight && decl.weight !== '400' ? ` font-weight: ${decl.weight};` : '';
    const rangeRule = decl.unicodeRange ? ` unicode-range: ${decl.unicodeRange};` : '';
    declarations.push(
      `@font-face { font-family: ${cssFamily};${styleRule}${weightRule} src: ${srcPart};${rangeRule} }`,
    );
  }

  if (declarations.length === 0) return 0;

  const doc = svgNode.ownerDocument || document;
  let defs = svgNode.querySelector('defs');
  if (!defs) {
    defs = doc.createElementNS(SVG_NS, 'defs');
    svgNode.insertBefore(defs, svgNode.firstChild);
  }
  let styleEl = defs.querySelector('style.style-fonts');
  if (!styleEl) {
    styleEl = doc.createElementNS(SVG_NS, 'style');
    styleEl.setAttribute('class', 'style-fonts');
    defs.appendChild(styleEl);
  }
  const existingCss = styleEl.textContent ? `${styleEl.textContent}\n` : '';
  styleEl.textContent = `${existingCss}${declarations.join('\n')}`;

  return declarations.length;
}
