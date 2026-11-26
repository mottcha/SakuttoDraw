// Shared runtime state (Excalidraw API / prefs), language switching, toast, and native tool helpers.
import { FONT_FAMILY } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { AppLang, Prefs } from '../../types/annotator';
import {
  EXCALIDRAW_SELECTORS,
  EXCALIDRAW_TESTIDS,
  TESTID_TO_TOOL_TYPE,
  toolbarTestIdSelector,
} from '../../excalidraw/domContract';
import { createDefaultPrefs, resolvePreferJpFont, savePrefs } from '../../services/storageBridge';
import { silently } from '../../utils/common';
import { applySakuttoFontOverrides, refreshSceneTextFonts } from '../jpGlyphOverride';
import { REDACT_TOOL_CUSTOM_TYPE, SHAPE_OTHER_ITEMS } from './constants';
import { el } from './dom';

export const runtime: {
  api: ExcalidrawImperativeAPI | null;
  prefs: Prefs;
  lastShapeOther: 'arrow' | 'line' | 'diamond' | 'redact';
  lastMobileShapeOther: 'ellipse' | 'arrow' | 'line' | 'diamond' | 'redact';
  isBusy: boolean;
  drawAssistAccOpen: boolean;
  expAccOpen: boolean;
  lastCanvasBg: string | null;
  primarySelIconSig: string;
  onLangChange: ((lang: AppLang) => void) | null;
} = {
  api: null,
  prefs: createDefaultPrefs(),
  lastShapeOther: 'arrow',
  lastMobileShapeOther: 'ellipse',
  isBusy: false,
  drawAssistAccOpen: false,
  expAccOpen: false,
  lastCanvasBg: null,
  primarySelIconSig: '',
  onLangChange: null,
};

let syncScheduled = false;
// Registered by index.ts so feature modules can request re-sync without importing index.ts (no cycles).
let syncHandler: (() => void) | null = null;

export function setSyncHandler(handler: (() => void) | null): void {
  syncHandler = handler;
}

export function scheduleSync(): void {
  if (syncScheduled) return;
  syncScheduled = true;
  const run = () => {
    syncScheduled = false;
    syncHandler?.();
  };
  if (document.hidden || typeof requestAnimationFrame !== 'function') {
    setTimeout(run, 0);
  } else {
    requestAnimationFrame(run);
  }
}

let toastNode: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

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
}

export function applyCodeLigatures(enabled: boolean): void {
  runtime.prefs.codeLigatures = enabled;
  savePrefs(runtime.prefs);
  applySakuttoFontOverrides({
    preferJpFont: resolvePreferJpFont(runtime.prefs),
    codeLigatures: enabled,
  });
  void refreshSceneTextFonts(runtime.api, { targetFamilyIds: [FONT_FAMILY.Cascadia] });
}

export function showToast(message: string): void {
  if (typeof document === 'undefined' || !document.body) return;
  if (!toastNode || !toastNode.isConnected) {
    toastNode = el('div', { class: 'exq-toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastNode);
  }
  toastNode.textContent = message;
  toastNode.classList.add('exq-toast-show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastNode?.classList.remove('exq-toast-show'), 1800);
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

export function activateRedactTool(): boolean {
  if (!runtime.api) return false;
  runtime.api.setActiveTool({ type: 'custom', customType: REDACT_TOOL_CUSTOM_TYPE });
  scheduleSync();
  return true;
}

export function getActiveNativeToolId(root: ParentNode = document): 'arrow' | 'line' | 'diamond' | 'redact' | null {
  if (runtime.api) {
    const activeTool = silently(() => runtime.api?.getAppState()?.activeTool);
    if (activeTool?.type === 'custom' && activeTool?.customType === REDACT_TOOL_CUSTOM_TYPE) {
      return 'redact';
    }
    const activeType = activeTool?.type;
    if (activeType === 'arrow' || activeType === 'line' || activeType === 'diamond') {
      return activeType;
    }
  }
  for (const item of SHAPE_OTHER_ITEMS) {
    if (item.id === 'redact') continue;
    const btn = root.querySelector(toolbarTestIdSelector(item.testId));
    if (btn?.classList.contains('ToolIcon--checked')) return item.id;
  }
  return null;
}

export function clickNativeTool(testId: string, root: ParentNode = document): boolean {
  if (runtime.api) {
    const toolType = TESTID_TO_TOOL_TYPE[testId];
    if (toolType) {
      runtime.api.setActiveTool({ type: toolType as never });
      return true;
    }
  }
  const btn = root.querySelector<HTMLElement>(toolbarTestIdSelector(testId));
  if (btn) {
    btn.click();
    return true;
  }
  return false;
}

/* ================= Text Tool Auto-Resize Guard Helpers ================= */
export function isTextToolActive(root: ParentNode = document): boolean {
  if (runtime.api) {
    const t = silently(() => runtime.api?.getAppState()?.activeTool?.type);
    if (t) return t === 'text';
  }
  return !!(
    root.querySelector(`${toolbarTestIdSelector(EXCALIDRAW_TESTIDS.text)}.ToolIcon--checked`) ||
    root.querySelector(`${EXCALIDRAW_SELECTORS.toolbar} [data-exq-mobile-tool="text"].exq-active`)
  );
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
