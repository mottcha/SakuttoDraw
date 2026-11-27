// Shared runtime state (Excalidraw API / prefs), language switching, toast, and native tool helpers.
import { FONT_FAMILY } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { AppLang, Prefs } from '../../types/annotator';
import { EXCALIDRAW_SELECTORS, TESTID_TO_TOOL_TYPE } from '../../excalidraw/domContract';
import { createDefaultPrefs, resolvePreferJpFont, savePrefs } from '../../services/storageBridge';
import { silently } from '../../utils/common';
import { applySakuttoFontOverrides, refreshSceneTextFonts } from '../jpGlyphOverride';
import { REDACT_TOOL_CUSTOM_TYPE } from './constants';
import { el } from './dom';

export const runtime: {
  api: ExcalidrawImperativeAPI | null;
  prefs: Prefs;
  lastShapeOther: 'arrow' | 'line' | 'diamond' | 'redact';
  lastMobileShapeOther: 'ellipse' | 'arrow' | 'line' | 'diamond' | 'redact';
  isBusy: boolean;
  drawAssistAccOpen: boolean;
  expAccOpen: boolean;
  expAdvAccOpen: boolean;
  lastCanvasBg: string | null;
  onLangChange: ((lang: AppLang) => void) | null;
} = {
  api: null,
  prefs: createDefaultPrefs(),
  lastShapeOther: 'arrow',
  lastMobileShapeOther: 'ellipse',
  isBusy: false,
  drawAssistAccOpen: false,
  expAccOpen: false,
  expAdvAccOpen: false,
  lastCanvasBg: null,
  onLangChange: null,
};

let syncScheduled = false;
let syncRafId: number | null = null;
let syncTimerId: ReturnType<typeof setTimeout> | null = null;
// Registered by index.ts so feature modules can request re-sync without importing index.ts (no cycles).
let syncHandler: (() => void) | null = null;
const runtimeChangeListeners = new Set<() => void>();

export function subscribeRuntimeChange(listener: () => void): () => void {
  runtimeChangeListeners.add(listener);
  return () => {
    runtimeChangeListeners.delete(listener);
  };
}

export function notifyRuntimeChange(): void {
  for (const listener of runtimeChangeListeners) {
    silently(listener);
  }
}

export function setSyncHandler(handler: (() => void) | null): void {
  syncHandler = handler;
}

export function cancelScheduledSync(): void {
  syncScheduled = false;
  if (syncRafId !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(syncRafId);
    syncRafId = null;
  }
  if (syncTimerId !== null) {
    clearTimeout(syncTimerId);
    syncTimerId = null;
  }
}

export function scheduleSync(): void {
  if (syncScheduled) return;
  syncScheduled = true;
  const run = () => {
    syncScheduled = false;
    syncRafId = null;
    syncTimerId = null;
    syncHandler?.();
  };
  if (document.hidden || typeof requestAnimationFrame !== 'function') {
    syncTimerId = setTimeout(run, 0);
  } else {
    syncRafId = requestAnimationFrame(run);
  }
}

let toastNode: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function clearToastState(): void {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = undefined;
  }
  toastNode?.remove();
  toastNode = null;
}

export function attachExcalidrawAPI(api: ExcalidrawImperativeAPI | null): void {
  runtime.api = api;
}

export function setLangChangeListener(cb: ((lang: AppLang) => void) | null): void {
  runtime.onLangChange = cb;
}

export function applyLanguage(nextLang: AppLang): void {
  runtime.prefs.lang = nextLang;
  savePrefs(runtime.prefs);
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = nextLang;
  }
  applySakuttoFontOverrides({
    preferJpFont: resolvePreferJpFont(runtime.prefs),
    codeLigatures: runtime.prefs.codeLigatures,
  });
  void refreshSceneTextFonts(runtime.api);
  runtime.onLangChange?.(nextLang);
  notifyRuntimeChange();
  scheduleSync();
}

