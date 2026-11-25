// Extra tools ("more") menu injection and draw-assist toggles.
import { CaptureUpdateAction } from '@excalidraw/excalidraw';
import {
  EXCALIDRAW_SELECTORS,
  EXCALIDRAW_TESTIDS,
  testIdSelector,
  toolbarTestIdSelector,
} from '../../excalidraw/domContract';
import { getMessages } from '../../i18n/messages';
import { silently } from '../../utils/common';
import { DRAW_ASSIST_DEFS, EXTRA_T3_LEFT_ITEMS, EXTRA_T3_LOCK_ITEM } from './constants';
import { createAccordionSection, createSwitchRow, el, svgIcon } from './dom';
import { clickNativeTool, runtime, scheduleSync, sendEscape, showToast } from './runtime';

const extraMenuInjected = new WeakSet<Element>();

export async function activateLassoTool(): Promise<boolean> {
  if (runtime.api) {
    runtime.api.setActiveTool({ type: 'lasso' });
    sendEscape();
    scheduleSync();
    return true;
  }
  const menuLasso = document.querySelector<HTMLElement>(
    `${EXCALIDRAW_SELECTORS.dropdownMenuContainer} ${testIdSelector(EXCALIDRAW_TESTIDS.lasso)}`,
  );
  if (menuLasso) {
    menuLasso.click();
    sendEscape();
    scheduleSync();
    return true;
  }
  return false;
}

/* ================= Extra Tools Menu Injection (T3 Row + Drawing Assist) ================= */
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
  const assistSwitchMap = new Map<(typeof DRAW_ASSIST_DEFS)[number]['key'], HTMLButtonElement>();
  let acc: ReturnType<typeof createAccordionSection> | null = null;

  const refreshAssist = () => {
    acc?.setOpen(runtime.drawAssistAccOpen);
    for (const [key, sw] of assistSwitchMap) {
      const on = getDrawAssistValue(key);
      sw.classList.toggle('exq-on', on);
      sw.setAttribute('aria-pressed', String(on));
    }
  };

  acc = createAccordionSection({
    rootClass: 'exq-acc-section',
    rootAttrs: { 'data-exq-draw-assist': '1' },
    toggleAttr: 'data-exq-assist-toggle',
    iconName: 'drawAssist',
    label: t.drawAssist,
    initialOpen: runtime.drawAssistAccOpen,
    onToggle: (nextOpen) => {
      runtime.drawAssistAccOpen = nextOpen;
      refreshAssist();
    },
  });

  for (const def of DRAW_ASSIST_DEFS) {
    const label = t[def.msgKey];
    const { row, switchBtn } = createSwitchRow({
      label,
      optAttr: 'data-exq-assist-opt',
      optValue: def.key,
      shortcut: def.shortcut || undefined,
      onClick: () => {
        const nextVal = toggleDrawAssistOption(def.key);
        refreshAssist();
        showToast(`${label}: ${nextVal ? 'ON' : 'OFF'}`);
      },
    });
    assistSwitchMap.set(def.key, switchBtn);
    acc.nest.append(row);
  }

  refreshAssist();
  root.append(sep, acc.root);
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
          root.querySelector(`${EXCALIDRAW_SELECTORS.dropdownMenuContainer} ${testIdSelector(EXCALIDRAW_TESTIDS.lasso)}.active`) ||
          root.querySelector(`${EXCALIDRAW_SELECTORS.toolPopoverContent} ${testIdSelector(EXCALIDRAW_TESTIDS.lasso)}.ToolIcon--checked`) ||
          root.querySelector(`${toolbarTestIdSelector(EXCALIDRAW_TESTIDS.lasso)}.ToolIcon--checked`)
        )
      : item.id === 'lock'
        ? !!activeTool?.locked ||
          !!root.querySelector(toolbarTestIdSelector(item.testId))?.classList.contains('ToolIcon--checked')
        : activeTool?.type === (item.id === 'sticky' ? 'stickynote' : item.id) ||
          !!root.querySelector(toolbarTestIdSelector(item.testId))?.classList.contains('ToolIcon--checked');

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
  const menu = root.querySelector(EXCALIDRAW_SELECTORS.extraToolsMenuContainer);
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
    if (!menu.querySelector(testIdSelector(EXCALIDRAW_TESTIDS.image))) {
      topFrag.append(makeExtraMenuProxyItem('imgSave', t.toolImage, EXCALIDRAW_TESTIDS.image, 'image'));
    }
    if (!menu.querySelector(testIdSelector(EXCALIDRAW_TESTIDS.frame))) {
      topFrag.append(makeExtraMenuProxyItem('frame', t.toolFrame, EXCALIDRAW_TESTIDS.frame, 'frame'));
    }
  }

  menu.insertBefore(topFrag, firstNative);
  menu.append(buildQuickOptionsAccordion());

  extraMenuInjected.add(menu);
  return true;
}
