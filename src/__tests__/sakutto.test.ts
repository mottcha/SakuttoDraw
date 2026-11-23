import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import {
  bootstrapCleanCanvas,
  cancelPendingScenePersist,
  DEFAULT_PINK,
  LS_ELEMENTS_KEY,
  LS_PREFS_KEY,
  LS_STATE_KEY,
  loadPrefs,
  normalizeFormat,
  normalizeScale,
  savePrefs,
  scheduleScenePersist,
  shouldSkipAutoReset,
} from '../services/storageBridge';
import {
  applyCanvasBackgroundWithApi,
  filterTargetElementsForExport,
  inlinePreSplitFontsIntoSvg,
  matchesUnicodeRange,
  runDirectDiskSaveWithApi,
  runInstantResetWithApi,
} from '../annotator/apiActions';
import {
  cjkFontManifest,
  computeExclusiveFilesForDeletion,
  deleteLanguageFontSet,
  downloadLanguageFontSet,
  isLanguageSetCached,
} from '../annotator/cjkFontManager';
import {
  applyLanguage,
  attachExcalidrawAPI,
  installTextAutoResizeGuard,
  runtime,
  syncContextMenu,
  syncExtraToolsMenu,
  syncMainMenu,
  syncToolbar,
  syncTopRightBar,
} from '../annotator/quickAnnotator';
import {
  detectBrowserLang,
  getMessages,
  normalizeAppLang,
  SUPPORTED_LANGS,
} from '../i18n/messages';

describe('i18n (en, ja-JP, zh-CN, zh-TW, ko-KR)', () => {
  it('normalizes and detects browser languages into the 5 supported locales', () => {
    expect(normalizeAppLang('ja')).toBe('ja-JP');
    expect(normalizeAppLang('ja-JP')).toBe('ja-JP');
    expect(normalizeAppLang('ko-KR')).toBe('ko-KR');
    expect(normalizeAppLang('zh-CN')).toBe('zh-CN');
    expect(normalizeAppLang('zh-SG')).toBe('zh-CN');
    expect(normalizeAppLang('zh-TW')).toBe('zh-TW');
    expect(normalizeAppLang('zh-HK')).toBe('zh-TW');
    expect(normalizeAppLang('zh-Hant')).toBe('zh-TW');
    expect(normalizeAppLang('en-US')).toBe('en');
    expect(detectBrowserLang({ language: 'fr-FR', languages: ['fr-FR', 'zh-TW'] })).toBe('zh-TW');
    expect(detectBrowserLang({ language: 'de-DE', languages: ['de-DE'] })).toBe('en');
  });

  it('provides complete message catalogs for all 5 supported locales', () => {
    expect(SUPPORTED_LANGS.map((l) => l.code)).toEqual(['en', 'ja-JP', 'zh-CN', 'zh-TW', 'ko-KR']);
    for (const { code } of SUPPORTED_LANGS) {
      const m = getMessages(code);
      expect(m.quickSettings.length).toBeGreaterThan(0);
      expect(m.drawAssist.length).toBeGreaterThan(0);
      expect(m.exportSettings.length).toBeGreaterThan(0);
      expect(m.penColor.length).toBeGreaterThan(0);
      expect(m.prefBoxSelectionTitle.length).toBeGreaterThan(0);
      expect(m.prefScrollActionTitle.length).toBeGreaterThan(0);
      expect(m.prefScreenModeTitle.length).toBeGreaterThan(0);
      expect(m.toastFontDownloaded('Test').length).toBeGreaterThan(0);
    }
  });
});

