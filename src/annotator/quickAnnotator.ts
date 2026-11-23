import { CaptureUpdateAction } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { AppLang, ExportFormat, ExportScale, Prefs } from '../types/annotator';
import { getMessages } from '../i18n/messages';
import {
  bootstrapCleanCanvas,
  clearIndexedDbFiles,
  DEFAULT_PEN_COLOR,
  DEFAULT_PINK,
  DEFAULT_PREFS,
  LS_STATE_KEY,
  loadPrefs,
  normalizeFormat,
  normalizeHexColor,
  normalizeScale,
  PEN_COLOR_SWATCHES,
  savePrefs,
  shouldSkipAutoReset,
  silently,
} from '../services/storageBridge';
import {
  applyCanvasBackgroundWithApi,
  applyPenColorWithApi,
  filterTargetElementsForExport,
  inlinePreSplitFontsIntoSvg,
  runDirectDiskSaveWithApi,
  runDirectFileLoadWithApi,
  runInstantExportWithApi,
  runInstantResetWithApi,
} from './apiActions';

export const SHAPE_OTHER_ITEMS = [
  { id: 'arrow', testId: 'toolbar-arrow', msgKey: 'toolArrow', shortcut: 'A' },
  { id: 'line', testId: 'toolbar-line', msgKey: 'toolLine', shortcut: 'L' },
  { id: 'diamond', testId: 'toolbar-diamond', msgKey: 'toolDiamond', shortcut: 'D' },
] as const;

export const EXTRA_T3_LEFT_ITEMS = [
  { id: 'eraser', testId: 'toolbar-eraser', msgKey: 'toolEraser', shortcut: 'E' },
  { id: 'sticky', testId: 'toolbar-stickynote', msgKey: 'toolSticky', shortcut: 'N' },
  { id: 'lasso', testId: 'toolbar-lasso', msgKey: 'toolLasso', shortcut: '' },
] as const;

export const EXTRA_T3_LOCK_ITEM = {
  id: 'lock',
  testId: 'toolbar-lock',
  msgKey: 'toolLock',
  shortcut: 'Q',
} as const;

export const CANVAS_BG_SWATCHES = ['#ffffff', '#f8f9fa', '#f5faff', '#fffce8', '#fdf8f6'] as const;

export const EXPORT_TOGGLE_DEFS = [
  { key: 'onlySelected', id: 'exportOnlySelected', msgKey: 'exportOnlySelected' },
  { key: 'background', id: 'exportBackgroundSwitch', msgKey: 'exportBackground' },
  { key: 'darkMode', id: 'exportDarkModeSwitch', msgKey: 'exportDarkMode' },
  { key: 'embedScene', id: 'exportEmbedSwitch', msgKey: 'exportEmbedScene' },
] as const;

export const DRAW_ASSIST_DEFS = [
  { key: 'objectsSnapMode', msgKey: 'assistSnapToObjects', shortcut: 'Alt+S' },
  { key: 'gridMode', msgKey: 'assistShowGrid', shortcut: "Ctrl+'" },
  { key: 'arrowBinding', msgKey: 'assistArrowBinding', shortcut: '' },
  { key: 'midpointSnapping', msgKey: 'assistMidpointSnap', shortcut: '' },
] as const;

export const QUICK_OPT_DEFS = [
  { key: 'autoResetOnOpen', msgKey: 'optAutoResetOnOpen' },
  { key: 'textAutoResize', msgKey: 'optTextAutoResize' },
  { key: 'fastLoadSave', msgKey: 'optFastLoadSave' },
] as const;

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICON_DEFS: Record<string, Array<[string, Record<string, string | number>]>> = {
  arrow: [
    ['line', { x1: 5, y1: 12, x2: 19, y2: 12 }],
    ['polyline', { points: '13 6 19 12 13 18' }],
  ],
  line: [['line', { x1: 5, y1: 19, x2: 19, y2: 5 }]],
  diamond: [['path', { d: 'M12 3 21 12 12 21 3 12 12 3Z' }]],
  eraser: [
    ['path', { d: 'm7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21' }],
    ['path', { d: 'M22 21H7' }],
    ['path', { d: 'm5 11 9 9' }],
  ],
  lock: [
    ['rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }],
    ['path', { d: 'M8 11V7a4 4 0 0 1 8 0v4' }],
  ],
  sticky: [
    ['path', { d: 'M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z' }],
    ['path', { d: 'M15 3v4a2 2 0 0 0 2 2h4' }],
  ],
  lasso: [
    ['path', { d: 'M7 22a5 5 0 0 1-2-4' }],
    ['path', { d: 'M3.3 14A6.8 6.8 0 0 1 2 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 0 1-5-1' }],
    ['path', { d: 'M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z' }],
  ],
  imgSave: [
    ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
    ['circle', { cx: 9, cy: 9, r: 2 }],
    ['path', { d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' }],
  ],
  sliders: [
    ['line', { x1: 4, y1: 21, x2: 4, y2: 14 }],
    ['line', { x1: 4, y1: 10, x2: 4, y2: 3 }],
    ['line', { x1: 12, y1: 21, x2: 12, y2: 12 }],
    ['line', { x1: 12, y1: 8, x2: 12, y2: 3 }],
    ['line', { x1: 20, y1: 21, x2: 20, y2: 16 }],
    ['line', { x1: 20, y1: 12, x2: 20, y2: 3 }],
    ['line', { x1: 2, y1: 14, x2: 6, y2: 14 }],
    ['line', { x1: 10, y1: 8, x2: 14, y2: 8 }],
    ['line', { x1: 18, y1: 16, x2: 22, y2: 16 }],
  ],
  drawAssist: [
    ['path', { d: 'M12 20h9' }],
    ['path', { d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z' }],
  ],
  caret: [['path', { d: 'm3 4.5 3 3 3-3' }]],
  copy: [
    ['rect', { x: 9, y: 9, width: 13, height: 13, rx: 2 }],
    ['path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }],
  ],
  check: [['polyline', { points: '20 6 9 17 4 12' }]],
  download: [
    ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
    ['polyline', { points: '7 10 12 15 17 10' }],
    ['line', { x1: 12, y1: 15, x2: 12, y2: 3 }],
  ],
  reset: [
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }],
    ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }],
  ],
  cut: [
    ['circle', { cx: 6, cy: 6, r: 3 }],
    ['circle', { cx: 6, cy: 18, r: 3 }],
    ['line', { x1: 20, y1: 4, x2: 8.12, y2: 15.88 }],
    ['line', { x1: 14.47, y1: 14.48, x2: 20, y2: 20 }],
    ['line', { x1: 8.12, y1: 8.12, x2: 12, y2: 12 }],
  ],
  paste: [
    ['rect', { x: 8, y: 2, width: 8, height: 4, rx: 1 }],
    ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }],
  ],
  dup: [
    ['rect', { x: 8, y: 8, width: 13, height: 13, rx: 2 }],
    ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
    ['line', { x1: 14.5, y1: 11.5, x2: 14.5, y2: 17.5 }],
    ['line', { x1: 11.5, y1: 14.5, x2: 17.5, y2: 14.5 }],
  ],
  toBack: [
    ['line', { x1: 5, y1: 19, x2: 19, y2: 19 }],
    ['polyline', { points: '8 11 12 15 16 11' }],
    ['line', { x1: 12, y1: 4, x2: 12, y2: 15 }],
  ],
  backward: [
    ['polyline', { points: '8 13 12 17 16 13' }],
    ['line', { x1: 12, y1: 6, x2: 12, y2: 17 }],
  ],
  forward: [
    ['polyline', { points: '8 11 12 7 16 11' }],
    ['line', { x1: 12, y1: 18, x2: 12, y2: 7 }],
  ],
  toFront: [
    ['line', { x1: 5, y1: 5, x2: 19, y2: 5 }],
    ['polyline', { points: '8 13 12 9 16 13' }],
    ['line', { x1: 12, y1: 20, x2: 12, y2: 9 }],
  ],
  crop: [
    ['path', { d: 'M6 2v14a2 2 0 0 0 2 2h14' }],
    ['path', { d: 'M18 22V8a2 2 0 0 0-2-2H2' }],
  ],
  flipH: [
    ['line', { x1: 12, y1: 3, x2: 12, y2: 21, 'stroke-dasharray': '2.5 2.5' }],
    ['polygon', { points: '8 7 3 12 8 17 8 7' }],
    ['polygon', { points: '16 7 21 12 16 17 16 7', fill: 'currentColor', 'fill-opacity': '0.18' }],
  ],
  flipV: [
    ['line', { x1: 3, y1: 12, x2: 21, y2: 12, 'stroke-dasharray': '2.5 2.5' }],
    ['polygon', { points: '7 8 12 3 17 8 7 8' }],
    ['polygon', { points: '7 16 12 21 17 16 7 16', fill: 'currentColor', 'fill-opacity': '0.18' }],
  ],
  link: [
    ['path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }],
    ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }],
  ],
  copyLink: [
    ['path', { d: 'M10 13a5 5 0 0 0 7.54.54l2-2' }],
    ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1-1' }],
    ['rect', { x: 14, y: 14, width: 7, height: 7, rx: 1.5 }],
  ],
  unlock: [
    ['rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }],
    ['path', { d: 'M8 11V7a4 4 0 0 1 7.6-1.7' }],
  ],
  selectAll: [
    ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2, 'stroke-dasharray': '3 2.5' }],
    ['rect', { x: 8, y: 8, width: 8, height: 8, rx: 1, fill: 'currentColor', 'fill-opacity': '0.18' }],
  ],
  group: [
    ['rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }],
    ['rect', { x: 14, y: 14, width: 7, height: 7, rx: 1 }],
    ['path', { d: 'M10 6.5h4.5a3 3 0 0 1 3 3V14' }],
    ['path', { d: 'M14 17.5H9.5a3 3 0 0 1-3-3V10' }],
  ],
  ungroup: [
    ['rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }],
    ['rect', { x: 14, y: 14, width: 7, height: 7, rx: 1 }],
    ['line', { x1: 14, y1: 6, x2: 20, y2: 6, 'stroke-dasharray': '2 2' }],
    ['line', { x1: 4, y1: 18, x2: 10, y2: 18, 'stroke-dasharray': '2 2' }],
  ],
  wrap: [
    ['line', { x1: 3, y1: 6, x2: 21, y2: 6 }],
    ['path', { d: 'M3 12h15a3 3 0 1 1 0 6h-4' }],
    ['polyline', { points: '16 16 14 18 16 20' }],
    ['line', { x1: 3, y1: 18, x2: 10, y2: 18 }],
  ],
  editLine: [
    ['circle', { cx: 5, cy: 19, r: 2.5 }],
    ['circle', { cx: 19, cy: 5, r: 2.5 }],
    ['line', { x1: 7, y1: 17, x2: 17, y2: 7 }],
  ],
  frame: [
    ['line', { x1: 22, y1: 6, x2: 2, y2: 6 }],
    ['line', { x1: 22, y1: 18, x2: 2, y2: 18 }],
    ['line', { x1: 6, y1: 2, x2: 6, y2: 22 }],
    ['line', { x1: 18, y1: 2, x2: 18, y2: 22 }],
  ],
  frameRemove: [
    ['rect', { x: 3, y: 3, width: 14, height: 14, rx: 2, 'stroke-dasharray': '3 2' }],
    ['path', { d: 'M13 13l8 8' }],
    ['path', { d: 'M21 15v6h-6' }],
  ],
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | null | undefined> | null,
  ...kids: Array<Node | string | number | boolean | null | undefined>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === 'class') node.className = v;
      else node.setAttribute(k, v);
    }
  }
  for (const kid of kids) {
    if (kid == null || kid === false || kid === true) continue;
    node.append(typeof kid === 'object' && 'nodeType' in kid ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

function svgIcon(name: string, size = 16, viewBox = '0 0 24 24', strokeWidth = 2): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(strokeWidth));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of ICON_DEFS[name] || []) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) shape.setAttribute(k, String(v));
    svg.append(shape);
  }
  return svg;
}

