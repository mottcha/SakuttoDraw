import type { BinaryFileData, BinaryFiles, ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type {
  BoxSelectionPref,
  ExportFormat,
  ExportScale,
  InputDevicePref,
  Prefs,
  StylesPanelPref,
  ThemeMode,
} from '../types/annotator';
import { detectBrowserLang, normalizeAppLang } from '../i18n/messages';

export const DEFAULT_PINK = '#c2255c';
export const DEFAULT_PEN_COLOR = DEFAULT_PINK;
export const PEN_COLOR_SWATCHES = ['#c2255c', '#1e1e1e', '#e03131', '#1971c2', '#2f9e44', '#f08c00'] as const;
export const LS_ELEMENTS_KEY = 'excalidraw';
export const LS_STATE_KEY = 'excalidraw-state';
export const LS_PREFS_KEY = 'exq-annotator-prefs';
export const LS_DESKTOP_UI_MODE_KEY = 'excalidraw.desktopUIMode';
export const FILES_DB_NAME = 'files-db';
export const FILES_STORE_NAME = 'files-store';

export const DEFAULT_PREFS: Prefs = {
  lang: 'en',
  themeMode: 'light',
  boxSelectionMode: 'overlap',
  inputDevice: 'trackpad',
  stylesPanelMode: 'auto',
  preferJpFont: null,
  exportOpts: {
    onlySelected: true,
    background: true,
    darkMode: false,
    embedScene: false,
    format: 'png',
    scale: 1,
  },
  quickOpts: {
    autoResetOnOpen: true,
    defaultPenColor: DEFAULT_PEN_COLOR,
    textAutoResize: true,
    fastLoadSave: true,
    modernContextMenu: true,
  },
};

export const silently = <T>(fn: () => T): T | undefined => {
  try {
    return fn();
  } catch {
    return undefined;
  }
};

export function resolvePreferJpFont(prefs: Pick<Prefs, 'lang' | 'preferJpFont'>): boolean {
  if (typeof prefs.preferJpFont === 'boolean') {
    return prefs.preferJpFont;
  }
  return prefs.lang === 'ja-JP';
}

export function normalizeScale(value: unknown): ExportScale {
  const num = Number(value);
  return num === 2 || num === 3 ? num : 1;
}

export function normalizeFormat(value: unknown): ExportFormat {
  return String(value || '').toLowerCase() === 'svg' ? 'svg' : 'png';
}

export function normalizeThemeMode(value: unknown): ThemeMode {
  if (value === 'dark' || value === 'system') return value;
  return 'light';
}

export function normalizeBoxSelectionMode(value: unknown): BoxSelectionPref {
  return value === 'contain' ? 'contain' : 'overlap';
}

export function normalizeInputDevice(value: unknown): InputDevicePref {
  return value === 'mouse' ? 'mouse' : 'trackpad';
}

export function normalizeStylesPanelMode(value: unknown): StylesPanelPref {
  if (value === 'compact' || value === 'full') return value;
  return 'auto';
}

export function sakuttoGetFormFactor(width: number, height: number): 'phone' | 'desktop' {
  const isPhone = width <= 599 || (height < 500 && width < 1000);
  return isPhone ? 'phone' : 'desktop';
}

export function resolveDesktopUIMode(
  pref: StylesPanelPref,
  width: number,
  height: number,
): 'compact' | 'full' {
  if (pref === 'compact' || pref === 'full') return pref;
  return width <= 1180 || height <= 650 ? 'compact' : 'full';
}

export function syncDesktopUIMode(
  pref: StylesPanelPref,
  options: {
    width?: number;
    height?: number;
    storage?: Storage | null;
    triggerResize?: boolean;
  } = {},
): 'compact' | 'full' {
  const width = options.width ?? (typeof window !== 'undefined' ? window.innerWidth : 1440);
  const height = options.height ?? (typeof window !== 'undefined' ? window.innerHeight : 900);
  const storage =
    options.storage !== undefined
      ? options.storage
      : typeof localStorage !== 'undefined'
        ? localStorage
        : null;
  const resolved = resolveDesktopUIMode(pref, width, height);
  if (storage) {
    silently(() => {
      if (storage.getItem(LS_DESKTOP_UI_MODE_KEY) !== resolved) {
        storage.setItem(LS_DESKTOP_UI_MODE_KEY, resolved);
      }
    });
  }
  if (options.triggerResize && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('resize'));
  }
  return resolved;
}

