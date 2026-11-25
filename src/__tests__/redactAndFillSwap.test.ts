import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { REDACT_TOOL_CUSTOM_TYPE } from '../annotator/quickAnnotator/constants';
import {
  clearTempFillSnapshot,
  computeSwappedStrokeFill,
  restoreTempFillIfToolChanged,
  syncStylesPanelColorSwap,
  toggleFillOrSwapColorsWithApi,
} from '../annotator/quickAnnotator/fillSwap';
import { syncUI } from '../annotator/quickAnnotator/index';
import { installRedactDragController } from '../annotator/quickAnnotator/redactDrag';
import { applyLanguage, attachExcalidrawAPI, runtime } from '../annotator/quickAnnotator/runtime';
import {
  clearRedactStyleIsolationState,
  createOrUpdateRedactElement,
  getRedactMeta,
  isRedactElement,
  resetRedactStyleIsolationForTests,
  syncRedactStyleIsolation,
  updateRedactElementsColor,
  updateRedactStyleIsolationPenColor,
} from '../annotator/redactProcessor';
import { CustomSettingsVisualPanel } from '../components/CustomSettingsPanel';
import { SakuttoRedactPanel } from '../components/SakuttoRedactPanel';
import { loadPrefs, savePrefs } from '../services/storageBridge';
import { resetDomAndRuntime } from './testHelpers';

