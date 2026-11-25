// Fill toggle and stroke/fill color swap in the styles panel.
import { CaptureUpdateAction } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppLang } from '../../types/annotator';
import { getMessages } from '../../i18n/messages';
import { DEFAULT_PEN_COLOR } from '../../services/storageBridge';
import { isRedactElement } from '../redactProcessor';
import { el, svgIcon } from './dom';
import { runtime, scheduleSync, showToast } from './runtime';
import { getCurrentPenColor } from './mainMenu';

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
