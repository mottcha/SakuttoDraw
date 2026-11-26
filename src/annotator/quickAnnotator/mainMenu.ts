// Left main-menu export block injection.
import type { ExportFormat, ExportScale } from '../../types/annotator';
import {
  EXCALIDRAW_CLASSES,
  EXCALIDRAW_SELECTORS,
  EXCALIDRAW_TESTIDS,
  testIdSelector,
} from '../../excalidraw/domContract';
import { getMessages } from '../../i18n/messages';
import { normalizeFormat, savePrefs } from '../../services/storageBridge';
import { runInstantExport } from './actions';
import { EXPORT_TOGGLE_DEFS } from './constants';
import {
  createAccordionSection,
  createMountedSlot,
  createSwitchRow,
  el,
  makeDropdownActionItem,
  svgIcon,
} from './dom';
import { runtime, sendEscape } from './runtime';

const mainMenuSlot = createMountedSlot<Record<string, never>>();

/* ================= Main Menu Injection (Save / Copy / Export Settings) ================= */
function buildMainMenuExportBlock(): DocumentFragment {
  const t = getMessages(runtime.prefs.lang);
  const frag = document.createDocumentFragment();

  const makeExportAction = (iconName: string, label: string, actionMode: 'save' | 'copy') =>
    makeDropdownActionItem({
      className: `${EXCALIDRAW_CLASSES.radixMenuItem} exq-main-export-action`,
      attrs: { 'data-exq-main-action': actionMode === 'save' ? 'png' : 'copy' },
      icon: svgIcon(iconName, 15),
      label,
      onClick: () => {
        sendEscape();
        void runInstantExport(actionMode);
      },
    });

  frag.append(
    el('div', { class: 'exq-extra-sep', 'aria-hidden': 'true' }),
    makeExportAction('imgSave', t.saveAsImage, 'save'),
    makeExportAction('copy', t.copyToClipboard, 'copy'),
  );

  const switchUpdaters = new Map<string, (on: boolean) => void>();
  const formatBtnMap = new Map<ExportFormat, HTMLButtonElement>();
  const scaleBtnMap = new Map<ExportScale, HTMLButtonElement>();
  let scaleRowNode: HTMLElement | null = null;
  let acc: ReturnType<typeof createAccordionSection> | null = null;

  const refresh = () => {
    acc?.setOpen(runtime.expAccOpen);
    for (const [key, setChecked] of switchUpdaters) {
      const rawOn = !!runtime.prefs.exportOpts[key as keyof typeof runtime.prefs.exportOpts];
      const on = key === 'background' ? !rawOn : rawOn;
      setChecked(on);
    }
    const curFmt = normalizeFormat(runtime.prefs.exportOpts.format);
    for (const [fmt, btn] of formatBtnMap) {
      const active = curFmt === fmt;
      btn.classList.toggle('exq-active', active);
      btn.setAttribute('aria-checked', String(active));
    }
    for (const [s, btn] of scaleBtnMap) {
      const active = runtime.prefs.exportOpts.scale === s;
      btn.classList.toggle('exq-active', active);
      btn.setAttribute('aria-checked', String(active));
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
    const { row, setChecked } = createSwitchRow({
      label: t[def.msgKey],
      optAttr: 'data-exq-exp-opt',
      optValue: def.key,
      onClick: () => {
        runtime.prefs.exportOpts[def.key] = !runtime.prefs.exportOpts[def.key];
        savePrefs(runtime.prefs);
        refresh();
      },
    });
    switchUpdaters.set(def.key, setChecked);
    acc.nest.append(row);
  }

  const fmtSeg = el('div', { class: 'exq-scale-seg exq-fmt-seg', role: 'radiogroup', 'aria-label': t.exportFormat });
  for (const fmt of ['png', 'svg'] as const) {
    const b = el(
      'button',
      { type: 'button', role: 'radio', 'aria-checked': 'false', 'data-exq-format': fmt },
      fmt.toUpperCase(),
    );
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
    const b = el(
      'button',
      { type: 'button', role: 'radio', 'aria-checked': 'false', 'data-exq-scale': String(s) },
      `${s}×`,
    );
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

  const mounted = mainMenuSlot.get(menu);
  if (mounted && mounted.lang === runtime.prefs.lang && mounted.nodes.every((n) => n.isConnected)) {
    return false;
  }

  const anchor = menu.querySelector(testIdSelector(EXCALIDRAW_TESTIDS.imageExport));
  const anchorParent = anchor?.parentElement;
  if (!anchor || !anchorParent) return false;

  const frag = buildMainMenuExportBlock();
  const nodes = Array.from(frag.children);
  anchorParent.insertBefore(frag, anchor);
  mainMenuSlot.mount(menu, runtime.prefs.lang, nodes, {});
  return true;
}
