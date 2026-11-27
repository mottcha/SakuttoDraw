// Event guards: text auto-resize, Ctrl multi-select, fast load/save, primary tool restore.
import {
  EXCALIDRAW_SELECTORS,
  EXCALIDRAW_TESTIDS,
  testIdSelector,
} from '../../excalidraw/domContract';
import { isMacPlatform, silently } from '../../utils/common';
import { runDirectDiskSaveWithApi, runDirectFileLoadWithApi } from '../apiActions';
import { runInstantExport, withBusyLock } from './actions';
import { isEditableFocused } from './dom';
import {
  focusActiveTextWysiwyg,
  isTextToolActive,
  runtime,
  sendEscape,
  showToast,
} from './runtime';

export function installTextAutoResizeGuard(): () => void {
  let downPos: { x: number; y: number; pointerId: number } | null = null;
  let touchTextPointerId: number | null = null;
  let pendingTouchCleanup: (() => void) | null = null;

  const clearPendingTouchFocus = () => {
    if (pendingTouchCleanup) {
      pendingTouchCleanup();
      pendingTouchCleanup = null;
    }
    touchTextPointerId = null;
  };

  const resetAllTextGuardState = () => {
    downPos = null;
    clearPendingTouchFocus();
  };

  const onPointerDownCapture = (e: PointerEvent) => {
    if (e.button !== 0 || e.altKey) return;
    if (!isTextToolActive()) return;
    if (!(e.target instanceof Element) || !e.target.matches(EXCALIDRAW_SELECTORS.interactiveCanvas)) return;

    // On touch devices, never swallow pointermove or rewrite pointerup coordinates;
    // instead arm a synchronous WYSIWYG focus assist on pointerup/touchend so mobile virtual keyboards reliably open.
    if (e.pointerType === 'touch') {
      if (e.isPrimary === false) return;
      clearPendingTouchFocus();
      touchTextPointerId = e.pointerId;
      return;
    }

    if (!runtime.prefs.quickOpts.textAutoResize) return;
    downPos = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  };

  // Bubble-phase pointerdown fires after React/Excalidraw registers its own window pointerup handler,
  // guaranteeing our one-shot bubble pointerup runs synchronously right after Excalidraw mounts textarea.excalidraw-wysiwyg.
  const onPointerDownBubble = (e: PointerEvent) => {
    if (touchTextPointerId === null || e.pointerId !== touchTextPointerId) return;
    const expectedPointerId = touchTextPointerId;
    const onTouchPointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== expectedPointerId) return;
      focusActiveTextWysiwyg();
      clearPendingTouchFocus();
    };
    const onTouchEnd = (te: TouchEvent) => {
      if (te.touches && te.touches.length > 0) return;
      focusActiveTextWysiwyg();
      clearPendingTouchFocus();
    };
    window.addEventListener('pointerup', onTouchPointerUp, false);
    window.addEventListener('touchend', onTouchEnd, false);
    pendingTouchCleanup = () => {
      window.removeEventListener('pointerup', onTouchPointerUp, false);
      window.removeEventListener('touchend', onTouchEnd, false);
    };
  };

  // Note: Excalidraw 0.18.0-next resets activeTool.type to "selection" immediately on pointerdown
  // when tool lock is OFF, so onPointerMove/onPointerUp must rely on `downPos` rather than re-checking isTextToolActive().
  const onPointerMove = (e: PointerEvent) => {
    if (!downPos || e.pointerId !== downPos.pointerId) return;
    if (
      !runtime.prefs.quickOpts.textAutoResize ||
      e.altKey ||
      ((e.pointerType === 'mouse' || e.pointerType === 'pen') && (e.buttons & 1) === 0)
    ) {
      downPos = null;
      return;
    }
    e.stopImmediatePropagation();
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!downPos || e.pointerId !== downPos.pointerId) return;
    const pos = downPos;
    downPos = null;
    if (!runtime.prefs.quickOpts.textAutoResize || e.altKey) return;
    silently(() => Object.defineProperty(e, 'clientX', { value: pos.x, configurable: true }));
    silently(() => Object.defineProperty(e, 'clientY', { value: pos.y, configurable: true }));
  };

  const onPointerCancel = (e: PointerEvent) => {
    if (downPos && e.pointerId === downPos.pointerId) {
      downPos = null;
    }
    if (touchTextPointerId !== null && e.pointerId === touchTextPointerId) {
      clearPendingTouchFocus();
    }
  };

  window.addEventListener('pointerdown', onPointerDownCapture, true);
  window.addEventListener('pointerdown', onPointerDownBubble, false);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerCancel, true);
  window.addEventListener('blur', resetAllTextGuardState);

  return () => {
    resetAllTextGuardState();
    window.removeEventListener('pointerdown', onPointerDownCapture, true);
    window.removeEventListener('pointerdown', onPointerDownBubble, false);
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', onPointerCancel, true);
    window.removeEventListener('blur', resetAllTextGuardState);
  };
}

