import {
  CaptureUpdateAction,
  exportScene,
  exportToClipboard,
  FONT_FAMILY,
  Fonts,
  getNonDeletedElements,
  loadFromBlob,
  MIME_TYPES,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement, NonDeletedExcalidrawElement, OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppLang, ExportFormat, ExportOpts, Prefs } from '../types/annotator';
import { getMessages } from '../i18n/messages';
import {
  cancelPendingScenePersist,
  clearIndexedDbFiles,
  DEFAULT_PEN_COLOR,
  DEFAULT_PINK,
  LS_ELEMENTS_KEY,
  LS_STATE_KEY,
  normalizeFormat,
  normalizeHexColor,
  normalizeScale,
  savePrefs,
  silently,
} from '../services/storageBridge';
import {
  clearRedactStyleIsolationState,
  updateRedactStyleIsolationPenColor,
} from './redactProcessor';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CJK_FALLBACK_CHAR_RE = /[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef\u{20000}-\u{2ffff}]/u;

export function matchesUnicodeRange(unicodeRange: string | undefined, text: string): boolean {
  if (!text) return false;
  const raw = (unicodeRange || '').trim();
  if (!raw || raw.toUpperCase() === 'U+0-10FFFF') return true;

  const ranges: Array<[number, number]> = [];
  for (const part of raw.split(',')) {
    const token = part.trim().replace(/^U\+/i, '');
    if (!token) continue;
    if (token.includes('-')) {
      const [startHex, endHex] = token.split('-');
      const start = parseInt(startHex, 16);
      const end = parseInt(endHex, 16);
      if (!Number.isNaN(start) && !Number.isNaN(end)) {
        ranges.push([start, end]);
      }
    } else if (token.includes('?')) {
      const start = parseInt(token.replace(/\?/g, '0'), 16);
      const end = parseInt(token.replace(/\?/g, 'F'), 16);
      if (!Number.isNaN(start) && !Number.isNaN(end)) {
        ranges.push([start, end]);
      }
    } else {
      const cp = parseInt(token, 16);
      if (!Number.isNaN(cp)) {
        ranges.push([cp, cp]);
      }
    }
  }

  if (ranges.length === 0) return true;

  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp == null) continue;
    for (const [start, end] of ranges) {
      if (cp >= start && cp <= end) return true;
    }
  }
  return false;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Inlines pre-split local WOFF2 font chunks matching the exact characters used
 * in the exported SVG, avoiding WASM/Emscripten `new Function` calls under strict CSP.
 */
