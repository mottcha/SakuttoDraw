// Top-right 2-button instant export bar ([Copy] [Save]).
import { EXCALIDRAW_SELECTORS } from '../../excalidraw/domContract';
import { getMessages } from '../../i18n/messages';
import { runInstantExport } from './actions';
import { createMountedSlot, el, svgIcon } from './dom';
import { runtime } from './runtime';

const rightBarSlot = createMountedSlot<{ saveBtn: HTMLButtonElement }>();

function applySaveBtnLabels(saveBtn: HTMLButtonElement): void {
  const t = getMessages(runtime.prefs.lang);
  const label = runtime.prefs.quickSaveMode === 'dialog' ? t.saveImageAs : t.saveAsImage;
  saveBtn.title = label;
  saveBtn.setAttribute('aria-label', label);
}

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
    },
    svgIcon('download', 15),
  );
  applySaveBtnLabels(saveBtn);

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
    void runInstantExport('save', saveBtn, {
      showSaveDialog: runtime.prefs.quickSaveMode === 'dialog',
    });
  });

  const bar = el('div', { class: 'exq-right-bar' }, copyBtn, saveBtn);
  wrap.append(bar);

  return { wrap, saveBtn };
}

export function syncTopRightBar(root: ParentNode = document): boolean {
  const container = root.querySelector(EXCALIDRAW_SELECTORS.topRightContainer);
  if (!container) return false;

  const mounted = rightBarSlot.get(container);
  if (mounted && mounted.lang === runtime.prefs.lang && mounted.nodes.every((n) => n.isConnected)) {
    applySaveBtnLabels(mounted.state.saveBtn);
    return false;
  }

  const widget = buildRightBarWidget();
  rightBarSlot.mount(container, runtime.prefs.lang, [widget.wrap], { saveBtn: widget.saveBtn });
  container.append(widget.wrap);
  return true;
}
