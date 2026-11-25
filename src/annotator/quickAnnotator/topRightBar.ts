// Top-right instant export / reset buttons.
import type { AppLang } from '../../types/annotator';
import { getMessages } from '../../i18n/messages';
import { resolvePreferJpFont } from '../../services/storageBridge';
import { runInstantExportWithApi, runInstantResetWithApi } from '../apiActions';
import { el, svgIcon } from './dom';
import { closeFloatingPopovers, runtime, showToast } from './runtime';

const rightBarMounts = new WeakMap<Element, { lang: AppLang; wrap: HTMLElement }>();

/* ================= Direct API Instant Export & Instant Reset ================= */
export async function runInstantExport(
  mode: 'copy' | 'png',
  triggerBtn?: HTMLButtonElement | null,
) {
  if (runtime.isBusy) return { ok: false, reason: 'busy' };
  runtime.isBusy = true;
  if (triggerBtn) triggerBtn.disabled = true;

  try {
    closeFloatingPopovers(null);
    return await runInstantExportWithApi(runtime.api, mode, runtime.prefs.exportOpts, {
      lang: runtime.prefs.lang,
      preferJpFont: resolvePreferJpFont(runtime.prefs),
      showToast,
    });
  } finally {
    runtime.isBusy = false;
    if (triggerBtn) triggerBtn.disabled = false;
  }
}

export async function runInstantReset(triggerBtn?: HTMLButtonElement | null) {
  if (runtime.isBusy) return { ok: false, reason: 'busy' };
  runtime.isBusy = true;
  if (triggerBtn) triggerBtn.disabled = true;

  try {
    closeFloatingPopovers(null);
    return await runInstantResetWithApi(runtime.api, runtime.prefs, {
      showToast,
    });
  } finally {
    runtime.isBusy = false;
    if (triggerBtn) triggerBtn.disabled = false;
  }
}

/* ================= Top-Right 2-Button Export Bar ([Copy] [Save]) ================= */
function buildRightBarWidget() {
  const t = getMessages(runtime.prefs.lang);
  const wrap = el('div', { class: 'exq-right-wrap', 'data-exq-right-bar': '1' });

  const copyBtn = el(
    'button',
    {
      type: 'button',
      class: 'exq-action-btn exq-primary',
      'data-exq-action': 'copy',
      title: t.copyToClipboard,
      'aria-label': t.copyToClipboard,
    },
    svgIcon('copy', 15),
  );

  const saveBtn = el(
    'button',
    {
      type: 'button',
      class: 'exq-action-btn',
      'data-exq-action': 'png',
      title: t.saveAsImage,
      'aria-label': t.saveAsImage,
    },
    svgIcon('download', 15),
  );

  copyBtn.addEventListener('click', async () => {
    const res = await runInstantExport('copy', copyBtn);
    if (res?.ok) {
      copyBtn.classList.add('exq-done');
      copyBtn.replaceChildren(svgIcon('check', 15, '0 0 24 24', 2.5));
      setTimeout(() => {
        copyBtn.classList.remove('exq-done');
        copyBtn.replaceChildren(svgIcon('copy', 15));
      }, 1100);
    }
  });

  saveBtn.addEventListener('click', () => {
    void runInstantExport('png', saveBtn);
  });

  const bar = el('div', { class: 'exq-right-bar' }, copyBtn, saveBtn);
  wrap.append(bar);

  return { wrap };
}

export function syncTopRightBar(root: ParentNode = document): boolean {
  const container =
    root.querySelector('.layer-ui__wrapper__top-right') ||
    root.querySelector('.excalidraw-ui-top-right');
  if (!container) return false;

  let mounted = rightBarMounts.get(container);
  if (mounted && mounted.lang !== runtime.prefs.lang) {
    mounted.wrap.remove();
    mounted = undefined;
  }

  if (!mounted || !mounted.wrap.isConnected) {
    const widget = buildRightBarWidget();
    container.append(widget.wrap);
    mounted = { lang: runtime.prefs.lang, wrap: widget.wrap };
    rightBarMounts.set(container, mounted);
  }
  return true;
}