export const runtime: {
  api: ExcalidrawImperativeAPI | null;
  prefs: Prefs;
  lastShapeOther: 'arrow' | 'line' | 'diamond';
  isBusy: boolean;
  drawAssistAccOpen: boolean;
  accOpen: boolean;
  expAccOpen: boolean;
  penPaletteOpen: boolean;
  bgPaletteOpen: boolean;
  lastCanvasBg: string | null;
  primarySelIconSig: string;
  onLangChange: ((lang: AppLang) => void) | null;
} = {
  api: null,
  prefs: {
    lang: DEFAULT_PREFS.lang,
    themeMode: DEFAULT_PREFS.themeMode,
    boxSelectionMode: DEFAULT_PREFS.boxSelectionMode,
    inputDevice: DEFAULT_PREFS.inputDevice,
    exportOpts: { ...DEFAULT_PREFS.exportOpts },
    quickOpts: { ...DEFAULT_PREFS.quickOpts },
  },
  lastShapeOther: 'arrow',
  isBusy: false,
  drawAssistAccOpen: false,
  accOpen: false,
  expAccOpen: false,
  penPaletteOpen: false,
  bgPaletteOpen: false,
  lastCanvasBg: null,
  primarySelIconSig: '',
  onLangChange: null,
};

let observer: MutationObserver | null = null;
let syncScheduled = false;
let toastNode: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

const toolbarMounts = new WeakMap<Element, {
  lang: AppLang;
  d1: HTMLElement;
  d2: HTMLElement;
  d3: HTMLElement;
  widget: ReturnType<typeof buildShapeGroupWidget>;
  resetBtn: HTMLButtonElement;
}>();
const rightBarMounts = new WeakMap<Element, { lang: AppLang; wrap: HTMLElement }>();
const mainMenuMounts = new WeakMap<Element, { lang: AppLang; nodes: Element[] }>();
const extraMenuInjected = new WeakSet<Element>();
const contextMenuProcessed = new WeakSet<Element>();

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
  runtime.onLangChange?.(nextLang);
  scheduleSync();
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

function sendEscape(target: EventTarget = document): void {
  silently(() => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }),
    );
  });
}

function getActiveNativeToolId(root: ParentNode = document): 'arrow' | 'line' | 'diamond' | null {
  if (runtime.api) {
    const activeType = silently(() => runtime.api?.getAppState()?.activeTool?.type);
    if (activeType === 'arrow' || activeType === 'line' || activeType === 'diamond') {
      return activeType;
    }
  }
  for (const item of SHAPE_OTHER_ITEMS) {
    const btn = root.querySelector(`.App-toolbar [data-testid="${item.testId}"]`);
    if (btn?.classList.contains('ToolIcon--checked')) return item.id;
  }
  return null;
}

function clickNativeTool(testId: string, root: ParentNode = document): boolean {
  const btn = root.querySelector<HTMLElement>(`.App-toolbar [data-testid="${testId}"]`);
  if (btn) {
    btn.click();
    return true;
  }
  if (runtime.api) {
    const map: Record<string, string> = {
      'toolbar-arrow': 'arrow',
      'toolbar-line': 'line',
      'toolbar-diamond': 'diamond',
      'toolbar-eraser': 'eraser',
      'toolbar-stickynote': 'stickynote',
      'toolbar-lasso': 'lasso',
    };
    const toolType = map[testId];
    if (toolType) {
      runtime.api.setActiveTool({ type: toolType as never });
      return true;
    }
  }
  return false;
}

/* ================= Text Tool Auto-Resize Guard ================= */
function isTextToolActive(root: ParentNode = document): boolean {
  if (runtime.api) {
    const t = silently(() => runtime.api?.getAppState()?.activeTool?.type);
    if (t) return t === 'text';
  }
  return !!root.querySelector('.App-toolbar [data-testid="toolbar-text"].ToolIcon--checked');
}

