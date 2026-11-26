import { CaptureUpdateAction, FONT_FAMILY } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import rawJpManifest from '../generated/jpFontManifest.json';
import type { JpFontChunkRef, JpFontManifest } from '../types/annotator';
import {
  clearLoadedFontCacheForFamilies,
  enableCascadiaFontInRegistry,
  type ExcalidrawFontFaceLike,
  findXiaolaiFamilyId,
  getDefaultRegisteredFonts,
  type RegisteredFontsMap,
  XIAOLAI_FAMILY_NAME,
} from '../excalidraw/fontsAdapter';
import { nextElementNonce } from '../utils/common';
import { parseUnicodeRangeToSet, subtractUnicodeRange } from '../utils/unicodeRange';
import { resolveFontAssetUrl } from './cjkFontManager';

export const jpFontManifest: JpFontManifest = rawJpManifest as JpFontManifest;

const CASCADIA_WEIGHT = '100 900';

function resolveChunkRange(ref: JpFontChunkRef, manifest: JpFontManifest): string {
  if (typeof ref.unicodeRange === 'string' && ref.unicodeRange) return ref.unicodeRange;
  if (typeof ref.rangeIndex === 'number' && Array.isArray(manifest.ranges)) {
    return manifest.ranges[ref.rangeIndex] ?? '';
  }
  return '';
}

function resolveCascadiaCodeRange(manifest: JpFontManifest): string {
  if (typeof manifest.cascadiaCodeRange === 'string' && manifest.cascadiaCodeRange) {
    return manifest.cascadiaCodeRange;
  }
  if (typeof manifest.cascadiaCodeRangeIndex === 'number' && Array.isArray(manifest.ranges)) {
    return manifest.ranges[manifest.cascadiaCodeRangeIndex] ?? '';
  }
  return '';
}

interface RegistryOverrideState {
  snapshots: Map<number, ExcalidrawFontFaceLike[]>;
  lastApplied: { preferJpFont: boolean; codeLigatures: boolean } | null;
}

let registryStates = new WeakMap<RegisteredFontsMap, RegistryOverrideState>();
let cachedJpCodePointSet: Set<number> | null = null;
let cachedMeasureCtx: CanvasRenderingContext2D | null | undefined;
let activeRefreshToken = 0;

function getRegistryState(targetFonts: RegisteredFontsMap): RegistryOverrideState {
  let state = registryStates.get(targetFonts);
  if (!state) {
    state = { snapshots: new Map(), lastApplied: null };
    registryStates.set(targetFonts, state);
  }
  return state;
}

