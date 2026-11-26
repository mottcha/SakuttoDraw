import { FONT_FAMILY } from '@excalidraw/excalidraw';
import type { BinaryFiles, ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type {
  AppLang,
  BoxSelectionPref,
  ExportFormat,
  ExportScale,
  InputDevicePref,
  Prefs,
  StylesPanelPref,
  ThemeMode,
} from '../types/annotator';
import { detectBrowserLang, normalizeAppLang } from '../i18n/messages';
import { normalizeHexColor, silently } from '../utils/common';
import {
  clearIndexedDbFiles,
  loadFilesFromIndexedDb,
  saveFilesToIndexedDb,
} from './filesDb';

export const DEFAULT_PINK = '#c2255c';
export const DEFAULT_PEN_COLOR = DEFAULT_PINK;
export const PEN_COLOR_SWATCHES = ['#c2255c', '#1e1e1e', '#e03131', '#1971c2', '#2f9e44', '#f08c00'] as const;
export const DEFAULT_REDACT_COLOR = '#111111';
export const REDACT_COLOR_SWATCHES = ['#111111', '#495057', '#adb5bd', '#ffffff', '#c2255c', '#1971c2'] as const;
export const LS_ELEMENTS_KEY = 'excalidraw';
export const LS_STATE_KEY = 'excalidraw-state';
export const LS_PREFS_KEY = 'exq-annotator-prefs';
export const LS_DESKTOP_UI_MODE_KEY = 'excalidraw.desktopUIMode';

export const DEFAULT_FONT_TOP_PICKS = [
  FONT_FAMILY.Excalifont,
  FONT_FAMILY.Nunito,
  FONT_FAMILY.Cascadia,
] as const;

export const DEFAULT_PREFS: Prefs = {
  lang: 'en',
  themeMode: 'light',
  boxSelectionMode: 'overlap',
  inputDevice: 'trackpad',
  stylesPanelMode: 'auto',
  preferJpFont: null,
  codeLigatures: true,
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
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
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
  base.exportOpts.scale = normalizeScale(st.exportScale);

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
      if (typeof saved.codeLigatures === 'boolean') {
        base.codeLigatures = saved.codeLigatures;
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
      if (saved.redactOpts && typeof saved.redactOpts === 'object') {
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
  patchSavedAppState(
    {
      boxSelectionMode: normalizeBoxSelectionMode(prefs.boxSelectionMode),
      inputDevice: normalizeInputDevice(prefs.inputDevice),
      exportBackground: prefs.exportOpts.background,
      exportWithDarkMode: prefs.exportOpts.darkMode,
      exportEmbedScene: prefs.exportOpts.embedScene,
      exportScale: normalizeScale(prefs.exportOpts.scale),
    },
    storage,
  );
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

  let autoReset = false;
  if (prefs.quickOpts.autoResetOnOpen) {
    silently(() => storage.setItem(LS_ELEMENTS_KEY, '[]'));
    void clearIndexedDbFiles(idb);
    autoReset = true;
  }

  const penColor = normalizeHexColor(prefs.quickOpts.defaultPenColor, DEFAULT_PEN_COLOR);
  const pinkApplied = penColor === DEFAULT_PINK;

  patchSavedAppState(
    {
      currentItemStrokeColor: penColor,
      showWelcomeScreen: false,
      boxSelectionMode: normalizeBoxSelectionMode(prefs.boxSelectionMode),
      inputDevice: normalizeInputDevice(prefs.inputDevice),
      exportBackground: prefs.exportOpts.background,
      exportWithDarkMode: prefs.exportOpts.darkMode,
      exportEmbedScene: prefs.exportOpts.embedScene,
      exportScale: normalizeScale(prefs.exportOpts.scale),
    },
    storage,
  );

  return { skipped: false, prefs, autoReset, pinkApplied };
}

export async function loadInitialSceneData(
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
  idb: IDBFactory | null = typeof indexedDB !== 'undefined' ? indexedDB : null,
): Promise<ExcalidrawInitialDataState> {
  const prefs = loadPrefs(storage);
  let elements: ExcalidrawElement[] = [];

  if (storage) {
    const rawEls = silently(() => storage.getItem(LS_ELEMENTS_KEY));
    if (rawEls) {
      const parsedEls = silently(() => JSON.parse(rawEls));
      if (Array.isArray(parsedEls)) {
        elements = parsedEls.filter((e) => e && !e.isDeleted);
      }
    }
  }

  const savedState = readSavedAppState(storage);
  const files = elements.length > 0 ? await loadFilesFromIndexedDb(idb) : {};
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
      boxSelectionMode: normalizeBoxSelectionMode(prefs.boxSelectionMode),
      inputDevice: normalizeInputDevice(prefs.inputDevice),
      exportBackground: prefs.exportOpts.background,
      exportWithDarkMode: prefs.exportOpts.darkMode,
      exportEmbedScene: prefs.exportOpts.embedScene,
      exportScale: normalizeScale(prefs.exportOpts.scale) as unknown as number,
      fontTopPicks: savedTopPicks as NonNullable<ExcalidrawInitialDataState['appState']>['fontTopPicks'],
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
      exportBackground: appState.exportBackground ?? prev.exportBackground ?? true,
      exportWithDarkMode: appState.exportWithDarkMode ?? prev.exportWithDarkMode ?? false,
      exportEmbedScene: appState.exportEmbedScene ?? prev.exportEmbedScene ?? false,
      exportScale: normalizeScale(appState.exportScale ?? prev.exportScale ?? 1),
      fontTopPicks: Array.isArray(appState.fontTopPicks)
        ? appState.fontTopPicks
        : prev.fontTopPicks ?? [...DEFAULT_FONT_TOP_PICKS],
      theme: appState.theme ?? prev.theme ?? 'light',
    }),
    storage,
  );
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