export function installTextAutoResizeGuard(): () => void {
  let downPos: { x: number; y: number; pointerId: number } | null = null;

  const onPointerDown = (e: PointerEvent) => {
    if (!runtime.prefs.quickOpts.textAutoResize) return;
    if (e.button !== 0 || e.altKey) return;
    if (!isTextToolActive()) return;
    if (e.target instanceof Element && e.target.matches('canvas.interactive')) {
      downPos = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    }
  };

  // Note: Excalidraw 0.18.0-next resets activeTool.type to "selection" immediately on pointerdown
  // when tool lock is OFF, so onPointerMove/onPointerUp must rely on `downPos` rather than re-checking isTextToolActive().
  const onPointerMove = (e: PointerEvent) => {
    if (!downPos || e.pointerId !== downPos.pointerId) return;
    if (!runtime.prefs.quickOpts.textAutoResize || e.altKey) {
      downPos = null;
      return;
    }
    e.stopImmediatePropagation();
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!downPos || e.pointerId !== downPos.pointerId) return;
    const pos = downPos;
    downPos = null;
    if (!runtime.prefs.quickOpts.textAutoResize || e.altKey) return;
    silently(() => Object.defineProperty(e, 'clientX', { value: pos.x, configurable: true }));
    silently(() => Object.defineProperty(e, 'clientY', { value: pos.y, configurable: true }));
  };

  const onPointerCancel = (e: PointerEvent) => {
    if (downPos && e.pointerId === downPos.pointerId) {
      downPos = null;
    }
  };

  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerCancel, true);

  return () => {
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', onPointerCancel, true);
  };
}

/* ================= Direct API Fast Load & Fast Save Interceptor ================= */
function openFilePickerForFastLoad(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.excalidraw,.json,application/json,image/*';
  input.style.display = 'none';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    await runDirectFileLoadWithApi(runtime.api, file, {
      lang: runtime.prefs.lang,
      showToast,
      defaultPenColor: runtime.prefs.quickOpts.defaultPenColor,
    });
  });
  document.body?.append(input);
  input.click();
}

export function installFastLoadSaveInterceptor(): () => void {
  const onClick = (e: MouseEvent) => {
    if (!runtime.prefs.quickOpts.fastLoadSave || runtime.isBusy || !runtime.api) return;
    if (!(e.target instanceof Element)) return;
    if (e.target.closest('[data-testid="load-button"]')) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      sendEscape();
      openFilePickerForFastLoad();
    } else if (e.target.closest('[data-testid="json-export-button"]')) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      sendEscape();
      runDirectDiskSaveWithApi(runtime.api, { lang: runtime.prefs.lang, showToast });
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!runtime.prefs.quickOpts.fastLoadSave || runtime.isBusy || !runtime.api) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      sendEscape();
      openFilePickerForFastLoad();
    }
  };

  window.addEventListener('click', onClick, true);
  window.addEventListener('keydown', onKeyDown, true);
  return () => {
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKeyDown, true);
  };
}

/* ================= Primary Tool Restore Guard ================= */
let internalToolClickDepth = 0;

function withInternalToolClick<T>(fn: () => T): T {
  internalToolClickDepth += 1;
  try {
    return fn();
  } finally {
    internalToolClickDepth -= 1;
  }
}

function getButtonIconSignature(btn: Element | null): string {
  if (!btn || typeof btn.querySelectorAll !== 'function') return '';
  return Array.from(btn.querySelectorAll('svg path, svg circle, svg rect, svg polyline, svg line'))
    .map((n) => n.getAttribute('d') || n.tagName)
    .join('|');
}

function isEditableFocused(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  const tag = active.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || !!active.isContentEditable;
}

export async function restorePrimaryFreedraw(): Promise<boolean> {
  if (runtime.api) {
    runtime.api.setActiveTool({ type: 'freedraw' });
    return true;
  }
  const popFree = document.querySelector<HTMLElement>('.tool-popover-content [data-testid="toolbar-freedraw"]');
  if (popFree) {
    withInternalToolClick(() => popFree.click());
    return true;
  }
  if (!isEditableFocused()) {
    silently(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', code: 'KeyP', bubbles: true, cancelable: true }));
    });
    return true;
  }
  return false;
}

export async function restorePrimarySelection(selBtn?: Element | null): Promise<boolean> {
  if (runtime.api) {
    runtime.api.setActiveTool({ type: 'selection' });
    return true;
  }
  const popSel = document.querySelector<HTMLElement>('.tool-popover-content [data-testid="toolbar-selection"]');
  const lassoChecked = !!document.querySelector('.tool-popover-content [data-testid="toolbar-lasso"].ToolIcon--checked');
  if (popSel && lassoChecked) {
    withInternalToolClick(() => popSel.click());
    return true;
  }
  const sigNow = getButtonIconSignature(selBtn ?? null);
  if (runtime.primarySelIconSig && sigNow && sigNow !== runtime.primarySelIconSig && selBtn instanceof HTMLElement) {
    withInternalToolClick(() => selBtn.click());
    return true;
  }
  return false;
}

export function installPrimaryToolRestoreGuard(): () => void {
  const onClick = (e: MouseEvent) => {
    if (internalToolClickDepth > 0 || runtime.isBusy) return;
    if (!(e.target instanceof Element)) return;
    const tbBtn = e.target.closest('.App-toolbar .Stack_horizontal > button[data-testid]');
    if (!tbBtn) return;
    const tid = tbBtn.getAttribute('data-testid');
    if (tid === 'toolbar-freedraw') {
      setTimeout(() => {
        void restorePrimaryFreedraw();
      }, 20);
    } else if (tid === 'toolbar-selection') {
      setTimeout(() => {
        void restorePrimarySelection(tbBtn);
      }, 20);
    }
  };

  window.addEventListener('click', onClick, true);
  return () => window.removeEventListener('click', onClick, true);
}

/* ================= Toolbar Group (Shape Other + Reset + Dividers) ================= */
function closeFloatingPopovers(exceptNode: Node | null): void {
  document.querySelectorAll('.exq-shape-group.exq-open').forEach((wrap) => {
    if (exceptNode && wrap.contains(exceptNode)) return;
    wrap.classList.remove('exq-open');
    wrap.querySelector('.exq-shape-trigger')?.setAttribute('aria-expanded', 'false');
  });
}

function buildShapeGroupWidget() {
  const t = getMessages(runtime.prefs.lang);
  const wrap = el('div', { class: 'exq-shape-group' });
  const iconSlot = el('span', { class: 'exq-icon-slot' });
  const caretSlot = svgIcon('caret', 10, '0 0 12 12', 2);
  caretSlot.classList.add('exq-caret');

  const trigger = el(
    'button',
    {
      type: 'button',
      class: 'exq-shape-trigger',
      title: t.shapeGroupTitle,
      'aria-label': t.shapeGroupTitle,
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
    },
    iconSlot,
    caretSlot,
  );

  const popover = el('div', { class: 'exq-popover', role: 'menu' });
  const itemButtons = new Map<string, HTMLButtonElement>();

  for (const item of SHAPE_OTHER_ITEMS) {
    const label = t[item.msgKey];
    const btn = el(
      'button',
      { type: 'button', class: 'exq-pop-item', role: 'menuitem', 'data-exq-tool': item.id },
      svgIcon(item.id, 15),
      el('span', null, label),
      el('span', { class: 'exq-pop-shortcut' }, item.shortcut),
    );
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      runtime.lastShapeOther = item.id;
      wrap.classList.remove('exq-open');
      trigger.setAttribute('aria-expanded', 'false');
      clickNativeTool(item.testId);
      scheduleSync();
    });
    itemButtons.set(item.id, btn);
    popover.append(btn);
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = !wrap.classList.contains('exq-open');
    closeFloatingPopovers(wrap);
    wrap.classList.toggle('exq-open', willOpen);
    trigger.setAttribute('aria-expanded', String(willOpen));
  });

  wrap.append(trigger, popover);

  let renderedIconId: string | null = null;
  const update = () => {
    const activeId = getActiveNativeToolId();
    if (activeId) runtime.lastShapeOther = activeId;
    if (renderedIconId !== runtime.lastShapeOther) {
      renderedIconId = runtime.lastShapeOther;
      iconSlot.replaceChildren(svgIcon(renderedIconId, 16));
    }
    trigger.classList.toggle('exq-active', !!activeId);
    for (const [id, btn] of itemButtons) {
      btn.classList.toggle('exq-active', activeId === id);
    }
  };

  update();
  return { wrap, trigger, update };
}

