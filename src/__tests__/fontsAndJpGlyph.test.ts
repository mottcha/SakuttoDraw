import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cjkFontManifest,
  computeExclusiveFilesForDeletion,
  deleteLanguageFontSet,
  downloadLanguageFontSet,
  isLanguageSetCached,
} from '../annotator/cjkFontManager';
import {
  applyJapaneseGlyphOverride,
  jpFontManifest,
  resetJpGlyphOverrideStateForTests,
} from '../annotator/jpGlyphOverride';
import { applyLanguage, applyPreferJpFont, runtime } from '../annotator/quickAnnotator/runtime';
import { inlinePreSplitFontsIntoSvg } from '../annotator/svgFontInliner';
import { XIAOLAI_FALLBACK_FAMILY_ID } from '../excalidraw/fontsAdapter';
import { loadPrefs, resolvePreferJpFont } from '../services/storageBridge';
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

    const onRes = applyJapaneseGlyphOverride(true, {
      registeredFonts: mockRegistered as never,
      fontFaceSet: mockFontFaceSet,
      baseUrl: 'http://localhost/',
    });
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

    const offRes = applyJapaneseGlyphOverride(false, {
      registeredFonts: mockRegistered as never,
      fontFaceSet: mockFontFaceSet,
      baseUrl: 'http://localhost/',
    });
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

    applyJapaneseGlyphOverride(true, {
      registeredFonts: mockRegistered as never,
      fontFaceSet: null,
      baseUrl: 'http://localhost/',
    });

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
