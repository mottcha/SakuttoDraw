import {
  CaptureUpdateAction,
  exportScene,
  exportToClipboard,
  loadFromBlob,
  MIME_TYPES,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { NonDeletedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppLang, ExportFormat, ExportOpts, Prefs } from '../types/annotator';
import { getMessages } from '../i18n/messages';
import { clearIndexedDbFiles } from '../services/filesDb';
import {
  cancelPendingScenePersist,
  DEFAULT_PEN_COLOR,
  LS_ELEMENTS_KEY,
  normalizeFormat,
  normalizeScale,
  patchSavedAppState,
  prefsToAppStatePatch,
  resetPersistedFilesCache,
  savePrefs,
} from '../services/storageBridge';
import { normalizeHexColor, silently } from '../utils/common';
import { filterTargetElementsForExport } from './elementOps';
import {
  clearRedactStyleIsolationState,
  updateRedactStyleIsolationPenColor,
} from './redactProcessor';
import { inlinePreSplitFontsIntoSvg } from './svgFontInliner';

const sceneReplaceHooks = new Set<() => void>();

export function registerSceneReplaceHook(fn: () => void): () => void {
  sceneReplaceHooks.add(fn);
  return () => {
    sceneReplaceHooks.delete(fn);
  };
}

function runSceneReplaceHooks(): void {
  for (const fn of sceneReplaceHooks) {
    silently(fn);
  }
}

function resolveExportBaseName(api: ExcalidrawImperativeAPI): string {
  const rawName = (typeof api.getName === 'function' && api.getName()) || 'sakuttodraw';
  return rawName.replace(/\.excalidraw$/i, '').replace(/[\\/:*?"<>|]+/g, '_') || 'sakuttodraw';
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body?.append(a);
  a.click();
  a.remove();
  setTimeout(() => silently(() => URL.revokeObjectURL(url)), 15000);
}

function buildExportSceneData(
  elements: NonDeletedExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
) {
  return {
    elements,
    appState: {
      viewBackgroundColor: appState.viewBackgroundColor || '#ffffff',
      gridSize: appState.gridSize,
      gridStep: appState.gridStep,
      gridModeEnabled: appState.gridModeEnabled,
    },
    files,
  };
}

export async function runInstantExportWithApi(
  api: ExcalidrawImperativeAPI | null,
  mode: 'copy' | 'save',
  opts: ExportOpts,
  {
    lang = 'en',
    preferJpFont,
    showToast,
  }: {
    lang?: AppLang;
    preferJpFont?: boolean;
    showToast?: (msg: string) => void;
  } = {},
): Promise<{
  ok: boolean;
  reason?: string;
  mode?: 'copy' | 'save';
  format?: ExportFormat;
  onlySelected?: boolean;
  message?: string;
  opts?: ExportOpts;
}> {
  if (!api) {
    return { ok: false, reason: 'api-not-ready' };
  }

  const t = getMessages(lang);
  const rawElements = api.getSceneElements();
  const appState = api.getAppState();
  const files = api.getFiles();

  const { elements, exportedOnlySelected } = filterTargetElementsForExport(
    rawElements,
    appState,
    opts.onlySelected,
  );

  if (elements.length === 0) {
    showToast?.(t.toastEmptyCanvas);
    return { ok: false, reason: 'empty-canvas' };
  }

  const scale = normalizeScale(opts.scale);
  const fmt = normalizeFormat(opts.format);
  const exportPadding = opts.padding ? 10 : 0;
  const canvasBackgroundColor = opts.background
    ? appState.viewBackgroundColor || '#ffffff'
    : false;
  const theme = opts.darkMode ? 'dark' : 'light';
  const sceneData = buildExportSceneData(elements, appState, files);

  try {
    if (mode === 'copy') {
      await exportToClipboard({
        type: 'png',
        data: sceneData,
        config: {
          canvasBackgroundColor,
          theme,
          scale,
          padding: exportPadding,
          embedScene: opts.embedScene,
        },
      });
      const msg = exportedOnlySelected ? t.toastCopiedSelected : t.toastCopiedAll;
      showToast?.(msg);
      return {
        ok: true,
        mode,
        onlySelected: exportedOnlySelected,
        message: msg,
        opts: { ...opts },
      };
    }

    const baseName = resolveExportBaseName(api);
    if (fmt === 'svg') {
      const svgNode = await exportScene({
        type: 'svg',
        data: sceneData,
        config: {
          canvasBackgroundColor,
          theme,
          padding: exportPadding,
          embedScene: opts.embedScene,
          skipInliningFonts: true,
        },
      });
      const svgLang = preferJpFont ? 'ja-JP' : lang;
      svgNode.setAttribute('lang', svgLang);
      await inlinePreSplitFontsIntoSvg(svgNode, elements);
      const blob = new Blob([svgNode.outerHTML], { type: MIME_TYPES.svg });
      triggerBlobDownload(blob, `${baseName}.svg`);
    } else {
      const pngBlob = await exportScene({
        type: 'png',
        data: sceneData,
        config: {
          canvasBackgroundColor,
          theme,
          scale,
          padding: exportPadding,
          embedScene: opts.embedScene,
        },
      });
      triggerBlobDownload(pngBlob, `${baseName}.png`);
    }

    const msg = exportedOnlySelected ? t.toastSavedSelected : t.toastSavedAll;
    showToast?.(msg);
    return {
      ok: true,
      mode,
      format: fmt,
      onlySelected: exportedOnlySelected,
      message: msg,
      opts: { ...opts },
    };
  } catch {
    const errMsg = mode === 'copy' ? t.toastCopyFailed : t.toastExportFailed;
    showToast?.(errMsg);
    return {
      ok: false,
      reason: mode === 'copy' ? 'copy-failed' : 'export-failed',
    };
  }
}

export async function runInstantResetWithApi(
  api: ExcalidrawImperativeAPI | null,
  prefs: Prefs,
  {
    showToast,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    idb = typeof indexedDB !== 'undefined' ? indexedDB : null,
  }: {
    showToast?: (msg: string) => void;
    storage?: Storage | null;
    idb?: IDBFactory | null;
  } = {},
): Promise<{ ok: boolean; reason?: string }> {
  if (!api) {
    return { ok: false, reason: 'api-not-ready' };
  }

  // Prevent any debounced onChange snapshot from overwriting the freshly reset storage
  cancelPendingScenePersist();
  clearRedactStyleIsolationState();
  runSceneReplaceHooks();
  resetPersistedFilesCache(idb);

  api.resetScene();
  silently(() => api.history?.clear());

  const penColor = normalizeHexColor(prefs.quickOpts.defaultPenColor, DEFAULT_PEN_COLOR);
  const restoredAppStatePatch = {
    ...prefsToAppStatePatch(prefs),
    currentItemStrokeColor: penColor,
  };
  api.updateScene({
    appState: restoredAppStatePatch as never,
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  // Cancel any onChange debounce queued synchronously by resetScene() / updateScene()
  cancelPendingScenePersist();

  if (storage) {
    silently(() => storage.setItem(LS_ELEMENTS_KEY, '[]'));
    patchSavedAppState(restoredAppStatePatch, storage);
  }

  await clearIndexedDbFiles(idb);
  resetPersistedFilesCache(idb);
  savePrefs(prefs, storage);

  showToast?.(getMessages(prefs.lang).toastResetDone);
  return { ok: true };
}

export function applyPenColorWithApi(
  api: ExcalidrawImperativeAPI | null,
  hex: string,
  {
    lang = 'en',
    showToast,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
  }: {
    lang?: AppLang;
    showToast?: (msg: string) => void;
    storage?: Storage | null;
  } = {},
): { ok: boolean; color: string } {
  const normalized = normalizeHexColor(hex, DEFAULT_PEN_COLOR);
  if (!api) {
    return { ok: false, color: normalized };
  }

  api.updateScene({
    appState: {
      currentItemStrokeColor: normalized,
    },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  updateRedactStyleIsolationPenColor(normalized);
  patchSavedAppState({ currentItemStrokeColor: normalized }, storage);

  showToast?.(getMessages(lang).toastPenColorChanged);
  return { ok: true, color: normalized };
}

export function applyCanvasBackgroundWithApi(
  api: ExcalidrawImperativeAPI | null,
  hex: string,
  {
    lang = 'en',
    showToast,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
  }: {
    lang?: AppLang;
    showToast?: (msg: string) => void;
    storage?: Storage | null;
  } = {},
): { ok: boolean; color: string } {
  const normalized = normalizeHexColor(hex, '#ffffff');
  if (!api) {
    return { ok: false, color: normalized };
  }

  api.updateScene({
    appState: {
      viewBackgroundColor: normalized,
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  patchSavedAppState({ viewBackgroundColor: normalized }, storage);

  showToast?.(getMessages(lang).toastBgChanged);
  return { ok: true, color: normalized };
}

type SaveFilePickerWritable = {
  write: (data: Blob | BufferSource | string) => Promise<void>;
  close: () => Promise<void>;
  abort?: () => Promise<void>;
};
type SaveFilePickerHandle = {
  createWritable: () => Promise<SaveFilePickerWritable>;
};
type ShowSaveFilePickerFn = (options?: {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}) => Promise<SaveFilePickerHandle>;

export async function runDirectDiskSaveWithApi(
  api: ExcalidrawImperativeAPI | null,
  {
    lang = 'en',
    showToast,
  }: {
    lang?: AppLang;
    showToast?: (msg: string) => void;
  } = {},
): Promise<boolean> {
  if (!api) return false;
  const elements = api.getSceneElements();
  const appState = api.getAppState();
  const files = api.getFiles();
  let json: string;
  try {
    json = serializeAsJSON(elements, appState, files, 'local');
  } catch {
    showToast?.(getMessages(lang).toastExportFailed);
    return false;
  }
  const blob = new Blob([json], { type: MIME_TYPES.excalidraw });
  const suggestedName = `${resolveExportBaseName(api)}.excalidraw`;

  const picker = (globalThis as { showSaveFilePicker?: ShowSaveFilePickerFn }).showSaveFilePicker;
  if (typeof picker === 'function') {
    let handle: SaveFilePickerHandle | null = null;
    try {
      handle = await picker({
        suggestedName,
        types: [
          {
            description: 'Excalidraw',
            accept: {
              'application/vnd.excalidraw+json': ['.excalidraw'],
            },
          },
        ],
      });
    } catch (err) {
      if ((err as { name?: string } | null)?.name === 'AbortError') {
        return false;
      }
      handle = null;
    }

    if (handle) {
      let writable: SaveFilePickerWritable | null = null;
      try {
        writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        showToast?.(getMessages(lang).toastSceneSaved);
        return true;
      } catch {
        await writable?.abort?.().catch(() => {});
        showToast?.(getMessages(lang).toastExportFailed);
        return false;
      }
    }
  }

  triggerBlobDownload(blob, suggestedName);
  showToast?.(getMessages(lang).toastSceneSaved);
  return true;
}

export async function runDirectFileLoadWithApi(
  api: ExcalidrawImperativeAPI | null,
  file: Blob,
  {
    lang = 'en',
    showToast,
    defaultPenColor,
  }: {
    lang?: AppLang;
    showToast?: (msg: string) => void;
    defaultPenColor?: string;
  } = {},
): Promise<boolean> {
  if (!api) return false;
  const t = getMessages(lang);
  try {
    const currentAppState = api.getAppState();
    const currentElements = api.getSceneElements();
    const loaded = await loadFromBlob(file, currentAppState, currentElements);

    cancelPendingScenePersist();
    clearRedactStyleIsolationState();
    runSceneReplaceHooks();
    resetPersistedFilesCache();

    if (loaded.files) {
      api.addFiles(Object.values(loaded.files));
    }
    const nextAppState = {
      ...currentAppState,
      ...loaded.appState,
      ...(defaultPenColor
        ? { currentItemStrokeColor: normalizeHexColor(defaultPenColor, DEFAULT_PEN_COLOR) }
        : {}),
    };
    api.updateScene({
      elements: loaded.elements,
      appState: nextAppState as AppState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    silently(() =>
      (api as unknown as { scrollToContent?: (target?: unknown) => void }).scrollToContent?.(
        loaded.elements,
      ),
    );
    showToast?.(t.toastFileLoaded);
    return true;
  } catch {
    showToast?.(t.toastFileLoadFailed);
    return false;
  }
}