export function syncToolbar(root: ParentNode = document): boolean {
  const stack = root.querySelector('.App-toolbar .Stack_horizontal');
  const selBtn = stack?.querySelector('[data-testid="toolbar-selection"]');
  if (!stack || !selBtn) return false;
  if (!runtime.primarySelIconSig) {
    runtime.primarySelIconSig = getButtonIconSignature(selBtn);
  }

  let mounted = toolbarMounts.get(stack);
  if (mounted && mounted.lang !== runtime.prefs.lang) {
    mounted.d1.remove();
    mounted.d2.remove();
    mounted.d3.remove();
    mounted.widget.wrap.remove();
    mounted.resetBtn.remove();
    mounted = undefined;
  }

  if (!mounted || !mounted.widget.wrap.isConnected) {
    const t = getMessages(runtime.prefs.lang);
    const d1 = el('div', { class: 'App-toolbar__divider exq-divider exq-div-1', 'aria-hidden': 'true' });
    const d2 = el('div', { class: 'App-toolbar__divider exq-divider exq-div-2', 'aria-hidden': 'true' });
    const d3 = el('div', { class: 'App-toolbar__divider exq-divider exq-div-3', 'aria-hidden': 'true' });
    const widget = buildShapeGroupWidget();
    const resetBtn = el(
      'button',
      {
        type: 'button',
        class: 'exq-toolbar-reset',
        'data-exq-action': 'reset',
        title: t.resetCanvasTitle,
        'aria-label': t.resetCanvasTitle,
      },
      svgIcon('reset', 15),
    );
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void runInstantReset(resetBtn);
    });

    stack.append(d1, d2, d3, widget.wrap, resetBtn);
    mounted = { lang: runtime.prefs.lang, d1, d2, d3, widget, resetBtn };
    toolbarMounts.set(stack, mounted);
  } else {
    mounted.widget.update();
  }

  const extraBtn = stack.querySelector('.App-toolbar__extra-tools-trigger');
  if (extraBtn) {
    const activeTool = silently(() => runtime.api?.getAppState()?.activeTool);
    const eraserChecked =
      activeTool?.type === 'eraser' ||
      !!stack.querySelector('[data-testid="toolbar-eraser"]')?.classList.contains('ToolIcon--checked');
    const stickyChecked =
      activeTool?.type === 'stickynote' ||
      !!stack.querySelector('[data-testid="toolbar-stickynote"]')?.classList.contains('ToolIcon--checked');
    const lassoChecked = activeTool?.type === 'lasso';
    const lockChecked =
      !!activeTool?.locked ||
      !!stack.querySelector('[data-testid="toolbar-lock"]')?.classList.contains('ToolIcon--checked');
    extraBtn.classList.toggle('exq-eraser-active', eraserChecked || stickyChecked || lassoChecked);
    extraBtn.classList.toggle('exq-lock-active', lockChecked);
  }

  return true;
}

/* ================= Main Menu Injection (Save / Copy / Export Settings) ================= */
function buildMainMenuExportBlock(): DocumentFragment {
  const t = getMessages(runtime.prefs.lang);
  const frag = document.createDocumentFragment();

  const makeActionItem = (iconName: string, label: string, actionMode: 'png' | 'copy') => {
    const row = el(
      'button',
      {
        type: 'button',
        role: 'menuitem',
        class: 'radix-menu-item dropdown-menu-item dropdown-menu-item-base exq-main-export-action',
        'data-exq-main-action': actionMode,
      },
      el('div', { class: 'dropdown-menu-item__icon' }, svgIcon(iconName, 15)),
      el('div', { class: 'dropdown-menu-item__text' }, label),
    );
    row.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sendEscape();
      void runInstantExport(actionMode);
    });
    return row;
  };

  frag.append(
    el('div', { class: 'exq-extra-sep', 'aria-hidden': 'true' }),
    makeActionItem('imgSave', t.saveAsImage, 'png'),
    makeActionItem('copy', t.copyToClipboard, 'copy'),
  );

  const root = el('div', {
    class: 'exq-main-export-root' + (runtime.expAccOpen ? ' exq-acc-open' : ''),
    'data-exq-export-settings': '1',
  });
  root.addEventListener('click', (e) => e.stopPropagation());

  const chev = el('span', { class: 'exq-acc-chev' }, svgIcon('caret', 12, '0 0 12 12', 1.8));
  const accBtn = el(
    'button',
    {
      type: 'button',
      class: 'exq-acc-flat-btn',
      'data-exq-exp-acc-toggle': '1',
      'aria-expanded': String(runtime.expAccOpen),
    },
    svgIcon('sliders', 14),
    el('span', null, t.exportSettings),
    chev,
  );

  const nest = el('div', { class: 'exq-acc-nest' });
  const switchMap = new Map<string, HTMLButtonElement>();
  const formatBtnMap = new Map<ExportFormat, HTMLButtonElement>();
  const scaleBtnMap = new Map<ExportScale, HTMLButtonElement>();
  let scaleRowNode: HTMLElement | null = null;

  const refresh = () => {
    root.classList.toggle('exq-acc-open', runtime.expAccOpen);
    accBtn.setAttribute('aria-expanded', String(runtime.expAccOpen));
    for (const [key, sw] of switchMap) {
      const rawOn = !!runtime.prefs.exportOpts[key as keyof typeof runtime.prefs.exportOpts];
      const on = key === 'background' ? !rawOn : rawOn;
      sw.classList.toggle('exq-on', on);
      sw.setAttribute('aria-pressed', String(on));
    }
    const curFmt = normalizeFormat(runtime.prefs.exportOpts.format);
    for (const [fmt, btn] of formatBtnMap) {
      btn.classList.toggle('exq-active', curFmt === fmt);
    }
    for (const [s, btn] of scaleBtnMap) {
      btn.classList.toggle('exq-active', runtime.prefs.exportOpts.scale === s);
    }
    if (scaleRowNode) {
      const isSvg = curFmt === 'svg';
      scaleRowNode.classList.toggle('exq-disabled', isSvg);
      scaleRowNode.setAttribute('aria-disabled', String(isSvg));
    }
  };

  accBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    runtime.expAccOpen = !runtime.expAccOpen;
    refresh();
  });

  for (const def of EXPORT_TOGGLE_DEFS) {
    const label = t[def.msgKey];
    const sw = el('button', {
      type: 'button',
      class: 'exq-switch',
      'data-exq-exp-opt': def.key,
      'aria-label': label,
    });
    const row = el(
      'div',
      { class: 'exq-opt-row', role: 'menuitemcheckbox' },
      el('span', { class: 'exq-opt-label' }, label),
      sw,
    );
    row.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      runtime.prefs.exportOpts[def.key] = !runtime.prefs.exportOpts[def.key];
      savePrefs(runtime.prefs);
      refresh();
    });
    switchMap.set(def.key, sw);
    nest.append(row);
  }

  const fmtSeg = el('div', { class: 'exq-scale-seg exq-fmt-seg', role: 'radiogroup', 'aria-label': t.exportFormat });
  for (const fmt of ['png', 'svg'] as const) {
    const b = el('button', { type: 'button', 'data-exq-format': fmt }, fmt.toUpperCase());
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      runtime.prefs.exportOpts.format = fmt;
      savePrefs(runtime.prefs);
      refresh();
    });
    formatBtnMap.set(fmt, b);
    fmtSeg.append(b);
  }
  nest.append(el('div', { class: 'exq-scale-row' }, el('span', null, t.exportFormat), fmtSeg));

  const scaleSeg = el('div', { class: 'exq-scale-seg', role: 'radiogroup', 'aria-label': t.exportScale });
  for (const s of [1, 2, 3] as const) {
    const b = el('button', { type: 'button', 'data-exq-scale': String(s) }, `${s}×`);
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      runtime.prefs.exportOpts.scale = s;
      savePrefs(runtime.prefs);
      refresh();
    });
    scaleBtnMap.set(s, b);
    scaleSeg.append(b);
  }
  scaleRowNode = el('div', { class: 'exq-scale-row' }, el('span', null, t.exportScale), scaleSeg);
  nest.append(scaleRowNode);

  refresh();
  root.append(accBtn, nest);
  frag.append(root);
  return frag;
}

