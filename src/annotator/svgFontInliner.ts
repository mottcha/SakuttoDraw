import { FONT_FAMILY, Fonts } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { findXiaolaiFamilyId, type RegisteredFontsMap } from '../excalidraw/fontsAdapter';
import { matchesUnicodeRange } from '../utils/unicodeRange';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CJK_FALLBACK_CHAR_RE = /[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef\u{20000}-\u{2ffff}]/u;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
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
    registeredFonts = Fonts.registered,
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

  // Include Xiaolai CJK fallback when hand-drawn fonts (Excalifont / Virgil) contain CJK characters
  const xiaolaiId = findXiaolaiFamilyId(registeredFonts);
  if (xiaolaiId !== null) {
    for (const handDrawnId of [FONT_FAMILY.Excalifont, FONT_FAMILY.Virgil]) {
      const usedChars = charsByFamily.get(handDrawnId);
      if (!usedChars) continue;
      const joined = Array.from(usedChars).join('');
      if (CJK_FALLBACK_CHAR_RE.test(joined)) {
        let fallbackSet = charsByFamily.get(xiaolaiId);
        if (!fallbackSet) {
          fallbackSet = new Set();
          charsByFamily.set(xiaolaiId, fallbackSet);
        }
        for (const ch of usedChars) fallbackSet.add(ch);
      }
    }
  }

  const declarations: string[] = [];
  const seenUrls = new Set<string>();

  for (const [familyId, charSet] of charsByFamily.entries()) {
    const entry = registeredFonts.get(familyId);
    if (!entry || entry.metadata?.local) continue;
    const text = Array.from(charSet).join('');

    for (const face of entry.fontFaces) {
      const unicodeRange = face.fontFace?.unicodeRange;
      if (!matchesUnicodeRange(unicodeRange, text)) continue;
      const rawUrl = face.urls[0];
      if (!rawUrl) continue;
      const urlStr = typeof rawUrl === 'string' ? rawUrl : rawUrl.toString();
      if (seenUrls.has(urlStr)) continue;
      seenUrls.add(urlStr);

      try {
        let dataUrl: string;
        if (urlStr.startsWith('data:')) {
          dataUrl = urlStr;
        } else {
          const resp = await fetchFn(urlStr, { credentials: 'same-origin', cache: 'force-cache' });
          if (!resp.ok) continue;
          const buf = await resp.arrayBuffer();
          dataUrl = `data:font/woff2;base64,${arrayBufferToBase64(buf)}`;
        }
        const family = face.fontFace.family;
        const rangeRule = unicodeRange ? ` unicode-range: ${unicodeRange};` : '';
        declarations.push(
          `@font-face { font-family: ${family}; src: url(${dataUrl}) format('woff2');${rangeRule} }`,
        );
      } catch {
        // Skip unreadable chunk silently so SVG export always succeeds
      }
    }
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