export function normalizeHexColor(value: unknown, fallback = DEFAULT_PEN_COLOR): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed) || /^#[0-9a-f]{3}$/.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

export function resolveTheme(themeMode: ThemeMode): 'light' | 'dark' {
  if (themeMode === 'dark') return 'dark';
  if (themeMode === 'system') {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }
  return 'light';
}

export function shouldSkipAutoReset(hash: unknown): boolean {
  return /^#(json|room|addLibrary)=/i.test(String(hash || ''));
}

export function loadPrefs(
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
): Prefs {
  const base: Prefs = {
    lang: detectBrowserLang(),
    themeMode: DEFAULT_PREFS.themeMode,
    boxSelectionMode: DEFAULT_PREFS.boxSelectionMode,
    inputDevice: DEFAULT_PREFS.inputDevice,
    stylesPanelMode: DEFAULT_PREFS.stylesPanelMode,
    preferJpFont: DEFAULT_PREFS.preferJpFont,
    exportOpts: { ...DEFAULT_PREFS.exportOpts },
    quickOpts: { ...DEFAULT_PREFS.quickOpts },
  };
  if (!storage) return base;

  const rawState = silently(() => storage.getItem(LS_STATE_KEY));
  if (rawState) {
    const st = silently(() => JSON.parse(rawState));
    if (st && typeof st === 'object') {
      if (st.theme === 'dark' || st.theme === 'light') base.themeMode = st.theme;
      if (st.boxSelectionMode === 'contain' || st.boxSelectionMode === 'overlap') {
        base.boxSelectionMode = st.boxSelectionMode;
      }
      if (st.inputDevice === 'mouse' || st.inputDevice === 'trackpad') {
        base.inputDevice = st.inputDevice;
      }
      if (typeof st.exportBackground === 'boolean') base.exportOpts.background = st.exportBackground;
      if (typeof st.exportWithDarkMode === 'boolean') base.exportOpts.darkMode = st.exportWithDarkMode;
      if (typeof st.exportEmbedScene === 'boolean') base.exportOpts.embedScene = st.exportEmbedScene;
      base.exportOpts.scale = normalizeScale(st.exportScale);
    }
  }

  const rawPrefs = silently(() => storage.getItem(LS_PREFS_KEY));
  if (rawPrefs) {
    const saved = silently(() => JSON.parse(rawPrefs));
    if (saved && typeof saved === 'object') {
      const savedLang = normalizeAppLang(saved.lang);
      if (savedLang) {
        base.lang = savedLang;
      }
      if (saved.themeMode === 'light' || saved.themeMode === 'dark' || saved.themeMode === 'system') {
        base.themeMode = saved.themeMode;
      }
      if (saved.boxSelectionMode === 'contain' || saved.boxSelectionMode === 'overlap') {
        base.boxSelectionMode = saved.boxSelectionMode;
      }
      if (saved.inputDevice === 'mouse' || saved.inputDevice === 'trackpad') {
        base.inputDevice = saved.inputDevice;
      }
      if (saved.stylesPanelMode === 'auto' || saved.stylesPanelMode === 'compact' || saved.stylesPanelMode === 'full') {
        base.stylesPanelMode = saved.stylesPanelMode;
      }
      if (typeof saved.preferJpFont === 'boolean' || saved.preferJpFont === null) {
        base.preferJpFont = saved.preferJpFont;
      }
      if (saved.exportOpts && typeof saved.exportOpts === 'object') {
        for (const k of ['onlySelected', 'background', 'darkMode', 'embedScene'] as const) {
          if (typeof saved.exportOpts[k] === 'boolean') base.exportOpts[k] = saved.exportOpts[k];
        }
        if (saved.exportOpts.format != null) {
          base.exportOpts.format = normalizeFormat(saved.exportOpts.format);
        }
        if (saved.exportOpts.scale != null) {
          base.exportOpts.scale = normalizeScale(saved.exportOpts.scale);
        }
      }
      if (saved.quickOpts && typeof saved.quickOpts === 'object') {
        for (const k of ['autoResetOnOpen', 'textAutoResize', 'fastLoadSave', 'modernContextMenu'] as const) {
          if (typeof saved.quickOpts[k] === 'boolean') base.quickOpts[k] = saved.quickOpts[k];
        }
        if (typeof saved.quickOpts.defaultPenColor === 'string') {
          base.quickOpts.defaultPenColor = normalizeHexColor(
            saved.quickOpts.defaultPenColor,
            DEFAULT_PEN_COLOR,
          );
        } else if (saved.quickOpts.defaultPink === false) {
          base.quickOpts.defaultPenColor = '#1e1e1e';
        }
      }
    }
  }
  return base;
}

