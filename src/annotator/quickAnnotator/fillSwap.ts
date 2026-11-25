// Fill toggle and stroke/fill color swap in the styles panel.
import { CaptureUpdateAction } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppLang } from '../../types/annotator';
import { EXCALIDRAW_SELECTORS } from '../../excalidraw/domContract';
import { getMessages } from '../../i18n/messages';
import { DEFAULT_PEN_COLOR } from '../../services/storageBridge';
import { nextElementNonce } from '../../utils/common';
import { isRedactElement } from '../redactProcessor';
import { getCurrentPenColor } from './actions';
import { el, svgIcon } from './dom';
import { runtime, scheduleSync, showToast } from './runtime';

/* ================= Stroke <-> Background Fill Toggle (Item 6) ================= */
const FILLABLE_ELEMENT_TYPES = new Set(['rectangle', 'ellipse', 'diamond', 'line', 'freedraw']);
const FILLABLE_SHAPE_TOOLS = new Set(['rectangle', 'ellipse', 'diamond']);
type ElementFillStyle = 'hachure' | 'cross-hatch' | 'solid' | 'zigzag';

interface TempFillSnapshot {
  strokeColor: string;
  backgroundColor: string;
  fillStyle: ElementFillStyle;
}

let tempFillSnapshot: TempFillSnapshot | null = null;

export function clearTempFillSnapshot(): void {
  tempFillSnapshot = null;
}

export function restoreTempFillIfToolChanged(
  api: ExcalidrawImperativeAPI | null,
  appState?: { activeTool?: { type?: string } },
): boolean {
  if (!api || !tempFillSnapshot) return false;
  const activeType = appState?.activeTool?.type ?? api.getAppState()?.activeTool?.type;
  if (activeType && FILLABLE_SHAPE_TOOLS.has(activeType)) {
    return false;
  }
  const snap = tempFillSnapshot;
  tempFillSnapshot = null;
  api.updateScene({
    appState: {
      currentItemStrokeColor: snap.strokeColor,
      currentItemBackgroundColor: snap.backgroundColor,
      currentItemFillStyle: snap.fillStyle,
    },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  return true;
}

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
  const eligibleTool = Boolean(activeType && FILLABLE_SHAPE_TOOLS.has(activeType));
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

    let updatedAny = false;
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
      updatedAny = true;
      return {
        ...elItem,
        strokeColor: swapped.strokeColor,
        backgroundColor: swapped.backgroundColor,
        fillStyle: swapped.fillStyle,
        version: elItem.version + 1,
        versionNonce: nextElementNonce(),
        updated: now,
      };
    });

    if (!updatedAny) return false;

    api.updateScene({
      elements: nextElements,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    toastFn?.(getMessages(lang).toastColorSwapped);
    return true;
  }

  const activeType = appState.activeTool?.type;
  if (!activeType || !FILLABLE_SHAPE_TOOLS.has(activeType)) {
    return false;
  }

  const curStroke = appState.currentItemStrokeColor || defaultPenColor;
  const curBg = appState.currentItemBackgroundColor || 'transparent';
  const curFill = (appState.currentItemFillStyle || 'hachure') as ElementFillStyle;

  const nextStyle = computeSwappedStrokeFill({
    strokeColor: curStroke,
    backgroundColor: curBg,
    fillStyle: curFill,
    fallbackStrokeColor: defaultPenColor,
    targetMode,
  });

  const enteringFilled = nextStyle.strokeColor === 'transparent' && nextStyle.backgroundColor !== 'transparent';
  let resolvedFillStyle = nextStyle.fillStyle;
  if (enteringFilled) {
    if (!tempFillSnapshot) {
      tempFillSnapshot = { strokeColor: curStroke, backgroundColor: curBg, fillStyle: curFill };
    }
  } else if (tempFillSnapshot) {
    resolvedFillStyle = tempFillSnapshot.fillStyle;
    tempFillSnapshot = null;
  }

  api.updateScene({
    appState: {
      currentItemStrokeColor: nextStyle.strokeColor,
      currentItemBackgroundColor: nextStyle.backgroundColor,
      currentItemFillStyle: resolvedFillStyle,
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
  const strokeTrigger = container.querySelector(EXCALIDRAW_SELECTORS.strokePopupTrigger);
  const bgTrigger = container.querySelector(EXCALIDRAW_SELECTORS.bgPopupTrigger);
  const existing = fillToggleMounts.get(container);
  const { isFilledOnly, eligible } = getActiveStrokeFillState(runtime.api);

  if (!strokeTrigger || !bgTrigger || !eligible) {
    if (existing) {
      existing.wrap.remove();
      fillToggleMounts.delete(container);
    }
    return false;
  }

  const t = getMessages(runtime.prefs.lang);

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
    const bgItem = bgTrigger.closest(EXCALIDRAW_SELECTORS.compactActionItem);
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

export function syncStylesPanelColorSwap(root: ParentNode = document): boolean {
  restoreTempFillIfToolChanged(runtime.api);
  root.querySelectorAll('[data-exq-fill-segment="1"]').forEach((node) => node.remove());

  let updated = false;
  const slimContainer = root.querySelector(EXCALIDRAW_SELECTORS.slimStyleActions);
  if (slimContainer) {
    updated = syncCompactFillToggle(slimContainer, false) || updated;
  }

  const mobileContainer = root.querySelector(EXCALIDRAW_SELECTORS.mobileStyleActionsLeft);
  if (mobileContainer) {
    updated = syncCompactFillToggle(mobileContainer, true) || updated;
  }

  return updated;
}
