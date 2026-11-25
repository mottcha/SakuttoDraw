import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import {
  applyCanvasBackgroundWithApi,
  runDirectDiskSaveWithApi,
  runInstantResetWithApi,
} from '../annotator/apiActions';
import { filterTargetElementsForExport } from '../annotator/elementOps';
import { DEFAULT_PINK, loadPrefs } from '../services/storageBridge';

describe('apiActions & elementOps (direct API, nested selection, and color validation)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('filters selected elements including bound text and nested frame -> container -> bound text when onlySelected is true', () => {
    const elements = [
      { id: 'rect-1', type: 'rectangle', isDeleted: false, groupIds: [] },
      { id: 'text-bound', type: 'text', isDeleted: false, groupIds: [], containerId: 'rect-1' },
      { id: 'frame-1', type: 'frame', isDeleted: false, groupIds: [] },
      { id: 'rect-in-frame', type: 'rectangle', isDeleted: false, groupIds: [], frameId: 'frame-1' },
      { id: 'text-in-frame-rect', type: 'text', isDeleted: false, groupIds: [], containerId: 'rect-in-frame' },
      { id: 'other-el', type: 'ellipse', isDeleted: false, groupIds: [] },
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

  it('runs instant reset, background update (with hex validation), and direct disk save via excalidrawAPI', async () => {
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
    } as unknown as ExcalidrawImperativeAPI;

    const prefs = loadPrefs(localStorage);
    const res = await runInstantResetWithApi(mockApi, prefs, { storage: localStorage });
    expect(res.ok).toBe(true);
    expect(res.pinkApplied).toBe(true);
    expect(resetScene).toHaveBeenCalledTimes(1);
    expect(clearHistory).toHaveBeenCalledTimes(1);
    expect(updateScene).toHaveBeenCalledWith(
      expect.objectContaining({
        appState: { currentItemStrokeColor: DEFAULT_PINK },
      }),
    );

    const bgRes = await applyCanvasBackgroundWithApi(mockApi, '#fffce8', { storage: localStorage });
    expect(bgRes.ok).toBe(true);
    expect(bgRes.color).toBe('#fffce8');

    const invalidBgRes = await applyCanvasBackgroundWithApi(mockApi, 'not-a-color', { storage: localStorage });
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
    const showSaveFilePicker = vi.fn(async () => ({
      createWritable: async () => ({ write, close }),
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
    } finally {
      delete (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    }
  });
});
