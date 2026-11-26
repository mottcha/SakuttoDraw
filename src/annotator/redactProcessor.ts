import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
} from '@excalidraw/excalidraw';
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from '@excalidraw/excalidraw/element/types';
import { DEFAULT_PEN_COLOR, DEFAULT_REDACT_COLOR } from '../services/storageBridge';
import { nextElementNonce, normalizeHexColor } from '../utils/common';

interface SakuttoRedactMeta {
  v: 1;
  color: string;
}

interface RedactRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const REDACT_BLACKOUT_COLOR = DEFAULT_REDACT_COLOR;

export function isRedactElement(el: ExcalidrawElement | null | undefined): boolean {
  if (!el || el.isDeleted) return false;
  const meta = (el as { customData?: { sakuttoRedact?: unknown } }).customData?.sakuttoRedact;
  return Boolean(meta && typeof meta === 'object');
}

export function getRedactMeta(el: ExcalidrawElement | null | undefined): SakuttoRedactMeta | null {
  if (!el) return null;
  const meta = (
    el as { customData?: { sakuttoRedact?: { v?: number; color?: unknown } } }
  ).customData?.sakuttoRedact;
  if (!meta || typeof meta !== 'object') return null;
  const liveBg =
    typeof el.backgroundColor === 'string' &&
    el.backgroundColor.trim() !== '' &&
    el.backgroundColor.trim().toLowerCase() !== 'transparent'
      ? el.backgroundColor
      : undefined;
  const color = normalizeHexColor(
    liveBg ?? meta.color,
    REDACT_BLACKOUT_COLOR,
  );
  return { v: 1, color };
}

function buildBlackoutElement(rect: RedactRect, color: string): OrderedExcalidrawElement {
  const resolvedColor = normalizeHexColor(color, REDACT_BLACKOUT_COLOR);
  const [created] = convertToExcalidrawElements([
    {
      type: 'rectangle',
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      strokeColor: 'transparent',
      backgroundColor: resolvedColor,
      fillStyle: 'solid',
      strokeWidth: 1,
      roughness: 0,
      opacity: 100,
      roundness: null,
      customData: {
        sakuttoRedact: { v: 1, color: resolvedColor } satisfies SakuttoRedactMeta,
      },
    },
  ]);
  return { ...created, index: null } as unknown as OrderedExcalidrawElement;
}