export function savePrefs(
  prefs: Prefs,
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
): void {
  if (!storage) return;
  silently(() => storage.setItem(LS_PREFS_KEY, JSON.stringify(prefs)));
  silently(() => {
    const raw = storage.getItem(LS_STATE_KEY);
    const st = raw ? JSON.parse(raw) : {};
    st.boxSelectionMode = normalizeBoxSelectionMode(prefs.boxSelectionMode);
    st.inputDevice = normalizeInputDevice(prefs.inputDevice);
    st.exportBackground = prefs.exportOpts.background;
    st.exportWithDarkMode = prefs.exportOpts.darkMode;
    st.exportEmbedScene = prefs.exportOpts.embedScene;
    st.exportScale = normalizeScale(prefs.exportOpts.scale);
    storage.setItem(LS_STATE_KEY, JSON.stringify(st));
  });
}

export const FILES_DB_VERSION = 2;

function openFilesDb(idb: IDBFactory): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = idb.open(FILES_DB_NAME, FILES_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(FILES_STORE_NAME)) {
          db.createObjectStore(FILES_STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onerror = () => resolve(null);
      req.onsuccess = () => resolve(req.result);
    } catch {
      resolve(null);
    }
  });
}

export async function clearIndexedDbFiles(
  idb: IDBFactory | null = typeof indexedDB !== 'undefined' ? indexedDB : null,
): Promise<boolean> {
  if (!idb || typeof idb.open !== 'function') return false;
  const db = await openFilesDb(idb);
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames?.contains(FILES_STORE_NAME)) {
        db.close();
        return resolve(false);
      }
      const tx = db.transaction(FILES_STORE_NAME, 'readwrite');
      tx.objectStore(FILES_STORE_NAME).clear();
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      silently(() => db.close());
      resolve(false);
    }
  });
}

export async function loadFilesFromIndexedDb(
  idb: IDBFactory | null = typeof indexedDB !== 'undefined' ? indexedDB : null,
): Promise<BinaryFiles> {
  if (!idb || typeof idb.open !== 'function') return {};
  const db = await openFilesDb(idb);
  if (!db) return {};
  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains(FILES_STORE_NAME)) {
        db.close();
        return resolve({});
      }
      const tx = db.transaction(FILES_STORE_NAME, 'readonly');
      const store = tx.objectStore(FILES_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const files: BinaryFiles = {};
        for (const item of (req.result || []) as BinaryFileData[]) {
          if (item && item.id) {
            files[item.id] = item;
          }
        }
        db.close();
        resolve(files);
      };
      req.onerror = () => {
        db.close();
        resolve({});
      };
    } catch {
      silently(() => db.close());
      resolve({});
    }
  });
}

