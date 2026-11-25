import { CaptureUpdateAction, FONT_FAMILY, Fonts } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import rawJpManifest from '../generated/jpFontManifest.json';
import type { JpFontManifest } from '../types/annotator';
import { resolveFontAssetUrl } from './cjkFontManager';

export const XIAOLAI_FALLBACK_FAMILY_ID = 100;
export const XIAOLAI_FAMILY_NAME = 'Xiaolai';

export const jpFontManifest: JpFontManifest = rawJpManifest as JpFontManifest;

type RegisteredFontsMap = typeof Fonts.registered;
type RegisteredFontEntry = RegisteredFontsMap extends Map<number, infer V> ? V : never;
type ExcalidrawFontFaceLike = RegisteredFontEntry['fontFaces'][number];

let originalXiaolaiFacesSnapshot: ExcalidrawFontFaceLike[] | null = null;
let lastAppliedEnabled: boolean | null = null;
let cachedJpCodePointSet: Set<number> | null = null;

export function parseUnicodeRangeToSet(unicodeRange: string | undefined): Set<number> {
  const result = new Set<number>();
  const raw = (unicodeRange || '').trim();
  if (!raw) return result;

  for (const part of raw.split(',')) {
    const token = part.trim().replace(/^U\+/i, '');
    if (!token) continue;
    if (token.includes('-')) {
      const [startHex, endHex] = token.split('-');
      const start = parseInt(startHex, 16);
      const end = parseInt(endHex, 16);
      if (!Number.isNaN(start) && !Number.isNaN(end) && start <= end) {
        for (let cp = start; cp <= end; cp++) result.add(cp);
      }
    } else if (token.includes('?')) {
      const start = parseInt(token.replace(/\?/g, '0'), 16);
      const end = parseInt(token.replace(/\?/g, 'F'), 16);
      if (!Number.isNaN(start) && !Number.isNaN(end) && start <= end) {
        for (let cp = start; cp <= end; cp++) result.add(cp);
      }
    } else {
      const cp = parseInt(token, 16);
      if (!Number.isNaN(cp)) result.add(cp);
    }
  }
  return result;
}

export function serializeCodePointsToUnicodeRange(codePoints: Iterable<number>): string {
  const sorted = Array.from(new Set(codePoints)).sort((a, b) => a - b);
  if (sorted.length === 0) return '';

  const tokens: string[] = [];
  let runStart = sorted[0];
  let runEnd = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const cp = sorted[i];
    if (cp === runEnd + 1) {
      runEnd = cp;
    } else {
      tokens.push(
        runStart === runEnd
          ? `U+${runStart.toString(16)}`
          : `U+${runStart.toString(16)}-${runEnd.toString(16)}`,
      );
      runStart = cp;
      runEnd = cp;
    }
  }
  tokens.push(
    runStart === runEnd
      ? `U+${runStart.toString(16)}`
      : `U+${runStart.toString(16)}-${runEnd.toString(16)}`,
  );
  return tokens.join(',');
}

export function subtractUnicodeRange(
  unicodeRange: string | undefined,
  excludeSet: ReadonlySet<number>,
): string | null {
  const raw = (unicodeRange || '').trim();
  if (!raw || raw.toUpperCase() === 'U+0-10FFFF') {
    return raw || 'U+0-10FFFF';
  }
  const source = parseUnicodeRangeToSet(raw);
  if (source.size === 0) return null;

  const remaining: number[] = [];
  for (const cp of source) {
    if (!excludeSet.has(cp)) {
      remaining.push(cp);
    }
  }
  if (remaining.length === 0) return null;
  return serializeCodePointsToUnicodeRange(remaining);
}

export function rangesIntersect(rangeA: string | undefined, rangeB: string | undefined): boolean {
  const setA = parseUnicodeRangeToSet(rangeA);
  if (setA.size === 0) return false;
  const setB = parseUnicodeRangeToSet(rangeB);
  for (const cp of setA) {
    if (setB.has(cp)) return true;
  }
  return false;
}

export function getJpCoveredCodePoints(manifest: JpFontManifest = jpFontManifest): Set<number> {
  if (manifest === jpFontManifest && cachedJpCodePointSet) {
    return cachedJpCodePointSet;
  }
  const covered = new Set<number>();
  for (const chunk of manifest.chunks) {
    for (const cp of parseUnicodeRangeToSet(chunk.unicodeRange)) {
      covered.add(cp);
    }
  }
  if (manifest === jpFontManifest) {
    cachedJpCodePointSet = covered;
  }
  return covered;
}

