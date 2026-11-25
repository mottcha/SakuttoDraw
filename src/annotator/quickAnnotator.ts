import { CaptureUpdateAction } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
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
  resolvePreferJpFont,
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
import {
  applyJapaneseGlyphOverride,
  refreshSceneHandDrawnTextFonts,
} from './jpGlyphOverride';
import { createOrUpdateRedactElement, isRedactElement } from './redactProcessor';

export const REDACT_TOOL_CUSTOM_TYPE = 'sakutto-redact';

export const SHAPE_OTHER_ITEMS = [
  { id: 'arrow', testId: 'toolbar-arrow', msgKey: 'toolArrow', shortcut: 'A' },
  { id: 'line', testId: 'toolbar-line', msgKey: 'toolLine', shortcut: 'L' },
  { id: 'diamond', testId: 'toolbar-diamond', msgKey: 'toolDiamond', shortcut: 'D' },
  { id: 'redact', testId: 'toolbar-redact', msgKey: 'toolRedact', shortcut: '' },
] as const;

export const MOBILE_SHAPE_OTHER_ITEMS = [
  { id: 'ellipse', testId: 'toolbar-ellipse', msgKey: 'toolEllipse', shortcut: 'O' },
  { id: 'arrow', testId: 'toolbar-arrow', msgKey: 'toolArrow', shortcut: 'A' },
  { id: 'line', testId: 'toolbar-line', msgKey: 'toolLine', shortcut: 'L' },
  { id: 'diamond', testId: 'toolbar-diamond', msgKey: 'toolDiamond', shortcut: 'D' },
  { id: 'redact', testId: 'toolbar-redact', msgKey: 'toolRedact', shortcut: '' },
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
  { key: 'modernContextMenu', msgKey: 'optModernContextMenu' },
] as const;

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICON_DEFS: Record<string, Array<[string, Record<string, string | number>]>> = {
  rectangle: [['rect', { x: 4, y: 4, width: 16, height: 16, rx: 2.5 }]],
  ellipse: [['circle', { cx: 12, cy: 12, r: 8.5 }]],
  text: [
    ['polyline', { points: '4 7 4 4 20 4 20 7' }],
    ['line', { x1: 9, y1: 20, x2: 15, y2: 20 }],
    ['line', { x1: 12, y1: 4, x2: 12, y2: 20 }],
  ],
  dotsH: [
    ['circle', { cx: 5, cy: 12, r: 1.5, fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: 12, cy: 12, r: 1.5, fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: 19, cy: 12, r: 1.5, fill: 'currentColor', stroke: 'none' }],
  ],
  caretUp: [['path', { d: 'm3 7.5 3-3 3 3' }]],
  arrow: [
    ['line', { x1: 5, y1: 12, x2: 19, y2: 12 }],
    ['polyline', { points: '13 6 19 12 13 18' }],
  ],
  line: [['line', { x1: 5, y1: 19, x2: 19, y2: 5 }]],
  diamond: [['path', { d: 'M12 3.5 20.5 12 12 20.5 3.5 12 12 3.5Z' }]],
  redact: [
    ['rect', { x: 4, y: 4, width: 16, height: 16, rx: 2 }],
    ['rect', { x: 7, y: 7, width: 4, height: 4, fill: 'currentColor', stroke: 'none', opacity: '0.85' }],
    ['rect', { x: 13, y: 7, width: 4, height: 4, fill: 'currentColor', stroke: 'none', opacity: '0.35' }],
    ['rect', { x: 7, y: 13, width: 4, height: 4, fill: 'currentColor', stroke: 'none', opacity: '0.35' }],
    ['rect', { x: 13, y: 13, width: 4, height: 4, fill: 'currentColor', stroke: 'none', opacity: '0.85' }],
  ],
  fillOutline: [['rect', { x: 4, y: 4, width: 16, height: 16, rx: 2.5 }]],
  fillSolid: [['rect', { x: 4, y: 4, width: 16, height: 16, rx: 2.5, fill: 'currentColor' }]],
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
  wrapContainer: [
    ['rect', { x: 3, y: 4, width: 18, height: 16, rx: 2.5 }],
    ['line', { x1: 7.5, y1: 9.5, x2: 16.5, y2: 9.5 }],
    ['line', { x1: 7.5, y1: 14.5, x2: 13.5, y2: 14.5 }],
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

export function cloneNativeToolbarIcon(
  testId: string,
  fallbackIconId: string,
  size = 16,
  strokeWidth = 1.5,
  root: ParentNode = document,
): SVGSVGElement {
  const nativeSvg = root.querySelector<SVGSVGElement>(`.App-toolbar [data-testid="${testId}"] svg`);
  if (nativeSvg && typeof nativeSvg.cloneNode === 'function') {
    const cloned = nativeSvg.cloneNode(true) as SVGSVGElement;
    cloned.setAttribute('width', String(size));
    cloned.setAttribute('height', String(size));
    cloned.setAttribute('aria-hidden', 'true');
    cloned.removeAttribute('class');
    return cloned;
  }
  return svgIcon(fallbackIconId, size, '0 0 24 24', strokeWidth);
}

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
  prefs: {
    lang: DEFAULT_PREFS.lang,
    themeMode: DEFAULT_PREFS.themeMode,
    boxSelectionMode: DEFAULT_PREFS.boxSelectionMode,
    inputDevice: DEFAULT_PREFS.inputDevice,
    stylesPanelMode: DEFAULT_PREFS.stylesPanelMode,
    preferJpFont: DEFAULT_PREFS.preferJpFont,
    exportOpts: { ...DEFAULT_PREFS.exportOpts },
    quickOpts: { ...DEFAULT_PREFS.quickOpts },
    redactOpts: { ...DEFAULT_PREFS.redactOpts },
  },
  lastShapeOther: 'arrow',
  lastMobileShapeOther: 'ellipse',
  isBusy: false,
  drawAssistAccOpen: false,
  expAccOpen: false,
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
const mobileToolbarMounts = new WeakMap<Element, {
  lang: AppLang;
  textBtn: HTMLButtonElement;
  rectBtn: HTMLButtonElement;
  widget: ReturnType<typeof buildMobileShapeGroupWidget>;
}>();
const mobileShapeActionsMounts = new WeakMap<Element, {
  lang: AppLang;
  dupWrap: HTMLElement;
  dupBtn: HTMLButtonElement;
  delWrap: HTMLElement;
  delBtn: HTMLButtonElement;
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
  applyJapaneseGlyphOverride(resolvePreferJpFont(runtime.prefs));
  void refreshSceneHandDrawnTextFonts(runtime.api);
  runtime.onLangChange?.(nextLang);
  scheduleSync();
}

export function applyPreferJpFont(enabled: boolean): void {
  runtime.prefs.preferJpFont = enabled;
  savePrefs(runtime.prefs);
  applyJapaneseGlyphOverride(enabled);
  void refreshSceneHandDrawnTextFonts(runtime.api);
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

function getActiveNativeToolId(root: ParentNode = document): 'arrow' | 'line' | 'diamond' | 'redact' | null {
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
    const btn = root.querySelector(`.App-toolbar [data-testid="${item.testId}"]`);
    if (btn?.classList.contains('ToolIcon--checked')) return item.id;
  }
  return null;
}

function clickNativeTool(testId: string, root: ParentNode = document): boolean {
  if (runtime.api) {
    const map: Record<string, string> = {
      'toolbar-rectangle': 'rectangle',
      'toolbar-ellipse': 'ellipse',
      'toolbar-text': 'text',
      'toolbar-image': 'image',
      'toolbar-frame': 'frame',
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
  const btn = root.querySelector<HTMLElement>(`.App-toolbar [data-testid="${testId}"]`);
  if (btn) {
    btn.click();
    return true;
  }
  return false;
}

/* ================= Text Tool Auto-Resize Guard ================= */
function isTextToolActive(root: ParentNode = document): boolean {
  if (runtime.api) {
    const t = silently(() => runtime.api?.getAppState()?.activeTool?.type);
    if (t) return t === 'text';
  }
  return !!(
    root.querySelector('.App-toolbar [data-testid="toolbar-text"].ToolIcon--checked') ||
    root.querySelector('.App-toolbar [data-exq-mobile-tool="text"].exq-active')
  );
}

function focusActiveTextWysiwyg(): boolean {
  const editable = document.querySelector<HTMLTextAreaElement>('textarea.excalidraw-wysiwyg');
  if (!editable) return false;
  if (document.activeElement !== editable) {
    silently(() => editable.focus({ preventScroll: true }));
  }
  return true;
}

export function installTextAutoResizeGuard(): () => void {
  let downPos: { x: number; y: number; pointerId: number } | null = null;
  let touchTextPointerId: number | null = null;
  let pendingTouchCleanup: (() => void) | null = null;

  const clearPendingTouchFocus = () => {
    if (pendingTouchCleanup) {
      pendingTouchCleanup();
      pendingTouchCleanup = null;
    }
    touchTextPointerId = null;
  };

  const onPointerDownCapture = (e: PointerEvent) => {
    if (e.button !== 0 || e.altKey) return;
    if (!isTextToolActive()) return;
    if (!(e.target instanceof Element) || !e.target.matches('canvas.interactive')) return;

    // On touch devices, never swallow pointermove or rewrite pointerup coordinates;
    // instead arm a synchronous WYSIWYG focus assist on pointerup/touchend so mobile virtual keyboards reliably open.
    if (e.pointerType === 'touch') {
      clearPendingTouchFocus();
      touchTextPointerId = e.pointerId;
      return;
    }

    if (!runtime.prefs.quickOpts.textAutoResize) return;
    downPos = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  };

  // Bubble-phase pointerdown fires after React/Excalidraw registers its own window pointerup handler,
  // guaranteeing our one-shot bubble pointerup runs synchronously right after Excalidraw mounts textarea.excalidraw-wysiwyg.
  const onPointerDownBubble = (e: PointerEvent) => {
    if (touchTextPointerId === null || e.pointerId !== touchTextPointerId) return;
    const expectedPointerId = touchTextPointerId;
    const onTouchPointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== expectedPointerId) return;
      focusActiveTextWysiwyg();
      clearPendingTouchFocus();
    };
    const onTouchEnd = () => {
      focusActiveTextWysiwyg();
      clearPendingTouchFocus();
    };
    window.addEventListener('pointerup', onTouchPointerUp, false);
    window.addEventListener('touchend', onTouchEnd, false);
    pendingTouchCleanup = () => {
      window.removeEventListener('pointerup', onTouchPointerUp, false);
      window.removeEventListener('touchend', onTouchEnd, false);
    };
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
    if (touchTextPointerId !== null && e.pointerId === touchTextPointerId) {
      clearPendingTouchFocus();
    }
  };

  window.addEventListener('pointerdown', onPointerDownCapture, true);
  window.addEventListener('pointerdown', onPointerDownBubble, false);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerCancel, true);

  return () => {
    clearPendingTouchFocus();
    window.removeEventListener('pointerdown', onPointerDownCapture, true);
    window.removeEventListener('pointerdown', onPointerDownBubble, false);
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', onPointerCancel, true);
  };
}

/* ================= Ctrl+Click Multi-Select Guard ================= */
function isMacPlatform(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    /Mac|iPod|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '')
  );
}