export function applyPreferJpFont(enabled: boolean): void {
  runtime.prefs.preferJpFont = enabled;
  savePrefs(runtime.prefs);
  applySakuttoFontOverrides({
    preferJpFont: enabled,
    codeLigatures: runtime.prefs.codeLigatures,
  });
  void refreshSceneTextFonts(runtime.api);
  notifyRuntimeChange();
}

export function applyCodeLigatures(enabled: boolean): void {
  runtime.prefs.codeLigatures = enabled;
  savePrefs(runtime.prefs);
  applySakuttoFontOverrides({
    preferJpFont: resolvePreferJpFont(runtime.prefs),
    codeLigatures: enabled,
  });
  void refreshSceneTextFonts(runtime.api, { targetFamilyIds: [FONT_FAMILY.Cascadia] });
  notifyRuntimeChange();
}

export function showToast(message: string): void {
  if (typeof document === 'undefined' || !document.body) return;
  const host = document.querySelector(EXCALIDRAW_SELECTORS.root) || document.body;
  if (!toastNode?.isConnected || toastNode.parentElement !== host) {
    toastNode?.remove();
    toastNode = el('div', { class: 'exq-toast', role: 'status', 'aria-live': 'polite' });
    host.append(toastNode);
  }
  toastNode.textContent = message;
  toastNode.classList.add('exq-toast-show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastTimer = undefined;
    toastNode?.classList.remove('exq-toast-show');
  }, 1800);
}

export function sendEscape(target: EventTarget = document): void {
  silently(() => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }),
    );
  });
}

export function isRedactToolActive(): boolean {
  const activeTool = silently(() => runtime.api?.getAppState()?.activeTool);
  return activeTool?.type === 'custom' && activeTool?.customType === REDACT_TOOL_CUSTOM_TYPE;
}

export function hasSelectedElements(): boolean {
  if (!runtime.api) return false;
  const st = silently(() => runtime.api?.getAppState());
  if (!st || st.viewModeEnabled) return false;
  const sel = st.selectedElementIds;
  return Boolean(sel && Object.values(sel).some(Boolean));
}

export function activateRedactTool(): boolean {
  if (!runtime.api) return false;
  runtime.api.setActiveTool({ type: 'custom', customType: REDACT_TOOL_CUSTOM_TYPE });
  scheduleSync();
  return true;
}

export function getActiveNativeToolId(): 'arrow' | 'line' | 'diamond' | 'redact' | null {
  if (!runtime.api) return null;
  if (isRedactToolActive()) return 'redact';
  const activeType = silently(() => runtime.api?.getAppState()?.activeTool?.type);
  if (activeType === 'arrow' || activeType === 'line' || activeType === 'diamond') {
    return activeType;
  }
  return null;
}

export function clickNativeTool(testId: string): boolean {
  if (!runtime.api) return false;
  const toolType = TESTID_TO_TOOL_TYPE[testId];
  if (!toolType) return false;
  runtime.api.setActiveTool({ type: toolType as never });
  return true;
}

/* ================= Text Tool Auto-Resize Guard Helpers ================= */
export function isTextToolActive(): boolean {
  if (!runtime.api) return false;
  return silently(() => runtime.api?.getAppState()?.activeTool?.type) === 'text';
}

export function focusActiveTextWysiwyg(): boolean {
  const editable = document.querySelector<HTMLTextAreaElement>(EXCALIDRAW_SELECTORS.wysiwygTextarea);
  if (!editable) return false;
  if (document.activeElement !== editable) {
    silently(() => editable.focus({ preventScroll: true }));
  }
  return true;
}

export function closeFloatingPopovers(exceptNode: Node | null): void {
  document.querySelectorAll('.exq-shape-group.exq-open').forEach((wrap) => {
    if (exceptNode && wrap.contains(exceptNode)) return;
    wrap.classList.remove('exq-open');
    wrap.querySelector('.exq-shape-trigger')?.setAttribute('aria-expanded', 'false');
  });
}
