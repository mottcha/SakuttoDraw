import { describe, expect, it, vi } from 'vitest';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import * as excalidraw from '@excalidraw/excalidraw';
import {
  applyCanvasBackgroundWithApi,
  runDirectDiskSaveWithApi,
  runDirectFileLoadWithApi,
  runInstantExportWithApi,
  runInstantResetWithApi,
} from '../annotator/apiActions';
import { filterTargetElementsForExport } from '../annotator/elementOps';
import { DEFAULT_PEN_COLOR, loadPrefs, prefsToAppStatePatch } from '../services/storageBridge';

describe('export filtering & apiActions', () => {
  it('filters selected shapes together with their bound text or frame descendants and falls back cleanly', () => {
    const elements = [
      { id: 'frame-1', type: 'frame', isDeleted: false },
      { id: 'rect-in-frame', type: 'rectangle', frameId: 'frame-1', isDeleted: false, boundElements: [{ id: 'text-in-frame-rect', type: 'text' }] },
      { id: 'text-in-frame-rect', type: 'text', containerId: 'rect-in-frame', isDeleted: false },
      { id: 'rect-1', type: 'rectangle', isDeleted: false, boundElements: [{ id: 'text-bound', type: 'text' }] },
      { id: 'text-bound', type: 'text', containerId: 'rect-1', isDeleted: false },
      { id: 'other-shape', type: 'ellipse', isDeleted: false },
      { id: 'deleted-el', type: 'rectangle', isDeleted: true },
    ] as never[];

    const selectedRes = filterTargetElementsForExport(
      elements,
      { selectedElementIds: { 'rect-1': true }, selectedGroupIds: {} },
      true,
    );
    expect(selectedRes.exportedOnlySelected).toBe(true);
    expect(selectedRes.elements.map((e) => e.id)).toEqual(['rect-1', 'text-bound']);

    const frameRes = filterTargetElementsForExport(
      elements,
      { selectedElementIds: { 'frame-1': true }, selectedGroupIds: {} },
      true,
    );
    expect(frameRes.exportedOnlySelected).toBe(true);
    expect(frameRes.elements.map((e) => e.id)).toEqual(['frame-1', 'rect-in-frame', 'text-in-frame-rect']);

    const unselectedFallback = filterTargetElementsForExport(
      elements,
      { selectedElementIds: {}, selectedGroupIds: {} },
      true,
    );
    expect(unselectedFallback.exportedOnlySelected).toBe(false);
    expect(unselectedFallback.elements.length).toBe(6);
  });

  it('passes padding: 0 by default and padding: 10 when enabled, plus skipInliningFonts and lang on SVG', async () => {
    const clipSpy = vi.spyOn(excalidraw, 'exportToClipboard').mockResolvedValue(undefined);
    const sceneSpy = vi
      .spyOn(excalidraw, 'exportScene')
      .mockImplementation(async ({ type }) => {
        if (type === 'svg') {
          return document.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as SVGSVGElement;
        }
        return new Blob(['png'], { type: 'image/png' });
      });
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-exp');
    URL.revokeObjectURL = vi.fn();

    try {
      const mockApi = {
        getSceneElements: () => [{ id: 'r1', type: 'rectangle', isDeleted: false }],
        getAppState: () => ({ viewBackgroundColor: '#ffffff', selectedElementIds: {} }),
        getFiles: () => ({}),
        getName: () => 'sample',
      } as unknown as ExcalidrawImperativeAPI;

      const prefs = loadPrefs(localStorage);
      expect(prefs.exportOpts.padding).toBe(false);

      const copyDefault = await runInstantExportWithApi(mockApi, 'copy', prefs.exportOpts, {
        lang: 'ja-JP',
        preferJpFont: true,
      });
      expect(copyDefault.ok).toBe(true);
      expect(clipSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ padding: 0, scale: 1 }),
        }),
      );

      const errSpy = vi.fn();
      const saveSvgPadded = await runInstantExportWithApi(
        mockApi,
        'save',
        { ...prefs.exportOpts, format: 'svg', padding: true, background: false },
        { lang: 'ja-JP', preferJpFont: true, showToast: errSpy },
      );
      expect(sceneSpy).toHaveBeenCalledTimes(1);
      expect(errSpy).toHaveBeenCalledWith('キャンバス全体を保存しました');
      expect(saveSvgPadded).toMatchObject({ ok: true });
      const svgConfig = sceneSpy.mock.calls[0]?.[0];
      expect(svgConfig).toEqual(
        expect.objectContaining({
          type: 'svg',
          config: expect.objectContaining({
            padding: 10,
            canvasBackgroundColor: false,
            skipInliningFonts: true,
          }),
        }),
      );
      const svgReturn = (await sceneSpy.mock.results[0]?.value) as SVGSVGElement;
      expect(svgReturn.getAttribute('lang')).toBe('ja-JP');

      const savePngPadded = await runInstantExportWithApi(
        mockApi,
        'save',
        { ...prefs.exportOpts, format: 'png', padding: true, scale: 2 },
        { lang: 'en', preferJpFont: false },
      );
      expect(savePngPadded.ok).toBe(true);
      expect(sceneSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'png',
          config: expect.objectContaining({ padding: 10, scale: 2 }),
        }),
      );
    } finally {
      clipSpy.mockRestore();
      sceneSpy.mockRestore();
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    }
  });

  it('runs instant reset restoring full prefs patch, background validation, and direct load/save with error abort', async () => {
    const resetScene = vi.fn();
    const updateScene = vi.fn();
    const clearHistory = vi.fn();
    const mockApi = {
      resetScene,
      updateScene,
      history: { clear: clearHistory },
      getSceneElements: () => [],
      getAppState: () => ({ viewBackgroundColor: '#ffffff' }),
      getFiles: () => ({}),
      getName: () => 'test-scene',
      addFiles: vi.fn(),
    } as unknown as ExcalidrawImperativeAPI;

    const prefs = loadPrefs(localStorage);
    prefs.boxSelectionMode = 'contain';
    prefs.inputDevice = 'mouse';
    const res = await runInstantResetWithApi(mockApi, prefs, { storage: localStorage });
    expect(res.ok).toBe(true);
    expect(resetScene).toHaveBeenCalledTimes(1);
    expect(clearHistory).toHaveBeenCalledTimes(1);
    expect(updateScene).toHaveBeenCalledWith(
      expect.objectContaining({
        appState: expect.objectContaining({
          ...prefsToAppStatePatch(prefs),
          currentItemStrokeColor: DEFAULT_PEN_COLOR,
        }),
      }),
    );

    const bgRes = applyCanvasBackgroundWithApi(mockApi, '#fffce8', { storage: localStorage });
    expect(bgRes.ok).toBe(true);
    expect(bgRes.color).toBe('#fffce8');

    const invalidBgRes = applyCanvasBackgroundWithApi(mockApi, 'not-a-color', { storage: localStorage });
    expect(invalidBgRes.ok).toBe(true);
    expect(invalidBgRes.color).toBe('#ffffff');

    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
    try {
      expect(await runDirectDiskSaveWithApi(mockApi)).toBe(true);
    } finally {
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    }

    const write = vi.fn(async () => {});
    const close = vi.fn(async () => {});
    const abort = vi.fn(async () => {});
    const showSaveFilePicker = vi.fn(async () => ({
      createWritable: async () => ({ write, close, abort }),
    }));
    const toastFn = vi.fn();
    Object.defineProperty(globalThis, 'showSaveFilePicker', {
      value: showSaveFilePicker,
      configurable: true,
      writable: true,
    });
    try {
      expect(await runDirectDiskSaveWithApi(mockApi, { lang: 'ja-JP', showToast: toastFn })).toBe(true);
      expect(showSaveFilePicker).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
      expect(toastFn).toHaveBeenCalledTimes(1);

      const abortErr = Object.assign(new Error('Cancelled'), { name: 'AbortError' });
      showSaveFilePicker.mockRejectedValueOnce(abortErr);
      toastFn.mockClear();
      expect(await runDirectDiskSaveWithApi(mockApi, { lang: 'ja-JP', showToast: toastFn })).toBe(false);
      expect(toastFn).not.toHaveBeenCalled();

      write.mockRejectedValueOnce(new Error('Disk full'));
      URL.createObjectURL = vi.fn(() => 'blob:fallback');
      URL.revokeObjectURL = vi.fn();
      toastFn.mockClear();
      expect(await runDirectDiskSaveWithApi(mockApi, { lang: 'ja-JP', showToast: toastFn })).toBe(false);
      expect(abort).toHaveBeenCalledTimes(1);
      expect(toastFn).toHaveBeenCalledTimes(1);
    } finally {
      delete (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker;
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    }

    const loadSpy = vi.spyOn(excalidraw, 'loadFromBlob').mockRejectedValueOnce(new Error('Invalid file'));
    const toastErr = vi.fn();
    try {
      updateScene.mockClear();
      const loadedOk = await runDirectFileLoadWithApi(mockApi, new Blob(['bad']), {
        lang: 'ja-JP',
        showToast: toastErr,
      });
      expect(loadedOk).toBe(false);
      expect(updateScene).not.toHaveBeenCalled();
      expect(toastErr).toHaveBeenCalledTimes(1);
    } finally {
      loadSpy.mockRestore();
    }
  });
});