function createFontFaceEntry(
  family: string,
  urls: Array<URL | string>,
  unicodeRange: string,
): ExcalidrawFontFaceLike {
  const urlObjs = urls.map((u) => (typeof u === 'string' && !u.startsWith('data:') ? new URL(u) : u));
  const sources = urlObjs
    .map((u) => (typeof u === 'string' ? `url(${u})` : `url(${u.toString()}) format('woff2')`))
    .join(', ');

  let fontFace: FontFace;
  if (typeof FontFace !== 'undefined') {
    fontFace = new FontFace(family, sources, {
      display: 'swap',
      style: 'normal',
      weight: '400',
      unicodeRange,
    });
  } else {
    fontFace = {
      family,
      display: 'swap',
      style: 'normal',
      weight: '400',
      unicodeRange,
      status: 'unloaded',
    } as unknown as FontFace;
  }

  return {
    urls: urlObjs,
    fontFace,
    toCSS: () => undefined,
  } as unknown as ExcalidrawFontFaceLike;
}

function findXiaolaiFamilyId(registeredFonts: RegisteredFontsMap): number | null {
  if (registeredFonts.has(XIAOLAI_FALLBACK_FAMILY_ID)) {
    return XIAOLAI_FALLBACK_FAMILY_ID;
  }
  for (const [id, entry] of registeredFonts.entries()) {
    const fam = entry.fontFaces[0]?.fontFace?.family;
    if (fam === XIAOLAI_FAMILY_NAME || fam === `"${XIAOLAI_FAMILY_NAME}"`) {
      return id;
    }
  }
  return null;
}

function syncDocumentFonts(
  oldFaces: readonly ExcalidrawFontFaceLike[],
  newFaces: readonly ExcalidrawFontFaceLike[],
  fontFaceSet: FontFaceSet | null,
): void {
  if (!fontFaceSet) return;
  for (const face of oldFaces) {
    try {
      if (face.fontFace && typeof fontFaceSet.delete === 'function') {
        fontFaceSet.delete(face.fontFace);
      }
    } catch {
      // ignore FontFaceSet errors in limited shims
    }
  }
  for (const face of newFaces) {
    try {
      if (face.fontFace && typeof fontFaceSet.add === 'function' && !fontFaceSet.has(face.fontFace)) {
        fontFaceSet.add(face.fontFace);
      }
    } catch {
      // ignore FontFaceSet errors in limited shims
    }
  }
}

function clearXiaolaiLoadedCache(): void {
  const cache = (Fonts as unknown as { loadedFontsCache?: Set<string> }).loadedFontsCache;
  if (!cache || typeof cache.forEach !== 'function') return;
  for (const sig of Array.from(cache)) {
    if (sig.startsWith(`${XIAOLAI_FAMILY_NAME}-`) || sig.startsWith(`"${XIAOLAI_FAMILY_NAME}"-`)) {
      cache.delete(sig);
    }
  }
}

export function resetJpGlyphOverrideStateForTests(): void {
  originalXiaolaiFacesSnapshot = null;
  lastAppliedEnabled = null;
  cachedJpCodePointSet = null;
}

function getDefaultRegisteredFonts(): RegisteredFontsMap | null {
  if (typeof FontFace === 'undefined') {
    return null;
  }
  try {
    return Fonts.registered;
  } catch {
    return null;
  }
}

/**
 * Replaces or restores Excalidraw's registered Xiaolai fallback font faces with
 * disjoint SetoJP Japanese-glyph chunks + trimmed Xiaolai fallback chunks.
 */