function isSelectionToolActive(root: ParentNode = document): boolean {
  if (runtime.api) {
    const t = silently(() => runtime.api?.getAppState()?.activeTool?.type);
    if (t) return t === 'selection';
  }
  return !!(
    root.querySelector('.App-toolbar [data-testid="toolbar-selection"].ToolIcon--checked') ||
    root.querySelector('.App-toolbar [data-exq-mobile-tool="selection"].exq-active')
  );
}

function remapCtrlToShift(e: PointerEvent, isMac: boolean): void {
  if (isMac) {
    silently(() => Object.defineProperty(e, 'metaKey', { value: false, configurable: true }));
  } else {
    silently(() => Object.defineProperty(e, 'ctrlKey', { value: false, configurable: true }));
  }
  silently(() => Object.defineProperty(e, 'shiftKey', { value: true, configurable: true }));
}

/**
 * Maps Ctrl+pointer (or Cmd+pointer on macOS) on the selection canvas to Shift+pointer
 * so Ctrl+click on shapes performs Excalidraw's toggle multi-select instead of deep single-select.
 */
export function installCtrlMultiSelectGuard(): () => void {
  let activePointerId: number | null = null;

  const onPointerDownCapture = (e: PointerEvent) => {
    if (e.button !== 0 || e.altKey) return;
    const isMac = isMacPlatform();
    if (!(isMac ? e.metaKey : e.ctrlKey)) return;
    if (!(e.target instanceof Element) || !e.target.matches('canvas.interactive')) return;
    if (!isSelectionToolActive()) return;

    const st = silently(() => runtime.api?.getAppState());
    if (
      st &&
      (st.viewModeEnabled ||
        st.editingTextElement ||
        st.croppingElementId ||
        st.selectedLinearElement?.isEditing)
    ) {
      return;
    }

    activePointerId = e.pointerId;
    remapCtrlToShift(e, isMac);
  };

  const onPointerMoveCapture = (e: PointerEvent) => {
    if (activePointerId === null || e.pointerId !== activePointerId) return;
    const isMac = isMacPlatform();
    if (!e.altKey && (isMac ? e.metaKey : e.ctrlKey)) {
      remapCtrlToShift(e, isMac);
    }
  };

  const onPointerUpCapture = (e: PointerEvent) => {
    if (activePointerId === null || e.pointerId !== activePointerId) return;
    activePointerId = null;
    const isMac = isMacPlatform();
    if (!e.altKey && (isMac ? e.metaKey : e.ctrlKey)) {
      remapCtrlToShift(e, isMac);
    }
  };

  const onPointerCancelCapture = (e: PointerEvent) => {
    if (activePointerId !== null && e.pointerId === activePointerId) {
      activePointerId = null;
    }
  };

  const onWindowBlur = () => {
    activePointerId = null;
  };

  window.addEventListener('pointerdown', onPointerDownCapture, true);
  window.addEventListener('pointermove', onPointerMoveCapture, true);
  window.addEventListener('pointerup', onPointerUpCapture, true);
  window.addEventListener('pointercancel', onPointerCancelCapture, true);
  window.addEventListener('blur', onWindowBlur);

  return () => {
    activePointerId = null;
    window.removeEventListener('pointerdown', onPointerDownCapture, true);
    window.removeEventListener('pointermove', onPointerMoveCapture, true);
    window.removeEventListener('pointerup', onPointerUpCapture, true);
    window.removeEventListener('pointercancel', onPointerCancelCapture, true);
    window.removeEventListener('blur', onWindowBlur);
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
      // Invoke File System Access save picker in the synchronous user-gesture tick before dismissing menu
      void runDirectDiskSaveWithApi(runtime.api, { lang: runtime.prefs.lang, showToast });
      sendEscape();
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
  const caretSlot = svgIcon('caret', 10, '0 0 12 12', 1.5);
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
      cloneNativeToolbarIcon(item.testId, item.id, 15, 1.5),
      el('span', null, label),
      item.shortcut ? el('span', { class: 'exq-pop-shortcut' }, item.shortcut) : null,
    );
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      runtime.lastShapeOther = item.id;
      wrap.classList.remove('exq-open');
      trigger.setAttribute('aria-expanded', 'false');
      if (item.id === 'redact') {
        activateRedactTool();
      } else {
        clickNativeTool(item.testId);
        scheduleSync();
      }
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
      const meta = SHAPE_OTHER_ITEMS.find((it) => it.id === renderedIconId);
      iconSlot.replaceChildren(
        cloneNativeToolbarIcon(meta?.testId || '', renderedIconId, 16, 1.5),
      );
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
      svgIcon('reset', 16, '0 0 24 24', 1.5),
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

/* ================= Mobile A-2 Unified Toolbar & Persistent Duplicate/Delete ================= */
function getActiveMobileShapeOtherId(): 'ellipse' | 'arrow' | 'line' | 'diamond' | 'redact' | null {
  const activeTool = silently(() => runtime.api?.getAppState()?.activeTool);
  if (activeTool?.type === 'custom' && activeTool?.customType === REDACT_TOOL_CUSTOM_TYPE) {
    return 'redact';
  }
  const activeType = activeTool?.type;
  if (
    activeType === 'ellipse' ||
    activeType === 'arrow' ||
    activeType === 'line' ||
    activeType === 'diamond'
  ) {
    return activeType;
  }
  return null;
}

function buildMobileShapeGroupWidget() {
  const t = getMessages(runtime.prefs.lang);
  const wrap = el('div', { class: 'exq-shape-group exq-mobile-shape-group', 'data-exq-mobile-shape-group': '1' });
  const iconSlot = el('span', { class: 'exq-icon-slot' });
  const caretSlot = svgIcon('caretUp', 10, '0 0 12 12', 1.5);
  caretSlot.classList.add('exq-caret');

  const trigger = el(
    'button',
    {
      type: 'button',
      class: 'exq-shape-trigger exq-mobile-shape-trigger',
      title: t.mobileShapeGroupTitle,
      'aria-label': t.mobileShapeGroupTitle,
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
    },
    iconSlot,
    caretSlot,
  );

  const popover = el('div', { class: 'exq-popover exq-popover--up', role: 'menu' });
  const itemButtons = new Map<string, HTMLButtonElement>();

  for (const item of MOBILE_SHAPE_OTHER_ITEMS) {
    const label = t[item.msgKey];
    const btn = el(
      'button',
      {
        type: 'button',
        class: 'exq-pop-item exq-pop-item--mobile',
        role: 'menuitem',
        'data-exq-mobile-shape': item.id,
        title: label,
        'aria-label': label,
      },
      cloneNativeToolbarIcon(item.testId, item.id, 16, 1.5),
      el('span', { class: 'exq-pop-mobile-label' }, label),
    );
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      runtime.lastMobileShapeOther = item.id;
      wrap.classList.remove('exq-open');
      trigger.setAttribute('aria-expanded', 'false');
      if (item.id === 'redact') {
        activateRedactTool();
      } else {
        clickNativeTool(item.testId);
        scheduleSync();
      }
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
    const activeId = getActiveMobileShapeOtherId();
    if (activeId) runtime.lastMobileShapeOther = activeId;
    if (renderedIconId !== runtime.lastMobileShapeOther) {
      renderedIconId = runtime.lastMobileShapeOther;
      const meta = MOBILE_SHAPE_OTHER_ITEMS.find((it) => it.id === renderedIconId);
      iconSlot.replaceChildren(
        cloneNativeToolbarIcon(meta?.testId || '', renderedIconId, 16, 1.5),
      );
    }
    trigger.classList.toggle('exq-active', !!activeId);
    for (const [id, btn] of itemButtons) {
      btn.classList.toggle('exq-active', activeId === id);
    }
  };

  update();
  return { wrap, trigger, update };
}

export function syncMobileToolbar(root: ParentNode = document): boolean {
  const bar = root.querySelector('.App-toolbar .mobile-toolbar');
  if (!bar) return false;

  let mounted = mobileToolbarMounts.get(bar);
  if (mounted && mounted.lang !== runtime.prefs.lang) {
    mounted.textBtn.remove();
    mounted.rectBtn.remove();
    mounted.widget.wrap.remove();
    mounted = undefined;
  }

  if (!mounted || !mounted.widget.wrap.isConnected) {
    const t = getMessages(runtime.prefs.lang);

    const textBtn = el(
      'button',
      {
        type: 'button',
        class: 'exq-mobile-tool-btn exq-mobile-text',
        'data-exq-mobile-tool': 'text',
        title: t.toolText,
        'aria-label': t.toolText,
      },
      cloneNativeToolbarIcon('toolbar-text', 'text', 16, 1.5),
    );
    textBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFloatingPopovers(null);
      clickNativeTool('toolbar-text');
      scheduleSync();
    });

    const rectBtn = el(
      'button',
      {
        type: 'button',
        class: 'exq-mobile-tool-btn exq-mobile-rect',
        'data-exq-mobile-tool': 'rectangle',
        title: t.toolRectangle,
        'aria-label': t.toolRectangle,
      },
      cloneNativeToolbarIcon('toolbar-rectangle', 'rectangle', 16, 1.5),
    );
    rectBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFloatingPopovers(null);
      clickNativeTool('toolbar-rectangle');
      scheduleSync();
    });

    const widget = buildMobileShapeGroupWidget();
    bar.append(textBtn, rectBtn, widget.wrap);
    mounted = { lang: runtime.prefs.lang, textBtn, rectBtn, widget };
    mobileToolbarMounts.set(bar, mounted);
  } else {
    mounted.widget.update();
  }

  // Show fallback Text button only when Excalidraw collapses native toolbar-text (<316px)
  const hasNativeText = !!bar.querySelector(':scope > [data-testid="toolbar-text"]');
  mounted.textBtn.style.display = hasNativeText ? 'none' : '';

  const activeTool = silently(() => runtime.api?.getAppState()?.activeTool);
  mounted.textBtn.classList.toggle('exq-active', activeTool?.type === 'text');
  mounted.rectBtn.classList.toggle('exq-active', activeTool?.type === 'rectangle');

  const extraBtn = bar.querySelector('.App-toolbar__extra-tools-trigger');
  if (extraBtn) {
    const eraserChecked = activeTool?.type === 'eraser';
    const stickyChecked = activeTool?.type === 'stickynote';
    const lassoChecked = activeTool?.type === 'lasso';
    const lockChecked = !!activeTool?.locked;
    extraBtn.classList.toggle('exq-eraser-active', eraserChecked || stickyChecked || lassoChecked);
    extraBtn.classList.toggle('exq-lock-active', lockChecked);
  }

  return true;
}

