// Extra tools ("more") menu injection, draw-assist and quick-option toggles.
import { CaptureUpdateAction } from '@excalidraw/excalidraw';
import { getMessages } from '../../i18n/messages';
import { silently } from '../../services/storageBridge';
import { DRAW_ASSIST_DEFS, EXTRA_T3_LEFT_ITEMS, EXTRA_T3_LOCK_ITEM } from './constants';
import { el, svgIcon } from './dom';
import { clickNativeTool, runtime, scheduleSync, sendEscape, showToast } from './runtime';

const extraMenuInjected = new WeakSet<Element>();

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
