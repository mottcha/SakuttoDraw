// Pointer drag controller for the redact (mosaic / blur / blackout) tool.
import { silently } from '../../services/storageBridge';
import { createOrUpdateRedactElement } from '../redactProcessor';
import { el } from './dom';
import { isRedactToolActive, runtime, scheduleSync } from './runtime';
import { isEditableFocused } from './guards';

/* ================= Blur / Redact Drag Controller (Item 5) ================= */
export function installRedactDragController(): () => void {
  let dragState: {
    pointerId: number;
    startX: number;
    startY: number;
    curX: number;
    curY: number;
    shiftKey: boolean;
    canvas: HTMLCanvasElement;
    boxEl: HTMLElement;
  } | null = null;
  let spaceHeld = false;

  const computeViewportBox = (s: NonNullable<typeof dragState>) => {
    let dx = s.curX - s.startX;
    let dy = s.curY - s.startY;
    if (s.shiftKey) {
      const size = Math.max(Math.abs(dx), Math.abs(dy));
      dx = dx >= 0 ? size : -size;
      dy = dy >= 0 ? size : -size;
    }
    const left = Math.min(s.startX, s.startX + dx);
    const top = Math.min(s.startY, s.startY + dy);
    const width = Math.abs(dx);
    const height = Math.abs(dy);
    return { left, top, width, height };
  };

  const clearDrag = () => {
    if (!dragState) return;
    dragState.boxEl.remove();
    dragState = null;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' && !isEditableFocused()) {
      spaceHeld = true;
    }
    if (e.key === 'Escape' && dragState) {
      clearDrag();
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      spaceHeld = false;
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!runtime.api || runtime.isBusy || spaceHeld) return;
    if (e.button !== 0 || e.altKey) return;
    if (!isRedactToolActive()) return;
    if (!(e.target instanceof HTMLCanvasElement) || !e.target.matches('canvas.interactive')) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const host = e.target.closest('.excalidraw') || document.body;
    const boxEl = el('div', { class: 'exq-redact-rubberband', 'data-exq-redact-rubberband': '1' });
    host.append(boxEl);

    dragState = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      curX: e.clientX,
      curY: e.clientY,
      shiftKey: e.shiftKey,
      canvas: e.target,
      boxEl,
    };

    silently(() => e.target instanceof Element && e.target.setPointerCapture?.(e.pointerId));
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    dragState.curX = e.clientX;
    dragState.curY = e.clientY;
    dragState.shiftKey = e.shiftKey;

    const { left, top, width, height } = computeViewportBox(dragState);
    const hostRect = (dragState.boxEl.parentElement || document.body).getBoundingClientRect();
    dragState.boxEl.style.left = `${Math.round(left - hostRect.left)}px`;
    dragState.boxEl.style.top = `${Math.round(top - hostRect.top)}px`;
    dragState.boxEl.style.width = `${Math.round(width)}px`;
    dragState.boxEl.style.height = `${Math.round(height)}px`;
  };

  const onPointerUp = async (e: PointerEvent) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    dragState.curX = e.clientX;
    dragState.curY = e.clientY;
    dragState.shiftKey = e.shiftKey;
    const { left, top, width, height } = computeViewportBox(dragState);
    const canvas = dragState.canvas;
    clearDrag();

    if (width < 6 || height < 6 || !runtime.api) return;

    const appState = runtime.api.getAppState();
    const zoom = appState.zoom?.value || 1;
    const canvasRect = canvas.getBoundingClientRect();
    const sceneX = (left - canvasRect.left) / zoom - (appState.scrollX || 0);
    const sceneY = (top - canvasRect.top) / zoom - (appState.scrollY || 0);
    const sceneW = width / zoom;
    const sceneH = height / zoom;
    const wasLocked = Boolean(appState.activeTool?.locked);

    runtime.isBusy = true;
    try {
      await createOrUpdateRedactElement({
        api: runtime.api,
        rect: { x: sceneX, y: sceneY, width: sceneW, height: sceneH },
        mode: runtime.prefs.redactOpts.mode,
        strength: runtime.prefs.redactOpts.strength,
        selectResult: true,
      });
      if (!wasLocked) {
        runtime.api.setActiveTool({ type: 'selection' });
      }
      scheduleSync();
    } finally {
      runtime.isBusy = false;
    }
  };

  const onPointerCancel = (e: PointerEvent) => {
    if (dragState && e.pointerId === dragState.pointerId) {
      clearDrag();
    }
  };

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerCancel, true);

  return () => {
    clearDrag();
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', onPointerCancel, true);
  };
}