function dispatchElementShortcut(action: 'duplicate' | 'delete'): void {
  const isMac = isMacPlatform();
  silently(() => {
    if (action === 'delete') {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Delete',
          code: 'Delete',
          bubbles: true,
          cancelable: true,
        }),
      );
      return;
    }
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'd',
        code: 'KeyD',
        ctrlKey: !isMac,
        metaKey: isMac,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

function hasAnySelectedElement(): boolean {
  if (!runtime.api) return true;
  const st = silently(() => runtime.api?.getAppState());
  if (!st || st.viewModeEnabled) return false;
  const sel = st.selectedElementIds;
  if (!sel) return false;
  return Object.values(sel).some(Boolean);
}

export function syncMobileShapeActions(root: ParentNode = document): boolean {
  const bar = root.querySelector('.mobile-shape-actions');
  if (!bar) return false;

  const directDivs = Array.from(bar.children).filter((c) => c.tagName === 'DIV');
  if (directDivs.length < 2) return false;
  const rightGroup = directDivs[directDivs.length - 1];

  let mounted = mobileShapeActionsMounts.get(rightGroup);
  if (mounted && mounted.lang !== runtime.prefs.lang) {
    mounted.dupWrap.remove();
    mounted.delWrap.remove();
    mounted = undefined;
  }

  if (!mounted || !mounted.dupWrap.isConnected || !mounted.delWrap.isConnected) {
    const t = getMessages(runtime.prefs.lang);

    const dupBtn = el(
      'button',
      {
        type: 'button',
        class: 'compact-action-button exq-mobile-action-btn',
        'data-exq-mobile-action': 'duplicate',
        title: t.ctxDuplicate,
        'aria-label': t.ctxDuplicate,
      },
      svgIcon('dup', 15, '0 0 24 24', 1.9),
    );
    dupBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dupBtn.disabled) return;
      dispatchElementShortcut('duplicate');
      scheduleSync();
    });
    const dupWrap = el('div', { class: 'compact-action-item exq-mobile-action-item' }, dupBtn);

    const delBtn = el(
      'button',
      {
        type: 'button',
        class: 'compact-action-button exq-mobile-action-btn exq-mobile-action-btn--danger',
        'data-exq-mobile-action': 'delete',
        title: t.ctxDelete,
        'aria-label': t.ctxDelete,
      },
      svgIcon('reset', 15, '0 0 24 24', 1.9),
    );
    delBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (delBtn.disabled) return;
      dispatchElementShortcut('delete');
      scheduleSync();
    });
    const delWrap = el('div', { class: 'compact-action-item exq-mobile-action-item' }, delBtn);

    rightGroup.append(dupWrap, delWrap);
    mounted = { lang: runtime.prefs.lang, dupWrap, dupBtn, delWrap, delBtn };
    mobileShapeActionsMounts.set(rightGroup, mounted);
  }

  // Excalidraw renders 2 native items (<374px: Undo/Redo), 3 items (374..411px: +Delete), 4 items (>=412px: +Dup+Delete).
  const nativeItems = Array.from(rightGroup.children).filter(
    (c) => !c.classList.contains('exq-mobile-action-item'),
  );
  const needDup = nativeItems.length < 4;
  const needDel = nativeItems.length < 3;

  mounted.dupWrap.style.display = needDup ? '' : 'none';
  mounted.delWrap.style.display = needDel ? '' : 'none';

  // When Delete is native (nativeItems.length === 3), place our Duplicate button right before native Delete.
  if (nativeItems.length === 3 && mounted.dupWrap.nextElementSibling !== nativeItems[2]) {
    rightGroup.insertBefore(mounted.dupWrap, nativeItems[2]);
  }

  const hasSel = hasAnySelectedElement();
  mounted.dupBtn.disabled = !hasSel;
  mounted.delBtn.disabled = !hasSel;

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

  /* --- Drawing Assist Accordion (default collapsed) --- */
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

  refreshAssist();
  root.append(sep, assistWrap);
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
    } else if (item.id === 'lock') {
      if (runtime.api) {
        const cur = runtime.api.getAppState().activeTool;
        runtime.api.updateScene({
          appState: {
            activeTool: { ...cur, locked: !cur.locked },
          },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      } else {
        clickNativeTool(item.testId);
      }
      sendEscape();
      scheduleSync();
    } else if (runtime.api && (item.id === 'eraser' || item.id === 'sticky')) {
      runtime.api.setActiveTool({
        type: item.id === 'sticky' ? ('stickynote' as never) : 'eraser',
      });
      sendEscape();
      scheduleSync();
    } else {
      clickNativeTool(item.testId);
      sendEscape();
      scheduleSync();
    }
  });
  return btn;
}

