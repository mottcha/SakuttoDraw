// Left main-menu export block injection.
import type { ExportFormat } from '../../types/annotator';
import {
  EXCALIDRAW_CLASSES,
  EXCALIDRAW_SELECTORS,
  EXCALIDRAW_TESTIDS,
  testIdSelector,
} from '../../excalidraw/domContract';
import { getMessages } from '../../i18n/messages';
import {
  applyExportPreset,
  normalizeFormat,
  resolveExportPreset,
  savePrefs,
} from '../../services/storageBridge';
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
        if (actionMode === 'save') {
          // Invoke OS save picker in the synchronous user-gesture tick before dismissing menu
          void runInstantExport('save', null, { showSaveDialog: true });
          sendEscape();
        } else {
          sendEscape();
          void runInstantExport('copy');
        }
      },
    });

  frag.append(
    el('div', { class: 'exq-extra-sep', 'aria-hidden': 'true' }),
    makeExportAction('imgSave', t.saveImageAs, 'save'),
    makeExportAction('copy', t.copyToClipboard, 'copy'),
  );

  const switchUpdaters = new Map<string, (on: boolean) => void>();
  const presetBtnMap = new Map<'screenshot' | 'whiteboard', HTMLButtonElement>();
  const formatBtnMap = new Map<ExportFormat, HTMLButtonElement>();
  let summaryEl: HTMLElement | null = null;
  let advRoot: HTMLElement | null = null;
  let advToggleBtn: HTMLButtonElement | null = null;
  let acc: ReturnType<typeof createAccordionSection> | null = null;

  const refresh = () => {
    acc?.setOpen(runtime.expAccOpen);
    const curPreset = resolveExportPreset(runtime.prefs.exportOpts);
    for (const [preset, btn] of presetBtnMap) {
      const active = curPreset === preset;
      btn.classList.toggle('exq-active', active);
      btn.setAttribute('aria-checked', String(active));
    }
    if (summaryEl) {
      const baseSummary =
        curPreset === 'screenshot'
          ? t.exportPresetSummaryScreenshot
          : curPreset === 'whiteboard'
            ? t.exportPresetSummaryWhiteboard
            : t.exportPresetSummaryCustom;
      const darkSuffix = runtime.prefs.exportOpts.darkMode
        ? `${runtime.prefs.lang === 'ja-JP' ? '・' : ' · '}${t.exportSummaryDarkTag}`
        : '';
      summaryEl.textContent = `${baseSummary}${darkSuffix}`;
    }
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
    if (advRoot && advToggleBtn) {
      advRoot.classList.toggle('exq-open', runtime.expAdvAccOpen);
      advToggleBtn.setAttribute('aria-expanded', String(runtime.expAdvAccOpen));
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

  const presetSeg = el('div', {
    class: 'exq-exp-preset-seg',
    role: 'radiogroup',
    'aria-label': t.exportPresetLabel,
  });
  for (const preset of ['screenshot', 'whiteboard'] as const) {
    const label = preset === 'screenshot' ? t.exportPresetScreenshot : t.exportPresetWhiteboard;
    const btn = el(
      'button',
      {
        type: 'button',
        role: 'radio',
        'aria-checked': 'false',
        class: 'exq-exp-preset-btn',
        'data-exq-exp-preset': preset,
        title: label,
      },
      label,
    );
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      runtime.prefs.exportOpts = applyExportPreset(runtime.prefs.exportOpts, preset);
      savePrefs(runtime.prefs);
      refresh();
    });
    presetBtnMap.set(preset, btn);
    presetSeg.append(btn);
  }
  acc.nest.append(presetSeg);

  summaryEl = el('div', { class: 'exq-exp-summary', 'data-exq-exp-summary': '1' });
  acc.nest.append(summaryEl);

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

  advRoot = el('div', {
    class: `exq-exp-adv-root${runtime.expAdvAccOpen ? ' exq-open' : ''}`,
    'data-exq-exp-adv': '1',
  });
  advToggleBtn = el(
    'button',
    {
      type: 'button',
      class: 'exq-exp-adv-toggle',
      'data-exq-exp-adv-toggle': '1',
      'aria-expanded': String(runtime.expAdvAccOpen),
    },
    el('span', null, t.exportAdvancedSettings),
    el('span', { class: 'exq-exp-adv-chev' }, svgIcon('caret', 11, '0 0 12 12', 1.8)),
  );
  advToggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    runtime.expAdvAccOpen = !runtime.expAdvAccOpen;
    refresh();
  });
  const advNest = el('div', { class: 'exq-exp-adv-nest' });
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
    advNest.append(row);
  }
  advRoot.append(advToggleBtn, advNest);
  acc.nest.append(advRoot);

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
