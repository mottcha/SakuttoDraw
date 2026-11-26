import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import * as actions from '../annotator/quickAnnotator/actions';
import {
  installCtrlMultiSelectGuard,
  installFastLoadSaveInterceptor,
  installPrimaryToolRestoreGuard,
  installTextAutoResizeGuard,
} from '../annotator/quickAnnotator/guards';
import { attachExcalidrawAPI } from '../annotator/quickAnnotator/runtime';
import { resetDomAndRuntime } from './testHelpers';

describe('event guards (textAutoResize, touch WYSIWYG, Ctrl multi-select, fast load/save)', () => {
  beforeEach(() => {
    resetDomAndRuntime();
  });

  it('guards pointermove and pins pointerup coordinates even when activeTool switches to selection on pointerdown', () => {
    let activeType = 'text';
    attachExcalidrawAPI({
      getAppState: () => ({ activeTool: { type: activeType } }),
    } as unknown as ExcalidrawImperativeAPI);

    const canvas = document.createElement('canvas');
    canvas.className = 'excalidraw__canvas interactive';
    document.body.append(canvas);

    const cleanup = installTextAutoResizeGuard();
    const moveListener = vi.fn();
    let seenUpCoords: { x: number; y: number } | null = null;
    window.addEventListener('pointermove', moveListener);
    window.addEventListener('pointerup', (e) => {
      seenUpCoords = { x: e.clientX, y: e.clientY };
    });

    try {
      const downEvt = new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 120, clientY: 200 });
      Object.defineProperty(downEvt, 'pointerId', { value: 1 });
      canvas.dispatchEvent(downEvt);

      activeType = 'selection';

      const moveEvt = new MouseEvent('pointermove', { bubbles: true, button: 0, clientX: 350, clientY: 220 });
      Object.defineProperty(moveEvt, 'pointerId', { value: 1 });
      canvas.dispatchEvent(moveEvt);

      const upEvt = new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 350, clientY: 220 });
      Object.defineProperty(upEvt, 'pointerId', { value: 1 });
      canvas.dispatchEvent(upEvt);

      expect(moveListener).not.toHaveBeenCalled();
      expect(seenUpCoords).toEqual({ x: 120, y: 200 });
    } finally {
      cleanup();
      window.removeEventListener('pointermove', moveListener);
    }
  });

  it('resets textAutoResize downPos on window.blur so subsequent gestures are not hijacked', () => {
    attachExcalidrawAPI({
      getAppState: () => ({ activeTool: { type: 'text' } }),
    } as unknown as ExcalidrawImperativeAPI);

    const canvas = document.createElement('canvas');
    canvas.className = 'excalidraw__canvas interactive';
    document.body.append(canvas);

    const cleanup = installTextAutoResizeGuard();
    const moveListener = vi.fn();
    window.addEventListener('pointermove', moveListener);
    try {
      const downEvt = new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, clientY: 100 });
      Object.defineProperty(downEvt, 'pointerId', { value: 9 });
      canvas.dispatchEvent(downEvt);

      window.dispatchEvent(new Event('blur'));

      const moveEvt = new MouseEvent('pointermove', { bubbles: true, button: 0, clientX: 250, clientY: 250 });
      Object.defineProperty(moveEvt, 'pointerId', { value: 9 });
      canvas.dispatchEvent(moveEvt);

      expect(moveListener).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
      window.removeEventListener('pointermove', moveListener);
    }
  });

  it('skips pointermove blocking on touch text input and synchronously focuses textarea.excalidraw-wysiwyg on pointerup', () => {
    let activeType = 'text';
    attachExcalidrawAPI({
      getAppState: () => ({ activeTool: { type: activeType } }),
    } as unknown as ExcalidrawImperativeAPI);

    const canvas = document.createElement('canvas');
    canvas.className = 'excalidraw__canvas interactive';
    document.body.append(canvas);

    const cleanup = installTextAutoResizeGuard();
    const moveListener = vi.fn();
    let seenUpCoords: { x: number; y: number } | null = null;
    let wysiwyg: HTMLTextAreaElement | null = null;

    const onCanvasPointerDown = () => {
      activeType = 'selection';
      const excalidrawUp = (e: Event) => {
        window.removeEventListener('pointerup', excalidrawUp);
        const pe = e as PointerEvent;
        seenUpCoords = { x: pe.clientX, y: pe.clientY };
        wysiwyg = document.createElement('textarea');
        wysiwyg.className = 'excalidraw-wysiwyg';
        document.body.append(wysiwyg);
      };
      window.addEventListener('pointerup', excalidrawUp);
    };
    canvas.addEventListener('pointerdown', onCanvasPointerDown);
    window.addEventListener('pointermove', moveListener);

    try {
      const downEvt = new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 80, clientY: 140 });
      Object.defineProperty(downEvt, 'pointerId', { value: 7 });
      Object.defineProperty(downEvt, 'pointerType', { value: 'touch' });
      canvas.dispatchEvent(downEvt);

      const moveEvt = new MouseEvent('pointermove', { bubbles: true, button: 0, clientX: 110, clientY: 145 });
      Object.defineProperty(moveEvt, 'pointerId', { value: 7 });
      Object.defineProperty(moveEvt, 'pointerType', { value: 'touch' });
      canvas.dispatchEvent(moveEvt);

      const upEvt = new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 110, clientY: 145 });
      Object.defineProperty(upEvt, 'pointerId', { value: 7 });
      Object.defineProperty(upEvt, 'pointerType', { value: 'touch' });
      canvas.dispatchEvent(upEvt);

      expect(moveListener).toHaveBeenCalledTimes(1);
      expect(seenUpCoords).toEqual({ x: 110, y: 145 });
      expect(wysiwyg).toBeTruthy();
      expect(document.activeElement).toBe(wysiwyg);
    } finally {
      cleanup();
      canvas.removeEventListener('pointerdown', onCanvasPointerDown);
      window.removeEventListener('pointermove', moveListener);
    }
  });

  it('removes hidden file input from DOM when fast-load file picker is cancelled', () => {
    attachExcalidrawAPI({
      getAppState: () => ({}),
    } as unknown as ExcalidrawImperativeAPI);

    const loadBtn = document.createElement('button');
    loadBtn.setAttribute('data-testid', 'load-button');
    document.body.append(loadBtn);

    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const cleanup = installFastLoadSaveInterceptor();
    try {
      loadBtn.click();
      const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
      expect(fileInput).toBeTruthy();
      fileInput!.dispatchEvent(new Event('cancel'));
      expect(document.querySelector('input[type="file"]')).toBeNull();
    } finally {
      cleanup();
      clickSpy.mockRestore();
    }
  });

  it('remaps Ctrl+pointer to Shift+pointer across down/move/up when selection tool is active', () => {
    attachExcalidrawAPI({
      getAppState: () => ({
        activeTool: { type: 'selection' },
        viewModeEnabled: false,
        editingTextElement: null,
        croppingElementId: null,
        selectedLinearElement: null,
      }),
    } as unknown as ExcalidrawImperativeAPI);

    const canvas = document.createElement('canvas');
    canvas.className = 'excalidraw__canvas interactive';
    document.body.append(canvas);

    const cleanup = installCtrlMultiSelectGuard();
    const seen: Array<{ type: string; ctrlKey: boolean; shiftKey: boolean }> = [];
    const record = (e: Event) => {
      const me = e as MouseEvent;
      seen.push({ type: e.type, ctrlKey: me.ctrlKey, shiftKey: me.shiftKey });
    };
    window.addEventListener('pointerdown', record);
    window.addEventListener('pointermove', record);
    window.addEventListener('pointerup', record);

    try {
      const downEvt = new MouseEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true, shiftKey: false });
      Object.defineProperty(downEvt, 'pointerId', { value: 11 });
      canvas.dispatchEvent(downEvt);

      const moveEvt = new MouseEvent('pointermove', { bubbles: true, button: 0, ctrlKey: true, shiftKey: false });
      Object.defineProperty(moveEvt, 'pointerId', { value: 11 });
      canvas.dispatchEvent(moveEvt);

      const upEvt = new MouseEvent('pointerup', { bubbles: true, button: 0, ctrlKey: true, shiftKey: false });
      Object.defineProperty(upEvt, 'pointerId', { value: 11 });
      canvas.dispatchEvent(upEvt);

      expect(seen).toEqual([
        { type: 'pointerdown', ctrlKey: false, shiftKey: true },
        { type: 'pointermove', ctrlKey: false, shiftKey: true },
        { type: 'pointerup', ctrlKey: false, shiftKey: true },
      ]);
    } finally {
      cleanup();
      window.removeEventListener('pointerdown', record);
      window.removeEventListener('pointermove', record);
      window.removeEventListener('pointerup', record);
    }
  });

  it('remaps Cmd+pointer (metaKey) to Shift+pointer on macOS', () => {
    const platformSpy = vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    attachExcalidrawAPI({
      getAppState: () => ({
        activeTool: { type: 'selection' },
        viewModeEnabled: false,
        editingTextElement: null,
        croppingElementId: null,
        selectedLinearElement: null,
      }),
    } as unknown as ExcalidrawImperativeAPI);

    const canvas = document.createElement('canvas');
    canvas.className = 'excalidraw__canvas interactive';
    document.body.append(canvas);

    const cleanup = installCtrlMultiSelectGuard();
    const seen: Array<{ type: string; metaKey: boolean; shiftKey: boolean }> = [];
    const record = (e: Event) => {
      const me = e as MouseEvent;
      seen.push({ type: e.type, metaKey: me.metaKey, shiftKey: me.shiftKey });
    };
    window.addEventListener('pointerdown', record);
    window.addEventListener('pointerup', record);

    try {
      const downEvt = new MouseEvent('pointerdown', { bubbles: true, button: 0, metaKey: true, shiftKey: false });
      Object.defineProperty(downEvt, 'pointerId', { value: 31 });
      canvas.dispatchEvent(downEvt);

      const upEvt = new MouseEvent('pointerup', { bubbles: true, button: 0, metaKey: true, shiftKey: false });
      Object.defineProperty(upEvt, 'pointerId', { value: 31 });
      canvas.dispatchEvent(upEvt);

      expect(seen).toEqual([
        { type: 'pointerdown', metaKey: false, shiftKey: true },
        { type: 'pointerup', metaKey: false, shiftKey: true },
      ]);
    } finally {
      cleanup();
      window.removeEventListener('pointerdown', record);
      window.removeEventListener('pointerup', record);
      platformSpy.mockRestore();
    }
  });

  it('preserves Alt+Ctrl lasso, non-selection tools, line-editor mode, and Ctrl release mid-gesture', () => {
    let appState: Record<string, unknown> = {
      activeTool: { type: 'selection' },
      viewModeEnabled: false,
      editingTextElement: null,
      croppingElementId: null,
      selectedLinearElement: null,
    };
    attachExcalidrawAPI({
      getAppState: () => appState,
    } as unknown as ExcalidrawImperativeAPI);

    const canvas = document.createElement('canvas');
    canvas.className = 'excalidraw__canvas interactive';
    document.body.append(canvas);

    const cleanup = installCtrlMultiSelectGuard();
    const seen: Array<{ type: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = [];
    const record = (e: Event) => {
      const me = e as MouseEvent;
      seen.push({ type: e.type, ctrlKey: me.ctrlKey, shiftKey: me.shiftKey, altKey: me.altKey });
    };
    window.addEventListener('pointerdown', record);
    window.addEventListener('pointerup', record);

    try {
      const altCtrlDown = new MouseEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true, altKey: true });
      Object.defineProperty(altCtrlDown, 'pointerId', { value: 21 });
      canvas.dispatchEvent(altCtrlDown);

      appState = { ...appState, activeTool: { type: 'rectangle' } };
      const rectDown = new MouseEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true });
      Object.defineProperty(rectDown, 'pointerId', { value: 22 });
      canvas.dispatchEvent(rectDown);

      appState = { ...appState, activeTool: { type: 'selection' }, selectedLinearElement: { isEditing: true } };
      const lineEditDown = new MouseEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true });
      Object.defineProperty(lineEditDown, 'pointerId', { value: 23 });
      canvas.dispatchEvent(lineEditDown);

      appState = { ...appState, selectedLinearElement: null };
      const startDown = new MouseEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true });
      Object.defineProperty(startDown, 'pointerId', { value: 24 });
      canvas.dispatchEvent(startDown);
      const releasedUp = new MouseEvent('pointerup', { bubbles: true, button: 0, ctrlKey: false, shiftKey: false });
      Object.defineProperty(releasedUp, 'pointerId', { value: 24 });
      canvas.dispatchEvent(releasedUp);

      expect(seen).toEqual([
        { type: 'pointerdown', ctrlKey: true, shiftKey: false, altKey: true },
        { type: 'pointerdown', ctrlKey: true, shiftKey: false, altKey: false },
        { type: 'pointerdown', ctrlKey: true, shiftKey: false, altKey: false },
        { type: 'pointerdown', ctrlKey: false, shiftKey: true, altKey: false },
        { type: 'pointerup', ctrlKey: false, shiftKey: false, altKey: false },
      ]);
    } finally {
      cleanup();
      window.removeEventListener('pointerdown', record);
      window.removeEventListener('pointerup', record);
    }
  });

  it('intercepts Ctrl/Cmd+Shift+E to run CSP-safe Sakutto image export', () => {
    attachExcalidrawAPI({
      getAppState: () => ({}),
    } as unknown as ExcalidrawImperativeAPI);
    const exportSpy = vi
      .spyOn(actions, 'runInstantExport')
      .mockResolvedValue({ ok: true, mode: 'save', format: 'png' });
    const cleanup = installFastLoadSaveInterceptor();
    try {
      const evt = new KeyboardEvent('keydown', {
        key: 'E',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(evt);
      expect(evt.defaultPrevented).toBe(true);
      expect(exportSpy).toHaveBeenCalledWith('save');

      exportSpy.mockClear();
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'e',
          ctrlKey: true,
          shiftKey: true,
          repeat: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      expect(exportSpy).not.toHaveBeenCalled();
    } finally {
      cleanup();
      exportSpy.mockRestore();
    }
  });

  it('unlocks textAutoResize guard when pointermove reports buttons === 0 and restores subtool after draw', () => {
    vi.useFakeTimers();
    try {
      const setActiveTool = vi.fn();
      let activeType = 'text';
      attachExcalidrawAPI({
        getAppState: () => ({ activeTool: { type: activeType, locked: false } }),
        setActiveTool,
      } as unknown as ExcalidrawImperativeAPI);

      const canvas = document.createElement('canvas');
      canvas.className = 'excalidraw__canvas interactive';
      document.body.append(canvas);

      const cleanupText = installTextAutoResizeGuard();
      const cleanupRestore = installPrimaryToolRestoreGuard();
      const moveListener = vi.fn();
      window.addEventListener('pointermove', moveListener);
      try {
        const downEvt = new MouseEvent('pointerdown', {
          bubbles: true,
          button: 0,
          buttons: 1,
          clientX: 40,
          clientY: 50,
        });
        Object.defineProperty(downEvt, 'pointerId', { value: 3 });
        canvas.dispatchEvent(downEvt);

        const releasedMove = new MouseEvent('pointermove', {
          bubbles: true,
          button: 0,
          buttons: 0,
          clientX: 90,
          clientY: 90,
        });
        Object.defineProperty(releasedMove, 'pointerId', { value: 3 });
        Object.defineProperty(releasedMove, 'pointerType', { value: 'mouse' });
        canvas.dispatchEvent(releasedMove);
        expect(moveListener).toHaveBeenCalledTimes(1);

        activeType = 'selection';
        const freedrawBtn = document.createElement('button');
        freedrawBtn.setAttribute('data-testid', 'toolbar-freedraw');
        const stack = document.createElement('div');
        stack.className = 'Stack_horizontal';
        stack.append(freedrawBtn);
        const toolbar = document.createElement('div');
        toolbar.className = 'App-toolbar';
        toolbar.append(stack);
        document.body.append(toolbar);
        freedrawBtn.click();

        vi.advanceTimersByTime(30);
        expect(setActiveTool).toHaveBeenCalledWith({ type: 'freedraw' });
      } finally {
        cleanupText();
        cleanupRestore();
        window.removeEventListener('pointermove', moveListener);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