function makeExtraMenuProxyItem(
  iconName: string,
  label: string,
  toolTestId: string,
  extraToolId: string,
): HTMLButtonElement {
  const btn = el(
    'button',
    {
      type: 'button',
      role: 'menuitem',
      class: 'dropdown-menu-item dropdown-menu-item-base exq-extra-proxy-item',
      'data-exq-extra-tool': extraToolId,
      title: label,
      'aria-label': label,
    },
    el('div', { class: 'dropdown-menu-item__icon' }, svgIcon(iconName, 16, '0 0 24 24', 1.85)),
    el('div', { class: 'dropdown-menu-item__text' }, label),
  );
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    clickNativeTool(toolTestId);
    sendEscape();
    scheduleSync();
  });
  return btn;
}

export function syncExtraToolsMenu(root: ParentNode = document): boolean {
  const menu = root.querySelector(
    '.dropdown-menu-container:has([data-testid="toolbar-image"], [data-testid="toolbar-laser"])',
  );
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

  // On mobile, A-2 hides toolbar-image/toolbar-frame from .mobile-toolbar for uniform 7-slot layout;
  // recover them inside Extra Tools whenever Excalidraw moved them out of the dropdown (>=356px / >=396px).
  if (root.querySelector('.mobile-toolbar')) {
    const t = getMessages(runtime.prefs.lang);
    if (!menu.querySelector('[data-testid="toolbar-image"]')) {
      topFrag.append(makeExtraMenuProxyItem('imgSave', t.toolImage, 'toolbar-image', 'image'));
    }
    if (!menu.querySelector('[data-testid="toolbar-frame"]')) {
      topFrag.append(makeExtraMenuProxyItem('frame', t.toolFrame, 'toolbar-frame', 'frame'));
    }
  }

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
  sendToBack: 'toBack',
  sendBackward: 'backward',
  bringForward: 'forward',
  bringToFront: 'toFront',
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
  wrapTextInContainer: 'wrapContainer',
  toggleLinearEditor: 'editLine',
  togglePolygon: 'editLine',
  selectAllElementsInFrame: 'frame',
  removeAllElementsFromFrame: 'frameRemove',
};