export function syncMainMenu(root: ParentNode = document): boolean {
  const menu = root.querySelector('.dropdown-menu-container:has([data-testid="image-export-button"])');
  if (!menu) return false;

  const mounted = mainMenuMounts.get(menu);
  if (mounted && mounted.lang === runtime.prefs.lang && mounted.nodes.every((n) => n.isConnected)) {
    return false;
  }

  const anchor = menu.querySelector('[data-testid="image-export-button"]');
  if (!anchor) return false;

  if (mounted) {
    for (const node of mounted.nodes) {
      node.remove();
    }
  }

  const frag = buildMainMenuExportBlock();
  const nodes = Array.from(frag.children);
  menu.insertBefore(frag, anchor);
  mainMenuMounts.set(menu, { lang: runtime.prefs.lang, nodes });
  return true;
}

/* ================= Canvas Background & Lasso Helpers ================= */
export function getCurrentCanvasBg(
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
): string {
  if (runtime.api) {
    const apiBg = silently(() => runtime.api?.getAppState()?.viewBackgroundColor?.trim());
    if (apiBg) return apiBg.toLowerCase();
  }
  const liveSwatch = silently(() =>
    document.querySelector<HTMLElement>('[data-openpopup="canvasBackground"]')?.style?.getPropertyValue('--swatch-color')?.trim(),
  );
  if (liveSwatch) return liveSwatch.toLowerCase();
  if (runtime.lastCanvasBg) return runtime.lastCanvasBg.toLowerCase();
  if (storage) {
    const st = silently(() => JSON.parse(storage.getItem(LS_STATE_KEY) || '{}'));
    if (st && typeof st.viewBackgroundColor === 'string' && st.viewBackgroundColor) {
      return st.viewBackgroundColor.toLowerCase();
    }
  }
  return '#ffffff';
}

