import fs from 'node:fs';
import path from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FONT_FAMILY } from '@excalidraw/excalidraw';
import {
  cjkFontManifest,
  computeExclusiveFilesForDeletion,
  deleteLanguageFontSet,
  downloadLanguageFontSet,
  isLanguageSetCached,
} from '../annotator/cjkFontManager';
import {
  applySakuttoFontOverrides,
  jpFontManifest,
  refreshSceneTextFonts,
  resetJpGlyphOverrideStateForTests,
} from '../annotator/jpGlyphOverride';
import { inlinePreSplitFontsIntoSvg } from '../annotator/svgFontInliner';
import {
  enableCascadiaFontInRegistry,
  XIAOLAI_FALLBACK_FAMILY_ID,
} from '../excalidraw/fontsAdapter';
import { syncFontPicker } from '../annotator/quickAnnotator/fontPicker';
import { applyLanguage, applyPreferJpFont, runtime } from '../annotator/quickAnnotator/runtime';
import { FontSettingsPanel } from '../components/FontSettingsPanel';
import {
  DEFAULT_FONT_TOP_PICKS,
  loadInitialSceneData,
  loadPrefs,
  resolvePreferJpFont,
  savePrefs,
} from '../services/storageBridge';
import {
  matchesUnicodeRange,
  parseUnicodeRangeToSet,
  rangesIntersect,
  subtractUnicodeRange,
} from '../utils/unicodeRange';

describe('WASM-free SVG font inlining & unicode-range utilities', () => {
  it('matches unicode-range specifications accurately', () => {
    expect(matchesUnicodeRange('U+20-7E', 'Hello')).toBe(true);
    expect(matchesUnicodeRange('U+20-7E', 'テスト')).toBe(false);
    expect(matchesUnicodeRange('U+3040-309F, U+30A0-30FF', 'テスト')).toBe(true);
    expect(matchesUnicodeRange('U+4E00-4E05', '一')).toBe(true);
    expect(matchesUnicodeRange('U+0-10FFFF', 'anything')).toBe(true);
  });

  it('inlines only matching pre-split local WOFF2 chunks into exported SVG without WASM', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const mockRegistered = new Map([
      [
        5,
        {
          metadata: { local: false },
          fontFaces: [
            {
              urls: [new URL('http://localhost/fonts/Excalifont/latin.woff2')],
              fontFace: { family: 'Excalifont', unicodeRange: 'U+20-7E' },
            },
            {
              urls: [new URL('http://localhost/fonts/Excalifont/cyrillic.woff2')],
              fontFace: { family: 'Excalifont', unicodeRange: 'U+400-4FF' },
            },
          ],
        },
      ],
      [
        99,
        {
          metadata: { local: false },
          fontFaces: [
            {
              urls: [new URL('http://localhost/fonts/Xiaolai/kana.woff2')],
              fontFace: { family: 'Xiaolai', unicodeRange: 'U+3040-30FF' },
            },
            {
              urls: [new URL('http://localhost/fonts/Xiaolai/hangul.woff2')],
              fontFace: { family: 'Xiaolai', unicodeRange: 'U+AC00-D7AF' },
            },
          ],
        },
      ],
    ]);

    const mockFetch = vi.fn(async () => new Response(new Uint8Array([0x77, 0x4f, 0x46, 0x32]), { status: 200 }));
    const elements = [
      { id: 't1', type: 'text', isDeleted: false, fontFamily: 5, originalText: 'Hi テスト', text: 'Hi テスト' },
    ] as never[];

    const inlinedCount = await inlinePreSplitFontsIntoSvg(svg, elements, {
      fetchFn: mockFetch as unknown as typeof fetch,
      registeredFonts: mockRegistered as never,
    });

    expect(inlinedCount).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const styleCss = svg.querySelector('defs > style.style-fonts')?.textContent || '';
    expect(styleCss).toContain('font-family: Excalifont');
    expect(styleCss).toContain('font-family: Xiaolai');
    expect(styleCss).toContain('data:font/woff2;base64,');
  });
});