export function applyJapaneseGlyphOverride(
  enabled: boolean,
  {
    registeredFonts,
    fontFaceSet = typeof document !== 'undefined' && document.fonts ? document.fonts : null,
    manifest = jpFontManifest,
    baseUrl,
  }: {
    registeredFonts?: RegisteredFontsMap;
    fontFaceSet?: FontFaceSet | null;
    manifest?: JpFontManifest;
    baseUrl?: string;
  } = {},
): { applied: boolean; totalFaces: number; jpFaceCount: number; xiaolaiFaceCount: number } {
  const isGlobalFonts = registeredFonts === undefined;
  const targetFonts = registeredFonts ?? getDefaultRegisteredFonts();
  if (!targetFonts) {
    return { applied: false, totalFaces: 0, jpFaceCount: 0, xiaolaiFaceCount: 0 };
  }

  const xiaolaiId = findXiaolaiFamilyId(targetFonts);
  if (xiaolaiId === null) {
    return { applied: false, totalFaces: 0, jpFaceCount: 0, xiaolaiFaceCount: 0 };
  }

  const entry = targetFonts.get(xiaolaiId);
  if (!entry) {
    return { applied: false, totalFaces: 0, jpFaceCount: 0, xiaolaiFaceCount: 0 };
  }

  if (originalXiaolaiFacesSnapshot === null) {
    originalXiaolaiFacesSnapshot = [...entry.fontFaces];
  }

  // Skip redundant work if the exact state is already applied on the global registry
  if (isGlobalFonts && lastAppliedEnabled === enabled) {
    const jpCount = enabled ? manifest.chunks.length : 0;
    return {
      applied: true,
      totalFaces: entry.fontFaces.length,
      jpFaceCount: jpCount,
      xiaolaiFaceCount: entry.fontFaces.length - jpCount,
    };
  }

  const prevFaces = [...entry.fontFaces];
  let nextFaces: ExcalidrawFontFaceLike[];
  let jpFaceCount = 0;

  if (enabled) {
    const jpCodePoints = getJpCoveredCodePoints(manifest);
    const trimmedXiaolaiFaces: ExcalidrawFontFaceLike[] = [];

    for (const face of originalXiaolaiFacesSnapshot) {
      const trimmedRange = subtractUnicodeRange(face.fontFace?.unicodeRange, jpCodePoints);
      if (!trimmedRange) continue;
      trimmedXiaolaiFaces.push(
        createFontFaceEntry(XIAOLAI_FAMILY_NAME, face.urls as Array<URL | string>, trimmedRange),
      );
    }

    const jpFaces = manifest.chunks.map((chunk) =>
      createFontFaceEntry(
        XIAOLAI_FAMILY_NAME,
        [resolveFontAssetUrl(chunk.file, baseUrl)],
        chunk.unicodeRange,
      ),
    );
    jpFaceCount = jpFaces.length;
    nextFaces = [...trimmedXiaolaiFaces, ...jpFaces];
  } else {
    nextFaces = [...originalXiaolaiFacesSnapshot];
  }

  entry.fontFaces = nextFaces;
  syncDocumentFonts(prevFaces, nextFaces, fontFaceSet);
  clearXiaolaiLoadedCache();

  if (isGlobalFonts) {
    lastAppliedEnabled = enabled;
  }

  return {
    applied: true,
    totalFaces: nextFaces.length,
    jpFaceCount,
    xiaolaiFaceCount: nextFaces.length - jpFaceCount,
  };
}

/**
 * Loads newly active glyphs for existing hand-drawn text elements on the canvas
 * and forces an immediate Canvas 2D redraw without polluting undo history.
 */
export async function refreshSceneHandDrawnTextFonts(
  api: ExcalidrawImperativeAPI | null,
  fontFaceSet: FontFaceSet | null = typeof document !== 'undefined' && document.fonts
    ? document.fonts
    : null,
): Promise<void> {
  if (!api) return;
  const elements = api.getSceneElements();
  const handDrawnTexts: string[] = [];
  let hasHandDrawnText = false;

  for (const el of elements) {
    if (el.type === 'text' && !el.isDeleted) {
      const textEl = el as { fontFamily?: number; originalText?: string; text?: string };
      if (
        textEl.fontFamily === FONT_FAMILY.Excalifont ||
        textEl.fontFamily === FONT_FAMILY.Virgil
      ) {
        hasHandDrawnText = true;
        const content = textEl.originalText || textEl.text || '';
        if (content) handDrawnTexts.push(content);
      }
    }
  }

  if (!hasHandDrawnText) return;

  if (fontFaceSet && typeof fontFaceSet.load === 'function' && handDrawnTexts.length > 0) {
    const uniqueChars = Array.from(new Set(handDrawnTexts.join(''))).join('');
    try {
      await fontFaceSet.load(`20px Excalifont, ${XIAOLAI_FAMILY_NAME}`, uniqueChars);
    } catch {
      // continue to repaint even if a specific font chunk fails to load offline
    }
  }

  const refreshed = api.getSceneElements().map((el) => {
    if (el.type === 'text' && !el.isDeleted) {
      const textEl = el as { fontFamily?: number };
      if (
        textEl.fontFamily === FONT_FAMILY.Excalifont ||
        textEl.fontFamily === FONT_FAMILY.Virgil
      ) {
        return {
          ...el,
          version: el.version + 1,
          versionNonce: Math.floor(Math.random() * 2147483647),
        };
      }
    }
    return el;
  });

  api.updateScene({
    elements: refreshed,
    captureUpdate: CaptureUpdateAction.NEVER,
  });
}