export function createOrUpdateRedactElement({
  api,
  rect,
  color = REDACT_BLACKOUT_COLOR,
  selectResult = true,
}: {
  api: ExcalidrawImperativeAPI | null;
  rect: RedactRect;
  color?: string;
  selectResult?: boolean;
}): ExcalidrawElement | null {
  if (!api) return null;
  const resolvedColor = normalizeHexColor(color, REDACT_BLACKOUT_COLOR);
  const safeRect: RedactRect = {
    x: rect.x,
    y: rect.y,
    width: Math.max(4, rect.width),
    height: Math.max(4, rect.height),
  };

  const existingElements =
    typeof api.getSceneElementsIncludingDeleted === 'function'
      ? api.getSceneElementsIncludingDeleted()
      : api.getSceneElements();
  const nextEl = buildBlackoutElement(safeRect, resolvedColor);
  const allElements: OrderedExcalidrawElement[] = [...existingElements, nextEl];

  api.updateScene({
    elements: allElements,
    ...(selectResult ? { appState: { selectedElementIds: { [nextEl.id]: true as const } } } : {}),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  return nextEl;
}

export function updateRedactElementsColor({
  api,
  elementIds,
  color,
}: {
  api: ExcalidrawImperativeAPI | null;
  elementIds: readonly string[];
  color: string;
}): boolean {
  if (!api || elementIds.length === 0) return false;
  const idSet = new Set(elementIds);
  const resolvedColor = normalizeHexColor(color, REDACT_BLACKOUT_COLOR);
  const nextMeta: SakuttoRedactMeta = { v: 1, color: resolvedColor };
  const now = Date.now();
  let updatedAny = false;

  const baseElements =
    typeof api.getSceneElementsIncludingDeleted === 'function'
      ? api.getSceneElementsIncludingDeleted()
      : api.getSceneElements();
  const nextElements = baseElements.map((el) => {
    if (el.isDeleted || !idSet.has(el.id) || el.type !== 'rectangle') return el;
    updatedAny = true;
    return {
      ...el,
      strokeColor: 'transparent',
      backgroundColor: resolvedColor,
      fillStyle: 'solid',
      roughness: 0,
      roundness: null,
      version: el.version + 1,
      versionNonce: nextElementNonce(),
      updated: now,
      customData: { ...el.customData, sakuttoRedact: nextMeta },
    };
  });

  if (!updatedAny) return false;
  api.updateScene({
    elements: nextElements as OrderedExcalidrawElement[],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return true;
}

interface NonRedactStyleSnapshot {
  currentItemBackgroundColor: string;
  currentItemStrokeColor: string;
  currentItemFillStyle: ExcalidrawElement['fillStyle'];
  currentItemStrokeWidthKey: AppState['currentItemStrokeWidthKey'];
  currentItemStrokeStyle: ExcalidrawElement['strokeStyle'];
  currentItemRoughness: number;
  currentItemOpacity: number;
  currentItemRoundness: AppState['currentItemRoundness'];
}

let lastNonRedactStyles: NonRedactStyleSnapshot | null = null;
let frozenNonRedactStyles: NonRedactStyleSnapshot | null = null;

export function clearRedactStyleIsolationState(): void {
  lastNonRedactStyles = null;
  frozenNonRedactStyles = null;
}

export function updateRedactStyleIsolationPenColor(penColor: string): void {
  const normalized = normalizeHexColor(penColor, DEFAULT_PEN_COLOR);
  if (lastNonRedactStyles) {
    lastNonRedactStyles = { ...lastNonRedactStyles, currentItemStrokeColor: normalized };
  }
  if (frozenNonRedactStyles) {
    frozenNonRedactStyles = { ...frozenNonRedactStyles, currentItemStrokeColor: normalized };
  }
}

function extractStyles(appState: Partial<AppState>): NonRedactStyleSnapshot {
  return {
    currentItemBackgroundColor: appState.currentItemBackgroundColor ?? 'transparent',
    currentItemStrokeColor: appState.currentItemStrokeColor ?? DEFAULT_PEN_COLOR,
    currentItemFillStyle: appState.currentItemFillStyle ?? 'hachure',
    currentItemStrokeWidthKey: appState.currentItemStrokeWidthKey ?? 'medium',
    currentItemStrokeStyle: appState.currentItemStrokeStyle ?? 'solid',
    currentItemRoughness: typeof appState.currentItemRoughness === 'number' ? appState.currentItemRoughness : 1,
    currentItemOpacity: typeof appState.currentItemOpacity === 'number' ? appState.currentItemOpacity : 100,
    currentItemRoundness: appState.currentItemRoundness ?? 'round',
  };
}

function stylesDiffer(a: NonRedactStyleSnapshot, b: NonRedactStyleSnapshot): boolean {
  return (
    a.currentItemBackgroundColor !== b.currentItemBackgroundColor ||
    a.currentItemStrokeColor !== b.currentItemStrokeColor ||
    a.currentItemFillStyle !== b.currentItemFillStyle ||
    a.currentItemStrokeWidthKey !== b.currentItemStrokeWidthKey ||
    a.currentItemStrokeStyle !== b.currentItemStrokeStyle ||
    a.currentItemRoughness !== b.currentItemRoughness ||
    a.currentItemOpacity !== b.currentItemOpacity ||
    a.currentItemRoundness !== b.currentItemRoundness
  );
}

/**
 * Prevents style changes on selected blackout rectangles (such as background color,
 * opacity, or corner roundness) from leaking into Excalidraw's global defaults
 * for subsequent shapes, pen strokes, or text.
 */
export function syncRedactStyleIsolation(
  api: ExcalidrawImperativeAPI | null,
  appState: Partial<AppState>,
  isRedactSelectionOnly: boolean,
): boolean {
  if (isRedactSelectionOnly) {
    if (!frozenNonRedactStyles) {
      frozenNonRedactStyles = lastNonRedactStyles
        ? { ...lastNonRedactStyles }
        : extractStyles(appState);
    }
    const current = extractStyles(appState);
    if (api && stylesDiffer(current, frozenNonRedactStyles)) {
      api.updateScene({
        appState: { ...frozenNonRedactStyles },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      return true;
    }
    return false;
  }

  if (frozenNonRedactStyles) {
    const snap = frozenNonRedactStyles;
    frozenNonRedactStyles = null;
    lastNonRedactStyles = { ...snap };
    if (api && stylesDiffer(extractStyles(appState), snap)) {
      api.updateScene({
        appState: { ...snap },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      return true;
    }
    return false;
  }

  lastNonRedactStyles = extractStyles(appState);
  return false;
}