export async function inlinePreSplitFontsIntoSvg(
  svgNode: SVGSVGElement,
  elements: readonly ExcalidrawElement[],
  {
    fetchFn = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
    registeredFonts = Fonts.registered,
  }: {
    fetchFn?: typeof fetch | null;
    registeredFonts?: typeof Fonts.registered;
  } = {},
): Promise<number> {
  if (!fetchFn) return 0;

  const charsByFamily = new Map<number, Set<string>>();
  for (const el of elements) {
    if (el.type === 'text' && !el.isDeleted) {
      const textEl = el as ExcalidrawElement & { fontFamily?: number; originalText?: string; text?: string };
      const familyId = textEl.fontFamily;
      const content = textEl.originalText || textEl.text || '';
      if (typeof familyId === 'number' && content) {
        let charSet = charsByFamily.get(familyId);
        if (!charSet) {
          charSet = new Set();
          charsByFamily.set(familyId, charSet);
        }
        for (const ch of content) charSet.add(ch);
      }
    }
  }

  if (charsByFamily.size === 0) return 0;

  // Include Xiaolai CJK fallback when hand-drawn fonts (Excalifont / Virgil) contain CJK characters
  let xiaolaiId: number | null = null;
  for (const [id, entry] of registeredFonts.entries()) {
    const firstFamily = entry.fontFaces[0]?.fontFace?.family;
    if (firstFamily === 'Xiaolai' || firstFamily === '"Xiaolai"') {
      xiaolaiId = id;
      break;
    }
  }

  if (xiaolaiId !== null) {
    for (const handDrawnId of [FONT_FAMILY.Excalifont, FONT_FAMILY.Virgil]) {
      const usedChars = charsByFamily.get(handDrawnId);
      if (!usedChars) continue;
      const joined = Array.from(usedChars).join('');
      if (CJK_FALLBACK_CHAR_RE.test(joined)) {
        let fallbackSet = charsByFamily.get(xiaolaiId);
        if (!fallbackSet) {
          fallbackSet = new Set();
          charsByFamily.set(xiaolaiId, fallbackSet);
        }
        for (const ch of usedChars) fallbackSet.add(ch);
      }
    }
  }

  const declarations: string[] = [];
  const seenUrls = new Set<string>();

  for (const [familyId, charSet] of charsByFamily.entries()) {
    const entry = registeredFonts.get(familyId);
    if (!entry || entry.metadata?.local) continue;
    const text = Array.from(charSet).join('');

    for (const face of entry.fontFaces) {
      const unicodeRange = face.fontFace?.unicodeRange;
      if (!matchesUnicodeRange(unicodeRange, text)) continue;
      const rawUrl = face.urls[0];
      if (!rawUrl) continue;
      const urlStr = typeof rawUrl === 'string' ? rawUrl : rawUrl.toString();
      if (seenUrls.has(urlStr)) continue;
      seenUrls.add(urlStr);

      try {
        let dataUrl: string;
        if (urlStr.startsWith('data:')) {
          dataUrl = urlStr;
        } else {
          const resp = await fetchFn(urlStr, { credentials: 'same-origin', cache: 'force-cache' });
          if (!resp.ok) continue;
          const buf = await resp.arrayBuffer();
          dataUrl = `data:font/woff2;base64,${arrayBufferToBase64(buf)}`;
        }
        const family = face.fontFace.family;
        const rangeRule = unicodeRange ? ` unicode-range: ${unicodeRange};` : '';
        declarations.push(
          `@font-face { font-family: ${family}; src: url(${dataUrl}) format('woff2');${rangeRule} }`,
        );
      } catch {
        // Skip unreadable chunk silently so SVG export always succeeds
      }
    }
  }

  if (declarations.length === 0) return 0;

  const doc = svgNode.ownerDocument || document;
  let defs = svgNode.querySelector('defs');
  if (!defs) {
    defs = doc.createElementNS(SVG_NS, 'defs');
    svgNode.insertBefore(defs, svgNode.firstChild);
  }
  let styleEl = defs.querySelector('style.style-fonts');
  if (!styleEl) {
    styleEl = doc.createElementNS(SVG_NS, 'style');
    styleEl.setAttribute('class', 'style-fonts');
    defs.appendChild(styleEl);
  }
  const existingCss = styleEl.textContent ? `${styleEl.textContent}\n` : '';
  styleEl.textContent = `${existingCss}${declarations.join('\n')}`;

  return declarations.length;
}