export async function applyCanvasBackground(hex: string): Promise<boolean> {
  if (runtime.isBusy) return false;
  const normalized = '#' + String(hex || '#ffffff').trim().toLowerCase().replace(/^#/, '');
  runtime.lastCanvasBg = normalized;

  if (runtime.api) {
    const res = await applyCanvasBackgroundWithApi(runtime.api, normalized, {
      lang: runtime.prefs.lang,
      showToast,
    });
    return res.ok;
  }

  if (typeof localStorage !== 'undefined') {
    silently(() => {
      const raw = localStorage.getItem(LS_STATE_KEY);
      const st = raw ? JSON.parse(raw) : {};
      st.viewBackgroundColor = normalized;
      localStorage.setItem(LS_STATE_KEY, JSON.stringify(st));
    });
  }
  showToast(getMessages(runtime.prefs.lang).toastBgChanged);
  return true;
}

export function getCurrentPenColor(): string {
  return normalizeHexColor(runtime.prefs.quickOpts.defaultPenColor, DEFAULT_PEN_COLOR);
}

export async function applyPenColor(hex: string): Promise<boolean> {
  if (runtime.isBusy) return false;
  const normalized = normalizeHexColor(hex, DEFAULT_PEN_COLOR);
  runtime.prefs.quickOpts.defaultPenColor = normalized;
  savePrefs(runtime.prefs);

  if (runtime.api) {
    const res = await applyPenColorWithApi(runtime.api, normalized, {
      lang: runtime.prefs.lang,
      showToast,
    });
    return res.ok;
  }

  if (typeof localStorage !== 'undefined') {
    silently(() => {
      const raw = localStorage.getItem(LS_STATE_KEY);
      const st = raw ? JSON.parse(raw) : {};
      st.currentItemStrokeColor = normalized;
      localStorage.setItem(LS_STATE_KEY, JSON.stringify(st));
    });
  }
  showToast(getMessages(runtime.prefs.lang).toastPenColorChanged);
  return true;
}

export async function activateLassoTool(): Promise<boolean> {
  if (runtime.api) {
    runtime.api.setActiveTool({ type: 'lasso' });
    sendEscape();
    scheduleSync();
    return true;
  }
  const menuLasso = document.querySelector<HTMLElement>('.dropdown-menu-container [data-testid="toolbar-lasso"]');
  if (menuLasso) {
    menuLasso.click();
    sendEscape();
    scheduleSync();
    return true;
  }
  return false;
}

/* ================= Extra Tools Menu Injection (T3 Row + Drawing Assist + Quick Settings) ================= */
function getDrawAssistValue(key: (typeof DRAW_ASSIST_DEFS)[number]['key']): boolean {
  const st = silently(() => runtime.api?.getAppState());
  if (!st) {
    return key === 'arrowBinding' || key === 'midpointSnapping';
  }
  if (key === 'objectsSnapMode') return Boolean(st.objectsSnapModeEnabled);
  if (key === 'gridMode') return Boolean(st.gridModeEnabled);
  if (key === 'arrowBinding') return st.bindingPreference !== 'disabled';
  return Boolean(st.isMidpointSnappingEnabled);
}

function toggleDrawAssistOption(key: (typeof DRAW_ASSIST_DEFS)[number]['key']): boolean {
  const next = !getDrawAssistValue(key);
  if (runtime.api) {
    if (key === 'objectsSnapMode') {
      runtime.api.updateScene({
        appState: { objectsSnapModeEnabled: next, gridModeEnabled: false },
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      });
    } else if (key === 'gridMode') {
      runtime.api.updateScene({
        appState: { gridModeEnabled: next, objectsSnapModeEnabled: false },
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      });
    } else if (key === 'arrowBinding') {
      runtime.api.updateScene({
        appState: {
          bindingPreference: next ? 'enabled' : 'disabled',
          isBindingEnabled: next,
        },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    } else {
      runtime.api.updateScene({
        appState: { isMidpointSnappingEnabled: next },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }
  }
  return next;
}

function buildQuickOptionsAccordion(): HTMLElement {
  const t = getMessages(runtime.prefs.lang);
  const root = el('div', { class: 'exq-extra-options-root' });
  root.addEventListener('click', (e) => e.stopPropagation());

  const sep = el('div', { class: 'exq-extra-sep', 'aria-hidden': 'true' });

  /* --- 1. Drawing Assist Accordion (default collapsed) --- */
  const assistWrap = el('div', {
    class: 'exq-acc-section' + (runtime.drawAssistAccOpen ? ' exq-acc-open' : ''),
    'data-exq-draw-assist': '1',
  });
  const assistChev = el('span', { class: 'exq-acc-chev' }, svgIcon('caret', 12, '0 0 12 12', 1.8));
  const assistBtn = el(
    'button',
    {
      type: 'button',
      class: 'exq-acc-flat-btn',
      'data-exq-assist-toggle': '1',
      'aria-expanded': String(runtime.drawAssistAccOpen),
    },
    svgIcon('drawAssist', 14),
    el('span', null, t.drawAssist),
    assistChev,
  );
  const assistNest = el('div', { class: 'exq-acc-nest' });
  const assistSwitchMap = new Map<(typeof DRAW_ASSIST_DEFS)[number]['key'], HTMLButtonElement>();

  const refreshAssist = () => {
    assistWrap.classList.toggle('exq-acc-open', runtime.drawAssistAccOpen);
    assistBtn.setAttribute('aria-expanded', String(runtime.drawAssistAccOpen));
    for (const [key, sw] of assistSwitchMap) {
      const on = getDrawAssistValue(key);
      sw.classList.toggle('exq-on', on);
      sw.setAttribute('aria-pressed', String(on));
    }
  };

  assistBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    runtime.drawAssistAccOpen = !runtime.drawAssistAccOpen;
    refreshAssist();
  });

  for (const def of DRAW_ASSIST_DEFS) {
    const label = t[def.msgKey];
    const sw = el('button', {
      type: 'button',
      class: 'exq-switch',
      'data-exq-assist-opt': def.key,
      'aria-label': label,
    });
    const rightGroup = el(
      'span',
      { class: 'exq-opt-right' },
      def.shortcut ? el('span', { class: 'exq-opt-shortcut', 'aria-hidden': 'true' }, def.shortcut) : null,
      sw,
    );
    const row = el(
      'div',
      { class: 'exq-opt-row', role: 'menuitemcheckbox' },
      el('span', { class: 'exq-opt-label' }, label),
      rightGroup,
    );
    row.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nextVal = toggleDrawAssistOption(def.key);
      refreshAssist();
      showToast(`${label}: ${nextVal ? 'ON' : 'OFF'}`);
    });
    assistSwitchMap.set(def.key, sw);
    assistNest.append(row);
  }
  assistWrap.append(assistBtn, assistNest);

  /* --- 2. Quick Settings Accordion (default collapsed) --- */
  const quickWrap = el('div', {
    class: 'exq-acc-section' + (runtime.accOpen ? ' exq-acc-open' : ''),
    'data-exq-quick-settings': '1',
  });
  const chev = el('span', { class: 'exq-acc-chev' }, svgIcon('caret', 12, '0 0 12 12', 1.8));
  const accBtn = el(
    'button',
    {
      type: 'button',
      class: 'exq-acc-flat-btn',
      'data-exq-acc-toggle': '1',
      'aria-expanded': String(runtime.accOpen),
    },
    svgIcon('sliders', 14),
    el('span', null, t.quickSettings),
    chev,
  );

  const nest = el('div', { class: 'exq-acc-nest' });
  const switchMap = new Map<string, HTMLButtonElement>();

  const penSwatch = el('span', { class: 'exq-bg-swatch', 'aria-hidden': 'true' });
  const penPalette = el('div', { class: 'exq-bg-palette' });
  const penChipMap = new Map<string, HTMLButtonElement>();

  const bgSwatch = el('span', { class: 'exq-bg-swatch', 'aria-hidden': 'true' });
  const bgPalette = el('div', { class: 'exq-bg-palette' });
  const bgChipMap = new Map<string, HTMLButtonElement>();

  const refreshQuick = () => {
    quickWrap.classList.toggle('exq-acc-open', runtime.accOpen);
    accBtn.setAttribute('aria-expanded', String(runtime.accOpen));
    for (const [key, sw] of switchMap) {
      const on = !!runtime.prefs.quickOpts[key as 'autoResetOnOpen' | 'textAutoResize' | 'fastLoadSave'];
      sw.classList.toggle('exq-on', on);
      sw.setAttribute('aria-pressed', String(on));
    }
    const curPen = getCurrentPenColor();
    penSwatch.style.background = curPen;
    penPalette.classList.toggle('exq-open', runtime.penPaletteOpen);
    for (const [hex, chip] of penChipMap) {
      chip.classList.toggle('exq-active', curPen === hex);
    }

    const curBg = getCurrentCanvasBg();
    bgSwatch.style.background = curBg;
    bgPalette.classList.toggle('exq-open', runtime.bgPaletteOpen);
    for (const [hex, chip] of bgChipMap) {
      chip.classList.toggle('exq-active', curBg === hex);
    }
  };

  accBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    runtime.accOpen = !runtime.accOpen;
    refreshQuick();
  });

  for (const def of QUICK_OPT_DEFS) {
    const label = t[def.msgKey];
    const labelNode = el('span', { class: 'exq-opt-label' }, label);
    const sw = el('button', {
      type: 'button',
      class: 'exq-switch',
      'data-exq-quick-opt': def.key,
      'aria-label': label,
    });
    const row = el('div', { class: 'exq-opt-row', role: 'menuitemcheckbox' }, labelNode, sw);
    row.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nextVal = !runtime.prefs.quickOpts[def.key];
      runtime.prefs.quickOpts[def.key] = nextVal;
      savePrefs(runtime.prefs);
      refreshQuick();
      showToast(`${label}: ${nextVal ? 'ON' : 'OFF'}`);
    });
    switchMap.set(def.key, sw);
    nest.append(row);
  }

  // Single-row Pen Color control (default pink #c2255c)
  const penRow = el(
    'button',
    { type: 'button', class: 'exq-bg-row', 'data-exq-pen-toggle': '1' },
    el('span', null, t.penColor),
    penSwatch,
  );
  penRow.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    runtime.penPaletteOpen = !runtime.penPaletteOpen;
    if (runtime.penPaletteOpen) runtime.bgPaletteOpen = false;
    refreshQuick();
  });

  for (const hex of PEN_COLOR_SWATCHES) {
    const chip = el('button', {
      type: 'button',
      class: 'exq-bg-chip',
      'data-exq-pen-color': hex,
      title: hex,
      'aria-label': `${t.penColorLabel} ${hex}`,
    });
    chip.style.background = hex;
    chip.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      runtime.penPaletteOpen = false;
      await applyPenColor(hex);
      refreshQuick();
    });
    penChipMap.set(hex, chip);
    penPalette.append(chip);
  }

  // Single-row Canvas Background control
  const bgRow = el(
    'button',
    { type: 'button', class: 'exq-bg-row', 'data-exq-bg-toggle': '1' },
    el('span', null, t.canvasBackground),
    bgSwatch,
  );
  bgRow.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    runtime.bgPaletteOpen = !runtime.bgPaletteOpen;
    if (runtime.bgPaletteOpen) runtime.penPaletteOpen = false;
    refreshQuick();
  });

  for (const hex of CANVAS_BG_SWATCHES) {
    const chip = el('button', {
      type: 'button',
      class: 'exq-bg-chip',
      'data-exq-bg-color': hex,
      title: hex,
      'aria-label': `${t.bgColorLabel} ${hex}`,
    });
    chip.style.background = hex;
    chip.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      runtime.bgPaletteOpen = false;
      await applyCanvasBackground(hex);
      refreshQuick();
    });
    bgChipMap.set(hex, chip);
    bgPalette.append(chip);
  }

  nest.append(
    el('div', { class: 'exq-extra-sep', 'aria-hidden': 'true' }),
    penRow,
    penPalette,
    bgRow,
    bgPalette,
  );
  quickWrap.append(accBtn, nest);

  refreshAssist();
  refreshQuick();
  root.append(sep, assistWrap, quickWrap);
  return root;
}

function makeExtraT3Button(
  item: { id: string; testId: string; msgKey: 'toolEraser' | 'toolSticky' | 'toolLasso' | 'toolLock'; shortcut: string },
  root: ParentNode,
): HTMLButtonElement {
  const t = getMessages(runtime.prefs.lang);
  const label = t[item.msgKey];
  const activeTool = silently(() => runtime.api?.getAppState()?.activeTool);
  const isChecked =
    item.id === 'lasso'
      ? activeTool?.type === 'lasso' ||
        !!(
          root.querySelector('.dropdown-menu-container [data-testid="toolbar-lasso"].active') ||
          root.querySelector('.tool-popover-content [data-testid="toolbar-lasso"].ToolIcon--checked') ||
          root.querySelector('.App-toolbar [data-testid="toolbar-lasso"].ToolIcon--checked')
        )
      : item.id === 'lock'
        ? !!activeTool?.locked ||
          !!root.querySelector(`.App-toolbar [data-testid="${item.testId}"]`)?.classList.contains('ToolIcon--checked')
        : activeTool?.type === (item.id === 'sticky' ? 'stickynote' : item.id) ||
          !!root.querySelector(`.App-toolbar [data-testid="${item.testId}"]`)?.classList.contains('ToolIcon--checked');

  const titleText = item.shortcut ? `${label} (${item.shortcut})` : label;
  const btn = el(
    'button',
    {
      type: 'button',
      role: 'menuitem',
      class: 'exq-extra-tb-btn' + (isChecked ? ' exq-active' : ''),
      'data-exq-proxy': item.testId,
      title: titleText,
      'aria-label': titleText,
    },
    svgIcon(item.id, 16, '0 0 24 24', 1.85),
    item.shortcut ? el('span', { class: 'exq-extra-tb-key', 'aria-hidden': 'true' }, item.shortcut) : null,
  );
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (item.id === 'lasso') {
      void activateLassoTool();
    } else {
      clickNativeTool(item.testId);
      sendEscape();
      scheduleSync();
    }
  });
  return btn;
}