describe('cjkFontManager (Japanese / Korean / Chinese manual download & full-key verification)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('classifies SetoJP and Xiaolai chunks into non-empty Japanese, Korean, and Chinese sets', () => {
    expect(cjkFontManifest.sets.ja.files.length).toBeGreaterThanOrEqual(40);
    expect(cjkFontManifest.sets.ja.files.every((f) => f.startsWith('fonts/SetoJP/'))).toBe(true);
    expect(cjkFontManifest.sets.ko.files.length).toBeGreaterThan(45);
    expect(cjkFontManifest.sets.zh.files.length).toBeGreaterThan(140);
  });

  it('protects shared Xiaolai chunks when deleting Chinese while Korean remains installed', () => {
    const allZh = cjkFontManifest.sets.zh.files;
    const allKoSet = new Set(cjkFontManifest.sets.ko.files);
    const exclusiveZh = computeExclusiveFilesForDeletion('zh', ['ko', 'zh']);

    expect(exclusiveZh.length).toBeLessThan(allZh.length);
    expect(exclusiveZh.length).toBeGreaterThan(0);
    for (const file of exclusiveZh) {
      expect(allKoSet.has(file)).toBe(false);
    }

    const exclusiveJa = computeExclusiveFilesForDeletion('ja', ['ja', 'zh']);
    expect(exclusiveJa.length).toBe(cjkFontManifest.sets.ja.files.length);
    expect(exclusiveJa.every((f) => f.startsWith('fonts/SetoJP/'))).toBe(true);
  });

  it('detects missing middle chunk via cache.keys() and handles download/delete cleanly', async () => {
    const memoryCache = new Map<string, Response>();
    const mockCache: Cache = {
      match: vi.fn(async (req: RequestInfo | URL) => memoryCache.get(String(req)) ?? undefined),
      put: vi.fn(async (req: RequestInfo | URL, res: Response) => {
        memoryCache.set(String(req), res);
      }),
      delete: vi.fn(async (req: RequestInfo | URL) => memoryCache.delete(String(req))),
      keys: vi.fn(async () => Array.from(memoryCache.keys()).map((url) => ({ url }) as Request)),
    } as unknown as Cache;

    const mockCacheStorage: CacheStorage = {
      open: vi.fn(async () => mockCache),
    } as unknown as CacheStorage;

    const mockFetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const koCount = cjkFontManifest.sets.ko.files.length;

    const dlRes = await downloadLanguageFontSet('ko', {
      fetchFn: mockFetch as unknown as typeof fetch,
      cacheStorage: mockCacheStorage,
      storage: localStorage,
      baseUrl: 'http://localhost/',
    });
    expect(dlRes.ok).toBe(true);
    expect(dlRes.total).toBe(koCount);

    expect(
      await isLanguageSetCached('ko', {
        cacheStorage: mockCacheStorage,
        storage: localStorage,
        baseUrl: 'http://localhost/',
      }),
    ).toBe(true);

    const midKey = Array.from(memoryCache.keys())[Math.floor(koCount / 2)];
    memoryCache.delete(midKey);

    expect(
      await isLanguageSetCached('ko', {
        cacheStorage: mockCacheStorage,
        storage: localStorage,
        baseUrl: 'http://localhost/',
      }),
    ).toBe(false);

    await downloadLanguageFontSet('ko', {
      fetchFn: mockFetch as unknown as typeof fetch,
      cacheStorage: mockCacheStorage,
      storage: localStorage,
      baseUrl: 'http://localhost/',
    });
    const delRes = await deleteLanguageFontSet('ko', {
      cacheStorage: mockCacheStorage,
      storage: localStorage,
      baseUrl: 'http://localhost/',
    });
    expect(delRes.ok).toBe(true);
    expect(delRes.deletedCount).toBe(koCount);
  });
});