function isSelectedElementLocked(isEditableSelection: boolean): boolean {
  if (runtime.api) {
    const appState = silently(() => runtime.api?.getAppState());
    const elements = silently(() => runtime.api?.getSceneElements());
    if (elements && appState?.selectedElementIds) {
      const selected = elements.filter((item) => appState.selectedElementIds[item.id]);
      if (selected.length > 0) {
        return selected.some((item) => item.locked);
      }
    }
  }
  return !isEditableSelection;
}

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

function buildContextQuickBar(
  ul: Element,
  t: ReturnType<typeof getMessages>,
  options: { isMobileB2?: boolean; onToggleMore?: (btn: HTMLButtonElement) => void } = {},
): HTMLLIElement {
  const bar = el('div', {
    class: 'exq-ctx-quick-bar' + (options.isMobileB2 ? ' exq-ctx-quick-bar--b2' : ''),
    role: 'group',
  });

  const actionsGrid = options.isMobileB2
    ? el('div', { class: 'exq-ctx-b2-actions', role: 'group' })
    : bar;

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
    actionsGrid.append(btn);
  }

  if (options.isMobileB2) {
    const moreBtn = el(
      'button',
      {
        type: 'button',
        class: 'exq-ctx-quick-btn exq-ctx-b2-more-btn',
        'data-exq-ctx-more': '1',
        title: t.ctxMore,
        'aria-label': t.ctxMore,
        'aria-expanded': 'false',
      },
      svgIcon('dotsH', 15, '0 0 24 24', 1.9),
      el('span', { class: 'exq-ctx-quick-label' }, t.ctxMore),
    );
    moreBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      options.onToggleMore?.(moreBtn);
    });
    bar.append(
      actionsGrid,
      el('div', { class: 'exq-ctx-b2-vdiv', 'aria-hidden': 'true' }),
      moreBtn,
    );
  }

  return el('li', { class: 'exq-ctx-widget-li', 'data-exq-ctx-quick-bar': '1' }, bar);
}

export function clampContextMenuPopover(ul: Element): void {
  const popover = ul.closest<HTMLElement>('.context-menu-popover');
  if (!popover) return;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  if (vw <= 0 || vh <= 0) return;

  const gap = 8;
  const maxW = Math.max(160, vw - gap * 2);
  const maxH = Math.max(160, vh - gap * 2);
  popover.style.maxWidth = `${maxW}px`;
  popover.style.maxHeight = `${maxH}px`;

  const rect = popover.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const offsetParent = popover.offsetParent instanceof HTMLElement ? popover.offsetParent : null;
  const parentRect = offsetParent ? offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
  const containerW = offsetParent ? offsetParent.clientWidth || vw : vw;
  const containerH = offsetParent ? offsetParent.clientHeight || vh : vh;

  const currentLeft = rect.left - parentRect.left;
  const currentTop = rect.top - parentRect.top;
  const maxLeft = Math.max(gap, containerW - gap - rect.width);
  const maxTop = Math.max(gap, containerH - gap - rect.height);
  const clampedLeft = Math.min(Math.max(currentLeft, gap), maxLeft);
  const clampedTop = Math.min(Math.max(currentTop, gap), maxTop);

  popover.style.left = `${Math.round(clampedLeft)}px`;
  popover.style.top = `${Math.round(clampedTop)}px`;
}

