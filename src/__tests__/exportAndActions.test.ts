import { describe, expect, it, vi } from 'vitest';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import * as excalidraw from '@excalidraw/excalidraw';
import {
  applyCanvasBackgroundWithApi,
  formatLocalTimestamp,
  isUntitledExcalidrawName,
  resolveExportFilename,
  resolveProjectFilename,
  runDirectDiskSaveWithApi,
  runDirectFileLoadWithApi,
  runInstantExportWithApi,
  runInstantResetWithApi,
  sanitizeFileBaseName,
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
      expect(prefs.exportOpts.background).toBe(false);
      expect(prefs.exportOpts.padding).toBe(false);

      const copyDefault = await runInstantExportWithApi(mockApi, 'copy', prefs.exportOpts, {
        lang: 'ja-JP',
        preferJpFont: true,
      });
      expect(copyDefault.ok).toBe(true);
      expect(clipSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            canvasBackgroundColor: false,
            padding: 0,
            scale: expect.any(Function),
          }),
        }),
      );
      const copyScaleFn = clipSpy.mock.calls[0]?.[0]?.config?.scale as (w: number, h: number) => number;
      expect(copyScaleFn(600, 400)).toBe(2);

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
        { ...prefs.exportOpts, format: 'png', padding: true, background: true },
        { lang: 'en', preferJpFont: false },
      );
      expect(savePngPadded.ok).toBe(true);
      expect(sceneSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'png',
          config: expect.objectContaining({
            padding: 10,
            canvasBackgroundColor: '#ffffff',
            scale: expect.any(Function),
          }),
        }),
      );
      const pngConfig = sceneSpy.mock.calls[1]?.[0]?.config as { scale?: (w: number, h: number) => number };
      expect(pngConfig.scale?.(600, 400)).toBe(2);
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

  it('resolves sakutto-YYYY-MM-DD-HHmmss filenames for untitled canvases and preserves named document bases without double timestamps', () => {
    const fixedDate = new Date(2026, 10, 28, 1, 23, 45);
    expect(formatLocalTimestamp(fixedDate)).toBe('2026-11-28-012345');

    expect(isUntitledExcalidrawName('')).toBe(true);
    expect(isUntitledExcalidrawName('Untitled-2026-11-28-0100')).toBe(true);
    expect(isUntitledExcalidrawName('無題-2026-11-28-0100')).toBe(true);
    expect(isUntitledExcalidrawName('未命名-2026-11-28-0100')).toBe(true);
    expect(isUntitledExcalidrawName('제목 없음-2026-11-28-0100')).toBe(true);
    expect(isUntitledExcalidrawName('memo')).toBe(false);

    const makeNamedApi = (name: string) =>
      ({ getName: () => name }) as unknown as ExcalidrawImperativeAPI;

    for (const untitled of ['', '無題-2026-11-28-0100', 'Untitled-2026-11-28-0100']) {
      const api = makeNamedApi(untitled);
      expect(resolveProjectFilename(api, fixedDate)).toBe('sakutto-2026-11-28-012345.excalidraw');
      expect(resolveExportFilename(api, 'png', fixedDate)).toBe('sakutto-2026-11-28-012345.png');
    }

    const memoApi = makeNamedApi('memo');
    expect(resolveProjectFilename(memoApi, fixedDate)).toBe('memo.excalidraw');
    expect(resolveExportFilename(memoApi, 'png', fixedDate)).toBe('memo-2026-11-28-012345.png');

    const prevTimestampApi = makeNamedApi('sakutto-2026-11-28-010000');
    expect(resolveProjectFilename(prevTimestampApi, fixedDate)).toBe('sakutto-2026-11-28-010000.excalidraw');
    expect(resolveExportFilename(prevTimestampApi, 'svg', fixedDate)).toBe('sakutto-2026-11-28-012345.svg');
  });

  it('handles OS save dialog for image export (PNG/SVG switch, cancel, write error, fallback) and syncs document name on load/save', async () => {
    const updateScene = vi.fn();
    let elements: Array<Record<string, unknown>> = [];
    const mockApi = {
      getSceneElements: () => elements,
      getAppState: () => ({ viewBackgroundColor: '#ffffff', selectedElementIds: {} }),
      getFiles: () => ({}),
      getName: () => '無題-2026-11-28-0100',
      updateScene,
      addFiles: vi.fn(),
    } as unknown as ExcalidrawImperativeAPI;

    const mockCanvas = {
      width: 640,
      height: 480,
      toBlob: vi.fn((cb: BlobCallback, mimeType?: string) => {
        cb(new Blob(['webp-bytes'], { type: mimeType || 'image/webp' }));
      }),
    };
    const sceneSpy = vi
      .spyOn(excalidraw, 'exportScene')
      .mockImplementation(async ({ type }) => {
        if (type === 'svg') {
          return document.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as SVGSVGElement;
        }
        if (type === 'canvas') {
          mockCanvas.width = 640;
          mockCanvas.height = 480;
          return mockCanvas as unknown as HTMLCanvasElement;
        }
        return new Blob(['png'], { type: 'image/png' });
      });

    const write = vi.fn(async () => {});
    const close = vi.fn(async () => {});
    const abort = vi.fn(async () => {});
    const showSaveFilePicker = vi.fn(async () => ({
      name: 'picked-diagram.svg',
      createWritable: async () => ({ write, close, abort }),
    }));
    const toastFn = vi.fn();
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-fallback');
    URL.revokeObjectURL = vi.fn();

    Object.defineProperty(globalThis, 'showSaveFilePicker', {
      value: showSaveFilePicker,
      configurable: true,
      writable: true,
    });

    try {
      const prefs = loadPrefs(localStorage);

      // Empty canvas skips showSaveFilePicker
      const emptyRes = await runInstantExportWithApi(mockApi, 'save', prefs.exportOpts, {
        lang: 'ja-JP',
        showToast: toastFn,
        showSaveDialog: true,
      });
      expect(emptyRes).toMatchObject({ ok: false, reason: 'empty-canvas' });
      expect(showSaveFilePicker).not.toHaveBeenCalled();

      elements = [{ id: 'r1', type: 'rectangle', isDeleted: false }];

      // Selecting .svg in OS picker when opts.format === 'png' switches output to SVG with skipInliningFonts: true
      toastFn.mockClear();
      const svgRes = await runInstantExportWithApi(mockApi, 'save', prefs.exportOpts, {
        lang: 'ja-JP',
        preferJpFont: true,
        showToast: toastFn,
        showSaveDialog: true,
      });
      expect(svgRes).toMatchObject({ ok: true, mode: 'save', format: 'svg' });
      expect(showSaveFilePicker).toHaveBeenCalledWith(
        expect.objectContaining({
          suggestedName: expect.stringMatching(/^sakutto-\d{4}-\d{2}-\d{2}-\d{6}\.png$/),
          types: [
            { description: 'PNG', accept: { 'image/png': ['.png'] } },
            { description: 'SVG', accept: { 'image/svg+xml': ['.svg'] } },
            { description: 'WebP', accept: { 'image/webp': ['.webp'] } },
          ],
        }),
      );
      expect(sceneSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'svg',
          config: expect.objectContaining({ skipInliningFonts: true }),
        }),
      );
      expect(write).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
      expect(toastFn).toHaveBeenCalledWith('キャンバス全体を保存しました');

      // Selecting .webp in OS picker encodes via canvas.toBlob('image/webp', 0.92) and releases canvas backing store
      expect(sanitizeFileBaseName('capture.webp')).toBe('capture');
      showSaveFilePicker.mockResolvedValueOnce({
        name: 'picked-shot.webp',
        createWritable: async () => ({ write, close, abort }),
      });
      sceneSpy.mockClear();
      mockCanvas.toBlob.mockClear();
      write.mockClear();
      const webpRes = await runInstantExportWithApi(mockApi, 'save', prefs.exportOpts, {
        lang: 'ja-JP',
        showToast: toastFn,
        showSaveDialog: true,
      });
      expect(webpRes).toMatchObject({ ok: true, mode: 'save', format: 'webp' });
      expect(sceneSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'canvas',
        }),
      );
      expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.92);
      expect(mockCanvas.width).toBe(0);
      expect(mockCanvas.height).toBe(0);
      expect(write).toHaveBeenCalledWith(expect.any(Blob));

      // Silent PNG fallback or null blob from canvas.toBlob rejects WebP export cleanly
      showSaveFilePicker.mockResolvedValueOnce({
        name: 'unsupported-shot.webp',
        createWritable: async () => ({ write, close, abort }),
      });
      mockCanvas.toBlob.mockImplementationOnce((cb: BlobCallback) => {
        cb(new Blob(['png-fallback'], { type: 'image/png' }));
      });
      toastFn.mockClear();
      const webpFailRes = await runInstantExportWithApi(mockApi, 'save', prefs.exportOpts, {
        lang: 'ja-JP',
        showToast: toastFn,
        showSaveDialog: true,
      });
      expect(webpFailRes).toEqual({ ok: false, reason: 'export-failed' });
      expect(mockCanvas.width).toBe(0);
      expect(mockCanvas.height).toBe(0);
      expect(toastFn).toHaveBeenCalledWith('保存に失敗しました');

      // AbortError cancels silently with zero toast calls
      const abortErr = Object.assign(new Error('Cancelled'), { name: 'AbortError' });
      showSaveFilePicker.mockRejectedValueOnce(abortErr);
      toastFn.mockClear();
      const cancelRes = await runInstantExportWithApi(mockApi, 'save', prefs.exportOpts, {
        lang: 'ja-JP',
        showToast: toastFn,
        showSaveDialog: true,
      });
      expect(cancelRes).toEqual({ ok: false, reason: 'cancelled' });
      expect(toastFn).not.toHaveBeenCalled();

      // Write error aborts writable and notifies failure
      write.mockRejectedValueOnce(new Error('Disk full'));
      toastFn.mockClear();
      const writeErrRes = await runInstantExportWithApi(mockApi, 'save', prefs.exportOpts, {
        lang: 'ja-JP',
        showToast: toastFn,
        showSaveDialog: true,
      });
      expect(writeErrRes).toEqual({ ok: false, reason: 'export-failed' });
      expect(abort).toHaveBeenCalledTimes(1);
      expect(toastFn).toHaveBeenCalledWith('保存に失敗しました');

      // Project save updates appState.name from handle.name
      updateScene.mockClear();
      showSaveFilePicker.mockResolvedValueOnce({
        name: 'architecture-notes.excalidraw',
        createWritable: async () => ({ write, close, abort }),
      });
      expect(await runDirectDiskSaveWithApi(mockApi, { lang: 'ja-JP', showToast: toastFn })).toBe(true);
      expect(updateScene).toHaveBeenCalledWith(
        expect.objectContaining({
          appState: { name: 'architecture-notes' },
        }),
      );

      // Missing showSaveFilePicker falls back to blob download
      delete (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker;
      sceneSpy.mockClear();
      const fallbackRes = await runInstantExportWithApi(mockApi, 'save', prefs.exportOpts, {
        lang: 'en',
        showToast: toastFn,
        showSaveDialog: true,
      });
      expect(fallbackRes).toMatchObject({ ok: true, mode: 'save', format: 'png' });
      expect(URL.createObjectURL).toHaveBeenCalled();

      // File load sets nextAppState.name from File.name
      const loadSpy = vi.spyOn(excalidraw, 'loadFromBlob').mockResolvedValueOnce({
        elements: [],
        appState: {},
        files: {},
      } as never);
      updateScene.mockClear();
      const file = new File(['{}'], 'roadmap.excalidraw', { type: 'application/json' });
      expect(await runDirectFileLoadWithApi(mockApi, file, { lang: 'en', showToast: toastFn })).toBe(true);
      expect(updateScene).toHaveBeenCalledWith(
        expect.objectContaining({
          appState: expect.objectContaining({ name: 'roadmap' }),
        }),
      );
      loadSpy.mockRestore();
    } finally {
      delete (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker;
      sceneSpy.mockRestore();
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    }
  });
});