export function syncExtraToolsMenu(root: ParentNode = document): boolean {
  const menu = root.querySelector('.dropdown-menu-container:has([data-testid="toolbar-image"])');
  if (!menu || extraMenuInjected.has(menu)) return false;

  const firstNative = menu.firstElementChild;
  if (!firstNative) return false;

  const topFrag = document.createDocumentFragment();
  const t3Row = el('div', { class: 'exq-extra-tb-row', 'data-exq-t3-row': '1' });
  for (const item of EXTRA_T3_LEFT_ITEMS) {
    t3Row.append(makeExtraT3Button(item, root));
  }
  t3Row.append(el('div', { class: 'exq-extra-tb-vdiv', 'aria-hidden': 'true' }));
  t3Row.append(makeExtraT3Button(EXTRA_T3_LOCK_ITEM, root));
  topFrag.append(t3Row, el('div', { class: 'exq-extra-sep', 'aria-hidden': 'true' }));
  menu.insertBefore(topFrag, firstNative);

  menu.append(buildQuickOptionsAccordion());

  extraMenuInjected.add(menu);
  return true;
}

/* ================= Context Menu Cleanup & Rich UI (Design 1) ================= */
const CTX_HIDDEN_TESTIDS = new Set([
  'wrapSelectionInFrame',
  'copyAsPng',
  'copyAsSvg',
  'copyText',
  'copyAsText',
  'copyStyles',
  'pasteStyles',
  'addToLibrary',
  'sendBackward',
  'bringForward',
  'gridMode',
  'objectsSnapMode',
  'arrowBinding',
  'midpointSnapping',
  'zenMode',
  'viewMode',
  'minimap',
  'stats',
]);

const CTX_QUICK_BAR_ITEMS = [
  { testId: 'cut', icon: 'cut', msgKey: 'ctxCut', shortcut: 'Ctrl+X', danger: false },
  { testId: 'copy', icon: 'copy', msgKey: 'ctxCopy', shortcut: 'Ctrl+C', danger: false },
  { testId: 'paste', icon: 'paste', msgKey: 'ctxPaste', shortcut: 'Ctrl+V', danger: false },
  { testId: 'duplicateSelection', icon: 'dup', msgKey: 'ctxDuplicate', shortcut: 'Ctrl+D', danger: false },
  { testId: 'deleteSelectedElements', icon: 'reset', msgKey: 'ctxDelete', shortcut: 'Delete', danger: true },
] as const;

const CTX_LAYER_BAR_ITEMS = [
  { testId: 'sendToBack', zIdx: 0, icon: 'toBack', msgKey: 'ctxSendToBack', shortcut: 'Ctrl+Shift+[' },
  { testId: 'sendBackward', zIdx: 1, icon: 'backward', msgKey: 'ctxSendBackward', shortcut: 'Ctrl+[' },
  { testId: 'bringForward', zIdx: 2, icon: 'forward', msgKey: 'ctxBringForward', shortcut: 'Ctrl+]' },
  { testId: 'bringToFront', zIdx: 3, icon: 'toFront', msgKey: 'ctxBringToFront', shortcut: 'Ctrl+Shift+]' },
] as const;

const CTX_ITEM_ICON_MAP: Record<string, string> = {
  cut: 'cut',
  copy: 'copy',
  paste: 'paste',
  duplicateSelection: 'dup',
  deleteSelectedElements: 'reset',
  cropEditor: 'crop',
  flipHorizontal: 'flipH',
  flipVertical: 'flipV',
  hyperlink: 'link',
  copyElementLink: 'copyLink',
  toggleElementLock: 'lock',
  unlockAllElements: 'unlock',
  selectAll: 'selectAll',
  group: 'group',
  ungroup: 'ungroup',
  toggleWrap: 'wrap',
  autoResize: 'wrap',
  unbindText: 'wrap',
  bindText: 'wrap',
  toggleLinearEditor: 'editLine',
  togglePolygon: 'editLine',
  selectAllElementsInFrame: 'frame',
  removeAllElementsFromFrame: 'frameRemove',
};

function isContextItemHidden(node: Element): boolean {
  if (node.tagName === 'HR') return node.classList.contains('exq-ctx-hr-hidden');
  if (node.classList.contains('exq-ctx-proxied-hidden')) return true;
  const tid = node.getAttribute('data-testid');
  if (tid && CTX_HIDDEN_TESTIDS.has(tid)) return true;
  if (typeof getComputedStyle === 'function') {
    return silently(() => getComputedStyle(node).display === 'none') || false;
  }
  return false;
}

function buildContextQuickBar(ul: Element, t: ReturnType<typeof getMessages>): HTMLLIElement {
  const bar = el('div', { class: 'exq-ctx-quick-bar', role: 'group' });

  for (const def of CTX_QUICK_BAR_ITEMS) {
    const nativeLi = ul.querySelector<HTMLElement>(`li[data-testid="${def.testId}"]`);
    const nativeBtn = nativeLi?.querySelector<HTMLButtonElement>('button') ?? null;
    if (nativeLi) {
      nativeLi.classList.add('exq-ctx-proxied-hidden');
    }

    const label = t[def.msgKey];
    const title = `${label} (${def.shortcut})`;
    const btn = el(
      'button',
      {
        type: 'button',
        class: 'exq-ctx-quick-btn' + (def.danger ? ' exq-ctx-quick-btn--danger' : ''),
        'data-exq-ctx-quick': def.testId,
        title,
        'aria-label': title,
      },
      svgIcon(def.icon, 15, '0 0 24 24', 1.9),
      el('span', { class: 'exq-ctx-quick-label' }, label),
    );
    if (!nativeBtn) {
      btn.disabled = true;
    } else {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        nativeBtn.click();
      });
    }
    bar.append(btn);
  }

  return el('li', { class: 'exq-ctx-widget-li', 'data-exq-ctx-quick-bar': '1' }, bar);
}

function dispatchLayerShortcut(testId: (typeof CTX_LAYER_BAR_ITEMS)[number]['testId']): void {
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
  const isFront = testId === 'bringForward' || testId === 'bringToFront';
  const isEdge = testId === 'sendToBack' || testId === 'bringToFront';
  const code = isFront ? 'BracketRight' : 'BracketLeft';
  const key = isFront ? ']' : '[';
  silently(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        code,
        ctrlKey: !isMac,
        metaKey: isMac,
        shiftKey: isEdge && !isMac,
        altKey: isEdge && isMac,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

function buildContextLayerBar(
  ul: Element,
  t: ReturnType<typeof getMessages>,
): HTMLLIElement {
  const nativeMap = new Map<string, HTMLButtonElement | null>();
  for (const def of CTX_LAYER_BAR_ITEMS) {
    const nativeLi = ul.querySelector<HTMLElement>(`li[data-testid="${def.testId}"]`);
    const nativeBtn = nativeLi?.querySelector<HTMLButtonElement>('button') ?? null;
    if (nativeLi) {
      nativeLi.classList.add('exq-ctx-proxied-hidden');
    }
    nativeMap.set(def.testId, nativeBtn);
  }

  const group = el('div', { class: 'exq-ctx-layer-btns', role: 'group', 'aria-label': t.ctxLayer });
  for (const def of CTX_LAYER_BAR_ITEMS) {
    const label = t[def.msgKey];
    const title = `${label} (${def.shortcut})`;
    const btn = el(
      'button',
      {
        type: 'button',
        class: 'exq-ctx-layer-btn',
        'data-exq-ctx-layer': def.testId,
        title,
        'aria-label': title,
      },
      svgIcon(def.icon, 14, '0 0 24 24', 2),
    );
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nativeBtn = nativeMap.get(def.testId);
      if (nativeBtn) {
        nativeBtn.click();
        return;
      }
      const liveZBtns = document.querySelectorAll<HTMLElement>('.zIndexButton');
      if (liveZBtns[def.zIdx]) {
        liveZBtns[def.zIdx].click();
        sendEscape();
        return;
      }
      sendEscape();
      dispatchLayerShortcut(def.testId);
    });
    group.append(btn);
  }

  const row = el(
    'div',
    { class: 'exq-ctx-layer-bar' },
    el('span', { class: 'exq-ctx-layer-title' }, t.ctxLayer),
    group,
  );
  return el('li', { class: 'exq-ctx-widget-li', 'data-exq-ctx-layer-bar': '1' }, row);
}