describe('jpGlyphOverride (SetoJP Japanese glyphs, disjoint unicode-range, and preferJpFont preference)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetJpGlyphOverrideStateForTests();
    runtime.prefs = loadPrefs(localStorage);
  });

  afterEach(() => {
    resetJpGlyphOverrideStateForTests();
  });

  it('resolves preferJpFont default by language (ja-JP ON, others OFF) and honors explicit overrides', () => {
    expect(resolvePreferJpFont({ lang: 'ja-JP', preferJpFont: null })).toBe(true);
    expect(resolvePreferJpFont({ lang: 'en', preferJpFont: null })).toBe(false);
    expect(resolvePreferJpFont({ lang: 'zh-CN', preferJpFont: null })).toBe(false);
    expect(resolvePreferJpFont({ lang: 'zh-TW', preferJpFont: null })).toBe(false);
    expect(resolvePreferJpFont({ lang: 'ko-KR', preferJpFont: null })).toBe(false);

    expect(resolvePreferJpFont({ lang: 'en', preferJpFont: true })).toBe(true);
    expect(resolvePreferJpFont({ lang: 'ja-JP', preferJpFont: false })).toBe(false);

    applyLanguage('en');
    expect(resolvePreferJpFont(runtime.prefs)).toBe(false);
    applyPreferJpFont(true);
    expect(loadPrefs(localStorage).preferJpFont).toBe(true);
    expect(resolvePreferJpFont(loadPrefs(localStorage))).toBe(true);
  });

  it('subtracts excluded codepoints accurately from CSS unicode-range descriptors', () => {
    const exclude = new Set([0x7f6e, 0x76f4, 0x4e01]);
    expect(subtractUnicodeRange('U+4e00-4e03,U+7f6e,U+76f4', exclude)).toBe('U+4e00,U+4e02-4e03');
    expect(subtractUnicodeRange('U+7f6e,U+76f4', exclude)).toBeNull();
    expect(subtractUnicodeRange('U+4e60', exclude)).toBe('U+4e60');
  });

  it('produces strictly disjoint unicode-ranges with zero overlap and restores original Xiaolai on disable', () => {
    const mockXiaolaiFaces = [
      {
        urls: [new URL('http://localhost/fonts/Xiaolai/chunk-mixed.woff2')],
        fontFace: { family: 'Xiaolai', unicodeRange: 'U+4e60,U+7f6e,U+76f4,U+8bbe' },
      },
      {
        urls: [new URL('http://localhost/fonts/Xiaolai/chunk-jp-only.woff2')],
        fontFace: { family: 'Xiaolai', unicodeRange: 'U+3042,U+30a2' },
      },
    ];
    const mockRegistered = new Map<number, { metadata: { local?: boolean }; fontFaces: unknown[] }>([
      [XIAOLAI_FALLBACK_FAMILY_ID, { metadata: {}, fontFaces: [...mockXiaolaiFaces] }],
    ]);
    const liveFaces = new Set<unknown>(mockXiaolaiFaces.map((f) => f.fontFace));
    const mockFontFaceSet = {
      add: vi.fn((f: unknown) => liveFaces.add(f)),
      delete: vi.fn((f: unknown) => liveFaces.delete(f)),
      has: vi.fn((f: unknown) => liveFaces.has(f)),
    } as unknown as FontFaceSet;

    const onRes = applySakuttoFontOverrides(
      { preferJpFont: true },
      {
        registeredFonts: mockRegistered as never,
        fontFaceSet: mockFontFaceSet,
        baseUrl: 'http://localhost/',
      },
    );
    expect(onRes.applied).toBe(true);
    expect(onRes.jpFaceCount).toBe(jpFontManifest.chunks.length);
    expect(onRes.xiaolaiFaceCount).toBe(1);

    const activeFaces = mockRegistered.get(XIAOLAI_FALLBACK_FAMILY_ID)!.fontFaces as Array<{
      urls: Array<URL | string>;
      fontFace: { family: string; unicodeRange: string };
    }>;

    const matchingOku = activeFaces.filter((f) => matchesUnicodeRange(f.fontFace.unicodeRange, '置'));
    const matchingChoku = activeFaces.filter((f) => matchesUnicodeRange(f.fontFace.unicodeRange, '直'));
    expect(matchingOku.length).toBe(1);
    expect(String(matchingOku[0].urls[0])).toContain('/fonts/SetoJP/');
    expect(matchingChoku.length).toBe(1);
    expect(String(matchingChoku[0].urls[0])).toContain('/fonts/SetoJP/');

    const matchingSc = activeFaces.filter((f) => matchesUnicodeRange(f.fontFace.unicodeRange, '设'));
    expect(matchingSc.length).toBe(1);
    expect(String(matchingSc[0].urls[0])).toContain('/fonts/Xiaolai/');

    const seenCps = new Set<number>();
    for (const face of activeFaces) {
      const cps = parseUnicodeRangeToSet(face.fontFace.unicodeRange);
      for (const cp of cps) {
        expect(seenCps.has(cp)).toBe(false);
        seenCps.add(cp);
      }
    }
    expect(rangesIntersect(activeFaces[0].fontFace.unicodeRange, matchingOku[0].fontFace.unicodeRange)).toBe(false);

    const offRes = applySakuttoFontOverrides(
      { preferJpFont: false },
      {
        registeredFonts: mockRegistered as never,
        fontFaceSet: mockFontFaceSet,
        baseUrl: 'http://localhost/',
      },
    );
    expect(offRes.applied).toBe(true);
    expect(offRes.jpFaceCount).toBe(0);
    expect(offRes.xiaolaiFaceCount).toBe(2);
    expect(mockRegistered.get(XIAOLAI_FALLBACK_FAMILY_ID)!.fontFaces.length).toBe(2);
  });

  it('inlines only SetoJP chunks (no duplicate Xiaolai fetch) into exported SVG when JP override is enabled', async () => {
    const mockRegistered = new Map<number, { metadata: { local?: boolean }; fontFaces: unknown[] }>([
      [
        5,
        {
          metadata: {},
          fontFaces: [
            {
              urls: ['http://localhost/fonts/Excalifont/Excalifont-Regular.woff2'],
              fontFace: { family: 'Excalifont', unicodeRange: 'U+0020-007E' },
            },
          ],
        },
      ],
      [
        XIAOLAI_FALLBACK_FAMILY_ID,
        {
          metadata: {},
          fontFaces: [
            {
              urls: ['http://localhost/fonts/Xiaolai/Xiaolai-mixed.woff2'],
              fontFace: { family: 'Xiaolai', unicodeRange: 'U+4e60,U+7f6e,U+8a2d' },
            },
          ],
        },
      ],
    ]);

    applySakuttoFontOverrides(
      { preferJpFont: true },
      {
        registeredFonts: mockRegistered as never,
        fontFaceSet: null,
        baseUrl: 'http://localhost/',
      },
    );

    const fetchedUrls: string[] = [];
    const mockFetch = vi.fn(async (url: RequestInfo | URL) => {
      fetchedUrls.push(String(url));
      return new Response(new Uint8Array([0x77, 0x4f, 0x46, 0x32]), { status: 200 });
    });

    const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const elements = [{ id: 't1', type: 'text', fontFamily: 5, text: '設置', originalText: '設置', isDeleted: false }] as never;

    const count = await inlinePreSplitFontsIntoSvg(svgNode, elements, {
      fetchFn: mockFetch as unknown as typeof fetch,
      registeredFonts: mockRegistered as never,
    });

    expect(count).toBeGreaterThanOrEqual(1);
    expect(fetchedUrls.length).toBe(count);
    expect(fetchedUrls.every((u) => u.includes('/fonts/SetoJP/'))).toBe(true);
    expect(fetchedUrls.some((u) => u.includes('/fonts/Xiaolai/'))).toBe(false);
  });
});

