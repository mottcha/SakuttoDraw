// Extra tools ("more") menu injection and draw-assist toggles.
import { CaptureUpdateAction } from '@excalidraw/excalidraw';
import {
  EXCALIDRAW_SELECTORS,
  EXCALIDRAW_TESTIDS,
  testIdSelector,
} from '../../excalidraw/domContract';
import { getMessages } from '../../i18n/messages';
import { silently } from '../../utils/common';
import { DRAW_ASSIST_DEFS, EXTRA_T3_LEFT_ITEMS, EXTRA_T3_LOCK_ITEM } from './constants';
import {
  createAccordionSection,
  createMountedSlot,
  createSwitchRow,
  el,
  makeDropdownActionItem,
  svgIcon,
} from './dom';
import { clickNativeTool, runtime, scheduleSync, sendEscape, showToast } from './runtime';

type DrawAssistKey = (typeof DRAW_ASSIST_DEFS)[number]['key'];

const extraMenuSlot = createMountedSlot<{
  hasMobileBar: boolean;
  needsImageProxy: boolean;
  needsFrameProxy: boolean;
  refreshAssist: () => void;
  refreshT3: () => void;
}>();

function activateLassoTool(): boolean {
  if (!runtime.api) return false;
  runtime.api.setActiveTool({ type: 'lasso' });
  sendEscape();
  scheduleSync();
  return true;
}

/* ================= Extra Tools Menu Injection (T3 Row + Drawing Assist) ================= */
function getDrawAssistValue(key: DrawAssistKey): boolean {
  const st = silently(() => runtime.api?.getAppState());
  if (!st) {
    return key === 'arrowBinding' || key === 'midpointSnapping';
  }
  if (key === 'objectsSnapMode') return Boolean(st.objectsSnapModeEnabled);
  if (key === 'gridMode') return Boolean(st.gridModeEnabled);
  if (key === 'arrowBinding') return st.bindingPreference !== 'disabled';
  return Boolean(st.isMidpointSnappingEnabled);
}