describe('CustomSettings, Stroke-Fill Swap, and Blackout/Redact Tool', () => {
  beforeEach(() => {
    resetDomAndRuntime();
    void syncUI;
  });

  it('renders CustomSettingsVisualPanel with 4 icon-badged behavior toggles, pen swatches, and bg swatches', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(CustomSettingsVisualPanel, { lang: 'ja-JP' }));
    });

    expect(host.querySelectorAll('[data-exq-quick-opt]').length).toBe(4);
    expect(host.querySelectorAll('.exq-custom-toggle-icon svg').length).toBe(4);
    expect(host.querySelectorAll('[data-exq-pen-color]').length).toBe(6);
    expect(host.querySelectorAll('[data-exq-bg-color]').length).toBe(5);

    const fastSaveBtn = host.querySelector<HTMLButtonElement>('[data-exq-quick-opt="fastLoadSave"]');
    expect(fastSaveBtn?.classList.contains('exq-on')).toBe(true);
    await act(async () => {
      fastSaveBtn?.parentElement?.click();
    });
    expect(runtime.prefs.quickOpts.fastLoadSave).toBe(false);
    await act(async () => {
      root.unmount();
    });
  });

  it('scopes fill swap to shapes, preserves pen/text global colors, and auto-restores on tool switch', () => {
    clearTempFillSnapshot();
    expect(
      computeSwappedStrokeFill({
        strokeColor: '#c2255c',
        backgroundColor: 'transparent',
        fillStyle: 'hachure',
      }),
    ).toEqual({
      strokeColor: 'transparent',
      backgroundColor: '#c2255c',
      fillStyle: 'solid',
    });

    expect(
      computeSwappedStrokeFill({
        strokeColor: 'transparent',
        backgroundColor: '#1971c2',
        fillStyle: 'solid',
      }),
    ).toEqual({
      strokeColor: '#1971c2',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
    });

    let captured: { elements?: unknown[]; appState?: Record<string, unknown> } | null = null;
    const elements = [
      {
        id: 'rect-1',
        type: 'rectangle',
        strokeColor: '#c2255c',
        backgroundColor: 'transparent',
        fillStyle: 'hachure',
        version: 1,
        versionNonce: 10,
        updated: 1,
        isDeleted: false,
      },
      {
        id: 'text-1',
        type: 'text',
        strokeColor: '#c2255c',
        backgroundColor: 'transparent',
        fillStyle: 'hachure',
        version: 1,
        versionNonce: 11,
        updated: 1,
        isDeleted: false,
      },
      {
        id: 'redact-1',
        type: 'rectangle',
        strokeColor: 'transparent',
        backgroundColor: '#111111',
        fillStyle: 'solid',
        customData: { sakuttoRedact: { v: 1, color: '#111111' } },
        version: 1,
        versionNonce: 12,
        updated: 1,
        isDeleted: false,
      },
    ];
    const mockEditApi = {
      getAppState: () => ({
        selectedElementIds: { 'rect-1': true, 'text-1': true, 'redact-1': true },
        activeTool: { type: 'selection' },
        currentItemStrokeColor: '#c2255c',
        currentItemBackgroundColor: 'transparent',
      }),
      getSceneElements: () => elements,
      updateScene: (arg: { elements?: unknown[]; appState?: Record<string, unknown> }) => {
        captured = arg;
      },
    } as unknown as ExcalidrawImperativeAPI;

    expect(toggleFillOrSwapColorsWithApi(mockEditApi, { lang: 'ja-JP' })).toBe(true);
    const updated = captured!.elements as Array<{ id: string; strokeColor: string; backgroundColor: string; fillStyle: string }>;
    expect(updated[0].strokeColor).toBe('transparent');
    expect(updated[0].backgroundColor).toBe('#c2255c');
    expect(updated[0].fillStyle).toBe('solid');
    expect(updated[1].strokeColor).toBe('#c2255c');
    expect(updated[2].backgroundColor).toBe('#111111');
    expect(captured!.appState).toBeUndefined();

    let toolState: {
      activeTool: { type: string };
      selectedElementIds: Record<string, boolean>;
      currentItemStrokeColor: string;
      currentItemBackgroundColor: string;
      currentItemFillStyle: string;
    } = {
      activeTool: { type: 'rectangle' },
      selectedElementIds: {},
      currentItemStrokeColor: '#c2255c',
      currentItemBackgroundColor: 'transparent',
      currentItemFillStyle: 'hachure',
    };
    const mockToolApi = {
      getAppState: () => toolState,
      getSceneElements: () => [],
      updateScene: (arg: { appState?: Record<string, unknown> }) => {
        if (arg.appState) {
          toolState = { ...toolState, ...arg.appState };
        }
      },
    } as unknown as ExcalidrawImperativeAPI;

    expect(toggleFillOrSwapColorsWithApi(mockToolApi, { lang: 'ja-JP' })).toBe(true);
    expect(toolState.currentItemStrokeColor).toBe('transparent');
    expect(toolState.currentItemBackgroundColor).toBe('#c2255c');
    expect(toolState.currentItemFillStyle).toBe('solid');

    toolState = { ...toolState, activeTool: { type: 'ellipse' } };
    expect(restoreTempFillIfToolChanged(mockToolApi, toolState)).toBe(false);
    expect(toolState.currentItemStrokeColor).toBe('transparent');

    toolState = { ...toolState, activeTool: { type: 'freedraw' } };
    expect(restoreTempFillIfToolChanged(mockToolApi, toolState)).toBe(true);
    expect(toolState.currentItemStrokeColor).toBe('#c2255c');
    expect(toolState.currentItemBackgroundColor).toBe('transparent');
    expect(toolState.currentItemFillStyle).toBe('hachure');

    expect(toggleFillOrSwapColorsWithApi(mockToolApi, { lang: 'ja-JP' })).toBe(false);
  });

  it('injects Fill toggle in Slim and Mobile when eligible, hides on pen/text, and never leaves standalone Expanded segment', () => {
    clearTempFillSnapshot();
    applyLanguage('ja-JP');
    let activeToolType = 'rectangle';
    attachExcalidrawAPI({
      getAppState: () => ({
        selectedElementIds: {},
        activeTool: { type: activeToolType },
        currentItemStrokeColor: '#c2255c',
        currentItemBackgroundColor: 'transparent',
        currentItemFillStyle: 'hachure',
      }),
      getSceneElements: () => [],
    } as unknown as ExcalidrawImperativeAPI);

    document.body.innerHTML = `
      <div class="App-menu_top__left">
        <div class="selected-shape-actions-container selected-shape-actions-container--compact">
          <div class="compact-shape-actions">
            <div class="compact-action-item"><button data-openpopup="elementStroke"></button></div>
            <div class="compact-action-item"><button data-openpopup="elementBackground"></button></div>
            <div class="compact-action-item"><button data-openpopup="compactOtherProperties"></button></div>
          </div>
        </div>
      </div>
      <div class="mobile-shape-actions">
        <div>
          <div class="compact-action-item"><button data-openpopup="elementStroke"></button></div>
          <div class="compact-action-item"><button data-openpopup="elementBackground"></button></div>
        </div>
        <div></div>
      </div>
    `;

    expect(syncStylesPanelColorSwap()).toBe(true);
    const slimBtn = document.querySelector<HTMLButtonElement>('.App-menu_top__left [data-exq-fill-toggle="1"]');
    const mobBtn = document.querySelector<HTMLButtonElement>('.mobile-shape-actions [data-exq-fill-toggle="1"]');
    expect(slimBtn?.textContent).toContain('塗潰');
    expect(mobBtn?.textContent).toContain('塗潰');
    expect(slimBtn?.classList.contains('exq-is-filled')).toBe(false);

    activeToolType = 'freedraw';
    syncStylesPanelColorSwap();
    expect(document.querySelector('.App-menu_top__left [data-exq-fill-toggle="1"]')).toBeNull();
    expect(document.querySelector('.mobile-shape-actions [data-exq-fill-toggle="1"]')).toBeNull();

    activeToolType = 'rectangle';
    document.body.innerHTML = `
      <div class="selected-shape-actions-container">
        <div class="Island App-menu__left">
          <div data-exq-fill-segment="1">stale</div>
          <div class="panelColumn">
            <button data-openpopup="elementStroke"></button>
            <button data-openpopup="elementBackground"></button>
          </div>
        </div>
      </div>
    `;
    syncStylesPanelColorSwap();
    expect(document.querySelector('[data-exq-fill-segment="1"]')).toBeNull();
  });

  it('creates native blackout rectangle with customizable color, updates selected blackout color, and mounts color-only SakuttoRedactPanel', async () => {
    const prefs = loadPrefs(localStorage);
    expect(prefs.redactOpts).toEqual({ color: '#111111' });
    prefs.redactOpts = { color: '#1971c2' };
    savePrefs(prefs, localStorage);
    expect(loadPrefs(localStorage).redactOpts).toEqual({ color: '#1971c2' });

    localStorage.setItem('exq-annotator-prefs', JSON.stringify({ redactOpts: { mode: 'mosaic', strength: 'strong' } }));
    expect(loadPrefs(localStorage).redactOpts).toEqual({ color: '#111111' });

    let committedElements: Array<Record<string, unknown>> = [];
    const mockApi = {
      getSceneElements: () => committedElements,
      getAppState: () => ({ viewBackgroundColor: '#ffffff', theme: 'light' }),
      getFiles: () => ({}),
      addFiles: vi.fn(),
      updateScene: (arg: { elements?: Array<Record<string, unknown>> }) => {
        committedElements = arg.elements || [];
      },
    } as unknown as ExcalidrawImperativeAPI;

    const created = createOrUpdateRedactElement({
      api: mockApi,
      rect: { x: 10, y: 20, width: 120, height: 40 },
      color: '#495057',
    });
    expect(created).toBeTruthy();
    expect(created?.type).toBe('rectangle');
    expect(created?.backgroundColor).toBe('#495057');
    expect(committedElements.length).toBe(1);
    expect(isRedactElement(created)).toBe(true);
    expect(getRedactMeta(created)?.color).toBe('#495057');

    expect(
      updateRedactElementsColor({
        api: mockApi,
        elementIds: [created!.id],
        color: '#c2255c',
      }),
    ).toBe(true);
    expect(committedElements[0].backgroundColor).toBe('#c2255c');
    expect(getRedactMeta(committedElements[0] as never)?.color).toBe('#c2255c');

    const updatedViaNativePicker = {
      ...created!,
      backgroundColor: '#1971c2',
    };
    expect(getRedactMeta(updatedViaNativePicker)?.color).toBe('#1971c2');

    document.body.innerHTML = `<div class="excalidraw"><div class="App-menu_top__left"></div></div>`;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const onColorChange = vi.fn();
    await act(async () => {
      root.render(
        createElement(SakuttoRedactPanel, {
          lang: 'ja-JP',
          active: true,
          uiLayout: 'full',
          color: '#111111',
          onColorChange,
        }),
      );
    });
    expect(document.querySelector('.App-menu_top__left .exq-redact-full-header')).toBeNull();
    expect(document.querySelector('.App-menu_top__left .selected-shape-actions-container.exq-redact-integrated-container .App-menu__left')).toBeTruthy();
    expect(document.querySelectorAll('.App-menu_top__left [data-exq-redact-color]').length).toBe(6);
    document.querySelector<HTMLButtonElement>('.App-menu_top__left [data-exq-redact-color="#c2255c"]')?.click();
    expect(onColorChange).toHaveBeenCalledWith('#c2255c');

    await act(async () => {
      root.render(
        createElement(SakuttoRedactPanel, {
          lang: 'ja-JP',
          active: true,
          uiLayout: 'compact',
          color: '#c2255c',
          onColorChange,
        }),
      );
    });
    expect(document.querySelector('.App-menu_top__left .selected-shape-actions-container--compact [data-exq-redact-trigger="1"]')).toBeTruthy();
    await act(async () => {
      root.unmount();
    });
  });

  it('isolates blackout style edits so normal shape/pen defaults remain unaffected', () => {
    resetRedactStyleIsolationForTests();
    let appState: Record<string, unknown> = {
      currentItemBackgroundColor: 'transparent',
      currentItemStrokeColor: '#c2255c',
      currentItemFillStyle: 'hachure',
      currentItemStrokeWidthKey: 'medium',
      currentItemStrokeStyle: 'solid',
      currentItemRoughness: 1,
      currentItemOpacity: 100,
      currentItemRoundness: 'round',
    };
    const updateSceneMock = vi.fn((arg: { appState?: Record<string, unknown> }) => {
      if (arg.appState) {
        appState = { ...appState, ...arg.appState };
      }
    });
    const mockApi = {
      updateScene: updateSceneMock,
    } as unknown as ExcalidrawImperativeAPI;

    expect(syncRedactStyleIsolation(mockApi, appState as never, false)).toBe(false);
    expect(updateSceneMock).not.toHaveBeenCalled();

    expect(syncRedactStyleIsolation(mockApi, appState as never, true)).toBe(false);
    appState = {
      ...appState,
      currentItemBackgroundColor: '#1971c2',
      currentItemStrokeWidthKey: 'bold',
      currentItemStrokeStyle: 'dashed',
      currentItemRoughness: 0,
      currentItemOpacity: 60,
      currentItemRoundness: 'sharp',
    };
    expect(syncRedactStyleIsolation(mockApi, appState as never, true)).toBe(true);
    expect(updateSceneMock).toHaveBeenCalledTimes(1);
    expect(appState.currentItemBackgroundColor).toBe('transparent');
    expect(appState.currentItemStrokeColor).toBe('#c2255c');
    expect(appState.currentItemStrokeWidthKey).toBe('medium');
    expect(appState.currentItemStrokeStyle).toBe('solid');
    expect(appState.currentItemRoughness).toBe(1);
    expect(appState.currentItemOpacity).toBe(100);
    expect(appState.currentItemRoundness).toBe('round');

    appState = { ...appState, currentItemStrokeColor: '#1971c2' };
    updateRedactStyleIsolationPenColor('#1971c2');
    expect(syncRedactStyleIsolation(mockApi, appState as never, false)).toBe(false);
    expect(appState.currentItemStrokeColor).toBe('#1971c2');

    appState = { ...appState, currentItemBackgroundColor: '#2f9e44' };
    expect(syncRedactStyleIsolation(mockApi, appState as never, false)).toBe(false);
    appState = { ...appState, currentItemBackgroundColor: '#111111' };
    expect(syncRedactStyleIsolation(mockApi, appState as never, true)).toBe(true);
    expect(appState.currentItemBackgroundColor).toBe('#2f9e44');

    syncRedactStyleIsolation(mockApi, appState as never, false);
    clearRedactStyleIsolationState();
    appState = { ...appState, currentItemBackgroundColor: 'transparent', currentItemStrokeColor: '#c2255c' };
    expect(syncRedactStyleIsolation(mockApi, appState as never, true)).toBe(false);
    expect(appState.currentItemBackgroundColor).toBe('transparent');
    expect(appState.currentItemStrokeColor).toBe('#c2255c');
  });

  it('resets stuck Space key and active rubberband drag on window.blur in redactDragController', () => {
    attachExcalidrawAPI({
      getAppState: () => ({
        activeTool: { type: 'custom', customType: REDACT_TOOL_CUSTOM_TYPE },
        zoom: { value: 1 },
        scrollX: 0,
        scrollY: 0,
      }),
    } as unknown as ExcalidrawImperativeAPI);

    const host = document.createElement('div');
    host.className = 'excalidraw';
    const canvas = document.createElement('canvas');
    canvas.className = 'excalidraw__canvas interactive';
    host.append(canvas);
    document.body.append(host);

    const cleanup = installRedactDragController();
    try {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      window.dispatchEvent(new Event('blur'));

      const downEvt = new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 });
      Object.defineProperty(downEvt, 'pointerId', { value: 5 });
      canvas.dispatchEvent(downEvt);
      expect(document.querySelector('[data-exq-redact-rubberband="1"]')).toBeTruthy();

      window.dispatchEvent(new Event('blur'));
      expect(document.querySelector('[data-exq-redact-rubberband="1"]')).toBeNull();
    } finally {
      cleanup();
    }
  });
});
