import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncContextMenu } from '../annotator/quickAnnotator/contextMenu';
import { cloneNativeToolbarIcon } from '../annotator/quickAnnotator/dom';
import { syncExtraToolsMenu } from '../annotator/quickAnnotator/extraToolsMenu';
import { syncUI } from '../annotator/quickAnnotator/index';
import { syncMainMenu } from '../annotator/quickAnnotator/mainMenu';
import { applyLanguage, attachExcalidrawAPI, runtime } from '../annotator/quickAnnotator/runtime';
import { syncToolbar } from '../annotator/quickAnnotator/toolbar';
import { syncTopRightBar } from '../annotator/quickAnnotator/topRightBar';
import * as actions from '../annotator/quickAnnotator/actions';
import * as apiActions from '../annotator/apiActions';
import { EXCALIDRAW_LS_KEYS } from '../excalidraw/domContract';
import {
  loadPrefs,
  resolveDesktopUIMode,
  sakuttoGetFormFactor,
  savePrefs,
  syncDesktopUIMode,
} from '../services/storageBridge';
import { createMockApi, resetDomAndRuntime } from './testHelpers';

describe('quickAnnotator desktop DOM sync, language switcher, and layout modes', () => {
  beforeEach(() => {
    resetDomAndRuntime();
    vi.useRealTimers();
    void syncUI;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('injects localized UI elements and updates language via applyLanguage', () => {
    applyLanguage('ja-JP');
    document.body.innerHTML = `
      <div class="App-toolbar">
        <div class="Stack_horizontal">
          <button data-testid="toolbar-selection"></button>
          <button data-testid="toolbar-freedraw"></button>
          <button data-testid="toolbar-arrow" class="ToolIcon--checked"></button>
          <button class="App-toolbar__extra-tools-trigger"></button>
        </div>
      </div>
      <div class="layer-ui__wrapper__top-right"></div>
      <div class="dropdown-menu-container">
        <button data-testid="image-export-button"></button>
      </div>
      <div class="dropdown-menu-container">
        <button data-testid="toolbar-image"></button>
      </div>
      <ul class="context-menu">
        <hr />
        <li data-testid="cut"><button>Cut</button></li>
        <hr />
        <hr />
        <li data-testid="wrapSelectionInFrame"><button>Frame</button></li>
        <hr />
      </ul>
    `;

    expect(syncToolbar()).toBe(true);
    expect(syncTopRightBar()).toBe(true);
    expect(syncMainMenu()).toBe(true);
    expect(syncExtraToolsMenu()).toBe(true);
    expect(syncContextMenu()).toBe(true);

    expect(document.querySelector('[data-exq-pen-toggle="1"]')).toBeNull();
    expect(document.querySelector('[data-exq-bg-toggle="1"]')).toBeNull();
    expect(document.querySelector('[data-exq-draw-assist="1"]')?.classList.contains('exq-acc-open')).toBe(false);
    expect(document.querySelector('[data-exq-quick-settings="1"]')).toBeNull();
    expect(document.querySelector('[data-exq-proxy="toolbar-lock"]')?.getAttribute('title')).toBe('作成後もツールを連続使用 (Q)');
    expect(document.querySelector('[data-exq-lang-select="1"]')).toBeNull();
    expect(document.querySelector('[data-exq-cjk-btn]')).toBeNull();
    expect(document.querySelector('.exq-toolbar-reset')?.getAttribute('title')).toBe('キャンバスをクリア');
    expect(document.querySelector('[data-exq-main-action="png"]')?.textContent).toBe('名前を付けて画像を保存...');
    expect(document.querySelector('[data-exq-main-action="copy"]')?.textContent).toBe('クリップボードにコピー');
    expect(document.querySelector('[data-exq-action="png"]')?.getAttribute('title')).toBe('画像として保存');

    runtime.prefs.quickSaveMode = 'dialog';
    expect(syncTopRightBar()).toBe(false);
    expect(document.querySelector('[data-exq-action="png"]')?.getAttribute('title')).toBe('名前を付けて画像を保存...');
    runtime.prefs.quickSaveMode = 'direct';

    const runExportSpy = vi
      .spyOn(actions, 'runInstantExport')
      .mockResolvedValue({ ok: true, mode: 'save', format: 'png' });
    document.querySelector<HTMLButtonElement>('[data-exq-main-action="png"]')?.click();
    expect(runExportSpy).toHaveBeenCalledWith('save', null, { showSaveDialog: true });
    runExportSpy.mockRestore();

    applyLanguage('en');
    syncToolbar();
    syncMainMenu();
    expect(document.querySelector('.exq-toolbar-reset')?.getAttribute('title')).toBe('Clear canvas');
    expect(document.querySelector('[data-exq-main-action="png"]')?.textContent).toBe('Save image as...');
    expect(document.querySelector('[data-exq-main-action="copy"]')?.textContent).toBe('Copy to clipboard');
  });

  it('renders screenshot/whiteboard presets, layer-1 format switcher, and collapsible advanced settings', () => {
    applyLanguage('ja-JP');
    document.body.innerHTML = `
      <div class="dropdown-menu-container">
        <button data-testid="image-export-button"></button>
      </div>
    `;
    expect(syncMainMenu()).toBe(true);

    const ssBtn = document.querySelector<HTMLButtonElement>('[data-exq-exp-preset="screenshot"]')!;
    const wbBtn = document.querySelector<HTMLButtonElement>('[data-exq-exp-preset="whiteboard"]')!;
    const summaryEl = document.querySelector<HTMLElement>('[data-exq-exp-summary="1"]')!;
    const advRoot = document.querySelector<HTMLElement>('[data-exq-exp-adv="1"]')!;
    const advToggle = document.querySelector<HTMLButtonElement>('[data-exq-exp-adv-toggle="1"]')!;
    const bgSwitch = document.querySelector<HTMLButtonElement>('[data-exq-exp-opt="background"]')!;
    const padSwitch = document.querySelector<HTMLButtonElement>('[data-exq-exp-opt="padding"]')!;
    const darkSwitch = document.querySelector<HTMLButtonElement>('[data-exq-exp-opt="darkMode"]')!;
    const svgBtn = document.querySelector<HTMLButtonElement>('[data-exq-format="svg"]')!;

    expect(document.querySelector('[data-exq-scale]')).toBeNull();
    expect(ssBtn.classList.contains('exq-active')).toBe(true);
    expect(ssBtn.getAttribute('aria-checked')).toBe('true');
    expect(wbBtn.classList.contains('exq-active')).toBe(false);
    expect(summaryEl.textContent).toBe('背景透過・余白なし');
    expect(advRoot.classList.contains('exq-open')).toBe(false);
    expect(advToggle.getAttribute('aria-expanded')).toBe('false');

    // Transparent background switch is ON by default (background: false) and padding is OFF
    expect(bgSwitch.classList.contains('exq-on')).toBe(true);
    expect(bgSwitch.getAttribute('aria-checked')).toBe('true');
    expect(padSwitch.classList.contains('exq-on')).toBe(false);
    expect(bgSwitch.getAttribute('role')).toBe('switch');
    expect(bgSwitch.getAttribute('aria-label')).toBe('背景の透明化');
    expect(padSwitch.getAttribute('aria-label')).toBe('余白を追加');

    // Switch to Whiteboard preset
    wbBtn.click();
    expect(runtime.prefs.exportOpts.background).toBe(true);
    expect(runtime.prefs.exportOpts.padding).toBe(true);
    expect(wbBtn.classList.contains('exq-active')).toBe(true);
    expect(ssBtn.classList.contains('exq-active')).toBe(false);
    expect(bgSwitch.classList.contains('exq-on')).toBe(false);
    expect(padSwitch.classList.contains('exq-on')).toBe(true);
    expect(summaryEl.textContent).toBe('背景あり・余白あり');

    // Open advanced settings and customize padding -> transitions to custom (both presets inactive)
    advToggle.click();
    expect(advRoot.classList.contains('exq-open')).toBe(true);
    expect(advToggle.getAttribute('aria-expanded')).toBe('true');

    padSwitch.click();
    expect(runtime.prefs.exportOpts.padding).toBe(false);
    expect(ssBtn.classList.contains('exq-active')).toBe(false);
    expect(wbBtn.classList.contains('exq-active')).toBe(false);
    expect(summaryEl.textContent).toBe('カスタム設定');

    // Enable dark mode -> summary appends dark tag; switch format on layer-1
    darkSwitch.click();
    expect(summaryEl.textContent).toBe('カスタム設定・ダーク');
    svgBtn.click();
    expect(loadPrefs(localStorage).exportOpts.format).toBe('svg');
    expect(loadPrefs(localStorage).exportOpts.darkMode).toBe(true);

    // Language switch updates localized labels & summary
    applyLanguage('en');
    syncMainMenu();
    expect(document.querySelector('[data-exq-exp-preset="screenshot"]')?.textContent).toBe('Screenshot');
    expect(document.querySelector('[data-exq-exp-summary="1"]')?.textContent).toBe('Custom settings · Dark');
  });

  it('injects top-right Copy/Save bar and unified extra tools menu in mobile layout', () => {
    applyLanguage('ja-JP');
    document.body.innerHTML = `
      <div class="excalidraw-ui-top-right">
        <button class="default-sidebar-trigger" data-testid="sidebar-trigger"></button>
      </div>
      <div class="dropdown-menu-container">
        <button data-testid="toolbar-frame"></button>
        <button data-testid="toolbar-embeddable"></button>
        <button data-testid="toolbar-autoshape"></button>
        <button data-testid="toolbar-laser"></button>
        <button data-testid="toolbar-bucketfill"></button>
      </div>
    `;

    expect(syncTopRightBar()).toBe(true);
    expect(syncExtraToolsMenu()).toBe(true);
    expect(document.querySelector('.excalidraw-ui-top-right [data-exq-right-bar="1"]')).toBeTruthy();
    expect(document.querySelector('[data-exq-t3-row="1"]')).toBeTruthy();
    expect(document.querySelector('[data-exq-draw-assist="1"]')).toBeTruthy();
    expect(document.querySelector('[data-exq-quick-settings="1"]')).toBeNull();
  });

  it('resolves desktopUIMode cleanly for PC mini-windows and persists stylesPanelMode preference', () => {
    expect(sakuttoGetFormFactor(390, 844)).toBe('phone');
    expect(sakuttoGetFormFactor(750, 480)).toBe('phone');
    expect(sakuttoGetFormFactor(750, 520)).toBe('desktop');
    expect(sakuttoGetFormFactor(800, 650)).toBe('desktop');
    expect(sakuttoGetFormFactor(1440, 900)).toBe('desktop');

    expect(resolveDesktopUIMode('auto', 750, 520)).toBe('compact');
    expect(resolveDesktopUIMode('auto', 800, 650)).toBe('compact');
    expect(resolveDesktopUIMode('auto', 1200, 600)).toBe('compact');
    expect(resolveDesktopUIMode('auto', 1440, 900)).toBe('full');

    expect(resolveDesktopUIMode('compact', 1440, 900)).toBe('compact');
    expect(resolveDesktopUIMode('full', 750, 520)).toBe('full');

    const resizeSpy = vi.fn();
    window.addEventListener('resize', resizeSpy);
    expect(syncDesktopUIMode('auto', { width: 750, height: 520, storage: localStorage })).toBe('compact');
    expect(localStorage.getItem(EXCALIDRAW_LS_KEYS.desktopUIMode)).toBe('compact');
    expect(resizeSpy).toHaveBeenCalledTimes(0);

    expect(
      syncDesktopUIMode('full', { width: 750, height: 520, storage: localStorage, triggerResize: true }),
    ).toBe('full');
    expect(localStorage.getItem(EXCALIDRAW_LS_KEYS.desktopUIMode)).toBe('full');
    expect(resizeSpy).toHaveBeenCalledTimes(1);
    window.removeEventListener('resize', resizeSpy);

    const prefs = loadPrefs(localStorage);
    expect(prefs.stylesPanelMode).toBe('auto');
    prefs.stylesPanelMode = 'compact';
    savePrefs(prefs, localStorage);
    expect(loadPrefs(localStorage).stylesPanelMode).toBe('compact');
  });

  it('clones native toolbar SVG icon when present and falls back to stroke-width=1.5', () => {
    document.body.innerHTML = `
      <div class="App-toolbar">
        <button data-testid="toolbar-diamond">
          <svg viewBox="0 0 24 24" stroke-width="1.25"><path d="M12 3l9 9-9 9-9-9z" /></svg>
        </button>
      </div>
    `;
    const cloned = cloneNativeToolbarIcon('toolbar-diamond', 'diamond', 16, 1.5);
    expect(cloned.getAttribute('stroke-width')).toBe('1.25');
    expect(cloned.getAttribute('width')).toBe('16');

    const fallback = cloneNativeToolbarIcon('toolbar-missing', 'redact', 16, 1.5);
    expect(fallback.getAttribute('stroke-width')).toBe('1.5');
  });

  it('cancels prior copy-done feedback timer when copy button is clicked again rapidly', async () => {
    vi.useFakeTimers();
    const exportSpy = vi
      .spyOn(apiActions, 'runInstantExportWithApi')
      .mockResolvedValue({ ok: true, mode: 'copy' });

    document.body.innerHTML = '<div class="layer-ui__wrapper__top-right"></div>';
    expect(syncTopRightBar()).toBe(true);
    const copyBtn = document.querySelector<HTMLButtonElement>('[data-exq-action="copy"]')!;

    copyBtn.click();
    await vi.waitFor(() => expect(copyBtn.classList.contains('exq-done')).toBe(true));

    vi.advanceTimersByTime(800);
    copyBtn.click();
    await vi.waitFor(() => {
      expect(exportSpy).toHaveBeenCalledTimes(2);
      expect(copyBtn.disabled).toBe(false);
    });

    // At 1200ms (past the first 1100ms timer, 400ms into second), .exq-done must still be active
    vi.advanceTimersByTime(400);
    expect(copyBtn.classList.contains('exq-done')).toBe(true);

    // After full 1100ms from second click, .exq-done clears cleanly
    vi.advanceTimersByTime(800);
    expect(copyBtn.classList.contains('exq-done')).toBe(false);
  });

  it('updates draw-assist switches synchronously without 1-step lag under async updateScene', async () => {
    let appState: Record<string, unknown> = {
      viewBackgroundColor: '#ffffff',
      selectedElementIds: {},
      objectsSnapModeEnabled: false,
      gridModeEnabled: false,
      bindingPreference: 'enabled',
      isBindingEnabled: true,
      isMidpointSnappingEnabled: true,
    };
    const mockApi = createMockApi({
      getAppState: () => appState,
      updateScene: ({ appState: patch }: { appState?: Record<string, unknown> }) => {
        if (patch) {
          void Promise.resolve().then(() => {
            appState = { ...appState, ...patch };
          });
        }
      },
    });
    attachExcalidrawAPI(mockApi);

    document.body.innerHTML = `
      <div class="dropdown-menu-container">
        <button data-testid="toolbar-image"></button>
      </div>
    `;
    expect(syncExtraToolsMenu()).toBe(true);

    const getBtn = (key: string) =>
      document.querySelector<HTMLButtonElement>(`[data-exq-assist-opt="${key}"]`)!;
    const expectSwitch = (key: string, expected: boolean) => {
      const btn = getBtn(key);
      expect(btn.classList.contains('exq-on')).toBe(expected);
      expect(btn.getAttribute('aria-checked')).toBe(String(expected));
      expect(btn.getAttribute('role')).toBe('switch');
    };

    expectSwitch('objectsSnapMode', false);
    expectSwitch('gridMode', false);
    expectSwitch('arrowBinding', true);
    expectSwitch('midpointSnapping', true);

    getBtn('objectsSnapMode').click();
    expectSwitch('objectsSnapMode', true);
    expectSwitch('gridMode', false);

    await Promise.resolve();
    getBtn('gridMode').click();
    expectSwitch('gridMode', true);
    expectSwitch('objectsSnapMode', false);

    await Promise.resolve();
    getBtn('gridMode').click();
    expectSwitch('gridMode', false);

    await Promise.resolve();
    getBtn('arrowBinding').click();
    expectSwitch('arrowBinding', false);

    getBtn('midpointSnapping').click();
    expectSwitch('midpointSnapping', false);
  });

  it('re-syncs already-mounted draw-assist switches when appState changes externally', () => {
    const appState: Record<string, unknown> = {
      viewBackgroundColor: '#ffffff',
      selectedElementIds: {},
      objectsSnapModeEnabled: false,
      gridModeEnabled: false,
      bindingPreference: 'enabled',
      isBindingEnabled: true,
      isMidpointSnappingEnabled: true,
    };
    attachExcalidrawAPI(createMockApi({ getAppState: () => appState }));

    document.body.innerHTML = `
      <div class="dropdown-menu-container">
        <button data-testid="toolbar-image"></button>
      </div>
    `;
    expect(syncExtraToolsMenu()).toBe(true);

    appState.objectsSnapModeEnabled = true;
    appState.bindingPreference = 'disabled';
    expect(syncExtraToolsMenu()).toBe(false);

    const snapBtn = document.querySelector<HTMLButtonElement>('[data-exq-assist-opt="objectsSnapMode"]')!;
    const bindBtn = document.querySelector<HTMLButtonElement>('[data-exq-assist-opt="arrowBinding"]')!;
    expect(snapBtn.classList.contains('exq-on')).toBe(true);
    expect(snapBtn.getAttribute('aria-checked')).toBe('true');
    expect(bindBtn.classList.contains('exq-on')).toBe(false);
    expect(bindBtn.getAttribute('aria-checked')).toBe('false');
  });
});
