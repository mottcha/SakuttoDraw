// Left main-menu export block injection.
import type { AppLang, ExportFormat, ExportScale } from '../../types/annotator';
import {
  EXCALIDRAW_SELECTORS,
  EXCALIDRAW_TESTIDS,
  testIdSelector,
} from '../../excalidraw/domContract';
import { getMessages } from '../../i18n/messages';
import { normalizeFormat, savePrefs } from '../../services/storageBridge';
import { runInstantExport } from './actions';
import { EXPORT_TOGGLE_DEFS } from './constants';
import { createAccordionSection, createSwitchRow, el, svgIcon } from './dom';
import { runtime, sendEscape } from './runtime';

const mainMenuMounts = new WeakMap<Element, { lang: AppLang; nodes: Element[] }>();

/* ================= Main Menu Injection (Save / Copy / Export Settings) ================= */
function buildMainMenuExportBlock(): DocumentFragment {
  const t = getMessages(runtime.prefs.lang);
  const frag = document.createDocumentFragment();

  const makeActionItem = (iconName: string, label: string, actionMode: 'png' | 'copy') => {
    const row = el(
      'button',
      {
        type: 'button',
        role: 'menuitem',
        class: 'radix-menu-item dropdown-menu-item dropdown-menu-item-base exq-main-export-action',
        'data-exq-main-action': actionMode,
      },
      el('div', { class: 'dropdown-menu-item__icon' }, svgIcon(iconName, 15)),
      el('div', { class: 'dropdown-menu-item__text' }, label),
    );
    row.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sendEscape();
      void runInstantExport(actionMode);
    });
    return row;
  };

  frag.append(
    el('div', { class: 'exq-extra-sep', 'aria-hidden': 'true' }),
    makeActionItem('imgSave', t.saveAsImage, 'png'),
    makeActionItem('copy', t.copyToClipboard, 'copy'),
  );

  const switchMap = new Map<string, HTMLButtonElement>();
  const formatBtnMap = new Map<ExportFormat, HTMLButtonElement>();
  const scaleBtnMap = new Map<ExportScale, HTMLButtonElement>();
  let scaleRowNode: HTMLElement | null = null;
  let acc: ReturnType<typeof createAccordionSection> | null = null;

  const refresh = () => {
    acc?.setOpen(runtime.expAccOpen);
    for (const [key, sw] of switchMap) {
      const rawOn = !!runtime.prefs.exportOpts[key as keyof typeof runtime.prefs.exportOpts];
      const on = key === 'background' ? !rawOn : rawOn;
      sw.classList.toggle('exq-on', on);
      sw.setAttribute('aria-pressed', String(on));
    }
    const curFmt = normalizeFormat(runtime.prefs.exportOpts.format);
    for (const [fmt, btn] of formatBtnMap) {
      btn.classList.toggle('exq-active', curFmt === fmt);
    }
    for (const [s, btn] of scaleBtnMap) {
      btn.classList.toggle('exq-active', runtime.prefs.exportOpts.scale === s);
    }
    if (scaleRowNode) {
      const isSvg = curFmt === 'svg';
      scaleRowNode.classList.toggle('exq-disabled', isSvg);
      scaleRowNode.setAttribute('aria-disabled', String(isSvg));
    }
  };

  acc = createAccordionSection({
    rootClass: 'exq-main-export-root',
    rootAttrs: { 'data-exq-export-settings': '1' },
    toggleAttr: 'data-exq-exp-acc-toggle',
    iconName: 'sliders',
    label: t.exportSettings,
    initialOpen: runtime.expAccOpen,
    onToggle: (nextOpen) => {
      runtime.expAccOpen = nextOpen;
      refresh();
    },
  });
  acc.root.addEventListener('click', (e) => e.stopPropagation());

  for (const def of EXPORT_TOGGLE_DEFS) {
    const { row, switchBtn } = createSwitchRow({
      label: t[def.msgKey],
      optAttr: 'data-exq-exp-opt',
      optValue: def.key,
      onClick: () => {
        runtime.prefs.exportOpts[def.key] = !runtime.prefs.exportOpts[def.key];
        savePrefs(runtime.prefs);
        refresh();
      },
    });
    switchMap.set(def.key, switchBtn);
    acc.nest.append(row);
  }

  const fmtSeg = el('div', { class: 'exq-scale-seg exq-fmt-seg', role: 'radiogroup', 'aria-label': t.exportFormat });
  for (const fmt of ['png', 'svg'] as const) {
    const b = el('button', { type: 'button', 'data-exq-format': fmt }, fmt.toUpperCase());
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      runtime.prefs.exportOpts.format = fmt;
      savePrefs(runtime.prefs);
      refresh();
    });
    formatBtnMap.set(fmt, b);
    fmtSeg.append(b);
  }
  acc.nest.append(el('div', { class: 'exq-scale-row' }, el('span', null, t.exportFormat), fmtSeg));

  const scaleSeg = el('div', { class: 'exq-scale-seg', role: 'radiogroup', 'aria-label': t.exportScale });
  for (const s of [1, 2, 3] as const) {
    const b = el('button', { type: 'button', 'data-exq-scale': String(s) }, `${s}×`);
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      runtime.prefs.exportOpts.scale = s;
      savePrefs(runtime.prefs);
      refresh();
    });
    scaleBtnMap.set(s, b);
    scaleSeg.append(b);
  }
  scaleRowNode = el('div', { class: 'exq-scale-row' }, el('span', null, t.exportScale), scaleSeg);
  acc.nest.append(scaleRowNode);

  refresh();
  frag.append(acc.root);
  return frag;
}

export function syncMainMenu(root: ParentNode = document): boolean {
  const menu = root.querySelector(EXCALIDRAW_SELECTORS.mainMenuContainer);
  if (!menu) return false;

  const mounted = mainMenuMounts.get(menu);
  if (mounted && mounted.lang === runtime.prefs.lang && mounted.nodes.every((n) => n.isConnected)) {
    return false;
  }

  const anchor = menu.querySelector(testIdSelector(EXCALIDRAW_TESTIDS.imageExport));
  if (!anchor) return false;

  if (mounted) {
    for (const node of mounted.nodes) {
      node.remove();
    }
  }

  const frag = buildMainMenuExportBlock();
  const nodes = Array.from(frag.children);
  menu.insertBefore(frag, anchor);
  mainMenuMounts.set(menu, { lang: runtime.prefs.lang, nodes });
  return true;
}
