import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import {
  bootstrapCleanCanvas,
  cancelPendingScenePersist,
  clearIndexedDbFiles,
  DEFAULT_PINK,
  FILES_DB_NAME,
  flushPendingScenePersist,
  loadInitialSceneData,
  LS_DESKTOP_UI_MODE_KEY,
  LS_ELEMENTS_KEY,
  LS_PREFS_KEY,
  LS_STATE_KEY,
  loadPrefs,
  normalizeFormat,
  normalizeScale,
  resolveDesktopUIMode,
  resolvePreferJpFont,
  sakuttoGetFormFactor,
  saveFilesToIndexedDb,
  savePrefs,
  scheduleScenePersist,
  shouldSkipAutoReset,
  syncDesktopUIMode,
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
  applyJapaneseGlyphOverride,
  jpFontManifest,
  parseUnicodeRangeToSet,
  rangesIntersect,
  resetJpGlyphOverrideStateForTests,
  subtractUnicodeRange,
  XIAOLAI_FALLBACK_FAMILY_ID,
} from '../annotator/jpGlyphOverride';
import {
  applyLanguage,
  applyPreferJpFont,
  attachExcalidrawAPI,
  clampContextMenuPopover,
  installTextAutoResizeGuard,
  runtime,
  syncContextMenu,
  syncExtraToolsMenu,
  syncMainMenu,
  syncMobileShapeActions,
  syncMobileToolbar,
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
      expect(m.prefPreferJpFont.length).toBeGreaterThan(0);
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

    // Deleting Japanese (SetoJP) removes only SetoJP files and never touches Chinese Xiaolai files
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

    // When modernContextMenu is OFF, skip rich redesign and keep native layout
    runtime.prefs.quickOpts.modernContextMenu = false;
    document.body.innerHTML = `
      <ul class="context-menu">
        <li data-testid="cut"><button class="context-menu-item">切り取り</button></li>
        <li data-testid="cropEditor"><button class="context-menu-item">画像を切り抜き</button></li>
      </ul>
    `;
    expect(syncContextMenu()).toBe(true);
    expect(document.querySelector('.context-menu')?.classList.contains('exq-ctx-rich')).toBe(false);
    expect(document.querySelector('[data-exq-ctx-quick-bar]')).toBeNull();
    expect(document.querySelector('[data-exq-ctx-layer-bar]')).toBeNull();
    expect(document.querySelector('.exq-ctx-item-icon')).toBeNull();
  });

  it('renders icons for wrapTextInContainer, all visible context menu items, and switches lock/unlock icon accurately', () => {
    applyLanguage('ja-JP');
    runtime.prefs.quickOpts.modernContextMenu = true;

    const visibleTestIds = [
      'selectAllElementsInFrame',
      'removeAllElementsFromFrame',
      'cropEditor',
      'group',
      'autoResize',
      'unbindText',
      'bindText',
      'wrapTextInContainer',
      'ungroup',
      'flipHorizontal',
      'flipVertical',
      'toggleLinearEditor',
      'hyperlink',
      'copyElementLink',
      'toggleElementLock',
      'unlockAllElements',
      'selectAll',
    ];

    attachExcalidrawAPI({
      getAppState: () => ({ selectedElementIds: { 'el-1': true } }),
      getSceneElements: () => [{ id: 'el-1', locked: false }],
    } as unknown as ExcalidrawImperativeAPI);

    document.body.innerHTML = `
      <ul class="context-menu">
        <li data-testid="cut"><button class="context-menu-item">切り取り</button></li>
        <li data-testid="deleteSelectedElements"><button class="context-menu-item">削除</button></li>
        ${visibleTestIds.map((tid) => `<li data-testid="${tid}"><button class="context-menu-item">${tid}</button></li>`).join('\n')}
      </ul>
    `;

    expect(syncContextMenu()).toBe(true);
    for (const tid of visibleTestIds) {
      const svg = document.querySelector(`li[data-testid="${tid}"] .exq-ctx-item-icon svg`);
      expect(svg, `missing SVG icon for ${tid}`).toBeTruthy();
      expect(svg?.children.length, `empty SVG icon for ${tid}`).toBeGreaterThan(0);
    }

    const lockedIconHtml = document.querySelector('li[data-testid="toggleElementLock"] .exq-ctx-item-icon svg')?.innerHTML;

    // When selected element is locked, toggleElementLock must display the unlock icon even with cut/delete present
    attachExcalidrawAPI({
      getAppState: () => ({ selectedElementIds: { 'el-1': true } }),
      getSceneElements: () => [{ id: 'el-1', locked: true }],
    } as unknown as ExcalidrawImperativeAPI);

    document.body.innerHTML = `
      <ul class="context-menu">
        <li data-testid="cut"><button class="context-menu-item">切り取り</button></li>
        <li data-testid="deleteSelectedElements"><button class="context-menu-item">削除</button></li>
        <li data-testid="toggleElementLock"><button class="context-menu-item">ロック解除</button></li>
      </ul>
    `;

    expect(syncContextMenu()).toBe(true);
    const unlockedIconHtml = document.querySelector('li[data-testid="toggleElementLock"] .exq-ctx-item-icon svg')?.innerHTML;
    expect(unlockedIconHtml).toBeTruthy();
    expect(unlockedIconHtml).not.toBe(lockedIconHtml);
  });

  it('auto-heals broken v1 IndexedDB without files-store and preserves images across reload when autoResetOnOpen is OFF', async () => {
    const fakeIdb = new IDBFactory();

    // Simulate the legacy bug: version 1 DB created without files-store
    await new Promise<void>((resolve, reject) => {
      const req = fakeIdb.open(FILES_DB_NAME, 1);
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });

    // Clear on first open (autoResetOnOpen=true) must upgrade to v2 and create files-store
    expect(await clearIndexedDbFiles(fakeIdb)).toBe(true);

    // User turns off autoResetOnOpen, pastes an image, and reloads immediately
    const prefs = loadPrefs(localStorage);
    prefs.quickOpts.autoResetOnOpen = false;
    savePrefs(prefs, localStorage);

    const imgElement = { id: 'img-1', type: 'image', fileId: 'file-abc', isDeleted: false } as never;
    const imgFile = {
      id: 'file-abc',
      dataURL: 'data:image/png;base64,iVBORw0KGgo=',
      mimeType: 'image/png',
      created: Date.now(),
    } as never;

    scheduleScenePersist([imgElement], { viewBackgroundColor: '#ffffff' }, { 'file-abc': imgFile }, {
      delayMs: 250,
      storage: localStorage,
      idb: fakeIdb,
    });
    // Flush on pagehide/beforeunload before 250ms expires
    flushPendingScenePersist();
    expect(await saveFilesToIndexedDb({ 'file-abc': imgFile }, fakeIdb)).toBe(true);

    // Simulate reload: bootstrapCleanCanvas + loadInitialSceneData
    const boot = bootstrapCleanCanvas({ storage: localStorage, hash: '', idb: fakeIdb });
    expect(boot.autoReset).toBe(false);

    const initial = await loadInitialSceneData(localStorage, fakeIdb);
    expect(initial.elements?.length).toBe(1);
    expect(initial.files?.['file-abc']).toBeTruthy();
    expect(initial.files?.['file-abc']?.dataURL).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('renders transparent background switch as OFF by default and toggles background=false when turned ON', () => {
    applyLanguage('ja-JP');
    document.body.innerHTML = `
      <div class="dropdown-menu-container">
        <button data-testid="image-export-button"></button>
      </div>
    `;
    expect(syncMainMenu()).toBe(true);
    const bgSwitch = document.querySelector<HTMLButtonElement>('[data-exq-exp-opt="background"]');
    expect(bgSwitch).toBeTruthy();
    // Default background=true (opaque) => transparent background switch is OFF
    expect(bgSwitch?.classList.contains('exq-on')).toBe(false);
    expect(bgSwitch?.getAttribute('aria-label')).toBe('背景の透明化');

    // Click row to turn transparent background ON => exportOpts.background becomes false
    bgSwitch?.parentElement?.click();
    expect(runtime.prefs.exportOpts.background).toBe(false);
    expect(bgSwitch?.classList.contains('exq-on')).toBe(true);
  });

  it('injects top-right Copy/Save bar and unified extra tools menu in mobile layout', () => {
    applyLanguage('ja-JP');
    document.body.innerHTML = `
      <div class="excalidraw-ui-top-right">
        <button class="default-sidebar-trigger" data-testid="sidebar-trigger"></button>
      </div>
      <div class="dropdown-menu-container">
        <button data-testid="toolbar-frame"></button>
        <button data-testid="toolbar-embeddable"></button>
        <button data-testid="toolbar-autoshape"></button>
        <button data-testid="toolbar-laser"></button>
        <button data-testid="toolbar-bucketfill"></button>
      </div>
    `;

    expect(syncTopRightBar()).toBe(true);
    expect(syncExtraToolsMenu()).toBe(true);
    expect(document.querySelector('.excalidraw-ui-top-right [data-exq-right-bar="1"]')).toBeTruthy();
    expect(document.querySelector('[data-exq-t3-row="1"]')).toBeTruthy();
    expect(document.querySelector('[data-exq-draw-assist="1"]')).toBeTruthy();
    expect(document.querySelector('[data-exq-quick-settings="1"]')).toBeTruthy();
  });

  it('resolves desktopUIMode cleanly for PC mini-windows and persists stylesPanelMode preference', () => {
    // Phone breakpoint preserved; non-phone viewports stay desktop (no tablet side effects)
    expect(sakuttoGetFormFactor(390, 844)).toBe('phone');
    expect(sakuttoGetFormFactor(750, 480)).toBe('phone');
    expect(sakuttoGetFormFactor(750, 520)).toBe('desktop');
    expect(sakuttoGetFormFactor(800, 650)).toBe('desktop');
    expect(sakuttoGetFormFactor(1440, 900)).toBe('desktop');

    // Auto mode uses compact on PC mini-windows (including 500..599px height dead zone) and full on wide desktop
    expect(resolveDesktopUIMode('auto', 750, 520)).toBe('compact');
    expect(resolveDesktopUIMode('auto', 800, 650)).toBe('compact');
    expect(resolveDesktopUIMode('auto', 1200, 600)).toBe('compact');
    expect(resolveDesktopUIMode('auto', 1440, 900)).toBe('full');

    // Explicit compact / full overrides ignore viewport dimensions
    expect(resolveDesktopUIMode('compact', 1440, 900)).toBe('compact');
    expect(resolveDesktopUIMode('full', 750, 520)).toBe('full');

    // syncDesktopUIMode updates localStorage and dispatches resize only when requested
    const resizeSpy = vi.fn();
    window.addEventListener('resize', resizeSpy);
    expect(syncDesktopUIMode('auto', { width: 750, height: 520, storage: localStorage })).toBe('compact');
    expect(localStorage.getItem(LS_DESKTOP_UI_MODE_KEY)).toBe('compact');
    expect(resizeSpy).toHaveBeenCalledTimes(0);

    expect(
      syncDesktopUIMode('full', { width: 750, height: 520, storage: localStorage, triggerResize: true }),
    ).toBe('full');
    expect(localStorage.getItem(LS_DESKTOP_UI_MODE_KEY)).toBe('full');
    expect(resizeSpy).toHaveBeenCalledTimes(1);
    window.removeEventListener('resize', resizeSpy);

    // Persists stylesPanelMode across loadPrefs/savePrefs
    const prefs = loadPrefs(localStorage);
    expect(prefs.stylesPanelMode).toBe('auto');
    prefs.stylesPanelMode = 'compact';
    savePrefs(prefs, localStorage);
    expect(loadPrefs(localStorage).stylesPanelMode).toBe('compact');
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

    // Explicit overrides win regardless of UI language
    expect(resolvePreferJpFont({ lang: 'en', preferJpFont: true })).toBe(true);
    expect(resolvePreferJpFont({ lang: 'ja-JP', preferJpFont: false })).toBe(false);

    // Persists through savePrefs / loadPrefs via applyPreferJpFont
    applyLanguage('en');
    expect(resolvePreferJpFont(runtime.prefs)).toBe(false);
    applyPreferJpFont(true);
    expect(loadPrefs(localStorage).preferJpFont).toBe(true);
    expect(resolvePreferJpFont(loadPrefs(localStorage))).toBe(true);
  });

  it('subtracts excluded codepoints accurately from CSS unicode-range descriptors', () => {
    const exclude = new Set([0x7f6e, 0x76f4, 0x4e01]); // 置, 直, 丁
    expect(subtractUnicodeRange('U+4e00-4e03,U+7f6e,U+76f4', exclude)).toBe('U+4e00,U+4e02-4e03');
    expect(subtractUnicodeRange('U+7f6e,U+76f4', exclude)).toBeNull();
    expect(subtractUnicodeRange('U+4e60', exclude)).toBe('U+4e60');
  });

  it('produces strictly disjoint unicode-ranges with zero overlap and restores original Xiaolai on disable', () => {
    const mockXiaolaiFaces = [
      {
        urls: [new URL('http://localhost/fonts/Xiaolai/chunk-mixed.woff2')],
        fontFace: { family: 'Xiaolai', unicodeRange: 'U+4e60,U+7f6e,U+76f4,U+8bbe' }, // 习, 置, 直, 设
      },
      {
        urls: [new URL('http://localhost/fonts/Xiaolai/chunk-jp-only.woff2')],
        fontFace: { family: 'Xiaolai', unicodeRange: 'U+3042,U+30a2' }, // あ, ア
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
    // chunk-jp-only was completely removed; chunk-mixed was trimmed to 习(U+4e60) and 设(U+8bbe)
    expect(onRes.xiaolaiFaceCount).toBe(1);

    const activeFaces = mockRegistered.get(XIAOLAI_FALLBACK_FAMILY_ID)!.fontFaces as Array<{
      urls: Array<URL | string>;
      fontFace: { family: string; unicodeRange: string };
    }>;

    // Verify 置 and 直 match ONLY a SetoJP chunk, never a Xiaolai chunk
    const matchingOku = activeFaces.filter((f) => matchesUnicodeRange(f.fontFace.unicodeRange, '置'));
    const matchingChoku = activeFaces.filter((f) => matchesUnicodeRange(f.fontFace.unicodeRange, '直'));
    expect(matchingOku.length).toBe(1);
    expect(String(matchingOku[0].urls[0])).toContain('/fonts/SetoJP/');
    expect(matchingChoku.length).toBe(1);
    expect(String(matchingChoku[0].urls[0])).toContain('/fonts/SetoJP/');

    // Verify Simplified-Chinese-only 设(U+8BBE) still matches the trimmed Xiaolai chunk
    const matchingSc = activeFaces.filter((f) => matchesUnicodeRange(f.fontFace.unicodeRange, '设'));
    expect(matchingSc.length).toBe(1);
    expect(String(matchingSc[0].urls[0])).toContain('/fonts/Xiaolai/');

    // Verify zero overlap across all active faces
    const seenCps = new Set<number>();
    for (const face of activeFaces) {
      const cps = parseUnicodeRangeToSet(face.fontFace.unicodeRange);
      for (const cp of cps) {
        expect(seenCps.has(cp)).toBe(false);
        seenCps.add(cp);
      }
    }
    expect(rangesIntersect(activeFaces[0].fontFace.unicodeRange, matchingOku[0].fontFace.unicodeRange)).toBe(false);

    // Disable restores exact original snapshot
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
        5, // FONT_FAMILY.Excalifont
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
              fontFace: { family: 'Xiaolai', unicodeRange: 'U+4e60,U+7f6e,U+8a2d' }, // 习, 置, 設
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

describe('mobile UI unification (A-2 toolbar, persistent Duplicate/Delete, labeled B-2 context menu, touch text fix)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    attachExcalidrawAPI(null);
    runtime.prefs = loadPrefs(localStorage);
    runtime.lastMobileShapeOther = 'ellipse';
  });

  it('mounts A-2 7-slot mobile toolbar with dedicated rectangle, upward 4-shape picker, fallback text, and recovers Image/Frame in Extra Tools', () => {
    applyLanguage('ja-JP');
    const setActiveTool = vi.fn();
    let activeType = 'selection';
    attachExcalidrawAPI({
      getAppState: () => ({ activeTool: { type: activeType, locked: false } }),
      setActiveTool: (tool: { type: string }) => {
        activeType = tool.type;
        setActiveTool(tool);
      },
    } as unknown as ExcalidrawImperativeAPI);

    // Narrow <316px mobile toolbar (native toolbar-text absent)
    document.body.innerHTML = `
      <div class="excalidraw excalidraw--mobile">
        <div class="App-toolbar">
          <div class="mobile-toolbar">
            <button data-testid="toolbar-selection"></button>
            <button data-testid="toolbar-freedraw"></button>
            <button data-testid="toolbar-rectangle"></button>
            <button data-testid="toolbar-arrow"></button>
            <button data-testid="toolbar-hand"></button>
            <button class="App-toolbar__extra-tools-trigger"></button>
          </div>
        </div>
        <div class="dropdown-menu-container">
          <button data-testid="toolbar-laser"></button>
        </div>
      </div>
    `;

    expect(syncMobileToolbar()).toBe(true);
    const fallbackText = document.querySelector<HTMLButtonElement>('[data-exq-mobile-tool="text"]');
    const rectBtn = document.querySelector<HTMLButtonElement>('[data-exq-mobile-tool="rectangle"]');
    const shapeGroup = document.querySelector<HTMLElement>('[data-exq-mobile-shape-group="1"]');
    expect(fallbackText).toBeTruthy();
    expect(fallbackText?.style.display).toBe('');
    expect(rectBtn).toBeTruthy();
    expect(shapeGroup?.querySelectorAll('[data-exq-mobile-shape]').length).toBe(4);

    // Selecting arrow inside upward shape group activates arrow and updates remembered icon
    const arrowBtn = shapeGroup?.querySelector<HTMLButtonElement>('[data-exq-mobile-shape="arrow"]');
    arrowBtn?.click();
    expect(setActiveTool).toHaveBeenCalledWith({ type: 'arrow' });
    expect(runtime.lastMobileShapeOther).toBe('arrow');

    // Selecting dedicated rectangle button activates rectangle
    rectBtn?.click();
    expect(setActiveTool).toHaveBeenCalledWith({ type: 'rectangle' });

    // Once native toolbar-text exists (>=316px), fallback text button hides automatically
    const nativeText = document.createElement('button');
    nativeText.setAttribute('data-testid', 'toolbar-text');
    document.querySelector('.mobile-toolbar')?.append(nativeText);
    syncMobileToolbar();
    expect(fallbackText?.style.display).toBe('none');

    // Extra Tools menu recovers missing Image and Frame items on mobile
    expect(syncExtraToolsMenu()).toBe(true);
    expect(document.querySelector('[data-exq-extra-tool="image"]')).toBeTruthy();
    expect(document.querySelector('[data-exq-extra-tool="frame"]')).toBeTruthy();
  });

  it('injects persistent Duplicate and Delete buttons in MobileShapeActions based on native count and selection state', () => {
    applyLanguage('ja-JP');
    let selectedIds: Record<string, boolean> = { el1: true };
    attachExcalidrawAPI({
      getAppState: () => ({ selectedElementIds: selectedIds, viewModeEnabled: false }),
    } as unknown as ExcalidrawImperativeAPI);

    // Smartphone width (<374px): only 2 native right items (Undo / Redo)
    document.body.innerHTML = `
      <div class="mobile-shape-actions">
        <div class="left-styles"></div>
        <div class="right-actions">
          <div class="compact-action-item"><button>Undo</button></div>
          <div class="compact-action-item"><button>Redo</button></div>
        </div>
      </div>
    `;

    expect(syncMobileShapeActions()).toBe(true);
    const dupBtn = document.querySelector<HTMLButtonElement>('[data-exq-mobile-action="duplicate"]');
    const delBtn = document.querySelector<HTMLButtonElement>('[data-exq-mobile-action="delete"]');
    expect(dupBtn).toBeTruthy();
    expect(delBtn).toBeTruthy();
    expect(dupBtn?.parentElement?.style.display).toBe('');
    expect(delBtn?.parentElement?.style.display).toBe('');
    expect(dupBtn?.disabled).toBe(false);
    expect(delBtn?.disabled).toBe(false);

    // Clicking Duplicate / Delete dispatches Ctrl/Cmd+D and Delete keydown
    const keys: string[] = [];
    const onKey = (e: KeyboardEvent) => keys.push(e.key);
    document.addEventListener('keydown', onKey);
    try {
      dupBtn?.click();
      delBtn?.click();
      expect(keys).toEqual(['d', 'Delete']);
    } finally {
      document.removeEventListener('keydown', onKey);
    }

    // Empty selection disables both buttons
    selectedIds = {};
    syncMobileShapeActions();
    expect(dupBtn?.disabled).toBe(true);
    expect(delBtn?.disabled).toBe(true);

    // Medium width (374..411px): 3 native items (Undo, Redo, native Delete) => show Duplicate only, hide injected Delete
    const nativeDel = document.createElement('div');
    nativeDel.className = 'compact-action-item';
    document.querySelector('.right-actions')?.append(nativeDel);
    syncMobileShapeActions();
    expect(dupBtn?.parentElement?.style.display).toBe('');
    expect(delBtn?.parentElement?.style.display).toBe('none');
    expect(dupBtn?.parentElement?.nextElementSibling).toBe(nativeDel);

    // Wide PC mini-window (>=412px): 4 native items => hide both injected buttons
    const nativeDup = document.createElement('div');
    nativeDup.className = 'compact-action-item';
    document.querySelector('.right-actions')?.append(nativeDup);
    syncMobileShapeActions();
    expect(dupBtn?.parentElement?.style.display).toBe('none');
    expect(delBtn?.parentElement?.style.display).toBe('none');
  });

  it('renders Desktop-matched labeled B-2 context menu on mobile editable selections, skips B-2 on empty canvas, and clamps popover in viewport', () => {
    applyLanguage('ja-JP');
    const origW = window.innerWidth;
    const origH = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { value: 360, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 640, configurable: true });

    try {
      document.body.innerHTML = `
        <div class="excalidraw excalidraw--mobile">
          <div class="popover context-menu-popover" style="left: 170px; top: 140px;">
            <ul class="context-menu">
              <li data-testid="cut"><button class="context-menu-item">切り取り</button></li>
              <li data-testid="copy"><button class="context-menu-item">コピー</button></li>
              <li data-testid="paste"><button class="context-menu-item">貼り付け</button></li>
              <li data-testid="duplicateSelection"><button class="context-menu-item">複製</button></li>
              <li data-testid="deleteSelectedElements"><button class="context-menu-item">削除</button></li>
              <li data-testid="flipHorizontal"><button class="context-menu-item">水平方向に反転</button></li>
            </ul>
          </div>
        </div>
      `;

      const popover = document.querySelector<HTMLElement>('.context-menu-popover')!;
      popover.getBoundingClientRect = () =>
        ({
          left: 170,
          top: 140,
          width: 296,
          height: 54,
          right: 466,
          bottom: 194,
          x: 170,
          y: 140,
          toJSON: () => ({}),
        }) as DOMRect;

      expect(syncContextMenu()).toBe(true);
      const ul = document.querySelector('.context-menu')!;
      expect(ul.classList.contains('exq-ctx-mobile-b2')).toBe(true);
      expect(ul.classList.contains('exq-ctx-b2-expanded')).toBe(false);

      const moreBtn = ul.querySelector<HTMLButtonElement>('[data-exq-ctx-more="1"]');
      expect(moreBtn).toBeTruthy();
      expect(moreBtn?.textContent).toBe('その他');
      expect(moreBtn?.getAttribute('aria-expanded')).toBe('false');

      // Popover was clamped so left + 296 <= 360 - 8 => left === 56
      expect(popover.style.left).toBe('56px');

      // Clicking "その他" expands layer bar & native items and re-clamps
      moreBtn?.click();
      expect(ul.classList.contains('exq-ctx-b2-expanded')).toBe(true);
      expect(moreBtn?.getAttribute('aria-expanded')).toBe('true');

      // Non-editable empty canvas on mobile: no B-2 collapse bar, renders compact card directly
      document.body.innerHTML = `
        <div class="excalidraw excalidraw--mobile">
          <div class="popover context-menu-popover" style="left: 200px; top: 100px;">
            <ul class="context-menu">
              <li data-testid="paste"><button class="context-menu-item">貼り付け</button></li>
              <li data-testid="selectAll"><button class="context-menu-item">すべて選択</button></li>
            </ul>
          </div>
        </div>
      `;
      expect(syncContextMenu()).toBe(true);
      const canvasUl = document.querySelector('.context-menu')!;
      expect(canvasUl.classList.contains('exq-ctx-mobile-b2')).toBe(false);
      expect(canvasUl.querySelector('[data-exq-ctx-more="1"]')).toBeNull();
      clampContextMenuPopover(canvasUl);
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: origW, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: origH, configurable: true });
    }
  });

  it('skips pointermove blocking on touch text input and synchronously focuses textarea.excalidraw-wysiwyg on pointerup', () => {
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
    let wysiwyg: HTMLTextAreaElement | null = null;

    // Simulate Excalidraw registering its window pointerup handler during canvas pointerdown
    const onCanvasPointerDown = () => {
      activeType = 'selection';
      const excalidrawUp = (e: Event) => {
        window.removeEventListener('pointerup', excalidrawUp);
        const pe = e as PointerEvent;
        seenUpCoords = { x: pe.clientX, y: pe.clientY };
        wysiwyg = document.createElement('textarea');
        wysiwyg.className = 'excalidraw-wysiwyg';
        document.body.append(wysiwyg);
      };
      window.addEventListener('pointerup', excalidrawUp);
    };
    canvas.addEventListener('pointerdown', onCanvasPointerDown);
    window.addEventListener('pointermove', moveListener);

    try {
      const downEvt = new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 80, clientY: 140 });
      Object.defineProperty(downEvt, 'pointerId', { value: 7 });
      Object.defineProperty(downEvt, 'pointerType', { value: 'touch' });
      canvas.dispatchEvent(downEvt);

      const moveEvt = new MouseEvent('pointermove', { bubbles: true, button: 0, clientX: 110, clientY: 145 });
      Object.defineProperty(moveEvt, 'pointerId', { value: 7 });
      Object.defineProperty(moveEvt, 'pointerType', { value: 'touch' });
      canvas.dispatchEvent(moveEvt);

      const upEvt = new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 110, clientY: 145 });
      Object.defineProperty(upEvt, 'pointerId', { value: 7 });
      Object.defineProperty(upEvt, 'pointerType', { value: 'touch' });
      canvas.dispatchEvent(upEvt);

      // Touch pointermove must NOT be swallowed and coordinates must NOT be rewritten
      expect(moveListener).toHaveBeenCalledTimes(1);
      expect(seenUpCoords).toEqual({ x: 110, y: 145 });
      // Synchronous focus assist must focus the mounted WYSIWYG textarea immediately
      expect(wysiwyg).toBeTruthy();
      expect(document.activeElement).toBe(wysiwyg);
    } finally {
      cleanup();
      canvas.removeEventListener('pointerdown', onCanvasPointerDown);
      window.removeEventListener('pointermove', moveListener);
    }
  });
});


