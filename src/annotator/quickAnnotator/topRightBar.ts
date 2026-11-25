// Top-right 2-button instant export bar ([Copy] [Save]).
import type { AppLang } from '../../types/annotator';
import { EXCALIDRAW_SELECTORS } from '../../excalidraw/domContract';
import { getMessages } from '../../i18n/messages';
import { runInstantExport } from './actions';
import { el, svgIcon } from './dom';
import { runtime } from './runtime';

const rightBarMounts = new WeakMap<Element, { lang: AppLang; wrap: HTMLElement }>();

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

  let copyDoneTimer: ReturnType<typeof setTimeout> | null = null;
  copyBtn.addEventListener('click', async () => {
    const res = await runInstantExport('copy', copyBtn);
    if (res?.ok) {
      if (copyDoneTimer !== null) {
        clearTimeout(copyDoneTimer);
      }
      copyBtn.classList.add('exq-done');
      copyBtn.replaceChildren(svgIcon('check', 15, '0 0 24 24', 2.5));
      copyDoneTimer = setTimeout(() => {
        copyDoneTimer = null;
        if (!copyBtn.isConnected) return;
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
  const container = root.querySelector(EXCALIDRAW_SELECTORS.topRightContainer);
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
