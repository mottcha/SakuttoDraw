/**
 * Single Source of Truth for inline SVG icons shared across both
 * imperative DOM injection (`quickAnnotator/dom.ts`) and React (`components/Icon.tsx`).
 */

export type SvgShapeDef = readonly [tag: string, attrs: Readonly<Record<string, string | number>>];

export interface IconEntry {
  readonly viewBox?: string;
  readonly shapes: readonly SvgShapeDef[];
}

export const ICON_DEFS = {
  rectangle: {
    shapes: [['rect', { x: 4, y: 4, width: 16, height: 16, rx: 2.5 }]],
  },
  ellipse: {
    shapes: [['circle', { cx: 12, cy: 12, r: 8.5 }]],
  },
  text: {
    shapes: [
      ['polyline', { points: '4 7 4 4 20 4 20 7' }],
      ['line', { x1: 9, y1: 20, x2: 15, y2: 20 }],
      ['line', { x1: 12, y1: 4, x2: 12, y2: 20 }],
    ],
  },
  dotsH: {
    shapes: [
      ['circle', { cx: 5, cy: 12, r: 1.5, fill: 'currentColor', stroke: 'none' }],
      ['circle', { cx: 12, cy: 12, r: 1.5, fill: 'currentColor', stroke: 'none' }],
      ['circle', { cx: 19, cy: 12, r: 1.5, fill: 'currentColor', stroke: 'none' }],
    ],
  },
  caretUp: {
    viewBox: '0 0 12 12',
    shapes: [['path', { d: 'm3 7.5 3-3 3 3' }]],
  },
  caret: {
    viewBox: '0 0 12 12',
    shapes: [['path', { d: 'm3 4.5 3 3 3-3' }]],
  },
  arrow: {
    shapes: [
      ['line', { x1: 5, y1: 12, x2: 19, y2: 12 }],
      ['polyline', { points: '13 6 19 12 13 18' }],
    ],
  },
  line: {
    shapes: [['line', { x1: 5, y1: 19, x2: 19, y2: 5 }]],
  },
  diamond: {
    shapes: [['path', { d: 'M12 3.5 20.5 12 12 20.5 3.5 12 12 3.5Z' }]],
  },
  redact: {
    shapes: [['rect', { x: 4, y: 5, width: 16, height: 14, rx: 2.5, fill: 'currentColor' }]],
  },
  fillBucket: {
    shapes: [
      ['path', { d: 'm19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z' }],
      ['path', { d: 'm5 2 5 5' }],
      ['path', { d: 'M2 13h15' }],
      ['path', { d: 'M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z' }],
    ],
  },
  fillBucketSolid: {
    shapes: [
      [
        'path',
        {
          d: 'M2.2 13H17l-6.6 6.6c-.8.8-2 .8-2.8 0L2.4 14.4c-.3-.4-.3-.9-.2-1.4Z',
          fill: 'currentColor',
          'fill-opacity': 0.32,
          stroke: 'none',
        },
      ],
      ['path', { d: 'm19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z' }],
      ['path', { d: 'm5 2 5 5' }],
      ['path', { d: 'M2 13h15' }],
      ['path', { d: 'M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z', fill: 'currentColor' }],
    ],
  },
  eraser: {
    shapes: [
      ['path', { d: 'm7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21' }],
      ['path', { d: 'M22 21H7' }],
      ['path', { d: 'm5 11 9 9' }],
    ],
  },
  lock: {
    shapes: [
      ['rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }],
      ['path', { d: 'M8 11V7a4 4 0 0 1 8 0v4' }],
    ],
  },
  sticky: {
    shapes: [
      ['path', { d: 'M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z' }],
      ['path', { d: 'M15 3v4a2 2 0 0 0 2 2h4' }],
    ],
  },
  lasso: {
    shapes: [
      ['path', { d: 'M7 22a5 5 0 0 1-2-4' }],
      ['path', { d: 'M3.3 14A6.8 6.8 0 0 1 2 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 0 1-5-1' }],
      ['path', { d: 'M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z' }],
    ],
  },
  imgSave: {
    shapes: [
      ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
      ['circle', { cx: 9, cy: 9, r: 2 }],
      ['path', { d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' }],
    ],
  },
  sliders: {
    shapes: [
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
  },
  drawAssist: {
    shapes: [
      ['path', { d: 'M12 20h9' }],
      ['path', { d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z' }],
    ],
  },
  copy: {
    shapes: [
      ['rect', { x: 9, y: 9, width: 13, height: 13, rx: 2 }],
      ['path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }],
    ],
  },
  check: {
    shapes: [['polyline', { points: '20 6 9 17 4 12' }]],
  },
  download: {
    shapes: [
      ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
      ['polyline', { points: '7 10 12 15 17 10' }],
      ['line', { x1: 12, y1: 15, x2: 12, y2: 3 }],
    ],
  },
  reset: {
    shapes: [
      ['path', { d: 'M3 6h18' }],
      ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }],
      ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }],
    ],
  },
  cut: {
    shapes: [
      ['circle', { cx: 6, cy: 6, r: 3 }],
      ['circle', { cx: 6, cy: 18, r: 3 }],
      ['line', { x1: 20, y1: 4, x2: 8.12, y2: 15.88 }],
      ['line', { x1: 14.47, y1: 14.48, x2: 20, y2: 20 }],
      ['line', { x1: 8.12, y1: 8.12, x2: 12, y2: 12 }],
    ],
  },
  paste: {
    shapes: [
      ['rect', { x: 8, y: 2, width: 8, height: 4, rx: 1 }],
      ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }],
    ],
  },
  dup: {
    shapes: [
      ['rect', { x: 8, y: 8, width: 13, height: 13, rx: 2 }],
      ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
      ['line', { x1: 14.5, y1: 11.5, x2: 14.5, y2: 17.5 }],
      ['line', { x1: 11.5, y1: 14.5, x2: 17.5, y2: 14.5 }],
    ],
  },
  toBack: {
    shapes: [
      ['line', { x1: 5, y1: 19, x2: 19, y2: 19 }],
      ['polyline', { points: '8 11 12 15 16 11' }],
      ['line', { x1: 12, y1: 4, x2: 12, y2: 15 }],
    ],
  },
  backward: {
    shapes: [
      ['polyline', { points: '8 13 12 17 16 13' }],
      ['line', { x1: 12, y1: 6, x2: 12, y2: 17 }],
    ],
  },
  forward: {
    shapes: [
      ['polyline', { points: '8 11 12 7 16 11' }],
      ['line', { x1: 12, y1: 18, x2: 12, y2: 7 }],
    ],
  },
  toFront: {
    shapes: [
      ['line', { x1: 5, y1: 5, x2: 19, y2: 5 }],
      ['polyline', { points: '8 13 12 9 16 13' }],
      ['line', { x1: 12, y1: 20, x2: 12, y2: 9 }],
    ],
  },
  crop: {
    shapes: [
      ['path', { d: 'M6 2v14a2 2 0 0 0 2 2h14' }],
      ['path', { d: 'M18 22V8a2 2 0 0 0-2-2H2' }],
    ],
  },
  flipH: {
    shapes: [
      ['line', { x1: 12, y1: 3, x2: 12, y2: 21, 'stroke-dasharray': '2.5 2.5' }],
      ['polygon', { points: '8 7 3 12 8 17 8 7' }],
      ['polygon', { points: '16 7 21 12 16 17 16 7', fill: 'currentColor', 'fill-opacity': '0.18' }],
    ],
  },
  flipV: {
    shapes: [
      ['line', { x1: 3, y1: 12, x2: 21, y2: 12, 'stroke-dasharray': '2.5 2.5' }],
      ['polygon', { points: '7 8 12 3 17 8 7 8' }],
      ['polygon', { points: '7 16 12 21 17 16 7 16', fill: 'currentColor', 'fill-opacity': '0.18' }],
    ],
  },
  link: {
    shapes: [
      ['path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }],
      ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }],
    ],
  },
  copyLink: {
    shapes: [
      ['path', { d: 'M10 13a5 5 0 0 0 7.54.54l2-2' }],
      ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1-1' }],
      ['rect', { x: 14, y: 14, width: 7, height: 7, rx: 1.5 }],
    ],
  },
  unlock: {
    shapes: [
      ['rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }],
      ['path', { d: 'M8 11V7a4 4 0 0 1 7.6-1.7' }],
    ],
  },
  selectAll: {
    shapes: [
      ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2, 'stroke-dasharray': '3 2.5' }],
      ['rect', { x: 8, y: 8, width: 8, height: 8, rx: 1, fill: 'currentColor', 'fill-opacity': '0.18' }],
    ],
  },
  group: {
    shapes: [
      ['rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }],
      ['rect', { x: 14, y: 14, width: 7, height: 7, rx: 1 }],
      ['path', { d: 'M10 6.5h4.5a3 3 0 0 1 3 3V14' }],
      ['path', { d: 'M14 17.5H9.5a3 3 0 0 1-3-3V10' }],
    ],
  },
  ungroup: {
    shapes: [
      ['rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }],
      ['rect', { x: 14, y: 14, width: 7, height: 7, rx: 1 }],
      ['line', { x1: 14, y1: 6, x2: 20, y2: 6, 'stroke-dasharray': '2 2' }],
      ['line', { x1: 4, y1: 18, x2: 10, y2: 18, 'stroke-dasharray': '2 2' }],
    ],
  },
  wrap: {
    shapes: [
      ['line', { x1: 3, y1: 6, x2: 21, y2: 6 }],
      ['path', { d: 'M3 12h15a3 3 0 1 1 0 6h-4' }],
      ['polyline', { points: '16 16 14 18 16 20' }],
      ['line', { x1: 3, y1: 18, x2: 10, y2: 18 }],
    ],
  },
  wrapContainer: {
    shapes: [
      ['rect', { x: 3, y: 4, width: 18, height: 16, rx: 2.5 }],
      ['line', { x1: 7.5, y1: 9.5, x2: 16.5, y2: 9.5 }],
      ['line', { x1: 7.5, y1: 14.5, x2: 13.5, y2: 14.5 }],
    ],
  },
  editLine: {
    shapes: [
      ['circle', { cx: 5, cy: 19, r: 2.5 }],
      ['circle', { cx: 19, cy: 5, r: 2.5 }],
      ['line', { x1: 7, y1: 17, x2: 17, y2: 7 }],
    ],
  },
  frame: {
    shapes: [
      ['line', { x1: 22, y1: 6, x2: 2, y2: 6 }],
      ['line', { x1: 22, y1: 18, x2: 2, y2: 18 }],
      ['line', { x1: 6, y1: 2, x2: 6, y2: 22 }],
      ['line', { x1: 18, y1: 2, x2: 18, y2: 22 }],
    ],
  },
  frameRemove: {
    shapes: [
      ['rect', { x: 3, y: 3, width: 14, height: 14, rx: 2, 'stroke-dasharray': '3 2' }],
      ['path', { d: 'M13 13l8 8' }],
      ['path', { d: 'M21 15v6h-6' }],
    ],
  },
  close: {
    shapes: [
      ['line', { x1: 18, y1: 6, x2: 6, y2: 18 }],
      ['line', { x1: 6, y1: 6, x2: 18, y2: 18 }],
    ],
  },
  overlap: {
    viewBox: '0 0 20 20',
    shapes: [
      ['rect', { x: 2.5, y: 2.5, width: 9.5, height: 9.5, rx: 1.5, 'stroke-dasharray': '2.5 2' }],
      ['rect', { x: 7.5, y: 7.5, width: 9.5, height: 9.5, rx: 2, fill: 'currentColor', 'fill-opacity': 0.18 }],
    ],
  },
  contain: {
    viewBox: '0 0 20 20',
    shapes: [
      ['rect', { x: 2, y: 2, width: 16, height: 16, rx: 2, 'stroke-dasharray': '2.5 2' }],
      ['rect', { x: 6, y: 6, width: 8, height: 8, rx: 1.5, fill: 'currentColor', 'fill-opacity': 0.22 }],
    ],
  },
  pan: {
    shapes: [
      ['polyline', { points: '5 9 2 12 5 15' }],
      ['polyline', { points: '9 5 12 2 15 5' }],
      ['polyline', { points: '15 19 12 22 9 19' }],
      ['polyline', { points: '19 9 22 12 19 15' }],
      ['line', { x1: 2, y1: 12, x2: 22, y2: 12 }],
      ['line', { x1: 12, y1: 2, x2: 12, y2: 22 }],
    ],
  },
  zoom: {
    shapes: [
      ['circle', { cx: 11, cy: 11, r: 7 }],
      ['line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }],
      ['line', { x1: 11, y1: 8, x2: 11, y2: 14 }],
      ['line', { x1: 8, y1: 11, x2: 14, y2: 11 }],
    ],
  },
  zen: {
    shapes: [
      ['path', { d: 'M8 3H5a2 2 0 0 0-2 2v3' }],
      ['path', { d: 'M21 8V5a2 2 0 0 0-2-2h-3' }],
      ['path', { d: 'M3 16v3a2 2 0 0 0 2 2h3' }],
      ['path', { d: 'M16 21h3a2 2 0 0 0 2-2v-3' }],
    ],
  },
  view: {
    shapes: [
      ['path', { d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z' }],
      ['circle', { cx: 12, cy: 12, r: 3 }],
    ],
  },
  kanjiJp: {
    shapes: [
      ['line', { x1: 6, y1: 5.2, x2: 18.5, y2: 5.2 }],
      ['line', { x1: 12.5, y1: 2.8, x2: 12.5, y2: 8.2 }],
      ['rect', { x: 9.5, y: 8.2, width: 8.2, height: 8.5, rx: 0.8 }],
      ['line', { x1: 9.8, y1: 11.2, x2: 17.4, y2: 11.2 }],
      ['line', { x1: 9.8, y1: 14, x2: 17.4, y2: 14 }],
      ['path', { d: 'M5.5 9.2 V20.2 H19.5', 'stroke-width': 2.1 }],
    ],
  },
  kanjiZh: {
    shapes: [
      ['line', { x1: 5.5, y1: 5.2, x2: 18.5, y2: 5.2 }],
      ['line', { x1: 12, y1: 2.8, x2: 12, y2: 8.2 }],
      ['rect', { x: 7, y: 8.2, width: 10, height: 11.8, rx: 0.8 }],
      ['line', { x1: 7.2, y1: 11.2, x2: 16.8, y2: 11.2 }],
      ['line', { x1: 7.2, y1: 14.2, x2: 16.8, y2: 14.2 }],
      ['line', { x1: 7.2, y1: 17.1, x2: 16.8, y2: 17.1 }],
      ['line', { x1: 4, y1: 20.2, x2: 20, y2: 20.2, 'stroke-width': 2.1 }],
    ],
  },
  autoResetOnOpen: {
    shapes: [
      ['path', { d: 'M3 12a9 9 0 1 0 3-6.7L3 8' }],
      ['path', { d: 'M3 3v5h5' }],
    ],
  },
  textAutoResize: {
    shapes: [
      ['path', { d: 'M4 17L8.5 6L13 17' }],
      ['path', { d: 'M5.5 13.5h6' }],
      ['path', { d: 'M15 12h6' }],
      ['polyline', { points: '18.5 9.5 21 12 18.5 14.5' }],
    ],
  },
  fastLoadSave: {
    shapes: [['polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' }]],
  },
  modernContextMenu: {
    shapes: [
      ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 3 }],
      ['line', { x1: 7, y1: 8.5, x2: 17, y2: 8.5 }],
      ['line', { x1: 7, y1: 12.5, x2: 14, y2: 12.5 }],
      ['line', { x1: 7, y1: 16.5, x2: 12, y2: 16.5 }],
    ],
  },
  penColor: {
    shapes: [
      ['path', { d: 'M12 19l7-7 3 3-7 7-3-3z' }],
      ['path', { d: 'M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z' }],
    ],
  },
  canvasBackground: {
    shapes: [
      ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 3 }],
      ['path', { d: 'M3 15l5-5 4 4 3-3 6 6' }],
    ],
  },
  fontSettings: {
    shapes: [
      ['path', { d: 'M3.5 19 7.8 5.5 12.1 19' }],
      ['path', { d: 'M4.9 14.5h5.8' }],
      ['circle', { cx: 17.5, cy: 15.5, r: 3.2 }],
      ['path', { d: 'M20.7 12.3v6.4' }],
    ],
  },
  code: {
    shapes: [
      ['polyline', { points: '16 18 22 12 16 6' }],
      ['polyline', { points: '8 6 2 12 8 18' }],
    ],
  },
  info: {
    shapes: [
      ['circle', { cx: 12, cy: 12, r: 10 }],
      ['line', { x1: 12, y1: 16, x2: 12, y2: 12 }],
      ['line', { x1: 12, y1: 8, x2: 12.01, y2: 8 }],
    ],
  },
} as const satisfies Record<string, IconEntry>;

export type IconName = keyof typeof ICON_DEFS;