describe('storageBridge & debounced persistence race prevention', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    cancelPendingScenePersist();
    vi.useRealTimers();
  });

  it('normalizes scale and format values', () => {
    expect(normalizeScale(1)).toBe(1);
    expect(normalizeScale(2)).toBe(2);
    expect(normalizeScale(3)).toBe(3);
    expect(normalizeScale(99)).toBe(1);
    expect(normalizeFormat('SVG')).toBe('svg');
    expect(normalizeFormat('png')).toBe('png');
    expect(normalizeFormat('invalid')).toBe('png');
  });

  it('bootstraps clean canvas and applies default pink stroke color and overlap selection', () => {
    localStorage.setItem(LS_ELEMENTS_KEY, JSON.stringify([{ id: 'old-el' }]));
    const res = bootstrapCleanCanvas({ storage: localStorage, hash: '' });
    expect(res.skipped).toBe(false);
    expect(res.autoReset).toBe(true);
    expect(res.pinkApplied).toBe(true);
    expect(res.prefs.boxSelectionMode).toBe('overlap');
    expect(res.prefs.inputDevice).toBe('trackpad');
    expect(localStorage.getItem(LS_ELEMENTS_KEY)).toBe('[]');
    const st = JSON.parse(localStorage.getItem(LS_STATE_KEY) || '{}');
    expect(st.currentItemStrokeColor).toBe(DEFAULT_PINK);
    expect(st.boxSelectionMode).toBe('overlap');
    expect(st.inputDevice).toBe('trackpad');
  });

  it('migrates legacy defaultPink: false preference to #1e1e1e defaultPenColor', () => {
    localStorage.setItem(LS_PREFS_KEY, JSON.stringify({ quickOpts: { defaultPink: false } }));
    const prefs = loadPrefs(localStorage);
    expect(prefs.quickOpts.defaultPenColor).toBe('#1e1e1e');
  });

  it('skips auto-reset when hash contains #json= or #addLibrary=', () => {
    expect(shouldSkipAutoReset('#json=abc')).toBe(true);
    expect(shouldSkipAutoReset('#addLibrary=xyz')).toBe(true);
    expect(shouldSkipAutoReset('')).toBe(false);
  });

  it('saves and reloads preferences including language, themeMode, boxSelectionMode, inputDevice, and pen color', () => {
    const prefs = loadPrefs(localStorage);
    prefs.lang = 'zh-TW';
    prefs.themeMode = 'system';
    prefs.boxSelectionMode = 'contain';
    prefs.inputDevice = 'mouse';
    prefs.exportOpts.format = 'svg';
    prefs.exportOpts.scale = 3;
    prefs.quickOpts.autoResetOnOpen = false;
    prefs.quickOpts.defaultPenColor = '#1971c2';
    savePrefs(prefs, localStorage);

    const reloaded = loadPrefs(localStorage);
    expect(reloaded.lang).toBe('zh-TW');
    expect(reloaded.themeMode).toBe('system');
    expect(reloaded.boxSelectionMode).toBe('contain');
    expect(reloaded.inputDevice).toBe('mouse');
    expect(reloaded.exportOpts.format).toBe('svg');
    expect(reloaded.exportOpts.scale).toBe(3);
    expect(reloaded.quickOpts.autoResetOnOpen).toBe(false);
    expect(reloaded.quickOpts.defaultPenColor).toBe('#1971c2');
    expect(localStorage.getItem(LS_PREFS_KEY)).toBeTruthy();
  });

  it('cancels pending debounced scene persist when instant reset runs within 250ms', async () => {
    vi.useFakeTimers();
    const mockApi = {
      resetScene: vi.fn(),
      updateScene: vi.fn(),
      history: { clear: vi.fn() },
    } as unknown as ExcalidrawImperativeAPI;

    scheduleScenePersist(
      [{ id: 'stale-el', isDeleted: false } as never],
      { viewBackgroundColor: '#ffffff' },
      {},
      { delayMs: 250, storage: localStorage },
    );

    // User clicks instant reset 100ms after drawing
    vi.advanceTimersByTime(100);
    await runInstantResetWithApi(mockApi, loadPrefs(localStorage), { storage: localStorage });

    // Advance past original 250ms timer: stale element must NOT overwrite the empty storage
    vi.advanceTimersByTime(300);
    expect(JSON.parse(localStorage.getItem(LS_ELEMENTS_KEY) || '[]')).toEqual([]);
  });
});

