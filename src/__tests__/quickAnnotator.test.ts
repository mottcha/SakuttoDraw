import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncContextMenu } from '../annotator/quickAnnotator/contextMenu';
import { cloneNativeToolbarIcon } from '../annotator/quickAnnotator/dom';
import { syncExtraToolsMenu } from '../annotator/quickAnnotator/extraToolsMenu';
import { syncUI } from '../annotator/quickAnnotator/index';
import { syncMainMenu } from '../annotator/quickAnnotator/mainMenu';
import { applyLanguage, runtime } from '../annotator/quickAnnotator/runtime';
import { syncToolbar } from '../annotator/quickAnnotator/toolbar';
import { syncTopRightBar } from '../annotator/quickAnnotator/topRightBar';
import * as apiActions from '../annotator/apiActions';
import {
  loadPrefs,
  LS_DESKTOP_UI_MODE_KEY,
  resolveDesktopUIMode,
  sakuttoGetFormFactor,
  savePrefs,
  syncDesktopUIMode,
} from '../services/storageBridge';
import { resetDomAndRuntime } from './testHelpers';

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
    expect(document.querySelector('[data-exq-main-action="copy"]')?.textContent).toBe('クリップボードにコピー');

    applyLanguage('en');
    syncToolbar();
    syncMainMenu();
    expect(document.querySelector('.exq-toolbar-reset')?.getAttribute('title')).toBe('Clear canvas');
    expect(document.querySelector('[data-exq-main-action="copy"]')?.textContent).toBe('Copy to clipboard');
  });

  it('renders transparent background switch as OFF by default and toggles background=false when turned ON', () => {
    applyLanguage('ja-JP');
    document.body.innerHTML = `
      <div class="dropdown-menu-container">
        <button data-testid="image-export-button"></button>
      </div>
    `;
    expect(syncMainMenu()).toBe(true);
    const bgSwitch = document.querySelector<HTMLButtonElement>('[data-exq-exp-opt="background"]');
    expect(bgSwitch).toBeTruthy();
    expect(bgSwitch?.classList.contains('exq-on')).toBe(false);
    expect(bgSwitch?.getAttribute('aria-label')).toBe('背景の透明化');

    bgSwitch?.parentElement?.click();
    expect(runtime.prefs.exportOpts.background).toBe(false);
    expect(bgSwitch?.classList.contains('exq-on')).toBe(true);
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
    expect(localStorage.getItem(LS_DESKTOP_UI_MODE_KEY)).toBe('compact');
    expect(resizeSpy).toHaveBeenCalledTimes(0);

    expect(
      syncDesktopUIMode('full', { width: 750, height: 520, storage: localStorage, triggerResize: true }),
    ).toBe('full');
    expect(localStorage.getItem(LS_DESKTOP_UI_MODE_KEY)).toBe('full');
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
});
