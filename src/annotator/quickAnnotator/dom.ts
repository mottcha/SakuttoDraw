// DOM element builder, inline SVG icon set, and native toolbar icon cloning.

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
    ['rect', { x: 4, y: 5, width: 16, height: 14, rx: 2.5, fill: 'currentColor' }],
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

export function el<K extends keyof HTMLElementTagNameMap>(
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

export function svgIcon(name: string, size = 16, viewBox = '0 0 24 24', strokeWidth = 2): SVGSVGElement {
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
