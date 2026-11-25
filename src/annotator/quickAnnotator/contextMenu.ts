// Right-click context menu quick bar / layer bar and popover clamping.
import { CTX_HIDDEN_TESTIDS, EXCALIDRAW_SELECTORS } from '../../excalidraw/domContract';
import { getMessages } from '../../i18n/messages';
import { isMacPlatform, silently } from '../../utils/common';
import { el, svgIcon } from './dom';
import { runtime, sendEscape } from './runtime';

const contextMenuProcessed = new WeakSet<Element>();

/* ================= Context Menu Cleanup & Rich UI (Design 1) ================= */
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
  const popover = ul.closest<HTMLElement>(EXCALIDRAW_SELECTORS.contextMenuPopover);
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
      const liveZBtns = document.querySelectorAll<HTMLElement>(EXCALIDRAW_SELECTORS.zIndexButton);
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
  const ul = root.querySelector(EXCALIDRAW_SELECTORS.contextMenu);
  if (!ul || contextMenuProcessed.has(ul)) return false;

  const isMobile = Boolean(
    ul.closest(EXCALIDRAW_SELECTORS.mobileRoot) || root.querySelector(EXCALIDRAW_SELECTORS.mobileRoot),
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