export function syncContextMenu(root: ParentNode = document): boolean {
  const ul = root.querySelector('.context-menu');
  if (!ul || contextMenuProcessed.has(ul)) return false;

  const t = getMessages(runtime.prefs.lang);
  ul.classList.add('exq-ctx-rich');

  const isEditableSelection = !!(
    ul.querySelector('li[data-testid="cut"]') || ul.querySelector('li[data-testid="deleteSelectedElements"]')
  );

  if (isEditableSelection) {
    const topFrag = document.createDocumentFragment();
    topFrag.append(buildContextQuickBar(ul, t));
    topFrag.append(el('hr', { class: 'context-menu-item-separator' }));
    topFrag.append(buildContextLayerBar(ul, t));
    topFrag.append(el('hr', { class: 'context-menu-item-separator' }));

    ul.insertBefore(topFrag, ul.firstChild);
  }

  // Decorate remaining visible native items with unified line icons
  for (const child of Array.from(ul.children)) {
    if (child.tagName !== 'LI' || child.classList.contains('exq-ctx-widget-li')) continue;
    if (isContextItemHidden(child)) continue;

    const btn = child.querySelector<HTMLButtonElement>(':scope > button.context-menu-item');
    if (!btn || btn.querySelector('.exq-ctx-item-icon')) continue;

    const tid = child.getAttribute('data-testid') || '';
    let iconName = CTX_ITEM_ICON_MAP[tid];
    if (tid === 'toggleElementLock' && !isEditableSelection) {
      iconName = 'unlock';
    }
    const iconSlot = el(
      'span',
      { class: 'exq-ctx-item-icon', 'aria-hidden': 'true' },
      iconName ? svgIcon(iconName, 14, '0 0 24 24', 1.9) : null,
    );
    btn.insertBefore(iconSlot, btn.firstChild);
  }

  const children = Array.from(ul.children);
  let lastVisibleWasSep = true;
  let lastVisibleSep: Element | null = null;
  for (const child of children) {
    if (child.tagName === 'HR') {
      child.classList.remove('exq-ctx-hr-hidden');
      if (lastVisibleWasSep) {
        child.classList.add('exq-ctx-hr-hidden');
      } else {
        lastVisibleWasSep = true;
        lastVisibleSep = child;
      }
    } else if (!isContextItemHidden(child)) {
      lastVisibleWasSep = false;
      lastVisibleSep = null;
    }
  }
  if (lastVisibleSep) lastVisibleSep.classList.add('exq-ctx-hr-hidden');

  contextMenuProcessed.add(ul);
  return true;
}

/* ================= Direct API Instant Export & Instant Reset ================= */
export async function runInstantExport(
  mode: 'copy' | 'png',
  triggerBtn?: HTMLButtonElement | null,
) {
  if (runtime.isBusy) return { ok: false, reason: 'busy' };
  runtime.isBusy = true;
  if (triggerBtn) triggerBtn.disabled = true;

  try {
    closeFloatingPopovers(null);
    return await runInstantExportWithApi(runtime.api, mode, runtime.prefs.exportOpts, {
      lang: runtime.prefs.lang,
      showToast,
    });
  } finally {
    runtime.isBusy = false;
    if (triggerBtn) triggerBtn.disabled = false;
  }
}

export async function runInstantReset(triggerBtn?: HTMLButtonElement | null) {
  if (runtime.isBusy) return { ok: false, reason: 'busy' };
  runtime.isBusy = true;
  if (triggerBtn) triggerBtn.disabled = true;

  try {
    closeFloatingPopovers(null);
    return await runInstantResetWithApi(runtime.api, runtime.prefs, {
      showToast,
    });
  } finally {
    runtime.isBusy = false;
    if (triggerBtn) triggerBtn.disabled = false;
  }
}

/* ================= Top-Right 2-Button Export Bar ([Copy] [Save]) ================= */
function buildRightBarWidget() {
  const t = getMessages(runtime.prefs.lang);
  const wrap = el('div', { class: 'exq-right-wrap', 'data-exq-right-bar': '1' });

  const copyBtn = el(
    'button',
    {
      type: 'button',
      class: 'exq-action-btn exq-primary',
      'data-exq-action': 'copy',
      title: t.copyToClipboard,
      'aria-label': t.copyToClipboard,
    },
    svgIcon('copy', 15),
  );

  const saveBtn = el(
    'button',
    {
      type: 'button',
      class: 'exq-action-btn',
      'data-exq-action': 'png',
      title: t.saveAsImage,
      'aria-label': t.saveAsImage,
    },
    svgIcon('download', 15),
  );

  copyBtn.addEventListener('click', async () => {
    const res = await runInstantExport('copy', copyBtn);
    if (res?.ok) {
      copyBtn.classList.add('exq-done');
      copyBtn.replaceChildren(svgIcon('check', 15, '0 0 24 24', 2.5));
      setTimeout(() => {
        copyBtn.classList.remove('exq-done');
        copyBtn.replaceChildren(svgIcon('copy', 15));
      }, 1100);
    }
  });

  saveBtn.addEventListener('click', () => {
    void runInstantExport('png', saveBtn);
  });

  const bar = el('div', { class: 'exq-right-bar' }, copyBtn, saveBtn);
  wrap.append(bar);

  return { wrap };
}

export function syncTopRightBar(root: ParentNode = document): boolean {
  const container = root.querySelector('.layer-ui__wrapper__top-right');
  if (!container) return false;

  let mounted = rightBarMounts.get(container);
  if (mounted && mounted.lang !== runtime.prefs.lang) {
    mounted.wrap.remove();
    mounted = undefined;
  }

  if (!mounted || !mounted.wrap.isConnected) {
    const widget = buildRightBarWidget();
    container.append(widget.wrap);
    mounted = { lang: runtime.prefs.lang, wrap: widget.wrap };
    rightBarMounts.set(container, mounted);
  }
  return true;
}

/* ================= Sync Loop & Boot ================= */
export function syncUI(): void {
  syncToolbar();
  syncTopRightBar();
  syncMainMenu();
  syncExtraToolsMenu();
  syncContextMenu();
  observer?.takeRecords();
}

export function scheduleSync(): void {
  if (syncScheduled) return;
  syncScheduled = true;
  const run = () => {
    syncScheduled = false;
    syncUI();
  };
  if (document.hidden || typeof requestAnimationFrame !== 'function') {
    setTimeout(run, 0);
  } else {
    requestAnimationFrame(run);
  }
}

export function bootQuickAnnotator(): () => void {
  runtime.prefs = loadPrefs();
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = runtime.prefs.lang;
  }

  const cleanupTextGuard = installTextAutoResizeGuard();
  const cleanupFastLoadSave = installFastLoadSaveInterceptor();
  const cleanupPrimaryToolGuard = installPrimaryToolRestoreGuard();

  const onDocClick = (e: MouseEvent) => {
    closeFloatingPopovers(e.target instanceof Node ? e.target : null);
  };
  const onDocKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeFloatingPopovers(null);
  };

  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onDocKeyDown);

  syncUI();
  const target = document.body || document.documentElement;
  if (target) {
    observer = new MutationObserver(scheduleSync);
    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  return () => {
    cleanupTextGuard();
    cleanupFastLoadSave();
    cleanupPrimaryToolGuard();
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onDocKeyDown);
    observer?.disconnect();
    observer = null;
  };
}

export {
  DEFAULT_PINK,
  DEFAULT_PREFS,
  bootstrapCleanCanvas,
  clearIndexedDbFiles,
  filterTargetElementsForExport,
  inlinePreSplitFontsIntoSvg,
  loadPrefs,
  normalizeFormat,
  normalizeScale,
  savePrefs,
  shouldSkipAutoReset,
};
