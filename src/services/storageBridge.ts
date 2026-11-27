import { FONT_FAMILY } from '@excalidraw/excalidraw';
import type { BinaryFiles, ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { EXCALIDRAW_LS_KEYS } from '../excalidraw/domContract';
import { detectBrowserLang, normalizeAppLang } from '../i18n/messages';
import type {
  AppLang,
  BoxSelectionPref,
  ExportFormat,
  ExportOpts,
  ExportPreset,
  InputDevicePref,
  Prefs,
  StylesPanelPref,
  ThemeMode,
} from '../types/annotator';
import { normalizeHexColor, silently } from '../utils/common';
import {
  clearIndexedDbFiles,
  loadFilesFromIndexedDb,
  saveFilesToIndexedDb,
} from './filesDb';

export const DEFAULT_PEN_COLOR = '#c2255c';
export const PEN_COLOR_SWATCHES = ['#c2255c', '#1e1e1e', '#e03131', '#1971c2', '#2f9e44', '#f08c00'] as const;
export const DEFAULT_REDACT_COLOR = '#111111';
export const REDACT_COLOR_SWATCHES = ['#111111', '#495057', '#adb5bd', '#ffffff', '#c2255c', '#1971c2'] as const;
export const LS_ELEMENTS_KEY = 'excalidraw';
export const LS_STATE_KEY = 'excalidraw-state';
export const LS_PREFS_KEY = 'exq-annotator-prefs';

export const DEFAULT_FONT_TOP_PICKS = [
  FONT_FAMILY.Excalifont,
  FONT_FAMILY.Nunito,
  FONT_FAMILY.Cascadia,
] as const;

const DEFAULT_PREFS: Prefs = {
  lang: 'en',
  themeMode: 'light',
  boxSelectionMode: 'overlap',
  inputDevice: 'trackpad',
  stylesPanelMode: 'auto',
  preferJpFont: null,
  codeLigatures: true,
  exportOpts: {
    onlySelected: true,
    background: false,
    darkMode: false,
    embedScene: false,
    padding: false,
    format: 'png',
  },
  quickOpts: {
    autoResetOnOpen: true,
    defaultPenColor: DEFAULT_PEN_COLOR,
    textAutoResize: true,
    fastLoadSave: true,
    modernContextMenu: true,
  },
  redactOpts: {
    color: DEFAULT_REDACT_COLOR,
  },
};

export function createDefaultPrefs(lang: AppLang = DEFAULT_PREFS.lang): Prefs {
  return {
    lang,
    themeMode: DEFAULT_PREFS.themeMode,
    boxSelectionMode: DEFAULT_PREFS.boxSelectionMode,
    inputDevice: DEFAULT_PREFS.inputDevice,
    stylesPanelMode: DEFAULT_PREFS.stylesPanelMode,
    preferJpFont: DEFAULT_PREFS.preferJpFont,
    codeLigatures: DEFAULT_PREFS.codeLigatures,
    exportOpts: { ...DEFAULT_PREFS.exportOpts },
    quickOpts: { ...DEFAULT_PREFS.quickOpts },
    redactOpts: { ...DEFAULT_PREFS.redactOpts },
  };
}

export function resolvePreferJpFont(prefs: Pick<Prefs, 'lang' | 'preferJpFont'>): boolean {
  if (typeof prefs.preferJpFont === 'boolean') {
    return prefs.preferJpFont;
  }
  return prefs.lang === 'ja-JP';
}

export function normalizeFormat(value: unknown): ExportFormat {
  return String(value || '').toLowerCase() === 'svg' ? 'svg' : 'png';
}

export function resolveExportPreset(opts: Pick<ExportOpts, 'background' | 'padding'>): ExportPreset {
  if (!opts.background && !opts.padding) return 'screenshot';
  if (opts.background && opts.padding) return 'whiteboard';
  return 'custom';
}

export function applyExportPreset(
  opts: ExportOpts,
  preset: 'screenshot' | 'whiteboard',
): ExportOpts {
  if (preset === 'screenshot') {
    return { ...opts, background: false, padding: false };
  }
  return { ...opts, background: true, padding: true };
}

function normalizeThemeMode(value: unknown): ThemeMode {
  if (value === 'dark' || value === 'system') return value;
  return 'light';
}

export function normalizeBoxSelectionMode(value: unknown): BoxSelectionPref {
  return value === 'contain' ? 'contain' : 'overlap';
}

export function normalizeInputDevice(value: unknown): InputDevicePref {
  return value === 'mouse' ? 'mouse' : 'trackpad';
}

function normalizeStylesPanelMode(value: unknown): StylesPanelPref {
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
      if (storage.getItem(EXCALIDRAW_LS_KEYS.desktopUIMode) !== resolved) {
        storage.setItem(EXCALIDRAW_LS_KEYS.desktopUIMode, resolved);
      }
    });
  }
  if (options.triggerResize && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('resize'));
  }
  return resolved;
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