describe('apiActions (direct ExcalidrawImperativeAPI & WASM-free SVG font inlining)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

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
        5, // Excalifont
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
        99, // Xiaolai fallback
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

    // Should fetch latin.woff2 and kana.woff2, skipping cyrillic.woff2 and hangul.woff2
    expect(inlinedCount).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const styleCss = svg.querySelector('defs > style.style-fonts')?.textContent || '';
    expect(styleCss).toContain('font-family: Excalifont');
    expect(styleCss).toContain('font-family: Xiaolai');
    expect(styleCss).toContain('data:font/woff2;base64,');
  });

  it('filters selected elements including bound text and frame children when onlySelected is true', () => {
    const elements = [
      { id: 'rect-1', type: 'rectangle', isDeleted: false, groupIds: [] },
      { id: 'text-bound', type: 'text', isDeleted: false, groupIds: [], containerId: 'rect-1' },
      { id: 'other-el', type: 'ellipse', isDeleted: false, groupIds: [] },
    ] as never[];

    const selectedRes = filterTargetElementsForExport(
      elements,
      { selectedElementIds: { 'rect-1': true }, selectedGroupIds: {} },
      true,
    );
    expect(selectedRes.exportedOnlySelected).toBe(true);
    expect(selectedRes.elements.map((e) => e.id)).toEqual(['rect-1', 'text-bound']);

    const unselectedFallback = filterTargetElementsForExport(
      elements,
      { selectedElementIds: {}, selectedGroupIds: {} },
      true,
    );
    expect(unselectedFallback.exportedOnlySelected).toBe(false);
    expect(unselectedFallback.elements.length).toBe(3);
  });

  it('runs instant reset, background update, and direct disk save via excalidrawAPI', async () => {
    const resetScene = vi.fn();
    const updateScene = vi.fn();
    const clearHistory = vi.fn();
    const mockApi = {
      resetScene,
      updateScene,
      history: { clear: clearHistory },
      getSceneElements: () => [],
      getAppState: () => ({ viewBackgroundColor: '#ffffff' }),
      getFiles: () => ({}),
      getName: () => 'test-scene',
    } as unknown as ExcalidrawImperativeAPI;

    const prefs = loadPrefs(localStorage);
    const res = await runInstantResetWithApi(mockApi, prefs, { storage: localStorage });
    expect(res.ok).toBe(true);
    expect(res.pinkApplied).toBe(true);
    expect(resetScene).toHaveBeenCalledTimes(1);
    expect(clearHistory).toHaveBeenCalledTimes(1);
    expect(updateScene).toHaveBeenCalledWith(
      expect.objectContaining({
        appState: { currentItemStrokeColor: DEFAULT_PINK },
      }),
    );

    const bgRes = await applyCanvasBackgroundWithApi(mockApi, '#fffce8', { storage: localStorage });
    expect(bgRes.ok).toBe(true);
    expect(bgRes.color).toBe('#fffce8');

    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
    try {
      expect(runDirectDiskSaveWithApi(mockApi)).toBe(true);
    } finally {
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    }
  });
});

