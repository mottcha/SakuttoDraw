// Desktop / mobile toolbar shape-group widgets and mobile shape actions.
import type { AppLang } from '../../types/annotator';
import {
  EXCALIDRAW_SELECTORS,
  EXCALIDRAW_TESTIDS,
  testIdSelector,
} from '../../excalidraw/domContract';
import { getMessages, type MessageCatalog } from '../../i18n/messages';
import { silently } from '../../utils/common';
import { deleteSelectedElementsWithApi, duplicateSelectedElementsWithApi } from '../elementOps';
import { runInstantReset } from './actions';
import { MOBILE_SHAPE_OTHER_ITEMS, REDACT_TOOL_CUSTOM_TYPE, SHAPE_OTHER_ITEMS } from './constants';
import { cloneNativeToolbarIcon, el, getButtonIconSignature, svgIcon } from './dom';
import {
  activateRedactTool,
  clickNativeTool,
  closeFloatingPopovers,
  getActiveNativeToolId,
  runtime,
  scheduleSync,
} from './runtime';

const toolbarMounts = new WeakMap<Element, {
  lang: AppLang;
  d1: HTMLElement;
  d2: HTMLElement;
  d3: HTMLElement;
  widget: { wrap: HTMLElement; trigger: HTMLButtonElement; update: () => void };
  resetBtn: HTMLButtonElement;
}>();
const mobileToolbarMounts = new WeakMap<Element, {
  lang: AppLang;
  textBtn: HTMLButtonElement;
  rectBtn: HTMLButtonElement;
  widget: { wrap: HTMLElement; trigger: HTMLButtonElement; update: () => void };
}>();
const mobileShapeActionsMounts = new WeakMap<Element, {
  lang: AppLang;
  dupWrap: HTMLElement;
  dupBtn: HTMLButtonElement;
  delWrap: HTMLElement;
  delBtn: HTMLButtonElement;
}>();

interface ShapeGroupItemDef<TId extends string> {
  readonly id: TId;
  readonly testId: string;
  readonly msgKey: keyof MessageCatalog;
  readonly shortcut: string;
}