function getJpCoveredCodePoints(manifest: JpFontManifest = jpFontManifest): Set<number> {
  if (manifest === jpFontManifest && cachedJpCodePointSet) {
    return cachedJpCodePointSet;
  }
  const covered = new Set<number>();
  for (const chunk of manifest.chunks) {
    for (const cp of parseUnicodeRangeToSet(resolveChunkRange(chunk, manifest))) {
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
  weight = '400',
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
      weight,
      unicodeRange,
    });
  } else {
    fontFace = {
      family,
      display: 'swap',
      style: 'normal',
      weight,
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

function extractCoveredCodePoints(faces: readonly ExcalidrawFontFaceLike[]): Set<number> {
  const covered = new Set<number>();
  for (const face of faces) {
    const range = face.fontFace?.unicodeRange;
    if (!range || range.trim().toUpperCase() === 'U+0-10FFFF') continue;
    for (const cp of parseUnicodeRangeToSet(range)) {
      covered.add(cp);
    }
  }
  return covered;
}

function resolveSlotWeight(faces: readonly ExcalidrawFontFaceLike[]): string {
  return faces[0]?.fontFace?.weight || '400';
}

function buildExcludedFallbackFaces(
  family: string,
  chunks: readonly JpFontChunkRef[],
  manifest: JpFontManifest,
  excludeCodePoints: ReadonlySet<number>,
  baseUrl?: string,
  weight = '400',
): ExcalidrawFontFaceLike[] {
  const result: ExcalidrawFontFaceLike[] = [];
  for (const chunk of chunks) {
    const rawRange = resolveChunkRange(chunk, manifest);
    const range =
      excludeCodePoints.size > 0
        ? subtractUnicodeRange(rawRange, excludeCodePoints)
        : rawRange;
    if (!range) continue;
    result.push(
      createFontFaceEntry(family, [resolveFontAssetUrl(chunk.file, baseUrl)], range, weight),
    );
  }
  return result;
}

function augmentFacesWithDisjointJp(
  family: string,
  baseFaces: readonly ExcalidrawFontFaceLike[],
  jpChunks: readonly JpFontChunkRef[],
  manifest: JpFontManifest,
  baseUrl?: string,
): ExcalidrawFontFaceLike[] {
  if (jpChunks.length === 0) return [...baseFaces];
  const baseCovered = extractCoveredCodePoints(baseFaces);
  const weight = resolveSlotWeight(baseFaces);
  const jpFaces = buildExcludedFallbackFaces(family, jpChunks, manifest, baseCovered, baseUrl, weight);
  return [...baseFaces, ...jpFaces];
}

function buildXiaolaiFaces(
  snapshot: readonly ExcalidrawFontFaceLike[],
  preferJpFont: boolean,
  manifest: JpFontManifest,
  baseUrl?: string,
): { faces: ExcalidrawFontFaceLike[]; jpFaceCount: number } {
  if (!preferJpFont) {
    return { faces: [...snapshot], jpFaceCount: 0 };
  }
  const jpCodePoints = getJpCoveredCodePoints(manifest);
  const trimmedXiaolaiFaces: ExcalidrawFontFaceLike[] = [];
  for (const face of snapshot) {
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
      resolveChunkRange(chunk, manifest),
    ),
  );
  return { faces: [...trimmedXiaolaiFaces, ...jpFaces], jpFaceCount: jpFaces.length };
}

function buildCascadiaFaces(
  snapshot: readonly ExcalidrawFontFaceLike[],
  { preferJpFont, codeLigatures }: { preferJpFont: boolean; codeLigatures: boolean },
  manifest: JpFontManifest,
  baseUrl?: string,
): ExcalidrawFontFaceLike[] {
  const sakuttoChunks = manifest.sakuttoCode?.chunks ?? [];
  if (preferJpFont && (sakuttoChunks.length > 0 || manifest.sakuttoCodeLgLatin)) {
    const regularLatin = sakuttoChunks.find((chunk) => /-00-latin-/i.test(chunk.file));
    const chosenLatin =
      codeLigatures && manifest.sakuttoCodeLgLatin
        ? manifest.sakuttoCodeLgLatin
        : (regularLatin ?? manifest.sakuttoCodeLgLatin);
    const chosenLatinRange = chosenLatin ? resolveChunkRange(chosenLatin, manifest) : '';
    const cjkChunks = regularLatin
      ? sakuttoChunks.filter((chunk) => chunk !== regularLatin)
      : sakuttoChunks;
    const latinExcluded = chosenLatinRange
      ? parseUnicodeRangeToSet(chosenLatinRange)
      : new Set<number>();
    const cjkFaces = buildExcludedFallbackFaces(
      'Cascadia',
      cjkChunks,
      manifest,
      latinExcluded,
      baseUrl,
      CASCADIA_WEIGHT,
    );
    if (!chosenLatin) return cjkFaces;
    return [
      createFontFaceEntry(
        'Cascadia',
        [resolveFontAssetUrl(chosenLatin.file, baseUrl)],
        chosenLatinRange,
        CASCADIA_WEIGHT,
      ),
      ...cjkFaces,
    ];
  }

  if (codeLigatures || !manifest.cascadiaMono) {
    const codeRange = resolveCascadiaCodeRange(manifest);
    return snapshot.map((face) => {
      const existingRange = face.fontFace?.unicodeRange;
      const effectiveRange =
        existingRange && existingRange.toUpperCase() !== 'U+0-10FFFF'
          ? existingRange
          : (codeRange || existingRange || 'U+20-7E');
      return createFontFaceEntry(
        'Cascadia',
        face.urls as Array<URL | string>,
        effectiveRange,
        CASCADIA_WEIGHT,
      );
    });
  }

  return [
    createFontFaceEntry(
      'Cascadia',
      [resolveFontAssetUrl(manifest.cascadiaMono.file, baseUrl)],
      resolveChunkRange(manifest.cascadiaMono, manifest),
      CASCADIA_WEIGHT,
    ),
  ];
}

function snapshotAndSwapSlot(
  targetFonts: RegisteredFontsMap,
  snapshots: Map<number, ExcalidrawFontFaceLike[]>,
  familyId: number,
  fontFaceSet: FontFaceSet | null,
  computeFaces: (snapshot: readonly ExcalidrawFontFaceLike[]) => ExcalidrawFontFaceLike[],
): { applied: boolean; totalFaces: number } {
  const entry = targetFonts.get(familyId);
  if (!entry) {
    return { applied: false, totalFaces: 0 };
  }
  if (!snapshots.has(familyId)) {
    snapshots.set(familyId, [...entry.fontFaces]);
  }
  const snapshot = snapshots.get(familyId)!;
  const prevFaces = [...entry.fontFaces];
  const nextFaces = computeFaces(snapshot);
  entry.fontFaces = nextFaces;
  syncDocumentFonts(prevFaces, nextFaces, fontFaceSet);
  const famName = nextFaces[0]?.fontFace?.family ?? snapshot[0]?.fontFace?.family ?? '';
  if (famName) {
    clearLoadedFontCacheForFamilies([famName.replace(/^["']|["']$/g, '')]);
  }
  return { applied: true, totalFaces: nextFaces.length };
}

export function resetJpGlyphOverrideStateForTests(): void {
  registryStates = new WeakMap();
  cachedJpCodePointSet = null;
  cachedMeasureCtx = undefined;
  activeRefreshToken = 0;
}

export interface SakuttoFontOverrideOptions {
  registeredFonts?: RegisteredFontsMap;
  fontFaceSet?: FontFaceSet | null;
  manifest?: JpFontManifest;
  baseUrl?: string;
}

/**
 * Configures all 5 active SakuttoDraw font slots (Excalifont/Xiaolai, Nunito->BIZ UDPGothic Bold,
 * Lilita One+Mochiy Pop P One, Cascadia->SakuttoCode/SakuttoCodeLG, Comic Shanns Narrow500+SetoJP)
 * with strictly disjoint `unicode-range` descriptors and clean restore when disabled.
 */
export function applySakuttoFontOverrides(
  {
    preferJpFont,
    codeLigatures = true,
  }: {
    preferJpFont: boolean;
    codeLigatures?: boolean;
  },
  {
    registeredFonts,
    fontFaceSet = typeof document !== 'undefined' && document.fonts ? document.fonts : null,
    manifest = jpFontManifest,
    baseUrl,
  }: SakuttoFontOverrideOptions = {},
): {
  applied: boolean;
  xiaolaiTotal: number;
  jpFaceCount: number;
  xiaolaiFaceCount: number;
} {
  const targetFonts = registeredFonts ?? getDefaultRegisteredFonts();
  if (!targetFonts) {
    return { applied: false, xiaolaiTotal: 0, jpFaceCount: 0, xiaolaiFaceCount: 0 };
  }

  enableCascadiaFontInRegistry(targetFonts);

  const state = getRegistryState(targetFonts);
  const prevState = state.lastApplied;
  const xiaolaiId = findXiaolaiFamilyId(targetFonts);
  let xiaolaiApplied = xiaolaiId !== null;
  let xiaolaiTotal = xiaolaiId !== null ? (targetFonts.get(xiaolaiId)?.fontFaces.length ?? 0) : 0;
  let jpFaceCount = preferJpFont ? manifest.chunks.length : 0;

  if (
    prevState &&
    prevState.preferJpFont === preferJpFont &&
    prevState.codeLigatures === codeLigatures
  ) {
    return {
      applied: xiaolaiApplied,
      xiaolaiTotal,
      jpFaceCount,
      xiaolaiFaceCount: Math.max(0, xiaolaiTotal - jpFaceCount),
    };
  }

  const swapJpSlots = !prevState || prevState.preferJpFont !== preferJpFont;
  const swapCascadiaSlot = swapJpSlots || prevState.codeLigatures !== codeLigatures;
  const bizChunks = manifest.bizUdpGothic?.chunks ?? [];
  const mochiyChunks = manifest.mochiyPop?.chunks ?? [];
  const comicMono500Chunks = manifest.comicShannsMono500?.chunks ?? [];

  if (swapJpSlots) {
    if (xiaolaiId !== null) {
      const res = snapshotAndSwapSlot(targetFonts, state.snapshots, xiaolaiId, fontFaceSet, (snapshot) => {
        const built = buildXiaolaiFaces(snapshot, preferJpFont, manifest, baseUrl);
        jpFaceCount = built.jpFaceCount;
        return built.faces;
      });
      xiaolaiApplied = res.applied;
      xiaolaiTotal = res.totalFaces;
    }

    if (bizChunks.length > 0) {
      snapshotAndSwapSlot(targetFonts, state.snapshots, FONT_FAMILY.Nunito, fontFaceSet, (snapshot) =>
        preferJpFont
          ? bizChunks.map((chunk) =>
              createFontFaceEntry('Nunito', [resolveFontAssetUrl(chunk.file, baseUrl)], resolveChunkRange(chunk, manifest), '100 900'),
            )
          : [...snapshot],
      );
    }

    if (mochiyChunks.length > 0) {
      snapshotAndSwapSlot(targetFonts, state.snapshots, FONT_FAMILY['Lilita One'], fontFaceSet, (snapshot) =>
        preferJpFont ? augmentFacesWithDisjointJp('Lilita One', snapshot, mochiyChunks, manifest, baseUrl) : [...snapshot],
      );
    }

    snapshotAndSwapSlot(targetFonts, state.snapshots, FONT_FAMILY['Comic Shanns'], fontFaceSet, (snapshot) => {
      if (!preferJpFont) return [...snapshot];
      const baseWeight = resolveSlotWeight(snapshot);
      const baseFaces =
        comicMono500Chunks.length > 0
          ? comicMono500Chunks.map((chunk) =>
              createFontFaceEntry(
                'Comic Shanns',
                [resolveFontAssetUrl(chunk.file, baseUrl)],
                resolveChunkRange(chunk, manifest),
                baseWeight,
              ),
            )
          : snapshot;
      return augmentFacesWithDisjointJp('Comic Shanns', baseFaces, manifest.chunks, manifest, baseUrl);
    });
  }

  if (swapCascadiaSlot) {
    snapshotAndSwapSlot(targetFonts, state.snapshots, FONT_FAMILY.Cascadia, fontFaceSet, (snapshot) =>
      buildCascadiaFaces(snapshot, { preferJpFont, codeLigatures }, manifest, baseUrl),
    );
  }

  state.lastApplied = { preferJpFont, codeLigatures };

  return {
    applied: xiaolaiApplied,
    xiaolaiTotal,
    jpFaceCount,
    xiaolaiFaceCount: Math.max(0, xiaolaiTotal - jpFaceCount),
  };
}

/**
 * Recreates any FontFace entries stuck in `status === 'error'` (e.g. from earlier offline use)
 * after an offline CJK pack finishes downloading, so glyphs render without requiring reload.
 */
export function reloadErroredRegisteredFonts(
  registeredFonts: RegisteredFontsMap | null = getDefaultRegisteredFonts(),
  fontFaceSet: FontFaceSet | null = typeof document !== 'undefined' && document.fonts ? document.fonts : null,
): number {
  if (!registeredFonts) return 0;
  let reloaded = 0;
  const touchedFamilies = new Set<string>();

  for (const entry of registeredFonts.values()) {
    const nextFaces = [...entry.fontFaces];
    let slotChanged = false;
    for (let i = 0; i < nextFaces.length; i++) {
      const item = nextFaces[i];
      if (item.fontFace?.status !== 'error' || item.urls.length === 0) continue;
      const replacement = createFontFaceEntry(
        item.fontFace.family,
        item.urls as Array<URL | string>,
        item.fontFace.unicodeRange,
        item.fontFace.weight || '400',
      );
      if (fontFaceSet) {
        try {
          fontFaceSet.delete?.(item.fontFace);
          fontFaceSet.add?.(replacement.fontFace);
        } catch {
          // ignore FontFaceSet errors in limited shims
        }
      }
      nextFaces[i] = replacement;
      touchedFamilies.add(item.fontFace.family.replace(/^["']|["']$/g, ''));
      slotChanged = true;
      reloaded += 1;
    }
    if (slotChanged) {
      entry.fontFaces = nextFaces;
    }
  }

  if (touchedFamilies.size > 0) {
    clearLoadedFontCacheForFamilies(Array.from(touchedFamilies));
  }
  return reloaded;
}

const ALL_ACTIVE_FONT_IDS: readonly number[] = [
  FONT_FAMILY.Excalifont,
  FONT_FAMILY.Virgil,
  FONT_FAMILY.Nunito,
  FONT_FAMILY['Lilita One'],
  FONT_FAMILY.Cascadia,
  FONT_FAMILY['Comic Shanns'],
];

const FAMILY_ID_TO_FONT_STACK: Readonly<Record<number, string>> = {
  [FONT_FAMILY.Excalifont]: `Excalifont, ${XIAOLAI_FAMILY_NAME}, sans-serif, "Segoe UI Emoji"`,
  [FONT_FAMILY.Virgil]: 'Virgil, sans-serif, "Segoe UI Emoji"',
  [FONT_FAMILY.Nunito]: 'Nunito, sans-serif, "Segoe UI Emoji"',
  [FONT_FAMILY['Lilita One']]: '"Lilita One", sans-serif, "Segoe UI Emoji"',
  [FONT_FAMILY.Cascadia]: 'Cascadia, monospace, "Segoe UI Emoji"',
  [FONT_FAMILY['Comic Shanns']]: '"Comic Shanns", monospace, "Segoe UI Emoji"',
};

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (cachedMeasureCtx !== undefined) return cachedMeasureCtx;
  if (typeof document === 'undefined') {
    cachedMeasureCtx = null;
    return null;
  }
  try {
    const canvas = document.createElement('canvas');
    cachedMeasureCtx = canvas.getContext('2d');
  } catch {
    cachedMeasureCtx = null;
  }
  return cachedMeasureCtx;
}

function measureAutoResizeTextWidth(
  text: string,
  fontSize: number,
  familyId: number,
): number | null {
  const stack = FAMILY_ID_TO_FONT_STACK[familyId];
  if (!stack || !text) return null;
  const ctx = getMeasureContext();
  if (!ctx) return null;
  ctx.font = `${fontSize}px ${stack}`;
  let maxWidth = 0;
  for (const line of text.split('\n')) {
    const w = ctx.measureText(line).width;
    if (w > maxWidth) maxWidth = w;
  }
  return maxWidth > 0 && Number.isFinite(maxWidth) ? maxWidth : null;
}

/**
 * Loads newly active glyphs for text elements matching `targetFamilyIds` and forces an
 * immediate Canvas 2D redraw (re-measuring unbound auto-resize widths) without polluting undo history.
 */
export async function refreshSceneTextFonts(
  api: ExcalidrawImperativeAPI | null,
  {
    fontFaceSet = typeof document !== 'undefined' && document.fonts ? document.fonts : null,
    targetFamilyIds = ALL_ACTIVE_FONT_IDS,
  }: {
    fontFaceSet?: FontFaceSet | null;
    targetFamilyIds?: readonly number[];
  } = {},
): Promise<void> {
  if (!api) return;
  const refreshToken = ++activeRefreshToken;
  const targetSet = new Set<number>(targetFamilyIds);
  const elements = api.getSceneElements();
  const charsByFamily = new Map<number, Set<string>>();

  for (const el of elements) {
    if (el.type === 'text' && !el.isDeleted) {
      const textEl = el as { fontFamily?: number; originalText?: string; text?: string };
      if (typeof textEl.fontFamily === 'number' && targetSet.has(textEl.fontFamily)) {
        let charSet = charsByFamily.get(textEl.fontFamily);
        if (!charSet) {
          charSet = new Set();
          charsByFamily.set(textEl.fontFamily, charSet);
        }
        const content = textEl.originalText || textEl.text || '';
        for (const ch of content) charSet.add(ch);
      }
    }
  }

  if (charsByFamily.size === 0) return;

  if (fontFaceSet && typeof fontFaceSet.load === 'function') {
    await Promise.all(
      Array.from(charsByFamily.entries()).map(async ([familyId, charSet]) => {
        if (charSet.size === 0) return;
        const stack = FAMILY_ID_TO_FONT_STACK[familyId];
        if (!stack) return;
        const uniqueChars = Array.from(charSet).join('');
        try {
          await fontFaceSet.load(`20px ${stack}`, uniqueChars);
        } catch {
          // continue to repaint even if a specific font chunk fails offline
        }
      }),
    );
  }

  if (refreshToken !== activeRefreshToken) return;

  const refreshed = api.getSceneElements().map((el) => {
    if (el.type === 'text' && !el.isDeleted) {
      const textEl = el as {
        fontFamily?: number;
        containerId?: string | null;
        autoResize?: boolean;
        fontSize?: number;
        textAlign?: string;
        text?: string;
        originalText?: string;
      };
      if (typeof textEl.fontFamily === 'number' && targetSet.has(textEl.fontFamily)) {
        const nextWidth =
          !textEl.containerId &&
          textEl.autoResize !== false &&
          typeof textEl.fontSize === 'number'
            ? measureAutoResizeTextWidth(
                textEl.text || textEl.originalText || '',
                textEl.fontSize,
                textEl.fontFamily,
              )
            : null;
        let nextX = el.x;
        if (nextWidth !== null) {
          if (textEl.textAlign === 'center') {
            nextX = el.x - (nextWidth - el.width) / 2;
          } else if (textEl.textAlign === 'right') {
            nextX = el.x - (nextWidth - el.width);
          }
        }
        return {
          ...el,
          ...(nextWidth !== null ? { width: nextWidth, x: nextX } : {}),
          version: el.version + 1,
          versionNonce: nextElementNonce(),
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