export function filterTargetElementsForExport(
  allElements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  onlySelected: boolean,
): {
  elements: NonDeletedExcalidrawElement[];
  exportedOnlySelected: boolean;
} {
  const nonDeleted = getNonDeletedElements(allElements);
  if (!onlySelected) {
    return { elements: [...nonDeleted], exportedOnlySelected: false };
  }

  const selectedIds = appState.selectedElementIds ?? {};
  const selectedGroupIds = appState.selectedGroupIds ?? {};
  const directlySelectedIds = new Set(
    Object.keys(selectedIds).filter((id) => Boolean(selectedIds[id])),
  );
  const activeGroupIds = new Set(
    Object.keys(selectedGroupIds).filter((gid) => Boolean(selectedGroupIds[gid])),
  );

  if (directlySelectedIds.size === 0 && activeGroupIds.size === 0) {
    return { elements: [...nonDeleted], exportedOnlySelected: false };
  }

  // First pass: elements directly selected or belonging to a selected group
  const includedIds = new Set<string>();
  for (const el of nonDeleted) {
    if (
      directlySelectedIds.has(el.id) ||
      (Array.isArray(el.groupIds) && el.groupIds.some((gid) => activeGroupIds.has(gid)))
    ) {
      includedIds.add(el.id);
    }
  }

  // Second pass: include bound text elements and children inside selected frames
  for (const el of nonDeleted) {
    const containerId = (el as { containerId?: string | null }).containerId;
    if (containerId && includedIds.has(containerId)) {
      includedIds.add(el.id);
    }
    if (el.frameId && includedIds.has(el.frameId)) {
      includedIds.add(el.id);
    }
  }

  const filtered = nonDeleted.filter((el) => includedIds.has(el.id));
  if (filtered.length === 0) {
    return { elements: [...nonDeleted], exportedOnlySelected: false };
  }

  return { elements: filtered, exportedOnlySelected: true };
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body?.append(a);
  a.click();
  a.remove();
  setTimeout(() => silently(() => URL.revokeObjectURL(url)), 1500);
}