function createShapeGroupWidget<TId extends string>({
  items,
  wrapClass,
  wrapAttrs = {},
  triggerClass,
  triggerTitle,
  caretIcon,
  popoverClass,
  itemClass,
  itemDataAttr,
  iconSize,
  labelClass,
  showShortcut,
  includeLabelTitle,
  getActiveId,
  getLastSelected,
  setLastSelected,
}: {
  items: readonly ShapeGroupItemDef<TId>[];
  wrapClass: string;
  wrapAttrs?: Record<string, string>;
  triggerClass: string;
  triggerTitle: string;
  caretIcon: 'caret' | 'caretUp';
  popoverClass: string;
  itemClass: string;
  itemDataAttr: string;
  iconSize: number;
  labelClass: string | null;
  showShortcut: boolean;
  includeLabelTitle: boolean;
  getActiveId: () => TId | null;
  getLastSelected: () => TId;
  setLastSelected: (id: TId) => void;
}) {
  const t = getMessages(runtime.prefs.lang);
  const wrap = el('div', { class: wrapClass, ...wrapAttrs });
  const iconSlot = el('span', { class: 'exq-icon-slot' });
  const caretSlot = svgIcon(caretIcon, 10, '0 0 12 12', 1.5);
  caretSlot.classList.add('exq-caret');

  const trigger = el(
    'button',
    {
      type: 'button',
      class: triggerClass,
      title: triggerTitle,
      'aria-label': triggerTitle,
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
    },
    iconSlot,
    caretSlot,
  );

  const popover = el('div', { class: popoverClass, role: 'menu' });
  const itemButtons = new Map<TId, HTMLButtonElement>();

  for (const item of items) {
    const label = String(t[item.msgKey]);
    const itemAttrs: Record<string, string> = {
      type: 'button',
      class: itemClass,
      role: 'menuitem',
      [itemDataAttr]: item.id,
    };
    if (includeLabelTitle) {
      itemAttrs.title = label;
      itemAttrs['aria-label'] = label;
    }

    const btn = el(
      'button',
      itemAttrs,
      cloneNativeToolbarIcon(item.testId, item.id, iconSize, 1.5),
      el('span', labelClass ? { class: labelClass } : null, label),
      showShortcut && item.shortcut ? el('span', { class: 'exq-pop-shortcut' }, item.shortcut) : null,
    );
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setLastSelected(item.id);
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

  let renderedIconId: TId | null = null;
  const update = () => {
    const activeId = getActiveId();
    if (activeId) setLastSelected(activeId);
    const currentLast = getLastSelected();
    if (renderedIconId !== currentLast) {
      renderedIconId = currentLast;
      const meta = items.find((it) => it.id === renderedIconId);
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

function updateExtraToolsTriggerIndicators(stackOrBar: Element, queryDomFallback: boolean): void {
  const extraBtn = stackOrBar.querySelector(EXCALIDRAW_SELECTORS.extraToolsTrigger);
  if (!extraBtn) return;
  const activeTool = silently(() => runtime.api?.getAppState()?.activeTool);
  const eraserChecked =
    activeTool?.type === 'eraser' ||
    (queryDomFallback && !!stackOrBar.querySelector(testIdSelector(EXCALIDRAW_TESTIDS.eraser))?.classList.contains('ToolIcon--checked'));
  const stickyChecked =
    activeTool?.type === 'stickynote' ||
    (queryDomFallback && !!stackOrBar.querySelector(testIdSelector(EXCALIDRAW_TESTIDS.stickynote))?.classList.contains('ToolIcon--checked'));
  const lassoChecked = activeTool?.type === 'lasso';
  const lockChecked =
    !!activeTool?.locked ||
    (queryDomFallback && !!stackOrBar.querySelector(testIdSelector(EXCALIDRAW_TESTIDS.lock))?.classList.contains('ToolIcon--checked'));
  extraBtn.classList.toggle('exq-eraser-active', eraserChecked || stickyChecked || lassoChecked);
  extraBtn.classList.toggle('exq-lock-active', lockChecked);
}

/* ================= Desktop Toolbar Group (Shape Other + Reset + Dividers) ================= */
export function syncToolbar(root: ParentNode = document): boolean {
  const stack = root.querySelector(EXCALIDRAW_SELECTORS.toolbarStack);
  const selBtn = stack?.querySelector(testIdSelector(EXCALIDRAW_TESTIDS.selection));
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
    const widget = createShapeGroupWidget({
      items: SHAPE_OTHER_ITEMS,
      wrapClass: 'exq-shape-group',
      triggerClass: 'exq-shape-trigger',
      triggerTitle: t.shapeGroupTitle,
      caretIcon: 'caret',
      popoverClass: 'exq-popover',
      itemClass: 'exq-pop-item',
      itemDataAttr: 'data-exq-tool',
      iconSize: 15,
      labelClass: null,
      showShortcut: true,
      includeLabelTitle: false,
      getActiveId: () => getActiveNativeToolId(),
      getLastSelected: () => runtime.lastShapeOther,
      setLastSelected: (id) => {
        runtime.lastShapeOther = id;
      },
    });
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

  updateExtraToolsTriggerIndicators(stack, true);
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

export function syncMobileToolbar(root: ParentNode = document): boolean {
  const bar = root.querySelector(EXCALIDRAW_SELECTORS.mobileToolbar);
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
      cloneNativeToolbarIcon(EXCALIDRAW_TESTIDS.text, 'text', 16, 1.5),
    );
    textBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFloatingPopovers(null);
      clickNativeTool(EXCALIDRAW_TESTIDS.text);
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
      cloneNativeToolbarIcon(EXCALIDRAW_TESTIDS.rectangle, 'rectangle', 16, 1.5),
    );
    rectBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFloatingPopovers(null);
      clickNativeTool(EXCALIDRAW_TESTIDS.rectangle);
      scheduleSync();
    });

    const widget = createShapeGroupWidget({
      items: MOBILE_SHAPE_OTHER_ITEMS,
      wrapClass: 'exq-shape-group exq-mobile-shape-group',
      wrapAttrs: { 'data-exq-mobile-shape-group': '1' },
      triggerClass: 'exq-shape-trigger exq-mobile-shape-trigger',
      triggerTitle: t.mobileShapeGroupTitle,
      caretIcon: 'caretUp',
      popoverClass: 'exq-popover exq-popover--up',
      itemClass: 'exq-pop-item exq-pop-item--mobile',
      itemDataAttr: 'data-exq-mobile-shape',
      iconSize: 16,
      labelClass: 'exq-pop-mobile-label',
      showShortcut: false,
      includeLabelTitle: true,
      getActiveId: getActiveMobileShapeOtherId,
      getLastSelected: () => runtime.lastMobileShapeOther,
      setLastSelected: (id) => {
        runtime.lastMobileShapeOther = id;
      },
    });
    bar.append(textBtn, rectBtn, widget.wrap);
    mounted = { lang: runtime.prefs.lang, textBtn, rectBtn, widget };
    mobileToolbarMounts.set(bar, mounted);
  } else {
    mounted.widget.update();
  }

  // Show fallback Text button only when Excalidraw collapses native toolbar-text (<316px)
  const hasNativeText = !!bar.querySelector(`:scope > ${testIdSelector(EXCALIDRAW_TESTIDS.text)}`);
  mounted.textBtn.style.display = hasNativeText ? 'none' : '';

  const activeTool = silently(() => runtime.api?.getAppState()?.activeTool);
  mounted.textBtn.classList.toggle('exq-active', activeTool?.type === 'text');
  mounted.rectBtn.classList.toggle('exq-active', activeTool?.type === 'rectangle');

  updateExtraToolsTriggerIndicators(bar, false);
  return true;
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
  const bar = root.querySelector(EXCALIDRAW_SELECTORS.mobileStyleActions);
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
      duplicateSelectedElementsWithApi(runtime.api);
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
      deleteSelectedElementsWithApi(runtime.api);
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