describe('5-font architecture (all active slots, ligatures, SVG dedup, picker & packs)', () => {
  const origFontFace = globalThis.FontFace;

  beforeEach(() => {
    resetJpGlyphOverrideStateForTests();
    localStorage.clear();
    class TestFontFace {
      family: string;
      source: string;
      unicodeRange: string;
      weight: string;
      style: string;
      status = 'unloaded';
      constructor(family: string, source: string, descriptors: Record<string, string> = {}) {
        this.family = family;
        this.source = source;
        this.unicodeRange = descriptors.unicodeRange ?? 'U+0-10FFFF';
        this.weight = descriptors.weight ?? '400';
        this.style = descriptors.style ?? 'normal';
      }
      load() {
        this.status = 'loaded';
        return Promise.resolve(this);
      }
    }
    globalThis.FontFace = TestFontFace as unknown as typeof FontFace;
  });

  afterEach(() => {
    globalThis.FontFace = origFontFace;
    resetJpGlyphOverrideStateForTests();
    localStorage.clear();
  });

  function createMockEnv() {
    const mkFace = (family: string, url: string, unicodeRange: string, weight = '400') => ({
      fontFace: new FontFace(family, `url(${url})`, { unicodeRange, weight }),
      urls: [new URL(url)],
    });
    const registered = new Map<
      number,
      { metadata: { deprecated?: boolean }; fontFaces: Array<{ fontFace: FontFace; urls: URL[] }> }
    >([
      [
        XIAOLAI_FALLBACK_FAMILY_ID,
        {
          metadata: {},
          fontFaces: [mkFace('Xiaolai', 'https://example.test/fonts/Xiaolai/0.woff2', 'U+3000-30FF, U+4E00-9FFF')],
        },
      ],
      [
        FONT_FAMILY.Nunito,
        {
          metadata: {},
          fontFaces: [mkFace('Nunito', 'https://example.test/fonts/Nunito/latin.woff2', 'U+0020-00FF', '500')],
        },
      ],
      [
        FONT_FAMILY['Lilita One'],
        {
          metadata: {},
          fontFaces: [mkFace('Lilita One', 'https://example.test/fonts/Lilita/latin.woff2', 'U+0020-00FF')],
        },
      ],
      [
        FONT_FAMILY.Cascadia,
        {
          metadata: { deprecated: true },
          fontFaces: [
            mkFace(
              'Cascadia',
              'https://example.test/fonts/Cascadia/CascadiaCode-Regular.woff2',
              'U+0020-00FF, U+2190-21FF',
            ),
          ],
        },
      ],
      [
        FONT_FAMILY['Comic Shanns'],
        {
          metadata: {},
          fontFaces: [mkFace('Comic Shanns', 'https://example.test/fonts/ComicShanns/latin.woff2', 'U+0020-00FF')],
        },
      ],
    ]);
    const fontFaceSet = new Set<FontFace>();
    for (const entry of registered.values()) {
      for (const ff of entry.fontFaces) fontFaceSet.add(ff.fontFace);
    }
    return { registered, fontFaceSet };
  }

  const getFaceSources = (
    entry: { fontFaces: Array<{ fontFace: FontFace; urls: URL[] }> } | undefined,
  ): string[] =>
    (entry?.fontFaces ?? []).map(
      (f) => (f.fontFace as unknown as { source?: string }).source ?? f.urls.map(String).join(','),
    );

  it('registers disjoint unicode-ranges across all 5 fonts, toggles ligatures, and restores originals', () => {
    const { registered, fontFaceSet } = createMockEnv();
    enableCascadiaFontInRegistry(registered as never);
    expect(registered.get(FONT_FAMILY.Cascadia)?.metadata.deprecated).toBeFalsy();

    applySakuttoFontOverrides(
      { preferJpFont: true, codeLigatures: true },
      { registeredFonts: registered as never, fontFaceSet: fontFaceSet as never, baseUrl: 'https://example.test/' },
    );

    const assertUniformBucketAndDisjoint = () => {
      for (const familyId of [
        XIAOLAI_FALLBACK_FAMILY_ID,
        FONT_FAMILY.Nunito,
        FONT_FAMILY['Lilita One'],
        FONT_FAMILY.Cascadia,
        FONT_FAMILY['Comic Shanns'],
      ]) {
        const faces = registered.get(familyId)?.fontFaces ?? [];
        expect(faces.length).toBeGreaterThan(0);
        // All FontFaces within a family must share a single (weight, style) bucket so Blink matches JP chunks on weight 400
        const buckets = new Set(faces.map((d) => `${d.fontFace.weight}::${d.fontFace.style}`));
        expect(buckets.size).toBe(1);
        for (let i = 0; i < faces.length; i += 1) {
          for (let j = i + 1; j < faces.length; j += 1) {
            expect(rangesIntersect(faces[i].fontFace.unicodeRange, faces[j].fontFace.unicodeRange)).toBe(false);
          }
        }
      }
    };

    assertUniformBucketAndDisjoint();

    // Nunito replaced by MPlusRounded; Cascadia uses CascadiaCode + MPlusRounded; Lilita uses MochiyPop; Comic Shanns uses SetoJP
    const nunitoUrls = getFaceSources(registered.get(FONT_FAMILY.Nunito));
    expect(nunitoUrls.every((s) => s.includes('MPlusRounded'))).toBe(true);
    const lilitaUrls = getFaceSources(registered.get(FONT_FAMILY['Lilita One']));
    expect(lilitaUrls.some((s) => s.includes('Lilita/latin'))).toBe(true);
    expect(lilitaUrls.some((s) => s.includes('MochiyPop'))).toBe(true);
    const comicUrls = getFaceSources(registered.get(FONT_FAMILY['Comic Shanns']));
    expect(comicUrls.some((s) => s.includes('ComicShanns/latin'))).toBe(true);
    expect(comicUrls.some((s) => s.includes('SetoJP'))).toBe(true);
    const cascadiaCodeUrls = getFaceSources(registered.get(FONT_FAMILY.Cascadia));
    expect(cascadiaCodeUrls.some((s) => s.includes('CascadiaCode-Regular'))).toBe(true);
    expect(cascadiaCodeUrls.some((s) => s.includes('MPlusRounded'))).toBe(true);

    // Snapshot FontFace object identities for the 4 non-Cascadia slots before toggling codeLigatures
    const snapshotNonCascadiaRefs = () => ({
      xiaolai: [...(registered.get(XIAOLAI_FALLBACK_FAMILY_ID)?.fontFaces ?? [])].map((f) => f.fontFace),
      nunito: [...(registered.get(FONT_FAMILY.Nunito)?.fontFaces ?? [])].map((f) => f.fontFace),
      lilita: [...(registered.get(FONT_FAMILY['Lilita One'])?.fontFaces ?? [])].map((f) => f.fontFace),
      comic: [...(registered.get(FONT_FAMILY['Comic Shanns'])?.fontFaces ?? [])].map((f) => f.fontFace),
    });
    const refsBeforeLigatureToggle = snapshotNonCascadiaRefs();

    // Toggle codeLigatures OFF -> swaps ONLY Cascadia to CascadiaMono, preserving loaded FontFaces on other 4 slots
    applySakuttoFontOverrides(
      { preferJpFont: true, codeLigatures: false },
      { registeredFonts: registered as never, fontFaceSet: fontFaceSet as never, baseUrl: 'https://example.test/' },
    );
    assertUniformBucketAndDisjoint();
    const refsAfterLigatureToggle = snapshotNonCascadiaRefs();
    expect(refsAfterLigatureToggle.xiaolai).toHaveLength(refsBeforeLigatureToggle.xiaolai.length);
    refsAfterLigatureToggle.xiaolai.forEach((f, i) => expect(f).toBe(refsBeforeLigatureToggle.xiaolai[i]));
    expect(refsAfterLigatureToggle.nunito).toHaveLength(refsBeforeLigatureToggle.nunito.length);
    refsAfterLigatureToggle.nunito.forEach((f, i) => expect(f).toBe(refsBeforeLigatureToggle.nunito[i]));
    expect(refsAfterLigatureToggle.lilita).toHaveLength(refsBeforeLigatureToggle.lilita.length);
    refsAfterLigatureToggle.lilita.forEach((f, i) => expect(f).toBe(refsBeforeLigatureToggle.lilita[i]));
    expect(refsAfterLigatureToggle.comic).toHaveLength(refsBeforeLigatureToggle.comic.length);
    refsAfterLigatureToggle.comic.forEach((f, i) => expect(f).toBe(refsBeforeLigatureToggle.comic[i]));
    const cascadiaMonoUrls = getFaceSources(registered.get(FONT_FAMILY.Cascadia));
    expect(cascadiaMonoUrls.some((s) => s.includes('CascadiaMono'))).toBe(true);
    expect(cascadiaMonoUrls.some((s) => s.includes('CascadiaCode-Regular'))).toBe(false);

    // Toggle preferJpFont OFF -> restores originals while keeping Cascadia active & un-deprecated
    applySakuttoFontOverrides(
      { preferJpFont: false, codeLigatures: false },
      { registeredFonts: registered as never, fontFaceSet: fontFaceSet as never, baseUrl: 'https://example.test/' },
    );
    assertUniformBucketAndDisjoint();
    expect(registered.get(FONT_FAMILY.Cascadia)?.metadata.deprecated).toBeFalsy();
    expect(getFaceSources(registered.get(FONT_FAMILY.Nunito)).every((s) => s.includes('Nunito/latin'))).toBe(true);
    expect(getFaceSources(registered.get(FONT_FAMILY['Lilita One'])).every((s) => s.includes('Lilita/latin'))).toBe(true);
    expect(getFaceSources(registered.get(FONT_FAMILY['Comic Shanns'])).every((s) => s.includes('ComicShanns/latin'))).toBe(true);
    expect(getFaceSources(registered.get(FONT_FAMILY.Cascadia)).every((s) => !s.includes('MPlusRounded'))).toBe(true);

    // Ensure separate registeredFonts maps maintain isolated snapshots/state without cross-leaking
    const secondEnv = createMockEnv();
    applySakuttoFontOverrides(
      { preferJpFont: false, codeLigatures: true },
      { registeredFonts: secondEnv.registered as never, fontFaceSet: null, baseUrl: 'https://example.test/' },
    );
    expect(getFaceSources(secondEnv.registered.get(FONT_FAMILY.Cascadia)).some((s) => s.includes('CascadiaCode-Regular'))).toBe(true);
    expect(getFaceSources(registered.get(FONT_FAMILY.Cascadia)).some((s) => s.includes('CascadiaMono'))).toBe(true);
  });

  it('inlines shared MPlusRounded chunk once by fetch but emits @font-face for both Nunito and Cascadia', async () => {
    const sharedUrl = '/fonts/MPlusRounded/mplus-001.woff2';
    const mockRegistered = new Map([
      [
        FONT_FAMILY.Nunito,
        {
          fontFaces: [
            {
              fontFace: { family: 'Nunito', weight: '500', style: 'normal', unicodeRange: 'U+3042' },
              urls: [sharedUrl],
            },
          ],
        },
      ],
      [
        FONT_FAMILY.Cascadia,
        {
          fontFaces: [
            {
              fontFace: { family: 'Cascadia', weight: '400', style: 'normal', unicodeRange: 'U+3042' },
              urls: [sharedUrl],
            },
          ],
        },
      ],
    ]);
    const fetchedUrls: string[] = [];
    const mockFetch = vi.fn(async (url: string) => {
      fetchedUrls.push(String(url));
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    });
    const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const elements = [
      { id: '1', type: 'text', fontFamily: FONT_FAMILY.Nunito, text: 'あ' },
      { id: '2', type: 'text', fontFamily: FONT_FAMILY.Cascadia, text: 'あ' },
    ];

    const emittedCount = await inlinePreSplitFontsIntoSvg(svgNode, elements as never, {
      fetchFn: mockFetch as unknown as typeof fetch,
      registeredFonts: mockRegistered as never,
    });

    expect(fetchedUrls).toHaveLength(1);
    expect(emittedCount).toBe(2);
    const styleText = svgNode.querySelector('style.style-fonts')?.textContent ?? '';
    expect(styleText).toContain('font-family: Nunito;');
    expect(styleText).toContain('font-family: Cascadia;');
  });

  it('supports all 5 CJK font packs and protects shared chunks during deletion', async () => {
    expect(Object.keys(cjkFontManifest.sets).sort()).toEqual(['ja', 'jaPop', 'jaStandard', 'ko', 'zh']);
    const fakeCache = new Map<string, Response>();
    const cacheObj = {
      match: vi.fn(async (req: string) => fakeCache.get(req)),
      put: vi.fn(async (req: string, res: Response) => {
        fakeCache.set(req, res);
      }),
      delete: vi.fn(async (req: string) => fakeCache.delete(req)),
      keys: vi.fn(async () => [...fakeCache.keys()].map((url) => ({ url }))),
    };
    const origCaches = globalThis.caches;
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { open: vi.fn(async () => cacheObj) },
    });
    try {
      const fetchFn = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
      await downloadLanguageFontSet('jaStandard', { fetchFn: fetchFn as unknown as typeof fetch, baseUrl: '/' });
      expect(await isLanguageSetCached('jaStandard', { baseUrl: '/' })).toBe(true);
      await downloadLanguageFontSet('jaPop', { fetchFn: fetchFn as unknown as typeof fetch, baseUrl: '/' });
      expect(await isLanguageSetCached('jaPop', { baseUrl: '/' })).toBe(true);
      const exclusiveStd = computeExclusiveFilesForDeletion('jaStandard', ['jaStandard', 'jaPop']);
      expect(exclusiveStd.length).toBe(cjkFontManifest.sets.jaStandard.files.length);
      await deleteLanguageFontSet('jaStandard', { baseUrl: '/' });
      expect(await isLanguageSetCached('jaStandard', { baseUrl: '/' })).toBe(false);
      expect(await isLanguageSetCached('jaPop', { baseUrl: '/' })).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'caches', { configurable: true, value: origCaches });
    }
  });

  it('syncs FontPicker labels for ja-JP and en, and defaults codeLigatures + fontTopPicks [5, 6, 3]', async () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="FontPicker__top-picks">
        <button data-testid="font-family-hand-drawn"></button>
        <button data-testid="font-family-normal"></button>
        <button data-testid="font-family-${FONT_FAMILY.Cascadia}"></button>
      </div>
      <div class="dropdown-menu fonts">
        <button value="${FONT_FAMILY.Excalifont}"><span class="dropdown-menu-item__text"><span>Excalifont</span></span></button>
        <button value="${FONT_FAMILY.Nunito}"><span class="dropdown-menu-item__text"><span>Nunito</span></span></button>
        <button value="${FONT_FAMILY['Lilita One']}"><span class="dropdown-menu-item__text"><span>Lilita One</span></span></button>
        <button value="${FONT_FAMILY.Cascadia}"><span class="dropdown-menu-item__text"><span>Cascadia</span></span></button>
        <button value="${FONT_FAMILY['Comic Shanns']}"><span class="dropdown-menu-item__text"><span>Comic Shanns</span></span></button>
      </div>
    `;

    const prevLang = runtime.prefs.lang;
    try {
      applyLanguage('ja-JP');
      expect(syncFontPicker(container)).toBe(true);
      expect(container.querySelector(`button[value="${FONT_FAMILY.Nunito}"] .dropdown-menu-item__text span`)?.textContent).toBe('標準');
      expect(container.querySelector(`button[value="${FONT_FAMILY.Cascadia}"] .dropdown-menu-item__text span`)?.textContent).toBe('コード');
      expect(container.querySelector(`button[value="${FONT_FAMILY['Comic Shanns']}"] .dropdown-menu-item__text span`)?.textContent).toBe('コード（手書き風）');
      expect(container.querySelector(`button[data-testid="font-family-${FONT_FAMILY.Cascadia}"]`)?.getAttribute('title')).toBe('コード');

      applyLanguage('en');
      expect(syncFontPicker(container)).toBe(true);
      expect(container.querySelector(`button[value="${FONT_FAMILY.Nunito}"] .dropdown-menu-item__text span`)?.textContent).toBe('Normal');
      expect(container.querySelector(`button[value="${FONT_FAMILY.Cascadia}"] .dropdown-menu-item__text span`)?.textContent).toBe('Code');
    } finally {
      applyLanguage(prevLang);
    }

    expect(DEFAULT_FONT_TOP_PICKS).toEqual([FONT_FAMILY.Excalifont, FONT_FAMILY.Nunito, FONT_FAMILY.Cascadia]);
    expect(loadPrefs().codeLigatures).toBe(true);
    savePrefs({ ...loadPrefs(), codeLigatures: false });
    expect(loadPrefs().codeLigatures).toBe(false);
    const initial = await loadInitialSceneData();
    expect(initial.appState?.fontTopPicks).toEqual([5, 6, 3]);
  });

  it('inlines all 5 fonts compactly from real public/fonts .woff2 chunks and dedups shared fetches', async () => {
    const publicRoot = path.resolve(process.cwd(), 'public');
    const resolveDistOrPublicFont = (urlPath: string): string => {
      const rel = urlPath.replace(/^https:\/\/example\.test\//, '').replace(/^\//, '');
      const pubCandidate = path.join(publicRoot, rel);
      if (fs.existsSync(pubCandidate)) return pubCandidate;
      return '';
    };

    const mkFace = (family: string, url: string, unicodeRange: string, weight = '400') => ({
      fontFace: new FontFace(family, `url(${url})`, { unicodeRange, weight }),
      urls: [new URL(url)],
    });

    const excalifontFile = fs
      .readdirSync(path.join(publicRoot, 'fonts', 'Excalifont'))
      .find((f) => f.endsWith('.woff2'));
    const lilitaFile = fs
      .readdirSync(path.join(publicRoot, 'fonts', 'Lilita'))
      .find((f) => f.endsWith('.woff2'));
    const comicFile = fs
      .readdirSync(path.join(publicRoot, 'fonts', 'ComicShanns'))
      .find((f) => f.endsWith('.woff2'));
    const cascadiaFile = fs
      .readdirSync(path.join(publicRoot, 'fonts', 'Cascadia'))
      .find((f) => f.endsWith('.woff2'));

    expect(excalifontFile && lilitaFile && comicFile && cascadiaFile).toBeTruthy();

    const registered = new Map<
      number,
      { metadata: { deprecated?: boolean }; fontFaces: Array<{ fontFace: FontFace; urls: URL[] }> }
    >([
      [
        FONT_FAMILY.Excalifont,
        {
          metadata: {},
          fontFaces: [mkFace('Excalifont', `https://example.test/fonts/Excalifont/${excalifontFile}`, 'U+0020-00FF')],
        },
      ],
      [
        XIAOLAI_FALLBACK_FAMILY_ID,
        {
          metadata: {},
          fontFaces: [mkFace('Xiaolai', 'https://example.test/fonts/Xiaolai/stub.woff2', 'U+3000-30FF, U+4E00-9FFF')],
        },
      ],
      [
        FONT_FAMILY.Nunito,
        {
          metadata: {},
          fontFaces: [mkFace('Nunito', 'https://example.test/fonts/Nunito/stub.woff2', 'U+0020-00FF', '500')],
        },
      ],
      [
        FONT_FAMILY['Lilita One'],
        {
          metadata: {},
          fontFaces: [mkFace('Lilita One', `https://example.test/fonts/Lilita/${lilitaFile}`, 'U+0020-00FF')],
        },
      ],
      [
        FONT_FAMILY.Cascadia,
        {
          metadata: { deprecated: true },
          fontFaces: [mkFace('Cascadia', `https://example.test/fonts/Cascadia/${cascadiaFile}`, 'U+0020-00FF')],
        },
      ],
      [
        FONT_FAMILY['Comic Shanns'],
        {
          metadata: {},
          fontFaces: [mkFace('Comic Shanns', `https://example.test/fonts/ComicShanns/${comicFile}`, 'U+0020-00FF')],
        },
      ],
    ]);

    applySakuttoFontOverrides(
      { preferJpFont: true, codeLigatures: true },
      { registeredFonts: registered as never, fontFaceSet: null, baseUrl: 'https://example.test/' },
    );

    const fetchCounts = new Map<string, number>();
    const mockFetch = vi.fn(async (url: string) => {
      const key = String(url);
      fetchCounts.set(key, (fetchCounts.get(key) ?? 0) + 1);
      const localPath = resolveDistOrPublicFont(key);
      if (!localPath) {
        return new Response(new Uint8Array([0, 1, 2, 3]), { status: 200 });
      }
      const buf = fs.readFileSync(localPath);
      return new Response(buf, { status: 200 });
    });

    const sample = 'Abc => !== あいう テスト';
    const elements = [
      { id: '1', type: 'text', fontFamily: FONT_FAMILY.Excalifont, text: sample },
      { id: '2', type: 'text', fontFamily: FONT_FAMILY.Nunito, text: sample },
      { id: '3', type: 'text', fontFamily: FONT_FAMILY['Lilita One'], text: sample },
      { id: '4', type: 'text', fontFamily: FONT_FAMILY.Cascadia, text: sample },
      { id: '5', type: 'text', fontFamily: FONT_FAMILY['Comic Shanns'], text: sample },
    ];
    const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const emittedCount = await inlinePreSplitFontsIntoSvg(svgNode, elements as never, {
      fetchFn: mockFetch as unknown as typeof fetch,
      registeredFonts: registered as never,
    });

    expect(emittedCount).toBeGreaterThanOrEqual(10);
    const styleCss = svgNode.querySelector('style.style-fonts')?.textContent ?? '';
    expect(styleCss).toContain('font-family: Excalifont;');
    expect(styleCss).toContain('font-family: Xiaolai;');
    expect(styleCss).toContain('font-family: Nunito;');
    expect(styleCss).toContain('font-family: "Lilita One";');
    expect(styleCss).toContain('font-family: Cascadia;');
    expect(styleCss).toContain('font-family: "Comic Shanns";');

    // Every unique URL was fetched at most once despite MPlusRounded (Nunito+Cascadia) & SetoJP (Xiaolai+Comic Shanns) sharing
    for (const count of fetchCounts.values()) {
      expect(count).toBe(1);
    }
    expect(Array.from(fetchCounts.keys()).some((u) => u.includes('/fonts/MochiyPop/'))).toBe(true);
    expect(Array.from(fetchCounts.keys()).some((u) => u.includes('/fonts/MPlusRounded/'))).toBe(true);
    expect(Array.from(fetchCounts.keys()).some((u) => u.includes('/fonts/SetoJP/'))).toBe(true);

    // Compact size: only used chunks (kana+latin) instead of all full packs (~9MB+)
    expect(svgNode.outerHTML.length).toBeLessThan(1_800_000);
  });

  it('re-measures width on unbound autoResize text elements during refreshSceneTextFonts while keeping fixed-width & bound texts', async () => {
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    const mockCtx = {
      font: '',
      measureText: vi.fn((text: string) => ({ width: text.length * 14 })),
    };
    HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCtx) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    const elements = [
      {
        id: 'auto-1',
        type: 'text',
        isDeleted: false,
        fontFamily: FONT_FAMILY['Lilita One'],
        fontSize: 20,
        text: 'Abcdef',
        originalText: 'Abcdef',
        autoResize: true,
        containerId: null,
        width: 50,
        version: 1,
        versionNonce: 1,
      },
      {
        id: 'fixed-2',
        type: 'text',
        isDeleted: false,
        fontFamily: FONT_FAMILY['Lilita One'],
        fontSize: 20,
        text: 'Abcdef',
        originalText: 'Abcdef',
        autoResize: false,
        containerId: null,
        width: 50,
        version: 1,
        versionNonce: 2,
      },
      {
        id: 'bound-3',
        type: 'text',
        isDeleted: false,
        fontFamily: FONT_FAMILY['Lilita One'],
        fontSize: 20,
        text: 'Abcdef',
        originalText: 'Abcdef',
        autoResize: true,
        containerId: 'rect-1',
        width: 50,
        version: 1,
        versionNonce: 3,
      },
    ];
    let updatedElements: Array<Record<string, unknown>> = [];
    const mockApi = {
      getSceneElements: () => elements,
      updateScene: vi.fn((scene: { elements: Array<Record<string, unknown>> }) => {
        updatedElements = scene.elements;
      }),
    };
    const mockFontFaceSet = { load: vi.fn(async () => []) };

    try {
      await refreshSceneTextFonts(mockApi as never, {
        fontFaceSet: mockFontFaceSet as unknown as FontFaceSet,
        targetFamilyIds: [FONT_FAMILY['Lilita One']],
      });
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext;
    }

    expect(mockApi.updateScene).toHaveBeenCalledTimes(1);
    expect(updatedElements.find((e) => e.id === 'auto-1')?.width).toBe(6 * 14);
    expect(updatedElements.find((e) => e.id === 'fixed-2')?.width).toBe(50);
    expect(updatedElements.find((e) => e.id === 'bound-3')?.width).toBe(50);
  });
});