export async function runInstantExportWithApi(
  api: ExcalidrawImperativeAPI | null,
  mode: 'copy' | 'png',
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
  mode?: 'copy' | 'png';
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
  const canvasBackgroundColor = opts.background
    ? appState.viewBackgroundColor || '#ffffff'
    : false;
  const theme = opts.darkMode ? 'dark' : 'light';

  try {
    if (mode === 'copy') {
      await exportToClipboard({
        type: 'png',
        data: {
          elements,
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor || '#ffffff',
            gridSize: appState.gridSize,
            gridStep: appState.gridStep,
            gridModeEnabled: appState.gridModeEnabled,
          },
          files,
        },
        config: {
          canvasBackgroundColor,
          theme,
          scale,
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

    const baseName = (typeof api.getName === 'function' && api.getName()) || 'sakuttodraw';
    if (fmt === 'svg') {
      const svgNode = await exportScene({
        type: 'svg',
        data: {
          elements,
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor || '#ffffff',
            gridSize: appState.gridSize,
            gridStep: appState.gridStep,
            gridModeEnabled: appState.gridModeEnabled,
          },
          files,
        },
        config: {
          canvasBackgroundColor,
          theme,
          embedScene: opts.embedScene,
          skipInliningFonts: true,
        },
      });
      const svgLang = preferJpFont ? 'ja-JP' : lang;
      svgNode.setAttribute('lang', svgLang);
      await inlinePreSplitFontsIntoSvg(svgNode, elements);
      const svgText = svgNode.outerHTML;
      const blob = new Blob([svgText], { type: MIME_TYPES.svg });
      triggerBlobDownload(blob, `${baseName}.svg`);
    } else {
      const pngBlob = await exportScene({
        type: 'png',
        data: {
          elements,
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor || '#ffffff',
            gridSize: appState.gridSize,
            gridStep: appState.gridStep,
            gridModeEnabled: appState.gridModeEnabled,
          },
          files,
        },
        config: {
          canvasBackgroundColor,
          theme,
          scale,
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
): Promise<{ ok: boolean; pinkApplied: boolean; reason?: string }> {
  if (!api) {
    return { ok: false, pinkApplied: false, reason: 'api-not-ready' };
  }

  // Prevent any debounced onChange snapshot from overwriting the freshly reset storage
  cancelPendingScenePersist();
  clearRedactStyleIsolationState();

  api.resetScene();
  silently(() => api.history?.clear());

  const penColor = normalizeHexColor(prefs.quickOpts.defaultPenColor, DEFAULT_PEN_COLOR);
  api.updateScene({
    appState: {
      currentItemStrokeColor: penColor,
    },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  const pinkApplied = penColor === DEFAULT_PINK;

  if (storage) {
    silently(() => storage.setItem(LS_ELEMENTS_KEY, '[]'));
    silently(() => {
      const raw = storage.getItem(LS_STATE_KEY);
      const st = raw ? JSON.parse(raw) : {};
      st.currentItemStrokeColor = penColor;
      storage.setItem(LS_STATE_KEY, JSON.stringify(st));
    });
  }

  await clearIndexedDbFiles(idb);
  savePrefs(prefs, storage);

  showToast?.(getMessages(prefs.lang).toastResetDone);
  return { ok: true, pinkApplied };
}

export async function applyPenColorWithApi(
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
): Promise<{ ok: boolean; color: string }> {
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

  if (storage) {
    silently(() => {
      const raw = storage.getItem(LS_STATE_KEY);
      const st = raw ? JSON.parse(raw) : {};
      st.currentItemStrokeColor = normalized;
      storage.setItem(LS_STATE_KEY, JSON.stringify(st));
    });
  }

  showToast?.(getMessages(lang).toastPenColorChanged);
  return { ok: true, color: normalized };
}

export async function applyCanvasBackgroundWithApi(
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
): Promise<{ ok: boolean; color: string }> {
  const normalized = '#' + String(hex || '#ffffff').trim().toLowerCase().replace(/^#/, '');
  if (!api) {
    return { ok: false, color: normalized };
  }

  api.updateScene({
    appState: {
      viewBackgroundColor: normalized,
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  if (storage) {
    silently(() => {
      const raw = storage.getItem(LS_STATE_KEY);
      const st = raw ? JSON.parse(raw) : {};
      st.viewBackgroundColor = normalized;
      storage.setItem(LS_STATE_KEY, JSON.stringify(st));
    });
  }

  showToast?.(getMessages(lang).toastBgChanged);
  return { ok: true, color: normalized };
}

type SaveFilePickerWritable = {
  write: (data: Blob | BufferSource | string) => Promise<void>;
  close: () => Promise<void>;
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
  const json = serializeAsJSON(elements, appState, files, 'local');
  const blob = new Blob([json], { type: MIME_TYPES.excalidraw });
  const baseName = (typeof api.getName === 'function' && api.getName()) || 'sakuttodraw';
  const suggestedName = baseName.endsWith('.excalidraw') ? baseName : `${baseName}.excalidraw`;

  const picker = (globalThis as { showSaveFilePicker?: ShowSaveFilePickerFn }).showSaveFilePicker;
  if (typeof picker === 'function') {
    try {
      const handle = await picker({
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
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      showToast?.(getMessages(lang).toastSceneSaved);
      return true;
    } catch (err) {
      if ((err as { name?: string } | null)?.name === 'AbortError') {
        return false;
      }
      // Fall back to direct blob download if File System Access API is blocked/unavailable
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
  cancelPendingScenePersist();
  clearRedactStyleIsolationState();
  try {
    const currentAppState = api.getAppState();
    const currentElements = api.getSceneElements();
    const loaded = await loadFromBlob(file, currentAppState, currentElements);
    if (loaded.files) {
      api.addFiles(Object.values(loaded.files));
    }
    const nextAppState = {
      ...currentAppState,
      ...loaded.appState,
      ...(defaultPenColor ? { currentItemStrokeColor: normalizeHexColor(defaultPenColor, DEFAULT_PEN_COLOR) } : {}),
    };
    api.updateScene({
      elements: loaded.elements,
      appState: nextAppState as AppState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    showToast?.(t.toastFileLoaded);
    return true;
  } catch {
    showToast?.(t.toastFileLoadFailed);
    return false;
  }
}

function makeElementId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  }
  return `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function nextElementNonce(): number {
  return Math.floor(Math.random() * 2147483647) + 1;
}

function collectSelectedTargetIds(
  allElements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
): Set<string> {
  const selectedIds = appState.selectedElementIds ?? {};
  const selectedGroupIds = appState.selectedGroupIds ?? {};
  const targetIds = new Set<string>();

  for (const el of allElements) {
    if (el.isDeleted || el.locked) continue;
    if (
      selectedIds[el.id] ||
      (Array.isArray(el.groupIds) && el.groupIds.some((gid) => Boolean(selectedGroupIds[gid])))
    ) {
      targetIds.add(el.id);
    }
  }

  // Expand to bound text and frame children so containers stay consistent.
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const el of allElements) {
      if (el.isDeleted || targetIds.has(el.id)) continue;
      const containerId = (el as { containerId?: string | null }).containerId;
      if (containerId && targetIds.has(containerId)) {
        targetIds.add(el.id);
        expanded = true;
        continue;
      }
      if (!el.locked && el.frameId && targetIds.has(el.frameId)) {
        targetIds.add(el.id);
        expanded = true;
      }
    }
  }

  return targetIds;
}

/**
 * Deletes the currently selected elements via ExcalidrawImperativeAPI so mobile
 * action buttons work reliably regardless of DOM focus or keyboard handling.
 */
export function deleteSelectedElementsWithApi(api: ExcalidrawImperativeAPI | null): boolean {
  if (!api) return false;
  const appState = api.getAppState();
  if (!appState || appState.viewModeEnabled) return false;

  const allElements =
    typeof api.getSceneElementsIncludingDeleted === 'function'
      ? api.getSceneElementsIncludingDeleted()
      : api.getSceneElements();
  const idsToDelete = collectSelectedTargetIds(allElements, appState);
  if (idsToDelete.size === 0) return false;

  const now = Date.now();
  const nextElements = allElements.map((el) => {
    if (idsToDelete.has(el.id)) {
      return {
        ...el,
        isDeleted: true,
        version: el.version + 1,
        versionNonce: nextElementNonce(),
        updated: now,
      };
    }

    let changed = false;
    let nextBound = el.boundElements;
    if (Array.isArray(el.boundElements) && el.boundElements.some((b) => idsToDelete.has(b.id))) {
      const filtered = el.boundElements.filter((b) => !idsToDelete.has(b.id));
      nextBound = filtered.length > 0 ? filtered : null;
      changed = true;
    }

    const linear = el as ExcalidrawElement & {
      startBinding?: { elementId: string } | null;
      endBinding?: { elementId: string } | null;
    };
    let nextStartBinding = linear.startBinding;
    let nextEndBinding = linear.endBinding;
    if (linear.startBinding && idsToDelete.has(linear.startBinding.elementId)) {
      nextStartBinding = null;
      changed = true;
    }
    if (linear.endBinding && idsToDelete.has(linear.endBinding.elementId)) {
      nextEndBinding = null;
      changed = true;
    }

    if (!changed) return el;
    return {
      ...el,
      boundElements: nextBound,
      ...(nextStartBinding !== linear.startBinding ? { startBinding: nextStartBinding } : {}),
      ...(nextEndBinding !== linear.endBinding ? { endBinding: nextEndBinding } : {}),
      version: el.version + 1,
      versionNonce: nextElementNonce(),
      updated: now,
    } as ExcalidrawElement;
  });

  api.updateScene({
    elements: nextElements as OrderedExcalidrawElement[],
    appState: {
      selectedElementIds: {},
      selectedGroupIds: {},
      editingGroupId: null,
      selectedLinearElement: null,
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return true;
}

/**
 * Duplicates the currently selected elements via ExcalidrawImperativeAPI,
 * remapping IDs, groups, bindings, and frame relationships.
 */
export function duplicateSelectedElementsWithApi(api: ExcalidrawImperativeAPI | null): boolean {
  if (!api) return false;
  const appState = api.getAppState();
  if (!appState || appState.viewModeEnabled) return false;

  const allElements =
    typeof api.getSceneElementsIncludingDeleted === 'function'
      ? api.getSceneElementsIncludingDeleted()
      : api.getSceneElements();
  const targetIds = collectSelectedTargetIds(allElements, appState);
  if (targetIds.size === 0) return false;

  const targets = allElements.filter((el) => !el.isDeleted && targetIds.has(el.id));
  if (targets.length === 0) return false;

  const idMap = new Map<string, string>();
  const groupIdMap = new Map<string, string>();
  for (const el of targets) {
    idMap.set(el.id, makeElementId());
    if (Array.isArray(el.groupIds)) {
      for (const gid of el.groupIds) {
        if (!groupIdMap.has(gid)) {
          groupIdMap.set(gid, makeElementId());
        }
      }
    }
  }

  const now = Date.now();
  const prevSelected = appState.selectedElementIds ?? {};
  const nextSelectedElementIds: Record<string, true> = {};
  const clones: OrderedExcalidrawElement[] = targets.map((el) => {
    const nextId = idMap.get(el.id)!;
    const containerId = (el as { containerId?: string | null }).containerId;
    if (prevSelected[el.id] || !containerId || !idMap.has(containerId)) {
      if (!containerId || !idMap.has(containerId)) {
        nextSelectedElementIds[nextId] = true;
      }
    }

    const nextBound = Array.isArray(el.boundElements)
      ? el.boundElements
          .filter((b) => idMap.has(b.id))
          .map((b) => ({ ...b, id: idMap.get(b.id)! }))
      : null;

    const linear = el as ExcalidrawElement & {
      points?: ReadonlyArray<readonly [number, number]>;
      pressures?: readonly number[];
      startBinding?: { elementId: string } | null;
      endBinding?: { elementId: string } | null;
    };
    const imageLike = el as ExcalidrawElement & {
      scale?: readonly [number, number];
    };

    const cloned: Record<string, unknown> = {
      ...el,
      id: nextId,
      x: el.x + 10,
      y: el.y + 10,
      locked: false,
      seed: nextElementNonce(),
      version: 1,
      versionNonce: nextElementNonce(),
      updated: now,
      created: now,
      index: null,
      groupIds: Array.isArray(el.groupIds)
        ? el.groupIds.map((gid) => groupIdMap.get(gid) ?? gid)
        : [],
      frameId: el.frameId && idMap.has(el.frameId) ? idMap.get(el.frameId)! : el.frameId,
      boundElements: nextBound && nextBound.length > 0 ? nextBound : null,
      ...(containerId !== undefined
        ? { containerId: containerId && idMap.has(containerId) ? idMap.get(containerId)! : null }
        : {}),
      ...(linear.points ? { points: linear.points.map((pt) => [...pt]) } : {}),
      ...(linear.pressures ? { pressures: [...linear.pressures] } : {}),
      ...(imageLike.scale ? { scale: [...imageLike.scale] } : {}),
      ...(el.customData ? { customData: { ...el.customData } } : {}),
    };

    if ('startBinding' in linear) {
      cloned.startBinding =
        linear.startBinding && idMap.has(linear.startBinding.elementId)
          ? { ...linear.startBinding, elementId: idMap.get(linear.startBinding.elementId)! }
          : null;
    }
    if ('endBinding' in linear) {
      cloned.endBinding =
        linear.endBinding && idMap.has(linear.endBinding.elementId)
          ? { ...linear.endBinding, elementId: idMap.get(linear.endBinding.elementId)! }
          : null;
    }

    return cloned as unknown as OrderedExcalidrawElement;
  });

  const nextSelectedGroupIds: Record<string, boolean> = {};
  for (const [gid, active] of Object.entries(appState.selectedGroupIds ?? {})) {
    if (!active) continue;
    nextSelectedGroupIds[groupIdMap.get(gid) ?? gid] = true;
  }

  api.updateScene({
    elements: [...allElements, ...clones] as OrderedExcalidrawElement[],
    appState: {
      selectedElementIds: nextSelectedElementIds,
      selectedGroupIds: nextSelectedGroupIds,
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return true;
}