export async function saveFilesToIndexedDb(
  files: BinaryFiles,
  idb: IDBFactory | null = typeof indexedDB !== 'undefined' ? indexedDB : null,
): Promise<boolean> {
  if (!idb || typeof idb.open !== 'function') return false;
  const entries = Object.values(files || {});
  if (entries.length === 0) return true;
  const db = await openFilesDb(idb);
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains(FILES_STORE_NAME)) {
        db.close();
        return resolve(false);
      }
      const tx = db.transaction(FILES_STORE_NAME, 'readwrite');
      const store = tx.objectStore(FILES_STORE_NAME);
      for (const file of entries) {
        if (file && file.id) {
          store.put(file);
        }
      }
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      silently(() => db.close());
      resolve(false);
    }
  });
}

export function bootstrapCleanCanvas({
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
  hash = typeof location !== 'undefined' ? location.hash : '',
  idb = typeof indexedDB !== 'undefined' ? indexedDB : null,
}: {
  storage?: Storage | null;
  hash?: string;
  idb?: IDBFactory | null;
} = {}): {
  skipped: boolean;
  prefs: Prefs;
  autoReset: boolean;
  pinkApplied: boolean;
} {
  const prefs = loadPrefs(storage);
  if (!storage) return { skipped: true, prefs, autoReset: false, pinkApplied: false };

  if (shouldSkipAutoReset(hash)) {
    return { skipped: true, prefs, autoReset: false, pinkApplied: false };
  }

  let state: Record<string, unknown> = {};
  const rawState = silently(() => storage.getItem(LS_STATE_KEY));
  if (rawState) {
    const parsed = silently(() => JSON.parse(rawState));
    if (parsed && typeof parsed === 'object') state = parsed;
  }

  let autoReset = false;
  let pinkApplied = false;

  if (prefs.quickOpts.autoResetOnOpen) {
    silently(() => storage.setItem(LS_ELEMENTS_KEY, '[]'));
    void clearIndexedDbFiles(idb);
    autoReset = true;
  }

  const penColor = normalizeHexColor(prefs.quickOpts.defaultPenColor, DEFAULT_PEN_COLOR);
  state.currentItemStrokeColor = penColor;
  pinkApplied = penColor === DEFAULT_PINK;

  state.showWelcomeScreen = false;
  state.boxSelectionMode = normalizeBoxSelectionMode(prefs.boxSelectionMode);
  state.inputDevice = normalizeInputDevice(prefs.inputDevice);
  state.exportBackground = prefs.exportOpts.background;
  state.exportWithDarkMode = prefs.exportOpts.darkMode;
  state.exportEmbedScene = prefs.exportOpts.embedScene;
  state.exportScale = normalizeScale(prefs.exportOpts.scale);
  silently(() => storage.setItem(LS_STATE_KEY, JSON.stringify(state)));

  return { skipped: false, prefs, autoReset, pinkApplied };
}

export async function loadInitialSceneData(
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
  idb: IDBFactory | null = typeof indexedDB !== 'undefined' ? indexedDB : null,
): Promise<ExcalidrawInitialDataState> {
  const prefs = loadPrefs(storage);
  let elements: ExcalidrawElement[] = [];
  let savedState: Record<string, unknown> = {};

  if (storage) {
    const rawEls = silently(() => storage.getItem(LS_ELEMENTS_KEY));
    if (rawEls) {
      const parsedEls = silently(() => JSON.parse(rawEls));
      if (Array.isArray(parsedEls)) {
        elements = parsedEls.filter((e) => e && !e.isDeleted);
      }
    }
    const rawSt = silently(() => storage.getItem(LS_STATE_KEY));
    if (rawSt) {
      const parsedSt = silently(() => JSON.parse(rawSt));
      if (parsedSt && typeof parsedSt === 'object') {
        savedState = parsedSt;
      }
    }
  }

  const files = elements.length > 0 ? await loadFilesFromIndexedDb(idb) : {};
  const defaultPenColor = normalizeHexColor(prefs.quickOpts.defaultPenColor, DEFAULT_PEN_COLOR);

  return {
    elements,
    files,
    appState: {
      viewBackgroundColor:
        typeof savedState.viewBackgroundColor === 'string' && savedState.viewBackgroundColor
          ? savedState.viewBackgroundColor
          : '#ffffff',
      currentItemStrokeColor:
        typeof savedState.currentItemStrokeColor === 'string' && savedState.currentItemStrokeColor
          ? savedState.currentItemStrokeColor
          : defaultPenColor,
      boxSelectionMode: normalizeBoxSelectionMode(prefs.boxSelectionMode),
      inputDevice: normalizeInputDevice(prefs.inputDevice),
      exportBackground: prefs.exportOpts.background,
      exportWithDarkMode: prefs.exportOpts.darkMode,
      exportEmbedScene: prefs.exportOpts.embedScene,
      exportScale: normalizeScale(prefs.exportOpts.scale) as unknown as number,
      theme: resolveTheme(prefs.themeMode),
    },
  };
}