function dispatchLayerShortcut(testId: (typeof CTX_LAYER_BAR_ITEMS)[number]['testId']): void {
  const isMac = isMacPlatform();
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

  const isMobile = Boolean(
    ul.closest('.excalidraw--mobile') || root.querySelector('.excalidraw--mobile'),
  );
  let useMobileB2 = false;

  if (runtime.prefs.quickOpts.modernContextMenu) {
    const t = getMessages(runtime.prefs.lang);
    ul.classList.add('exq-ctx-rich');

    const isEditableSelection = !!(
      ul.querySelector('li[data-testid="cut"]') || ul.querySelector('li[data-testid="deleteSelectedElements"]')
    );

    if (isEditableSelection) {
      useMobileB2 = isMobile;
      const topFrag = document.createDocumentFragment();
      topFrag.append(
        buildContextQuickBar(ul, t, {
          isMobileB2: useMobileB2,
          onToggleMore: (moreBtn) => {
            const expanded = ul.classList.toggle('exq-ctx-b2-expanded');
            moreBtn.classList.toggle('exq-open', expanded);
            moreBtn.setAttribute('aria-expanded', String(expanded));
            clampContextMenuPopover(ul);
          },
        }),
      );
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
      if (tid === 'toggleElementLock') {
        iconName = isSelectedElementLocked(isEditableSelection) ? 'unlock' : 'lock';
      }
      const iconSlot = el(
        'span',
        { class: 'exq-ctx-item-icon', 'aria-hidden': 'true' },
        iconName ? svgIcon(iconName, 14, '0 0 24 24', 1.9) : null,
      );
      btn.insertBefore(iconSlot, btn.firstChild);
    }
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

  if (useMobileB2) {
    ul.classList.add('exq-ctx-mobile-b2');
  }

  clampContextMenuPopover(ul);
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
      preferJpFont: resolvePreferJpFont(runtime.prefs),
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
  const container =
    root.querySelector('.layer-ui__wrapper__top-right') ||
    root.querySelector('.excalidraw-ui-top-right');
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

/* ================= Stroke <-> Background Fill Toggle (Item 6) ================= */
const FILLABLE_ELEMENT_TYPES = new Set(['rectangle', 'ellipse', 'diamond', 'line', 'freedraw']);
type ElementFillStyle = 'hachure' | 'cross-hatch' | 'solid' | 'zigzag';

export function computeSwappedStrokeFill({
  strokeColor,
  backgroundColor,
  fillStyle = 'hachure',
  fallbackStrokeColor = DEFAULT_PEN_COLOR,
  targetMode = 'toggle',
}: {
  strokeColor: string;
  backgroundColor: string;
  fillStyle?: string;
  fallbackStrokeColor?: string;
  targetMode?: 'toggle' | 'outline' | 'filled';
}): {
  strokeColor: string;
  backgroundColor: string;
  fillStyle: ElementFillStyle;
} {
  const stroke = (strokeColor || DEFAULT_PEN_COLOR).trim();
  const bg = (backgroundColor || 'transparent').trim();
  const fs = (fillStyle || 'hachure') as ElementFillStyle;
  const strokeTransparent = stroke === 'transparent';
  const bgTransparent = bg === 'transparent';

  if (targetMode === 'outline') {
    const nextStroke = !strokeTransparent ? stroke : !bgTransparent ? bg : fallbackStrokeColor;
    return { strokeColor: nextStroke, backgroundColor: 'transparent', fillStyle: fs };
  }

  if (targetMode === 'filled') {
    const nextBg = !bgTransparent ? bg : !strokeTransparent ? stroke : fallbackStrokeColor;
    return {
      strokeColor: 'transparent',
      backgroundColor: nextBg,
      fillStyle: fs === 'hachure' ? 'solid' : fs,
    };
  }

  if (!strokeTransparent && bgTransparent) {
    return {
      strokeColor: 'transparent',
      backgroundColor: stroke,
      fillStyle: fs === 'hachure' ? 'solid' : fs,
    };
  }
  if (strokeTransparent && !bgTransparent) {
    return {
      strokeColor: bg,
      backgroundColor: 'transparent',
      fillStyle: fs,
    };
  }
  if (!strokeTransparent && !bgTransparent) {
    return {
      strokeColor: bg,
      backgroundColor: stroke,
      fillStyle: fs,
    };
  }
  return {
    strokeColor: fallbackStrokeColor,
    backgroundColor: 'transparent',
    fillStyle: fs,
  };
}

function getSelectedFillableElements(api: ExcalidrawImperativeAPI): ExcalidrawElement[] {
  const appState = api.getAppState();
  const selectedIds = appState.selectedElementIds || {};
  const elements = api.getSceneElements();
  return elements.filter(
    (item) =>
      !item.isDeleted &&
      Boolean(selectedIds[item.id]) &&
      FILLABLE_ELEMENT_TYPES.has(item.type) &&
      !isRedactElement(item),
  );
}

export function getActiveStrokeFillState(api: ExcalidrawImperativeAPI | null): {
  isFilledOnly: boolean;
  hasAnyFill: boolean;
  eligible: boolean;
} {
  if (!api) {
    return { isFilledOnly: false, hasAnyFill: false, eligible: false };
  }
  const appState = api.getAppState();
  const selectedIds = appState.selectedElementIds || {};
  const hasAnySelected = Object.values(selectedIds).some(Boolean);
  if (hasAnySelected) {
    const fillable = getSelectedFillableElements(api);
    if (fillable.length === 0) {
      return { isFilledOnly: false, hasAnyFill: false, eligible: false };
    }
    const first = fillable[0];
    return {
      isFilledOnly: first.strokeColor === 'transparent' && first.backgroundColor !== 'transparent',
      hasAnyFill: first.backgroundColor !== 'transparent',
      eligible: true,
    };
  }

  const activeType = appState.activeTool?.type;
  const eligibleTool = activeType === 'rectangle' || activeType === 'ellipse' || activeType === 'diamond';
  const stroke = appState.currentItemStrokeColor || DEFAULT_PEN_COLOR;
  const bg = appState.currentItemBackgroundColor || 'transparent';
  return {
    isFilledOnly: stroke === 'transparent' && bg !== 'transparent',
    hasAnyFill: bg !== 'transparent',
    eligible: eligibleTool,
  };
}

export function toggleFillOrSwapColorsWithApi(
  api: ExcalidrawImperativeAPI | null,
  {
    lang = 'en',
    showToast: toastFn,
    defaultPenColor = DEFAULT_PEN_COLOR,
    targetMode = 'toggle',
  }: {
    lang?: AppLang;
    showToast?: (msg: string) => void;
    defaultPenColor?: string;
    targetMode?: 'toggle' | 'outline' | 'filled';
  } = {},
): boolean {
  if (!api) return false;
  const appState = api.getAppState();
  const selectedIds = appState.selectedElementIds || {};
  const hasAnySelected = Object.values(selectedIds).some(Boolean);

  if (hasAnySelected) {
    const fillableIds = new Set(getSelectedFillableElements(api).map((e) => e.id));
    if (fillableIds.size === 0) return false;

    let primaryStyle: { strokeColor: string; backgroundColor: string; fillStyle: ElementFillStyle } | null = null;
    const now = Date.now();
    const nextElements = api.getSceneElements().map((elItem) => {
      if (!fillableIds.has(elItem.id)) return elItem;
      const swapped = computeSwappedStrokeFill({
        strokeColor: elItem.strokeColor,
        backgroundColor: elItem.backgroundColor,
        fillStyle: elItem.fillStyle,
        fallbackStrokeColor: defaultPenColor,
        targetMode,
      });
      if (!primaryStyle) primaryStyle = swapped;
      return {
        ...elItem,
        strokeColor: swapped.strokeColor,
        backgroundColor: swapped.backgroundColor,
        fillStyle: swapped.fillStyle,
        version: elItem.version + 1,
        versionNonce: Math.floor(Math.random() * 2147483647) + 1,
        updated: now,
      };
    });

    if (!primaryStyle) return false;
    const resolvedStyle = primaryStyle as {
      strokeColor: string;
      backgroundColor: string;
      fillStyle: ElementFillStyle;
    };

    api.updateScene({
      elements: nextElements,
      appState: {
        currentItemStrokeColor: resolvedStyle.strokeColor,
        currentItemBackgroundColor: resolvedStyle.backgroundColor,
        currentItemFillStyle: resolvedStyle.fillStyle,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    toastFn?.(getMessages(lang).toastColorSwapped);
    return true;
  }

  const nextStyle = computeSwappedStrokeFill({
    strokeColor: appState.currentItemStrokeColor || defaultPenColor,
    backgroundColor: appState.currentItemBackgroundColor || 'transparent',
    fillStyle: appState.currentItemFillStyle || 'hachure',
    fallbackStrokeColor: defaultPenColor,
    targetMode,
  });

  api.updateScene({
    appState: {
      currentItemStrokeColor: nextStyle.strokeColor,
      currentItemBackgroundColor: nextStyle.backgroundColor,
      currentItemFillStyle: nextStyle.fillStyle,
    },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  toastFn?.(getMessages(lang).toastColorSwapped);
  return true;
}

const fillToggleMounts = new WeakMap<Element, {
  lang: AppLang;
  wrap: HTMLElement;
  btn: HTMLButtonElement;
  iconSlot: HTMLElement;
}>();
const fillSegmentMounts = new WeakMap<Element, {
  lang: AppLang;
  wrap: HTMLElement;
  outlineBtn: HTMLButtonElement;
  filledBtn: HTMLButtonElement;
}>();

function updateFillToggleButtonState(
  btn: HTMLButtonElement,
  iconSlot: HTMLElement,
  isFilled: boolean,
): void {
  btn.classList.toggle('exq-is-filled', isFilled);
  btn.setAttribute('aria-pressed', String(isFilled));
  iconSlot.replaceChildren(svgIcon(isFilled ? 'fillSolid' : 'fillOutline', 14, '0 0 24 24', 1.6));
}

function syncCompactFillToggle(container: Element, isMobile: boolean): boolean {
  const strokeTrigger = container.querySelector('[data-openpopup="elementStroke"]');
  const bgTrigger = container.querySelector('[data-openpopup="elementBackground"]');
  const existing = fillToggleMounts.get(container);

  if (!strokeTrigger || !bgTrigger) {
    if (existing) {
      existing.wrap.remove();
      fillToggleMounts.delete(container);
    }
    return false;
  }

  const t = getMessages(runtime.prefs.lang);
  const { isFilledOnly } = getActiveStrokeFillState(runtime.api);

  let mounted = existing;
  if (mounted && mounted.lang !== runtime.prefs.lang) {
    mounted.wrap.remove();
    fillToggleMounts.delete(container);
    mounted = undefined;
  }

  if (!mounted || !mounted.wrap.isConnected) {
    const iconSlot = el('span', { class: 'exq-fill-btn-icon', 'aria-hidden': 'true' });
    const labelSpan = el('span', { class: 'exq-fill-btn-label' }, t.fillToggleShort);
    const btn = el(
      'button',
      {
        type: 'button',
        class: `exq-fill-toggle-btn${isMobile ? ' exq-fill-toggle-btn--mobile' : ' exq-fill-toggle-btn--slim'}`,
        'data-exq-fill-toggle': '1',
        title: t.swapStrokeFillTitle,
        'aria-label': t.swapStrokeFillTitle,
        'aria-pressed': String(isFilledOnly),
      },
      iconSlot,
      labelSpan,
    );
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFillOrSwapColorsWithApi(runtime.api, {
        lang: runtime.prefs.lang,
        showToast,
        defaultPenColor: getCurrentPenColor(),
        targetMode: 'toggle',
      });
      syncStylesPanelColorSwap();
      scheduleSync();
    });

    const wrap = el(
      'div',
      { class: `compact-action-item exq-fill-compact-item${isMobile ? ' exq-fill-mobile-item' : ''}` },
      btn,
    );
    const bgItem = bgTrigger.closest('.compact-action-item');
    if (bgItem && bgItem.parentElement === container) {
      container.insertBefore(wrap, bgItem.nextSibling);
    } else {
      container.append(wrap);
    }
    mounted = { lang: runtime.prefs.lang, wrap, btn, iconSlot };
    fillToggleMounts.set(container, mounted);
  }

  updateFillToggleButtonState(mounted.btn, mounted.iconSlot, isFilledOnly);
  return true;
}

function syncExpandedFillSegment(panelRoot: Element): boolean {
  const strokeTrigger = panelRoot.querySelector('[data-openpopup="elementStroke"]');
  const bgTrigger = panelRoot.querySelector('[data-openpopup="elementBackground"]');
  const existing = fillSegmentMounts.get(panelRoot);

  if (!strokeTrigger || !bgTrigger) {
    if (existing) {
      existing.wrap.remove();
      fillSegmentMounts.delete(panelRoot);
    }
    return false;
  }

  const targetParent =
    strokeTrigger.closest('.panelColumn') ||
    panelRoot.querySelector('.panelColumn') ||
    panelRoot;
  const t = getMessages(runtime.prefs.lang);
  const { isFilledOnly } = getActiveStrokeFillState(runtime.api);

  let mounted = existing;
  if (mounted && mounted.lang !== runtime.prefs.lang) {
    mounted.wrap.remove();
    fillSegmentMounts.delete(panelRoot);
    mounted = undefined;
  }

  if (!mounted || !mounted.wrap.isConnected) {
    const outlineBtn = el(
      'button',
      {
        type: 'button',
        role: 'radio',
        class: 'exq-fill-seg-btn',
        'data-exq-fill-mode': 'outline',
        title: t.swapStrokeFillTitle,
      },
      svgIcon('fillOutline', 13, '0 0 24 24', 1.6),
      el('span', null, t.fillToggleOutline),
    );
    const filledBtn = el(
      'button',
      {
        type: 'button',
        role: 'radio',
        class: 'exq-fill-seg-btn',
        'data-exq-fill-mode': 'filled',
        title: t.swapStrokeFillTitle,
      },
      svgIcon('fillSolid', 13, '0 0 24 24', 1.6),
      el('span', null, t.fillToggleFilled),
    );

    outlineBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFillOrSwapColorsWithApi(runtime.api, {
        lang: runtime.prefs.lang,
        showToast,
        defaultPenColor: getCurrentPenColor(),
        targetMode: 'outline',
      });
      syncStylesPanelColorSwap();
      scheduleSync();
    });
    filledBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFillOrSwapColorsWithApi(runtime.api, {
        lang: runtime.prefs.lang,
        showToast,
        defaultPenColor: getCurrentPenColor(),
        targetMode: 'filled',
      });
      syncStylesPanelColorSwap();
      scheduleSync();
    });

    const wrap = el(
      'div',
      {
        class: 'exq-fill-segment',
        'data-exq-fill-segment': '1',
        role: 'radiogroup',
        'aria-label': t.swapStrokeFillTitle,
      },
      outlineBtn,
      filledBtn,
    );
    targetParent.insertBefore(wrap, targetParent.firstChild);
    mounted = { lang: runtime.prefs.lang, wrap, outlineBtn, filledBtn };
    fillSegmentMounts.set(panelRoot, mounted);
  }

  mounted.outlineBtn.classList.toggle('exq-active', !isFilledOnly);
  mounted.outlineBtn.setAttribute('aria-checked', String(!isFilledOnly));
  mounted.filledBtn.classList.toggle('exq-active', isFilledOnly);
  mounted.filledBtn.setAttribute('aria-checked', String(isFilledOnly));
  return true;
}

export function syncStylesPanelColorSwap(root: ParentNode = document): boolean {
  let updated = false;
  const slimContainer = root.querySelector('.App-menu_top__left .compact-shape-actions, .compact-shape-actions-island .compact-shape-actions');
  if (slimContainer) {
    updated = syncCompactFillToggle(slimContainer, false) || updated;
  }

  const mobileContainer = root.querySelector('.mobile-shape-actions > div:first-child');
  if (mobileContainer) {
    updated = syncCompactFillToggle(mobileContainer, true) || updated;
  }

  const expandedPanel = root.querySelector(
    '.selected-shape-actions-container:not(.selected-shape-actions-container--compact) .App-menu__left, .selected-shape-actions-container:not(.selected-shape-actions-container--compact) .selected-shape-actions, .App-menu__left',
  );
  if (expandedPanel && !expandedPanel.closest('.compact-shape-actions-island') && !expandedPanel.closest('.exq-redact-full-island')) {
    updated = syncExpandedFillSegment(expandedPanel) || updated;
  }

  return updated;
}

/* ================= Blur / Redact Drag Controller (Item 5) ================= */
export function installRedactDragController(): () => void {
  let dragState: {
    pointerId: number;
    startX: number;
    startY: number;
    curX: number;
    curY: number;
    shiftKey: boolean;
    canvas: HTMLCanvasElement;
    boxEl: HTMLElement;
  } | null = null;
  let spaceHeld = false;

  const computeViewportBox = (s: NonNullable<typeof dragState>) => {
    let dx = s.curX - s.startX;
    let dy = s.curY - s.startY;
    if (s.shiftKey) {
      const size = Math.max(Math.abs(dx), Math.abs(dy));
      dx = dx >= 0 ? size : -size;
      dy = dy >= 0 ? size : -size;
    }
    const left = Math.min(s.startX, s.startX + dx);
    const top = Math.min(s.startY, s.startY + dy);
    const width = Math.abs(dx);
    const height = Math.abs(dy);
    return { left, top, width, height };
  };

  const clearDrag = () => {
    if (!dragState) return;
    dragState.boxEl.remove();
    dragState = null;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' && !isEditableFocused()) {
      spaceHeld = true;
    }
    if (e.key === 'Escape' && dragState) {
      clearDrag();
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      spaceHeld = false;
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!runtime.api || runtime.isBusy || spaceHeld) return;
    if (e.button !== 0 || e.altKey) return;
    if (!isRedactToolActive()) return;
    if (!(e.target instanceof HTMLCanvasElement) || !e.target.matches('canvas.interactive')) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const host = e.target.closest('.excalidraw') || document.body;
    const boxEl = el('div', { class: 'exq-redact-rubberband', 'data-exq-redact-rubberband': '1' });
    host.append(boxEl);

    dragState = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      curX: e.clientX,
      curY: e.clientY,
      shiftKey: e.shiftKey,
      canvas: e.target,
      boxEl,
    };

    silently(() => e.target instanceof Element && e.target.setPointerCapture?.(e.pointerId));
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    dragState.curX = e.clientX;
    dragState.curY = e.clientY;
    dragState.shiftKey = e.shiftKey;

    const { left, top, width, height } = computeViewportBox(dragState);
    const hostRect = (dragState.boxEl.parentElement || document.body).getBoundingClientRect();
    dragState.boxEl.style.left = `${Math.round(left - hostRect.left)}px`;
    dragState.boxEl.style.top = `${Math.round(top - hostRect.top)}px`;
    dragState.boxEl.style.width = `${Math.round(width)}px`;
    dragState.boxEl.style.height = `${Math.round(height)}px`;
  };

  const onPointerUp = async (e: PointerEvent) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    dragState.curX = e.clientX;
    dragState.curY = e.clientY;
    dragState.shiftKey = e.shiftKey;
    const { left, top, width, height } = computeViewportBox(dragState);
    const canvas = dragState.canvas;
    clearDrag();

    if (width < 6 || height < 6 || !runtime.api) return;

    const appState = runtime.api.getAppState();
    const zoom = appState.zoom?.value || 1;
    const canvasRect = canvas.getBoundingClientRect();
    const sceneX = (left - canvasRect.left) / zoom - (appState.scrollX || 0);
    const sceneY = (top - canvasRect.top) / zoom - (appState.scrollY || 0);
    const sceneW = width / zoom;
    const sceneH = height / zoom;
    const wasLocked = Boolean(appState.activeTool?.locked);

    runtime.isBusy = true;
    try {
      await createOrUpdateRedactElement({
        api: runtime.api,
        rect: { x: sceneX, y: sceneY, width: sceneW, height: sceneH },
        mode: runtime.prefs.redactOpts.mode,
        strength: runtime.prefs.redactOpts.strength,
        selectResult: true,
      });
      if (!wasLocked) {
        runtime.api.setActiveTool({ type: 'selection' });
      }
      scheduleSync();
    } finally {
      runtime.isBusy = false;
    }
  };

  const onPointerCancel = (e: PointerEvent) => {
    if (dragState && e.pointerId === dragState.pointerId) {
      clearDrag();
    }
  };

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerCancel, true);

  return () => {
    clearDrag();
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', onPointerCancel, true);
  };
}