/* ================= Ctrl+Click Multi-Select Guard ================= */
function isSelectionToolActive(): boolean {
  if (!runtime.api) return false;
  return silently(() => runtime.api?.getAppState()?.activeTool?.type) === 'selection';
}

function remapCtrlToShift(e: PointerEvent, isMac: boolean): void {
  if (isMac) {
    silently(() => Object.defineProperty(e, 'metaKey', { value: false, configurable: true }));
  } else {
    silently(() => Object.defineProperty(e, 'ctrlKey', { value: false, configurable: true }));
  }
  silently(() => Object.defineProperty(e, 'shiftKey', { value: true, configurable: true }));
}

/**
 * Maps Ctrl+pointer (or Cmd+pointer on macOS) on the selection canvas to Shift+pointer
 * so Ctrl+click on shapes performs Excalidraw's toggle multi-select instead of deep single-select.
 */
export function installCtrlMultiSelectGuard(): () => void {
  let activePointerId: number | null = null;

  const onPointerDownCapture = (e: PointerEvent) => {
    if (e.button !== 0 || e.altKey) return;
    const isMac = isMacPlatform();
    if (!(isMac ? e.metaKey : e.ctrlKey)) return;
    if (!(e.target instanceof Element) || !e.target.matches(EXCALIDRAW_SELECTORS.interactiveCanvas)) return;
    if (!isSelectionToolActive()) return;

    const st = silently(() => runtime.api?.getAppState());
    if (
      st &&
      (st.viewModeEnabled ||
        st.editingTextElement ||
        st.croppingElementId ||
        st.selectedLinearElement?.isEditing)
    ) {
      return;
    }

    activePointerId = e.pointerId;
    remapCtrlToShift(e, isMac);
  };

  const onPointerMoveCapture = (e: PointerEvent) => {
    if (activePointerId === null || e.pointerId !== activePointerId) return;
    const isMac = isMacPlatform();
    if (!e.altKey && (isMac ? e.metaKey : e.ctrlKey)) {
      remapCtrlToShift(e, isMac);
    }
  };

  const onPointerUpCapture = (e: PointerEvent) => {
    if (activePointerId === null || e.pointerId !== activePointerId) return;
    activePointerId = null;
    const isMac = isMacPlatform();
    if (!e.altKey && (isMac ? e.metaKey : e.ctrlKey)) {
      remapCtrlToShift(e, isMac);
    }
  };

  const onPointerCancelCapture = (e: PointerEvent) => {
    if (activePointerId !== null && e.pointerId === activePointerId) {
      activePointerId = null;
    }
  };

  const onWindowBlur = () => {
    activePointerId = null;
  };

  window.addEventListener('pointerdown', onPointerDownCapture, true);
  window.addEventListener('pointermove', onPointerMoveCapture, true);
  window.addEventListener('pointerup', onPointerUpCapture, true);
  window.addEventListener('pointercancel', onPointerCancelCapture, true);
  window.addEventListener('blur', onWindowBlur);

  return () => {
    activePointerId = null;
    window.removeEventListener('pointerdown', onPointerDownCapture, true);
    window.removeEventListener('pointermove', onPointerMoveCapture, true);
    window.removeEventListener('pointerup', onPointerUpCapture, true);
    window.removeEventListener('pointercancel', onPointerCancelCapture, true);
    window.removeEventListener('blur', onWindowBlur);
  };
}

/* ================= Direct API Fast Load, Fast Save & Export Interceptor ================= */
function pruneStaleFileInputs(): void {
  document.querySelectorAll('input[type="file"][data-exq-fast-load="1"]').forEach((node) => {
    node.remove();
  });
}