describe('cjkFontManager (Japanese / Korean / Chinese manual download & full-key verification)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('classifies Xiaolai chunks into non-empty Japanese, Korean, and Chinese sets', () => {
    expect(cjkFontManifest.sets.ja.files.length).toBeGreaterThan(100);
    expect(cjkFontManifest.sets.ko.files.length).toBeGreaterThan(45);
    expect(cjkFontManifest.sets.zh.files.length).toBeGreaterThan(140);
  });

  it('protects shared Kanji chunks when deleting Chinese while Japanese remains installed', () => {
    const allZh = cjkFontManifest.sets.zh.files;
    const allJaSet = new Set(cjkFontManifest.sets.ja.files);
    const exclusiveZh = computeExclusiveFilesForDeletion('zh', ['ja', 'zh']);

    expect(exclusiveZh.length).toBeLessThan(allZh.length);
    expect(exclusiveZh.length).toBeGreaterThan(0);
    for (const file of exclusiveZh) {
      expect(allJaSet.has(file)).toBe(false);
    }
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

    // Simulate browser evicting a single middle chunk
    const midKey = Array.from(memoryCache.keys())[Math.floor(koCount / 2)];
    memoryCache.delete(midKey);

    expect(
      await isLanguageSetCached('ko', {
        cacheStorage: mockCacheStorage,
        storage: localStorage,
        baseUrl: 'http://localhost/',
      }),
    ).toBe(false);

    // Re-download and delete cleanly
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

describe('quickAnnotator DOM sync, language switcher, and textAutoResize guard regression', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    attachExcalidrawAPI(null);
    runtime.prefs = loadPrefs(localStorage);
  });

  it('guards pointermove and pins pointerup coordinates even when activeTool switches to selection on pointerdown', () => {
    let activeType = 'text';
    attachExcalidrawAPI({
      getAppState: () => ({ activeTool: { type: activeType } }),
    } as unknown as ExcalidrawImperativeAPI);

    const canvas = document.createElement('canvas');
    canvas.className = 'excalidraw__canvas interactive';
    document.body.append(canvas);

    const cleanup = installTextAutoResizeGuard();
    const moveListener = vi.fn();
    let seenUpCoords: { x: number; y: number } | null = null;
    window.addEventListener('pointermove', moveListener);
    window.addEventListener('pointerup', (e) => {
      seenUpCoords = { x: e.clientX, y: e.clientY };
    });

    try {
      const downEvt = new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 120, clientY: 200 });
      Object.defineProperty(downEvt, 'pointerId', { value: 1 });
      canvas.dispatchEvent(downEvt);

      // Simulate Excalidraw 0.18.0-next immediately resetting activeTool to selection on pointerdown
      activeType = 'selection';

      const moveEvt = new MouseEvent('pointermove', { bubbles: true, button: 0, clientX: 350, clientY: 220 });
      Object.defineProperty(moveEvt, 'pointerId', { value: 1 });
      canvas.dispatchEvent(moveEvt);

      const upEvt = new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 350, clientY: 220 });
      Object.defineProperty(upEvt, 'pointerId', { value: 1 });
      canvas.dispatchEvent(upEvt);

      expect(moveListener).not.toHaveBeenCalled();
      expect(seenUpCoords).toEqual({ x: 120, y: 200 });
    } finally {
      cleanup();
      window.removeEventListener('pointermove', moveListener);
    }
  });

  it('injects localized UI elements and updates language via applyLanguage', () => {
    applyLanguage('ja-JP');
    document.body.innerHTML = `
      <div class="App-toolbar">
        <div class="Stack_horizontal">
          <button data-testid="toolbar-selection"></button>
          <button data-testid="toolbar-freedraw"></button>
          <button data-testid="toolbar-arrow" class="ToolIcon--checked"></button>
          <button class="App-toolbar__extra-tools-trigger"></button>
        </div>
      </div>
      <div class="layer-ui__wrapper__top-right"></div>
      <div class="dropdown-menu-container">
        <button data-testid="image-export-button"></button>
      </div>
      <div class="dropdown-menu-container">
        <button data-testid="toolbar-image"></button>
      </div>
      <ul class="context-menu">
        <hr />
        <li data-testid="cut"><button>Cut</button></li>
        <hr />
        <hr />
        <li data-testid="wrapSelectionInFrame"><button>Frame</button></li>
        <hr />
      </ul>
    `;

    expect(syncToolbar()).toBe(true);
    expect(syncTopRightBar()).toBe(true);
    expect(syncMainMenu()).toBe(true);
    expect(syncExtraToolsMenu()).toBe(true);
    expect(syncContextMenu()).toBe(true);

    expect(document.querySelector('[data-exq-pen-toggle="1"]')).toBeTruthy();
    expect(document.querySelector('[data-exq-bg-toggle="1"]')).toBeTruthy();
    expect(document.querySelector('[data-exq-draw-assist="1"]')?.classList.contains('exq-acc-open')).toBe(false);
    expect(document.querySelector('[data-exq-quick-settings="1"]')?.classList.contains('exq-acc-open')).toBe(false);
    expect(document.querySelector('[data-exq-proxy="toolbar-lock"]')?.getAttribute('title')).toBe('作成後もツールを連続使用 (Q)');
    expect(document.querySelector('[data-exq-lang-select="1"]')).toBeNull();
    expect(document.querySelector('[data-exq-cjk-btn]')).toBeNull();
    expect(document.querySelector('.exq-toolbar-reset')?.getAttribute('title')).toBe('キャンバスをクリア');
    expect(document.querySelector('[data-exq-main-action="copy"]')?.textContent).toBe('クリップボードにコピー');

    applyLanguage('en');
    syncToolbar();
    syncMainMenu();
    expect(document.querySelector('.exq-toolbar-reset')?.getAttribute('title')).toBe('Clear canvas');
    expect(document.querySelector('[data-exq-main-action="copy"]')?.textContent).toBe('Copy to clipboard');
  });

  it('enriches selected context menu with quick bar, 4-button layer bar, and row icons while keeping empty canvas compact', () => {
    applyLanguage('ja-JP');
    const cutClick = vi.fn();
    const toFrontClick = vi.fn();
    document.body.innerHTML = `
      <ul class="context-menu">
        <li data-testid="cut"><button class="context-menu-item">切り取り</button></li>
        <li data-testid="copy"><button class="context-menu-item">コピー</button></li>
        <li data-testid="paste"><button class="context-menu-item">貼り付け</button></li>
        <li data-testid="sendToBack"><button class="context-menu-item">最背面</button></li>
        <li data-testid="sendBackward"><button class="context-menu-item">背面</button></li>
        <li data-testid="bringForward"><button class="context-menu-item">前面</button></li>
        <li data-testid="bringToFront"><button class="context-menu-item">最前面</button></li>
        <li data-testid="cropEditor"><button class="context-menu-item">画像を切り抜き</button></li>
        <li data-testid="duplicateSelection"><button class="context-menu-item">複製</button></li>
        <li data-testid="deleteSelectedElements"><button class="context-menu-item">削除</button></li>
      </ul>
    `;
    document.querySelector('li[data-testid="cut"] button')?.addEventListener('click', cutClick);
    document.querySelector('li[data-testid="bringToFront"] button')?.addEventListener('click', toFrontClick);

    expect(syncContextMenu()).toBe(true);
    expect(document.querySelector('.context-menu')?.classList.contains('exq-ctx-rich')).toBe(true);
    expect(document.querySelectorAll('[data-exq-ctx-quick]').length).toBe(5);
    expect(document.querySelectorAll('[data-exq-ctx-layer]').length).toBe(4);
    expect(document.querySelector('li[data-testid="cut"]')?.classList.contains('exq-ctx-proxied-hidden')).toBe(true);
    expect(document.querySelector('li[data-testid="cropEditor"] .exq-ctx-item-icon svg')).toBeTruthy();

    document.querySelector<HTMLButtonElement>('[data-exq-ctx-quick="cut"]')?.click();
    document.querySelector<HTMLButtonElement>('[data-exq-ctx-layer="bringToFront"]')?.click();
    expect(cutClick).toHaveBeenCalledTimes(1);
    expect(toFrontClick).toHaveBeenCalledTimes(1);

    // Empty canvas menu: no quick bar or layer bar, only decorated rows
    document.body.innerHTML = `
      <ul class="context-menu">
        <li data-testid="paste"><button class="context-menu-item">貼り付け</button></li>
        <li data-testid="selectAll"><button class="context-menu-item">すべて選択</button></li>
      </ul>
    `;
    expect(syncContextMenu()).toBe(true);
    expect(document.querySelector('[data-exq-ctx-quick-bar]')).toBeNull();
    expect(document.querySelector('[data-exq-ctx-layer-bar]')).toBeNull();
    expect(document.querySelector('li[data-testid="paste"] .exq-ctx-item-icon svg')).toBeTruthy();
    expect(document.querySelector('li[data-testid="selectAll"] .exq-ctx-item-icon svg')).toBeTruthy();
  });
});