/* ================= Sync Loop & Boot ================= */
export function syncUI(): void {
  syncToolbar();
  syncMobileToolbar();
  syncMobileShapeActions();
  syncStylesPanelColorSwap();
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
  const cleanupCtrlMultiSelect = installCtrlMultiSelectGuard();
  const cleanupFastLoadSave = installFastLoadSaveInterceptor();
  const cleanupPrimaryToolGuard = installPrimaryToolRestoreGuard();
  const cleanupRedactDrag = installRedactDragController();

  const onDocClick = (e: MouseEvent) => {
    closeFloatingPopovers(e.target instanceof Node ? e.target : null);
  };
  const onDocKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeFloatingPopovers(null);
      return;
    }
    if (
      e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      e.key.toLowerCase() === 'x' &&
      !isEditableFocused()
    ) {
      const { eligible } = getActiveStrokeFillState(runtime.api);
      if (eligible) {
        e.preventDefault();
        toggleFillOrSwapColorsWithApi(runtime.api, {
          lang: runtime.prefs.lang,
          showToast,
          defaultPenColor: getCurrentPenColor(),
          targetMode: 'toggle',
        });
        scheduleSync();
      }
    }
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
      attributeFilter: ['class', 'disabled'],
    });
  }

  return () => {
    cleanupTextGuard();
    cleanupCtrlMultiSelect();
    cleanupFastLoadSave();
    cleanupPrimaryToolGuard();
    cleanupRedactDrag();
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