export function readSavedAppState(
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
): Record<string, unknown> {
  if (!storage) return {};
  const raw = silently(() => storage.getItem(LS_STATE_KEY));
  if (!raw) return {};
  const parsed = silently(() => JSON.parse(raw));
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

export function patchSavedAppState(
  patch: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>),
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
): void {
  if (!storage) return;
  silently(() => {
    const prev = readSavedAppState(storage);
    const delta = typeof patch === 'function' ? patch(prev) : patch;
    storage.setItem(LS_STATE_KEY, JSON.stringify({ ...prev, ...delta }));
  });
}

export function prefsToAppStatePatch(prefs: Prefs) {
  return {
    boxSelectionMode: normalizeBoxSelectionMode(prefs.boxSelectionMode),
    inputDevice: normalizeInputDevice(prefs.inputDevice),
    exportBackground: Boolean(prefs.exportOpts.background),
    exportWithDarkMode: Boolean(prefs.exportOpts.darkMode),
    exportEmbedScene: Boolean(prefs.exportOpts.embedScene),
  };
}

export function loadPrefs(
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
): Prefs {
  const base = createDefaultPrefs(detectBrowserLang());
  if (!storage) return base;

  const st = readSavedAppState(storage);
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

  const rawPrefs = silently(() => storage.getItem(LS_PREFS_KEY));
  if (rawPrefs) {
    const saved = silently(() => JSON.parse(rawPrefs));
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      const savedLang = normalizeAppLang(saved.lang);
      if (savedLang) {
        base.lang = savedLang;
      }
      if (saved.themeMode != null) {
        base.themeMode = normalizeThemeMode(saved.themeMode);
      }
      if (saved.boxSelectionMode === 'contain' || saved.boxSelectionMode === 'overlap') {
        base.boxSelectionMode = normalizeBoxSelectionMode(saved.boxSelectionMode);
      }
      if (saved.inputDevice === 'mouse' || saved.inputDevice === 'trackpad') {
        base.inputDevice = normalizeInputDevice(saved.inputDevice);
      }
      if (saved.stylesPanelMode != null) {
        base.stylesPanelMode = normalizeStylesPanelMode(saved.stylesPanelMode);
      }
      if (typeof saved.preferJpFont === 'boolean' || saved.preferJpFont === null) {
        base.preferJpFont = saved.preferJpFont;
      }
      if (typeof saved.codeLigatures === 'boolean') {
        base.codeLigatures = saved.codeLigatures;
      }
      if (saved.exportOpts && typeof saved.exportOpts === 'object' && !Array.isArray(saved.exportOpts)) {
        for (const k of ['onlySelected', 'background', 'darkMode', 'embedScene', 'padding'] as const) {
          if (typeof saved.exportOpts[k] === 'boolean') base.exportOpts[k] = saved.exportOpts[k];
        }
        if (saved.exportOpts.format != null) {
          base.exportOpts.format = normalizeFormat(saved.exportOpts.format);
        }
      }
      if (saved.quickOpts && typeof saved.quickOpts === 'object' && !Array.isArray(saved.quickOpts)) {
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
      if (saved.redactOpts && typeof saved.redactOpts === 'object' && !Array.isArray(saved.redactOpts)) {
        base.redactOpts.color = normalizeHexColor(
          saved.redactOpts.color,
          DEFAULT_REDACT_COLOR,
        );
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
  patchSavedAppState(prefsToAppStatePatch(prefs), storage);
}

const persistedFileIdsByIdb = new WeakMap<IDBFactory, Set<string>>();

function getPersistedFileIdSet(idb: IDBFactory | null): Set<string> | null {
  if (!idb) return null;
  let set = persistedFileIdsByIdb.get(idb);
  if (!set) {
    set = new Set();
    persistedFileIdsByIdb.set(idb, set);
  }
  return set;
}

export function resetPersistedFilesCache(
  idb: IDBFactory | null = typeof indexedDB !== 'undefined' ? indexedDB : null,
): void {
  if (!idb) return;
  persistedFileIdsByIdb.get(idb)?.clear();
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
} {
  const prefs = loadPrefs(storage);
  if (!storage) return { skipped: true, prefs, autoReset: false };

  if (shouldSkipAutoReset(hash)) {
    return { skipped: true, prefs, autoReset: false };
  }

  let autoReset = false;
  if (prefs.quickOpts.autoResetOnOpen) {
    silently(() => storage.setItem(LS_ELEMENTS_KEY, '[]'));
    resetPersistedFilesCache(idb);
    void clearIndexedDbFiles(idb);
    autoReset = true;
  }

  const penColor = normalizeHexColor(prefs.quickOpts.defaultPenColor, DEFAULT_PEN_COLOR);

  patchSavedAppState(
    {
      currentItemStrokeColor: penColor,
      showWelcomeScreen: false,
      ...prefsToAppStatePatch(prefs),
    },
    storage,
  );

  return { skipped: false, prefs, autoReset };
}

function isValidStoredElement(el: unknown): el is ExcalidrawElement {
  return Boolean(
    el &&
      typeof el === 'object' &&
      !Array.isArray(el) &&
      typeof (el as { id?: unknown }).id === 'string' &&
      typeof (el as { type?: unknown }).type === 'string' &&
      !(el as { isDeleted?: unknown }).isDeleted,
  );
}

export async function loadInitialSceneData(
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
  idb: IDBFactory | null = typeof indexedDB !== 'undefined' ? indexedDB : null,
  preloadedPrefs?: Prefs,
): Promise<ExcalidrawInitialDataState> {
  const prefs = preloadedPrefs ?? loadPrefs(storage);
  let elements: ExcalidrawElement[] = [];

  if (storage) {
    const rawEls = silently(() => storage.getItem(LS_ELEMENTS_KEY));
    if (rawEls) {
      const parsedEls = silently(() => JSON.parse(rawEls));
      if (Array.isArray(parsedEls)) {
        elements = parsedEls.filter(isValidStoredElement);
      }
    }
  }

  const savedState = readSavedAppState(storage);
  const files = elements.length > 0 ? await loadFilesFromIndexedDb(idb) : {};
  const persistedSet = getPersistedFileIdSet(idb);
  if (persistedSet) {
    for (const id of Object.keys(files)) {
      persistedSet.add(id);
    }
  }
  const defaultPenColor = normalizeHexColor(prefs.quickOpts.defaultPenColor, DEFAULT_PEN_COLOR);

  const savedTopPicks =
    Array.isArray(savedState.fontTopPicks) &&
    savedState.fontTopPicks.length > 0 &&
    savedState.fontTopPicks.every((v) => typeof v === 'number')
      ? (savedState.fontTopPicks as number[])
      : [...DEFAULT_FONT_TOP_PICKS];

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
      ...prefsToAppStatePatch(prefs),
      fontTopPicks: savedTopPicks as NonNullable<ExcalidrawInitialDataState['appState']>['fontTopPicks'],
      theme: resolveTheme(prefs.themeMode),
    },
  };
}

let onStorageQuotaWarned = false;

function persistSceneSnapshot(
  elements: readonly ExcalidrawElement[],
  appState: Record<string, unknown>,
  files: BinaryFiles,
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
  idb: IDBFactory | null = typeof indexedDB !== 'undefined' ? indexedDB : null,
  onPersistError?: (reason: 'quota-exceeded') => void,
): void {
  if (!storage) return;
  const nonDeleted = elements.filter((el) => !el.isDeleted);
  let writeError: unknown = null;
  try {
    storage.setItem(LS_ELEMENTS_KEY, JSON.stringify(nonDeleted));
  } catch (err) {
    writeError = err;
    const isQuota =
      err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22);
    if (isQuota) {
      onPersistError?.('quota-exceeded');
      if (!onStorageQuotaWarned) {
        onStorageQuotaWarned = true;
        console.warn('[SakuttoDraw] localStorage quota exceeded while persisting scene elements.');
      }
    }
  }

  if (!writeError) {
    patchSavedAppState(
      (prev) => ({
        viewBackgroundColor: appState.viewBackgroundColor ?? prev.viewBackgroundColor ?? '#ffffff',
        currentItemStrokeColor:
          appState.currentItemStrokeColor ?? prev.currentItemStrokeColor ?? DEFAULT_PEN_COLOR,
        boxSelectionMode: normalizeBoxSelectionMode(
          appState.boxSelectionMode ?? prev.boxSelectionMode ?? DEFAULT_PREFS.boxSelectionMode,
        ),
        inputDevice: normalizeInputDevice(
          appState.inputDevice ?? prev.inputDevice ?? DEFAULT_PREFS.inputDevice,
        ),
        exportBackground:
          appState.exportBackground ?? prev.exportBackground ?? DEFAULT_PREFS.exportOpts.background,
        exportWithDarkMode: appState.exportWithDarkMode ?? prev.exportWithDarkMode ?? false,
        exportEmbedScene: appState.exportEmbedScene ?? prev.exportEmbedScene ?? false,
        fontTopPicks: Array.isArray(appState.fontTopPicks)
          ? appState.fontTopPicks
          : prev.fontTopPicks ?? [...DEFAULT_FONT_TOP_PICKS],
        theme: appState.theme ?? prev.theme ?? 'light',
      }),
      storage,
    );
  }

  if (!files) return;
  const referencedFileIds = new Set<string>();
  for (const el of nonDeleted) {
    if (el.type === 'image') {
      const fileId = (el as { fileId?: string | null }).fileId;
      if (fileId) referencedFileIds.add(fileId);
    }
  }

  if (referencedFileIds.size === 0) return;

  const persistedSet = getPersistedFileIdSet(idb);
  const filesToWrite: BinaryFiles = {};
  for (const fileId of referencedFileIds) {
    if (persistedSet?.has(fileId)) continue;
    const file = files[fileId];
    if (file?.id) {
      filesToWrite[fileId] = file;
      persistedSet?.add(fileId);
    }
  }

  if (Object.keys(filesToWrite).length > 0) {
    void saveFilesToIndexedDb(filesToWrite, idb).then((ok) => {
      if (!ok && persistedSet) {
        for (const id of Object.keys(filesToWrite)) {
          persistedSet.delete(id);
        }
      }
    });
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
    onPersistError,
  }: {
    delayMs?: number;
    storage?: Storage | null;
    idb?: IDBFactory | null;
    onPersistError?: (reason: 'quota-exceeded') => void;
  } = {},
): void {
  cancelPendingScenePersist();
  pendingPersistTask = () => {
    persistSceneSnapshot(elements, appState, files, storage, idb, onPersistError);
  };
  pendingPersistTimer = setTimeout(() => {
    pendingPersistTimer = null;
    const task = pendingPersistTask;
    pendingPersistTask = null;
    if (task) task();
  }, delayMs);
}
