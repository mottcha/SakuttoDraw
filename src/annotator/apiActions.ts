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
  patchSavedAppState,
  prefsToAppStatePatch,
  resetPersistedFilesCache,
  savePrefs,
} from '../services/storageBridge';
import { normalizeHexColor, silently } from '../utils/common';
import { filterTargetElementsForExport } from './elementOps';
import { createAutoExportScaleFn } from './exportScale';
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

const SAKUTTO_TIMESTAMP_NAME_RE = /^sakutto-\d{4}-\d{2}-\d{2}-\d{6}$/i;
const UNTITLED_NAME_RE =
  /^(?:untitled|無題|未命名|제목\s*없음)(?:-\d{4}-\d{2}-\d{2}-\d{4})?$/i;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatLocalTimestamp(date: Date = new Date()): string {
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `-${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`
  );
}

export function sanitizeFileBaseName(raw: string): string {
  return raw
    .trim()
    .replace(/\.(?:excalidraw|json|png|svg)$/i, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .trim();
}

export function isUntitledExcalidrawName(name: string): boolean {
  const trimmed = name.trim();
  return !trimmed || UNTITLED_NAME_RE.test(trimmed);
}

export function resolveNamedDocumentBase(api: ExcalidrawImperativeAPI): string | null {
  const rawName = typeof api.getName === 'function' ? api.getName() : '';
  if (!rawName || isUntitledExcalidrawName(rawName)) return null;
  const base = sanitizeFileBaseName(rawName);
  return !base || isUntitledExcalidrawName(base) ? null : base;
}

export function resolveProjectFilename(
  api: ExcalidrawImperativeAPI,
  now: Date = new Date(),
): string {
  const docBase = resolveNamedDocumentBase(api);
  if (docBase) return `${docBase}.excalidraw`;
  return `sakutto-${formatLocalTimestamp(now)}.excalidraw`;
}

export function resolveExportFilename(
  api: ExcalidrawImperativeAPI,
  format: ExportFormat,
  now: Date = new Date(),
): string {
  const ts = formatLocalTimestamp(now);
  const docBase = resolveNamedDocumentBase(api);
  if (docBase) {
    const normalizedBase = SAKUTTO_TIMESTAMP_NAME_RE.test(docBase) ? 'sakutto' : docBase;
    return `${normalizedBase}-${ts}.${format}`;
  }
  return `sakutto-${ts}.${format}`;
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

type SaveFilePickerWritable = {
  write: (data: Blob | BufferSource | string) => Promise<void>;
  close: () => Promise<void>;
  abort?: () => Promise<void>;
};
type SaveFilePickerHandle = {
  name?: string;
  createWritable: () => Promise<SaveFilePickerWritable>;
};
type SaveFilePickerType = { description?: string; accept: Record<string, string[]> };
type ShowSaveFilePickerFn = (options?: {
  suggestedName?: string;
  types?: SaveFilePickerType[];
}) => Promise<SaveFilePickerHandle>;

async function promptSaveFilePicker(options: {
  suggestedName: string;
  types: SaveFilePickerType[];
}): Promise<
  | { status: 'ok'; handle: SaveFilePickerHandle }
  | { status: 'cancelled' }
  | { status: 'fallback' }
> {
  const picker = (globalThis as { showSaveFilePicker?: ShowSaveFilePickerFn }).showSaveFilePicker;
  if (typeof picker !== 'function') {
    return { status: 'fallback' };
  }
  try {
    const handle = await picker(options);
    return { status: 'ok', handle };
  } catch (err) {
    if ((err as { name?: string } | null)?.name === 'AbortError') {
      return { status: 'cancelled' };
    }
    return { status: 'fallback' };
  }
}

async function writeBlobToFileHandle(handle: SaveFilePickerHandle, blob: Blob): Promise<boolean> {
  let writable: SaveFilePickerWritable | null = null;
  try {
    writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch {
    await writable?.abort?.().catch(() => {});
    return false;
  }
}

function buildImagePickerTypes(initialFmt: ExportFormat): SaveFilePickerType[] {
  const pngType: SaveFilePickerType = {
    description: 'PNG',
    accept: { 'image/png': ['.png'] },
  };
  const svgType: SaveFilePickerType = {
    description: 'SVG',
    accept: { 'image/svg+xml': ['.svg'] },
  };
  return initialFmt === 'svg' ? [svgType, pngType] : [pngType, svgType];
}

function resolvePickedImageFormat(handleName: string | undefined, fallback: ExportFormat): ExportFormat {
  const lower = (handleName ?? '').trim().toLowerCase();
  if (lower.endsWith('.svg')) return 'svg';
  if (lower.endsWith('.png')) return 'png';
  return fallback;
}

async function renderExportBlob(
  targetFmt: ExportFormat,
  {
    sceneData,
    elements,
    canvasBackgroundColor,
    theme,
    autoScale,
    exportPadding,
    embedScene,
    lang,
    preferJpFont,
  }: {
    sceneData: ReturnType<typeof buildExportSceneData>;
    elements: NonDeletedExcalidrawElement[];
    canvasBackgroundColor: string | false;
    theme: 'light' | 'dark';
    autoScale: ReturnType<typeof createAutoExportScaleFn>;
    exportPadding: number;
    embedScene: boolean;
    lang: AppLang;
    preferJpFont?: boolean;
  },
): Promise<Blob> {
  if (targetFmt === 'svg') {
    const svgNode = await exportScene({
      type: 'svg',
      data: sceneData,
      config: {
        canvasBackgroundColor,
        theme,
        padding: exportPadding,
        embedScene,
        skipInliningFonts: true,
      },
    });
    const svgLang = preferJpFont ? 'ja-JP' : lang;
    svgNode.setAttribute('lang', svgLang);
    await inlinePreSplitFontsIntoSvg(svgNode, elements);
    return new Blob([svgNode.outerHTML], { type: MIME_TYPES.svg });
  }
  return exportScene({
    type: 'png',
    data: sceneData,
    config: {
      canvasBackgroundColor,
      theme,
      scale: autoScale,
      padding: exportPadding,
      embedScene,
    },
  });
}

export async function runInstantExportWithApi(
  api: ExcalidrawImperativeAPI | null,
  mode: 'copy' | 'save',
  opts: ExportOpts,
  {
    lang = 'en',
    preferJpFont,
    showToast,
    showSaveDialog = false,
  }: {
    lang?: AppLang;
    preferJpFont?: boolean;
    showToast?: (msg: string) => void;
    showSaveDialog?: boolean;
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

  const fmt = normalizeFormat(opts.format);
  const autoScale = createAutoExportScaleFn(elements, files);
  const exportPadding = opts.padding ? 10 : 0;
  const canvasBackgroundColor: string | false = opts.background
    ? appState.viewBackgroundColor || '#ffffff'
    : false;
  const theme: 'light' | 'dark' = opts.darkMode ? 'dark' : 'light';
  const sceneData = buildExportSceneData(elements, appState, files);

  try {
    if (mode === 'copy') {
      await exportToClipboard({
        type: 'png',
        data: sceneData,
        config: {
          canvasBackgroundColor,
          theme,
          scale: autoScale,
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

    const renderOpts = {
      sceneData,
      elements,
      canvasBackgroundColor,
      theme,
      autoScale,
      exportPadding,
      embedScene: opts.embedScene,
      lang,
      preferJpFont,
    };
    const suggestedName = resolveExportFilename(api, fmt);

    let targetFmt: ExportFormat = fmt;
    let savedToHandle = false;

    if (showSaveDialog) {
      const pickerRes = await promptSaveFilePicker({
        suggestedName,
        types: buildImagePickerTypes(fmt),
      });
      if (pickerRes.status === 'cancelled') {
        return { ok: false, reason: 'cancelled' };
      }
      if (pickerRes.status === 'ok') {
        targetFmt = resolvePickedImageFormat(pickerRes.handle.name, fmt);
        const blob = await renderExportBlob(targetFmt, renderOpts);
        const wrote = await writeBlobToFileHandle(pickerRes.handle, blob);
        if (!wrote) {
          showToast?.(t.toastExportFailed);
          return { ok: false, reason: 'export-failed' };
        }
        savedToHandle = true;
      }
    }

    if (!savedToHandle) {
      const blob = await renderExportBlob(targetFmt, renderOpts);
      triggerBlobDownload(blob, suggestedName);
    }

    const msg = exportedOnlySelected ? t.toastSavedSelected : t.toastSavedAll;
    showToast?.(msg);
    return {
      ok: true,
      mode,
      format: targetFmt,
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
  const suggestedName = resolveProjectFilename(api);

  const pickerRes = await promptSaveFilePicker({
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
  if (pickerRes.status === 'cancelled') {
    return false;
  }
  if (pickerRes.status === 'ok') {
    const wrote = await writeBlobToFileHandle(pickerRes.handle, blob);
    if (!wrote) {
      showToast?.(getMessages(lang).toastExportFailed);
      return false;
    }
    const savedBase = pickerRes.handle.name ? sanitizeFileBaseName(pickerRes.handle.name) : '';
    if (savedBase && !isUntitledExcalidrawName(savedBase)) {
      silently(() =>
        api.updateScene({
          appState: { name: savedBase } as never,
          captureUpdate: CaptureUpdateAction.NEVER,
        }),
      );
    }
    showToast?.(getMessages(lang).toastSceneSaved);
    return true;
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
    const fileName =
      'name' in file && typeof (file as { name?: unknown }).name === 'string'
        ? (file as { name: string }).name
        : '';
    const loadedBase = fileName ? sanitizeFileBaseName(fileName) : '';
    const nextName =
      loadedBase && !isUntitledExcalidrawName(loadedBase) ? loadedBase : undefined;
    const nextAppState = {
      ...currentAppState,
      ...loaded.appState,
      ...(nextName ? { name: nextName } : {}),
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
