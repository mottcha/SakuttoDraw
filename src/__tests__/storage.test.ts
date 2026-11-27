import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { IDBFactory } from 'fake-indexeddb';
import { runInstantResetWithApi } from '../annotator/apiActions';
import {
  clearIndexedDbFiles,
  FILES_DB_NAME,
  FILES_DB_VERSION,
  FILES_STORE_NAME,
  loadFilesFromIndexedDb,
  saveFilesToIndexedDb,
} from '../services/filesDb';
import {
  bootstrapCleanCanvas,
  cancelPendingScenePersist,
  DEFAULT_PEN_COLOR,
  flushPendingScenePersist,
  loadInitialSceneData,
  loadPrefs,
  LS_ELEMENTS_KEY,
  LS_PREFS_KEY,
  LS_STATE_KEY,
  normalizeFormat,
  normalizeScale,
  resetPersistedFilesCache,
  resolveTheme,
  savePrefs,
  scheduleScenePersist,
  shouldSkipAutoReset,
} from '../services/storageBridge';

describe('storageBridge, filesDb & debounced persistence race prevention', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPersistedFilesCache();
    vi.useRealTimers();
  });

  afterEach(() => {
    cancelPendingScenePersist();
    resetPersistedFilesCache();
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

  it('bootstraps clean canvas and applies default pen color, padding=false, and overlap selection', () => {
    localStorage.setItem(LS_ELEMENTS_KEY, JSON.stringify([{ id: 'old-el' }]));
    const res = bootstrapCleanCanvas({ storage: localStorage, hash: '' });
    expect(res.skipped).toBe(false);
    expect(res.autoReset).toBe(true);
    expect(res.prefs.boxSelectionMode).toBe('overlap');
    expect(res.prefs.inputDevice).toBe('trackpad');
    expect(res.prefs.exportOpts.padding).toBe(false);
    expect(localStorage.getItem(LS_ELEMENTS_KEY)).toBe('[]');
    const st = JSON.parse(localStorage.getItem(LS_STATE_KEY) || '{}');
    expect(st.currentItemStrokeColor).toBe(DEFAULT_PEN_COLOR);
    expect(st.boxSelectionMode).toBe('overlap');
    expect(st.inputDevice).toBe('trackpad');
  });

  it('migrates legacy defaultPink: false preference and handles corrupted storage payloads gracefully', () => {
    localStorage.setItem(LS_PREFS_KEY, JSON.stringify({ quickOpts: { defaultPink: false } }));
    const prefs = loadPrefs(localStorage);
    expect(prefs.quickOpts.defaultPenColor).toBe('#1e1e1e');
    expect(prefs.exportOpts.padding).toBe(false);

    localStorage.setItem(LS_PREFS_KEY, '[]');
    expect(loadPrefs(localStorage).exportOpts.padding).toBe(false);

    localStorage.setItem(LS_PREFS_KEY, '{broken-json');
    expect(loadPrefs(localStorage).quickOpts.defaultPenColor).toBe(DEFAULT_PEN_COLOR);
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

    vi.advanceTimersByTime(100);
    await runInstantResetWithApi(mockApi, loadPrefs(localStorage), { storage: localStorage });

    vi.advanceTimersByTime(300);
    expect(JSON.parse(localStorage.getItem(LS_ELEMENTS_KEY) || '[]')).toEqual([]);
  });

  it('auto-heals broken v1 IndexedDB without files-store and preserves images across reload when autoResetOnOpen is OFF', async () => {
    const fakeIdb = new IDBFactory();

    await new Promise<void>((resolve, reject) => {
      const req = fakeIdb.open(FILES_DB_NAME, 1);
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });

    expect(await clearIndexedDbFiles(fakeIdb)).toBe(true);

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
    flushPendingScenePersist();
    expect(await saveFilesToIndexedDb({ 'file-abc': imgFile }, fakeIdb)).toBe(true);

    const boot = bootstrapCleanCanvas({ storage: localStorage, hash: '', idb: fakeIdb });
    expect(boot.autoReset).toBe(false);

    const initial = await loadInitialSceneData(localStorage, fakeIdb);
    expect(initial.elements?.length).toBe(1);
    expect(initial.files?.['file-abc']).toBeTruthy();
    expect(initial.files?.['file-abc']?.dataURL).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('resolves cleanly without hanging when an IndexedDB transaction aborts', async () => {
    const close = vi.fn();
    const fakeTx = {
      oncomplete: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onabort: null as (() => void) | null,
      objectStore: () => ({
        clear: () => {
          queueMicrotask(() => fakeTx.onabort?.());
        },
        put: () => {
          queueMicrotask(() => fakeTx.onabort?.());
        },
        getAll: () => {
          queueMicrotask(() => fakeTx.onabort?.());
          return { onsuccess: null, onerror: null };
        },
      }),
    };
    const fakeDb = {
      objectStoreNames: { contains: (name: string) => name === FILES_STORE_NAME },
      transaction: () => fakeTx,
      close,
    };
    const fakeIdb = {
      open: () => {
        const req = {
          result: fakeDb,
          onupgradeneeded: null as (() => void) | null,
          onsuccess: null as (() => void) | null,
          onerror: null as (() => void) | null,
        };
        queueMicrotask(() => req.onsuccess?.());
        return req;
      },
    } as unknown as IDBFactory;

    expect(FILES_DB_VERSION).toBe(2);
    await expect(clearIndexedDbFiles(fakeIdb)).resolves.toBe(false);
    await expect(loadFilesFromIndexedDb(fakeIdb)).resolves.toEqual({});
    await expect(
      saveFilesToIndexedDb({ f1: { id: 'f1', dataURL: 'data:', mimeType: 'image/png', created: 1 } as never }, fakeIdb),
    ).resolves.toBe(false);
    expect(close).toHaveBeenCalledTimes(3);
  });

  it('keeps default themeMode as light and resolves light, dark, and system themes', () => {
    expect(loadPrefs(localStorage).themeMode).toBe('light');
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');

    const origMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockReturnValue({ matches: true }),
      configurable: true,
      writable: true,
    });
    try {
      expect(resolveTheme('system')).toBe('dark');
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        value: origMatchMedia,
        configurable: true,
        writable: true,
      });
    }
  });
});
