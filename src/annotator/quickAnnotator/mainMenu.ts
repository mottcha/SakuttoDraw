// Left main-menu export block injection, canvas background, and pen color.
import type { AppLang, ExportFormat, ExportScale } from '../../types/annotator';
import { getMessages } from '../../i18n/messages';
import {
  DEFAULT_PEN_COLOR,
  LS_STATE_KEY,
  normalizeFormat,
  normalizeHexColor,
  savePrefs,
  silently,
} from '../../services/storageBridge';
import { applyCanvasBackgroundWithApi, applyPenColorWithApi } from '../apiActions';
import { EXPORT_TOGGLE_DEFS } from './constants';
import { el, svgIcon } from './dom';
import { runtime, sendEscape, showToast } from './runtime';
import { runInstantExport } from './topRightBar';

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

  const root = el('div', {
    class: 'exq-main-export-root' + (runtime.expAccOpen ? ' exq-acc-open' : ''),
    'data-exq-export-settings': '1',
  });
  root.addEventListener('click', (e) => e.stopPropagation());

  const chev = el('span', { class: 'exq-acc-chev' }, svgIcon('caret', 12, '0 0 12 12', 1.8));
  const accBtn = el(
    'button',
    {
      type: 'button',
      class: 'exq-acc-flat-btn',
      'data-exq-exp-acc-toggle': '1',
      'aria-expanded': String(runtime.expAccOpen),
    },
    svgIcon('sliders', 14),
    el('span', null, t.exportSettings),
    chev,
  );

  const nest = el('div', { class: 'exq-acc-nest' });
  const switchMap = new Map<string, HTMLButtonElement>();
  const formatBtnMap = new Map<ExportFormat, HTMLButtonElement>();
  const scaleBtnMap = new Map<ExportScale, HTMLButtonElement>();
  let scaleRowNode: HTMLElement | null = null;

  const refresh = () => {
    root.classList.toggle('exq-acc-open', runtime.expAccOpen);
    accBtn.setAttribute('aria-expanded', String(runtime.expAccOpen));
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

  accBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    runtime.expAccOpen = !runtime.expAccOpen;
    refresh();
  });

  for (const def of EXPORT_TOGGLE_DEFS) {
    const label = t[def.msgKey];
    const sw = el('button', {
      type: 'button',
      class: 'exq-switch',
      'data-exq-exp-opt': def.key,
      'aria-label': label,
    });
    const row = el(
      'div',
      { class: 'exq-opt-row', role: 'menuitemcheckbox' },
      el('span', { class: 'exq-opt-label' }, label),
      sw,
    );
    row.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      runtime.prefs.exportOpts[def.key] = !runtime.prefs.exportOpts[def.key];
      savePrefs(runtime.prefs);
      refresh();
    });
    switchMap.set(def.key, sw);
    nest.append(row);
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
  nest.append(el('div', { class: 'exq-scale-row' }, el('span', null, t.exportFormat), fmtSeg));

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
  nest.append(scaleRowNode);

  refresh();
  root.append(accBtn, nest);
  frag.append(root);
  return frag;
}

export function syncMainMenu(root: ParentNode = document): boolean {
  const menu = root.querySelector('.dropdown-menu-container:has([data-testid="image-export-button"])');
  if (!menu) return false;

  const mounted = mainMenuMounts.get(menu);
  if (mounted && mounted.lang === runtime.prefs.lang && mounted.nodes.every((n) => n.isConnected)) {
    return false;
  }

  const anchor = menu.querySelector('[data-testid="image-export-button"]');
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

/* ================= Canvas Background & Lasso Helpers ================= */
export function getCurrentCanvasBg(
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
): string {
  if (runtime.api) {
    const apiBg = silently(() => runtime.api?.getAppState()?.viewBackgroundColor?.trim());
    if (apiBg) return apiBg.toLowerCase();
  }
  const liveSwatch = silently(() =>
    document.querySelector<HTMLElement>('[data-openpopup="canvasBackground"]')?.style?.getPropertyValue('--swatch-color')?.trim(),
  );
  if (liveSwatch) return liveSwatch.toLowerCase();
  if (runtime.lastCanvasBg) return runtime.lastCanvasBg.toLowerCase();
  if (storage) {
    const st = silently(() => JSON.parse(storage.getItem(LS_STATE_KEY) || '{}'));
    if (st && typeof st.viewBackgroundColor === 'string' && st.viewBackgroundColor) {
      return st.viewBackgroundColor.toLowerCase();
    }
  }
  return '#ffffff';
}

export async function applyCanvasBackground(hex: string): Promise<boolean> {
  if (runtime.isBusy) return false;
  const normalized = '#' + String(hex || '#ffffff').trim().toLowerCase().replace(/^#/, '');
  runtime.lastCanvasBg = normalized;

  if (runtime.api) {
    const res = await applyCanvasBackgroundWithApi(runtime.api, normalized, {
      lang: runtime.prefs.lang,
      showToast,
    });
    return res.ok;
  }

  if (typeof localStorage !== 'undefined') {
    silently(() => {
      const raw = localStorage.getItem(LS_STATE_KEY);
      const st = raw ? JSON.parse(raw) : {};
      st.viewBackgroundColor = normalized;
      localStorage.setItem(LS_STATE_KEY, JSON.stringify(st));
    });
  }
  showToast(getMessages(runtime.prefs.lang).toastBgChanged);
  return true;
}

export function getCurrentPenColor(): string {
  return normalizeHexColor(runtime.prefs.quickOpts.defaultPenColor, DEFAULT_PEN_COLOR);
}

export async function applyPenColor(hex: string): Promise<boolean> {
  if (runtime.isBusy) return false;
  const normalized = normalizeHexColor(hex, DEFAULT_PEN_COLOR);
  runtime.prefs.quickOpts.defaultPenColor = normalized;
  savePrefs(runtime.prefs);

  if (runtime.api) {
    const res = await applyPenColorWithApi(runtime.api, normalized, {
      lang: runtime.prefs.lang,
      showToast,
    });
    return res.ok;
  }

  if (typeof localStorage !== 'undefined') {
    silently(() => {
      const raw = localStorage.getItem(LS_STATE_KEY);
      const st = raw ? JSON.parse(raw) : {};
      st.currentItemStrokeColor = normalized;
      localStorage.setItem(LS_STATE_KEY, JSON.stringify(st));
    });
  }
  showToast(getMessages(runtime.prefs.lang).toastPenColorChanged);
  return true;
}