function openFilePickerForFastLoad(): void {
  pruneStaleFileInputs();
  const input = document.createElement('input');
  input.type = 'file';
  input.setAttribute('data-exq-fast-load', '1');
  input.accept = '.excalidraw,.json,application/json,image/png,image/svg+xml';
  input.style.display = 'none';
  input.addEventListener(
    'change',
    async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      await withBusyLock(
        null,
        () =>
          runDirectFileLoadWithApi(runtime.api, file, {
            lang: runtime.prefs.lang,
            showToast,
            defaultPenColor: runtime.prefs.quickOpts.defaultPenColor,
          }),
        false,
      );
    },
    { once: true },
  );
  input.addEventListener('cancel', () => input.remove(), { once: true });
  document.body?.append(input);
  input.click();
}

export function installFastLoadSaveInterceptor(): () => void {
  const loadSel = testIdSelector(EXCALIDRAW_TESTIDS.loadButton);
  const saveSel = testIdSelector(EXCALIDRAW_TESTIDS.jsonExport);

  const onClick = (e: MouseEvent) => {
    if (!runtime.prefs.quickOpts.fastLoadSave || runtime.isBusy || !runtime.api) return;
    if (!(e.target instanceof Element)) return;
    if (e.target.closest(loadSel)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      sendEscape();
      openFilePickerForFastLoad();
    } else if (e.target.closest(saveSel)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const api = runtime.api;
      // Invoke File System Access save picker in the synchronous user-gesture tick before dismissing menu
      void withBusyLock(
        null,
        () => runDirectDiskSaveWithApi(api, { lang: runtime.prefs.lang, showToast }),
        false,
      );
      sendEscape();
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat || e.isComposing || !runtime.api) return;
    const mod = e.ctrlKey || e.metaKey;

    // Intercept Excalidraw's Alt+Shift+C (copyAsPng) so clipboard export uses SakuttoDraw's preset & auto-scale
    if (!mod && e.altKey && e.shiftKey && e.code === 'KeyC' && !isEditableFocused()) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (!runtime.isBusy) {
        void runInstantExport('copy');
      }
      return;
    }

    if (!mod || e.altKey) return;
    const keyLower = e.key.toLowerCase();

    // Always intercept Ctrl/Cmd+Shift+E so Excalidraw's native export dialog (and WASM subsetter) never runs under strict CSP
    if (e.shiftKey && keyLower === 'e') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (!runtime.isBusy) {
        void runInstantExport('save');
      }
      return;
    }

    if (runtime.prefs.quickOpts.fastLoadSave && !runtime.isBusy && !e.shiftKey && keyLower === 'o') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      sendEscape();
      openFilePickerForFastLoad();
    }
  };

  window.addEventListener('click', onClick, true);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('focus', pruneStaleFileInputs);
  return () => {
    pruneStaleFileInputs();
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('focus', pruneStaleFileInputs);
  };
}

/* ================= Primary Tool Restore Guard ================= */
export function installPrimaryToolRestoreGuard(): () => void {
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

  const scheduleRestore = (fn: () => void) => {
    const id = setTimeout(() => {
      pendingTimers.delete(id);
      fn();
    }, 20);
    pendingTimers.add(id);
  };

  const onClick = (e: MouseEvent) => {
    if (runtime.isBusy || !runtime.api) return;
    if (!(e.target instanceof Element)) return;
    const tbBtn = e.target.closest(EXCALIDRAW_SELECTORS.toolbarPrimaryButton);
    if (!tbBtn) return;
    const tid = tbBtn.getAttribute('data-testid');
    if (tid === EXCALIDRAW_TESTIDS.freedraw) {
      scheduleRestore(() => {
        const curType = silently(() => runtime.api?.getAppState()?.activeTool?.type);
        if (runtime.api && curType === 'selection') {
          runtime.api.setActiveTool({ type: 'freedraw' });
        }
      });
    } else if (tid === EXCALIDRAW_TESTIDS.selection) {
      scheduleRestore(() => {
        const curType = silently(() => runtime.api?.getAppState()?.activeTool?.type);
        if (runtime.api && (curType === 'lasso' || curType === 'hand')) {
          runtime.api.setActiveTool({ type: 'selection' });
        }
      });
    }
  };

  window.addEventListener('click', onClick, true);
  return () => {
    for (const id of pendingTimers) clearTimeout(id);
    pendingTimers.clear();
    window.removeEventListener('click', onClick, true);
  };
}