export function persistSceneSnapshot(
  elements: readonly ExcalidrawElement[],
  appState: Record<string, unknown>,
  files: BinaryFiles,
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
  idb: IDBFactory | null = typeof indexedDB !== 'undefined' ? indexedDB : null,
): void {
  if (!storage) return;
  silently(() => {
    const nonDeleted = elements.filter((el) => !el.isDeleted);
    storage.setItem(LS_ELEMENTS_KEY, JSON.stringify(nonDeleted));
  });
  silently(() => {
    const raw = storage.getItem(LS_STATE_KEY);
    const prev = raw ? JSON.parse(raw) : {};
    const nextState = {
      ...prev,
      viewBackgroundColor: appState.viewBackgroundColor ?? prev.viewBackgroundColor ?? '#ffffff',
      currentItemStrokeColor:
        appState.currentItemStrokeColor ?? prev.currentItemStrokeColor ?? DEFAULT_PEN_COLOR,
      boxSelectionMode: normalizeBoxSelectionMode(
        appState.boxSelectionMode ?? prev.boxSelectionMode ?? DEFAULT_PREFS.boxSelectionMode,
      ),
      inputDevice: normalizeInputDevice(
        appState.inputDevice ?? prev.inputDevice ?? DEFAULT_PREFS.inputDevice,
      ),
      exportBackground: appState.exportBackground ?? prev.exportBackground ?? true,
      exportWithDarkMode: appState.exportWithDarkMode ?? prev.exportWithDarkMode ?? false,
      exportEmbedScene: appState.exportEmbedScene ?? prev.exportEmbedScene ?? false,
      exportScale: normalizeScale(appState.exportScale ?? prev.exportScale ?? 1),
      theme: appState.theme ?? prev.theme ?? 'light',
    };
    storage.setItem(LS_STATE_KEY, JSON.stringify(nextState));
  });
  if (files && Object.keys(files).length > 0) {
    void saveFilesToIndexedDb(files, idb);
  }
}

/* ================= Centralized Debounced Scene Persistence ================= */
let pendingPersistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPersistTask: (() => void) | null = null;

export function cancelPendingScenePersist(): void {
  if (pendingPersistTimer !== null) {
    clearTimeout(pendingPersistTimer);
    pendingPersistTimer = null;
  }
  pendingPersistTask = null;
}

export function flushPendingScenePersist(): void {
  if (pendingPersistTimer !== null) {
    clearTimeout(pendingPersistTimer);
    pendingPersistTimer = null;
  }
  const task = pendingPersistTask;
  pendingPersistTask = null;
  if (task) task();
}

export function scheduleScenePersist(
  elements: readonly ExcalidrawElement[],
  appState: Record<string, unknown>,
  files: BinaryFiles,
  {
    delayMs = 250,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    idb = typeof indexedDB !== 'undefined' ? indexedDB : null,
  }: {
    delayMs?: number;
    storage?: Storage | null;
    idb?: IDBFactory | null;
  } = {},
): void {
  cancelPendingScenePersist();
  pendingPersistTask = () => {
    persistSceneSnapshot(elements, appState, files, storage, idb);
  };
  pendingPersistTimer = setTimeout(() => {
    pendingPersistTimer = null;
    const task = pendingPersistTask;
    pendingPersistTask = null;
    if (task) task();
  }, delayMs);
}