function toggleDrawAssistOption(key: DrawAssistKey): {
  next: boolean;
  patch: Partial<Record<DrawAssistKey, boolean>>;
} {
  const next = !getDrawAssistValue(key);
  let patch: Partial<Record<DrawAssistKey, boolean>>;
  if (key === 'objectsSnapMode') {
    patch = { objectsSnapMode: next, gridMode: false };
    runtime.api?.updateScene({
      appState: { objectsSnapModeEnabled: next, gridModeEnabled: false },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    });
  } else if (key === 'gridMode') {
    patch = { gridMode: next, objectsSnapMode: false };
    runtime.api?.updateScene({
      appState: { gridModeEnabled: next, objectsSnapModeEnabled: false },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    });
  } else if (key === 'arrowBinding') {
    patch = { arrowBinding: next };
    runtime.api?.updateScene({
      appState: {
        bindingPreference: next ? 'enabled' : 'disabled',
        isBindingEnabled: next,
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  } else {
    patch = { midpointSnapping: next };
    runtime.api?.updateScene({
      appState: { isMidpointSnappingEnabled: next },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }
  return { next, patch };
}

function buildQuickOptionsAccordion(): {
  root: HTMLElement;
  refreshAssist: (overrides?: Partial<Record<DrawAssistKey, boolean>>) => void;
} {
  const t = getMessages(runtime.prefs.lang);
  const root = el('div', { class: 'exq-extra-options-root' });
  root.addEventListener('click', (e) => e.stopPropagation());

  const sep = el('div', { class: 'exq-extra-sep', 'aria-hidden': 'true' });
  const assistSwitchMap = new Map<DrawAssistKey, (on: boolean) => void>();
  let acc: ReturnType<typeof createAccordionSection> | null = null;

  const refreshAssist = (overrides?: Partial<Record<DrawAssistKey, boolean>>) => {
    acc?.setOpen(runtime.drawAssistAccOpen);
    for (const [key, setChecked] of assistSwitchMap) {
      const on =
        overrides && Object.hasOwn(overrides, key)
          ? Boolean(overrides[key])
          : getDrawAssistValue(key);
      setChecked(on);
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
    const { row, setChecked } = createSwitchRow({
      label,
      optAttr: 'data-exq-assist-opt',
      optValue: def.key,
      shortcut: def.shortcut || undefined,
      onClick: () => {
        const { next, patch } = toggleDrawAssistOption(def.key);
        refreshAssist(patch);
        const curMessages = getMessages(runtime.prefs.lang);
        showToast(`${label}: ${next ? curMessages.stateOn : curMessages.stateOff}`);
        scheduleSync();
      },
    });
    assistSwitchMap.set(def.key, setChecked);
    acc.nest.append(row);
  }

  refreshAssist();
  root.append(sep, acc.root);
  return { root, refreshAssist };
}

type T3ItemId = (typeof EXTRA_T3_LEFT_ITEMS)[number]['id'] | typeof EXTRA_T3_LOCK_ITEM.id;

function isT3ItemChecked(id: T3ItemId): boolean {
  const activeTool = silently(() => runtime.api?.getAppState()?.activeTool);
  if (!activeTool) return false;
  if (id === 'lasso') return activeTool.type === 'lasso';
  if (id === 'lock') return Boolean(activeTool.locked);
  return activeTool.type === (id === 'sticky' ? 'stickynote' : id);
}

function makeExtraT3Button(
  item: { id: T3ItemId; testId: string; msgKey: 'toolEraser' | 'toolSticky' | 'toolLasso' | 'toolLock'; shortcut: string },
): { btn: HTMLButtonElement; refresh: () => void } {
  const t = getMessages(runtime.prefs.lang);
  const label = t[item.msgKey];
  const titleText = item.shortcut ? `${label} (${item.shortcut})` : label;
  const btn = el(
    'button',
    {
      type: 'button',
      role: 'menuitem',
      class: 'exq-extra-tb-btn',
      'data-exq-proxy': item.testId,
      title: titleText,
      'aria-label': titleText,
    },
    svgIcon(item.id, 16, '0 0 24 24', 1.85),
    item.shortcut ? el('span', { class: 'exq-extra-tb-key', 'aria-hidden': 'true' }, item.shortcut) : null,
  );
  const refresh = () => {
    btn.classList.toggle('exq-active', isT3ItemChecked(item.id));
  };
  refresh();

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (item.id === 'lasso') {
      activateLassoTool();
      return;
    }
    if (item.id === 'lock') {
      if (runtime.api) {
        const cur = runtime.api.getAppState().activeTool;
        runtime.api.updateScene({
          appState: {
            activeTool: { ...cur, locked: !cur.locked },
          },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }
      sendEscape();
      scheduleSync();
      return;
    }
    if (runtime.api && (item.id === 'eraser' || item.id === 'sticky')) {
      runtime.api.setActiveTool({
        type: item.id === 'sticky' ? ('stickynote' as never) : 'eraser',
      });
    } else {
      clickNativeTool(item.testId);
    }
    sendEscape();
    scheduleSync();
  });
  return { btn, refresh };
}

function makeExtraMenuProxyItem(
  iconName: string,
  label: string,
  toolTestId: string,
  extraToolId: string,
): HTMLButtonElement {
  return makeDropdownActionItem({
    className: 'exq-extra-proxy-item',
    attrs: {
      'data-exq-extra-tool': extraToolId,
      title: label,
      'aria-label': label,
    },
    icon: svgIcon(iconName, 16, '0 0 24 24', 1.85),
    label,
    onClick: () => {
      clickNativeTool(toolTestId);
      sendEscape();
      scheduleSync();
    },
  });
}

export function syncExtraToolsMenu(root: ParentNode = document): boolean {
  const menu = root.querySelector(EXCALIDRAW_SELECTORS.extraToolsMenuContainer);
  if (!menu) return false;

  const hasMobileBar = Boolean(root.querySelector(EXCALIDRAW_SELECTORS.mobileToolbar));
  const needsImageProxy =
    hasMobileBar && !menu.querySelector(`:scope > ${testIdSelector(EXCALIDRAW_TESTIDS.image)}`);
  const needsFrameProxy =
    hasMobileBar && !menu.querySelector(`:scope > ${testIdSelector(EXCALIDRAW_TESTIDS.frame)}`);

  const mounted = extraMenuSlot.get(menu);
  if (
    mounted &&
    mounted.lang === runtime.prefs.lang &&
    mounted.nodes.every((n) => n.isConnected) &&
    mounted.state.hasMobileBar === hasMobileBar &&
    mounted.state.needsImageProxy === needsImageProxy &&
    mounted.state.needsFrameProxy === needsFrameProxy
  ) {
    mounted.state.refreshT3();
    mounted.state.refreshAssist();
    return false;
  }

  // Clear previously injected nodes before inspecting first native child
  extraMenuSlot.clear(menu);
  const firstNative = menu.firstElementChild;
  if (!firstNative) return false;

  const t3Refreshes: Array<() => void> = [];
  const t3Row = el('div', { class: 'exq-extra-tb-row', 'data-exq-t3-row': '1' });
  for (const item of EXTRA_T3_LEFT_ITEMS) {
    const built = makeExtraT3Button(item);
    t3Row.append(built.btn);
    t3Refreshes.push(built.refresh);
  }
  t3Row.append(el('div', { class: 'exq-extra-tb-vdiv', 'aria-hidden': 'true' }));
  const lockBuilt = makeExtraT3Button(EXTRA_T3_LOCK_ITEM);
  t3Row.append(lockBuilt.btn);
  t3Refreshes.push(lockBuilt.refresh);

  const topNodes: Element[] = [t3Row, el('div', { class: 'exq-extra-sep', 'aria-hidden': 'true' })];
  const t = getMessages(runtime.prefs.lang);
  if (needsImageProxy) {
    topNodes.push(makeExtraMenuProxyItem('imgSave', t.toolImage, EXCALIDRAW_TESTIDS.image, 'image'));
  }
  if (needsFrameProxy) {
    topNodes.push(makeExtraMenuProxyItem('frame', t.toolFrame, EXCALIDRAW_TESTIDS.frame, 'frame'));
  }

  const topFrag = document.createDocumentFragment();
  topFrag.append(...topNodes);
  menu.insertBefore(topFrag, firstNative);

  const { root: assistRoot, refreshAssist } = buildQuickOptionsAccordion();
  menu.append(assistRoot);

  const refreshT3 = () => {
    for (const fn of t3Refreshes) fn();
  };
  extraMenuSlot.mount(menu, runtime.prefs.lang, [...topNodes, assistRoot], {
    hasMobileBar,
    needsImageProxy,
    needsFrameProxy,
    refreshAssist,
    refreshT3,
  });
  return true;
}