describe('FontSettingsPanel UI (5-slot linkage, codeLigatures, other CJK, and license modal)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    resetJpGlyphOverrideStateForTests();
    runtime.prefs = loadPrefs(localStorage);
    applyLanguage('ja-JP');
    applyPreferJpFont(true);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    resetJpGlyphOverrideStateForTests();
    localStorage.clear();
  });

  it('shows Code Ligatures above 優先フォント, updates all 5 slots dynamically, expands other languages, and opens/closes license modal', async () => {
    const rootShell = document.createElement('div');
    rootShell.className = 'excalidraw';
    const host = document.createElement('div');
    rootShell.append(host);
    document.body.append(rootShell);

    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(FontSettingsPanel, { lang: 'ja-JP' }));
    });

    const panel = host.querySelector('[data-exq-font-settings-panel="1"]')!;
    const ligGroup = panel.querySelector('[data-exq-code-ligatures-group="1"]')!;
    const preferGroup = panel.querySelector('[data-exq-prefer-jp-group="1"]')!;
    expect(
      Boolean(ligGroup.compareDocumentPosition(preferGroup) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(preferGroup.querySelector('.exq-pref-group-title')?.textContent).toBe('優先フォント');

    const getSub = (slotId: string) =>
      panel.querySelector(`[data-exq-font-slot="${slotId}"] .exq-font-slot-sub`)?.textContent;

    expect(getSub('hand-drawn')).toBe('Excalifont + SetoJP');
    expect(getSub('normal')).toBe('M PLUS Rounded 1c');
    expect(getSub('pop')).toBe('Lilita One + Mochiy Pop P One');
    expect(getSub('code')).toBe('Cascadia Code + M PLUS Rounded 1c');
    expect(getSub('code-hand')).toBe('Comic Shanns + SetoJP');

    // Toggle Code Ligatures OFF -> Code slot switches to Cascadia Mono + M PLUS Rounded 1c
    await act(async () => {
      panel.querySelector<HTMLButtonElement>('[data-exq-code-ligatures="off"]')?.click();
    });
    expect(getSub('code')).toBe('Cascadia Mono + M PLUS Rounded 1c');

    // Expand Other languages drawer -> reveals full 中国語 and 韓国語 buttons
    expect(panel.querySelector('.exq-font-other-cjk [data-exq-cjk-btn="zh"]')).toBeNull();
    await act(async () => {
      panel.querySelector<HTMLButtonElement>('[data-exq-other-cjk-toggle="1"]')?.click();
    });
    expect(panel.querySelector('.exq-font-other-cjk [data-exq-cjk-btn="zh"]')?.textContent).toContain('中国語');
    expect(panel.querySelector('.exq-font-other-cjk [data-exq-cjk-btn="ko"]')?.textContent).toContain('韓国語');

    // Switch 優先フォント to 標準・中国語
    await act(async () => {
      panel.querySelector<HTMLButtonElement>('[data-exq-prefer-jp-card="zh"]')?.click();
    });
    expect(getSub('hand-drawn')).toBe('Excalifont + Xiaolai');
    expect(getSub('normal')).toBe('Nunito');
    expect(getSub('pop')).toBe('Lilita One');
    expect(getSub('code')).toBe('Cascadia Mono');
    expect(getSub('code-hand')).toBe('Comic Shanns');
    expect(
      panel.querySelector('[data-exq-font-slot="hand-drawn"] [data-exq-cjk-btn="zh"]')?.textContent,
    ).toContain('中国語');
    expect(
      panel.querySelector('[data-exq-font-slot="hand-drawn"] [data-exq-cjk-btn="ko"]')?.textContent,
    ).toContain('韓国語');
    expect(
      panel.querySelector('[data-exq-font-slot="normal"] .exq-font-builtin-badge')?.textContent,
    ).toBe('同梱済み');
    expect(panel.querySelector('[data-exq-other-cjk-toggle="1"]')).toBeNull();

    // Open License modal, verify all 9 fonts, close with button, reopen and close with Escape
    await act(async () => {
      panel.querySelector<HTMLButtonElement>('[data-exq-font-licenses-btn="1"]')?.click();
    });
    const modal = document.querySelector('[data-exq-font-license-modal="1"]');
    expect(modal).toBeTruthy();
    const modalText = modal?.textContent ?? '';
    for (const fontName of [
      'Excalifont',
      'SetoJP',
      'Xiaolai',
      'M PLUS Rounded 1c',
      'Nunito',
      'Lilita One',
      'Mochiy Pop P One',
      'Cascadia Code / Mono',
      'Comic Shanns',
    ]) {
      expect(modalText).toContain(fontName);
    }

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-exq-font-licenses-close="1"]')?.click();
    });
    expect(document.querySelector('[data-exq-font-license-modal="1"]')).toBeNull();

    await act(async () => {
      panel.querySelector<HTMLButtonElement>('[data-exq-font-licenses-btn="1"]')?.click();
    });
    expect(document.querySelector('[data-exq-font-license-modal="1"]')).toBeTruthy();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('[data-exq-font-license-modal="1"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
