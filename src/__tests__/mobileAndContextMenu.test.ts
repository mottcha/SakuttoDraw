import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import {
  deleteSelectedElementsWithApi,
  duplicateSelectedElementsWithApi,
} from '../annotator/elementOps';
import { clampContextMenuPopover, syncContextMenu } from '../annotator/quickAnnotator/contextMenu';
import { syncExtraToolsMenu } from '../annotator/quickAnnotator/extraToolsMenu';
import { syncUI } from '../annotator/quickAnnotator/index';
import { applyLanguage, attachExcalidrawAPI, runtime } from '../annotator/quickAnnotator/runtime';
import { syncMobileShapeActions, syncMobileToolbar } from '../annotator/quickAnnotator/toolbar';
import { resetDomAndRuntime } from './testHelpers';

describe('context menu enrichment & mobile UI unification', () => {
  beforeEach(() => {
    resetDomAndRuntime();
    runtime.lastMobileShapeOther = 'ellipse';
    void syncUI;
  });

  it('enriches selected context menu with quick bar, 4-button layer bar, and row icons while keeping empty canvas compact', () => {
    applyLanguage('ja-JP');
    const cutClick = vi.fn();
    const toFrontClick = vi.fn();
    document.body.innerHTML = `
      <ul class="context-menu">
        <li data-testid="cut"><button class="context-menu-item">切り取り</button></li>
        <li data-testid="copy"><button class="context-menu-item">コピー</button></li>
        <li data-testid="paste"><button class="context-menu-item">貼り付け</button></li>
        <li data-testid="sendToBack"><button class="context-menu-item">最背面</button></li>
        <li data-testid="sendBackward"><button class="context-menu-item">背面</button></li>
        <li data-testid="bringForward"><button class="context-menu-item">前面</button></li>
        <li data-testid="bringToFront"><button class="context-menu-item">最前面</button></li>
        <li data-testid="cropEditor"><button class="context-menu-item">画像を切り抜き</button></li>
        <li data-testid="duplicateSelection"><button class="context-menu-item">複製</button></li>
        <li data-testid="deleteSelectedElements"><button class="context-menu-item">削除</button></li>
      </ul>
    `;
    document.querySelector('li[data-testid="cut"] button')?.addEventListener('click', cutClick);
    document.querySelector('li[data-testid="bringToFront"] button')?.addEventListener('click', toFrontClick);

    expect(syncContextMenu()).toBe(true);
    expect(document.querySelector('.context-menu')?.classList.contains('exq-ctx-rich')).toBe(true);
    expect(document.querySelectorAll('[data-exq-ctx-quick]').length).toBe(5);
    expect(document.querySelectorAll('[data-exq-ctx-layer]').length).toBe(4);
    expect(document.querySelector('li[data-testid="cut"]')?.classList.contains('exq-ctx-proxied-hidden')).toBe(true);
    expect(document.querySelector('li[data-testid="cropEditor"] .exq-ctx-item-icon svg')).toBeTruthy();

    document.querySelector<HTMLButtonElement>('[data-exq-ctx-quick="cut"]')?.click();
    document.querySelector<HTMLButtonElement>('[data-exq-ctx-layer="bringToFront"]')?.click();
    expect(cutClick).toHaveBeenCalledTimes(1);
    expect(toFrontClick).toHaveBeenCalledTimes(1);

    document.body.innerHTML = `
      <ul class="context-menu">
        <li data-testid="paste"><button class="context-menu-item">貼り付け</button></li>
        <li data-testid="selectAll"><button class="context-menu-item">すべて選択</button></li>
      </ul>
    `;
    expect(syncContextMenu()).toBe(true);
    expect(document.querySelector('[data-exq-ctx-quick-bar]')).toBeNull();
    expect(document.querySelector('[data-exq-ctx-layer-bar]')).toBeNull();
    expect(document.querySelector('li[data-testid="paste"] .exq-ctx-item-icon svg')).toBeTruthy();
    expect(document.querySelector('li[data-testid="selectAll"] .exq-ctx-item-icon svg')).toBeTruthy();

    runtime.prefs.quickOpts.modernContextMenu = false;
    document.body.innerHTML = `
      <ul class="context-menu">
        <li data-testid="cut"><button class="context-menu-item">切り取り</button></li>
        <li data-testid="cropEditor"><button class="context-menu-item">画像を切り抜き</button></li>
      </ul>
    `;
    expect(syncContextMenu()).toBe(true);
    expect(document.querySelector('.context-menu')?.classList.contains('exq-ctx-rich')).toBe(false);
    expect(document.querySelector('[data-exq-ctx-quick-bar]')).toBeNull();
    expect(document.querySelector('[data-exq-ctx-layer-bar]')).toBeNull();
    expect(document.querySelector('.exq-ctx-item-icon')).toBeNull();
  });

  it('renders icons for wrapTextInContainer, all visible context menu items, and switches lock/unlock icon accurately', () => {
    applyLanguage('ja-JP');
    runtime.prefs.quickOpts.modernContextMenu = true;

    const visibleTestIds = [
      'selectAllElementsInFrame',
      'removeAllElementsFromFrame',
      'cropEditor',
      'group',
      'autoResize',
      'unbindText',
      'bindText',
      'wrapTextInContainer',
      'ungroup',
      'flipHorizontal',
      'flipVertical',
      'toggleLinearEditor',
      'hyperlink',
      'copyElementLink',
      'toggleElementLock',
      'unlockAllElements',
      'selectAll',
    ];

    attachExcalidrawAPI({
      getAppState: () => ({ selectedElementIds: { 'el-1': true } }),
      getSceneElements: () => [{ id: 'el-1', locked: false }],
    } as unknown as ExcalidrawImperativeAPI);

    document.body.innerHTML = `
      <ul class="context-menu">
        <li data-testid="cut"><button class="context-menu-item">切り取り</button></li>
        <li data-testid="deleteSelectedElements"><button class="context-menu-item">削除</button></li>
        ${visibleTestIds.map((tid) => `<li data-testid="${tid}"><button class="context-menu-item">${tid}</button></li>`).join('\n')}
      </ul>
    `;

    expect(syncContextMenu()).toBe(true);
    for (const tid of visibleTestIds) {
      const svg = document.querySelector(`li[data-testid="${tid}"] .exq-ctx-item-icon svg`);
      expect(svg, `missing SVG icon for ${tid}`).toBeTruthy();
      expect(svg?.children.length, `empty SVG icon for ${tid}`).toBeGreaterThan(0);
    }

    const lockedIconHtml = document.querySelector('li[data-testid="toggleElementLock"] .exq-ctx-item-icon svg')?.innerHTML;

    attachExcalidrawAPI({
      getAppState: () => ({ selectedElementIds: { 'el-1': true } }),
      getSceneElements: () => [{ id: 'el-1', locked: true }],
    } as unknown as ExcalidrawImperativeAPI);

    document.body.innerHTML = `
      <ul class="context-menu">
        <li data-testid="cut"><button class="context-menu-item">切り取り</button></li>
        <li data-testid="deleteSelectedElements"><button class="context-menu-item">削除</button></li>
        <li data-testid="toggleElementLock"><button class="context-menu-item">ロック解除</button></li>
      </ul>
    `;

    expect(syncContextMenu()).toBe(true);
    const unlockedIconHtml = document.querySelector('li[data-testid="toggleElementLock"] .exq-ctx-item-icon svg')?.innerHTML;
    expect(unlockedIconHtml).toBeTruthy();
    expect(unlockedIconHtml).not.toBe(lockedIconHtml);
  });

  it('mounts A-2 7-slot mobile toolbar with dedicated rectangle, upward shape picker, fallback text, and recovers Image/Frame in Extra Tools', () => {
    applyLanguage('ja-JP');
    const setActiveTool = vi.fn();
    let activeType = 'selection';
    attachExcalidrawAPI({
      getAppState: () => ({ activeTool: { type: activeType, locked: false } }),
      setActiveTool: (tool: { type: string }) => {
        activeType = tool.type;
        setActiveTool(tool);
      },
    } as unknown as ExcalidrawImperativeAPI);

    document.body.innerHTML = `
      <div class="excalidraw excalidraw--mobile">
        <div class="App-toolbar">
          <div class="mobile-toolbar">
            <button data-testid="toolbar-selection"></button>
            <button data-testid="toolbar-freedraw"></button>
            <button data-testid="toolbar-rectangle"></button>
            <button data-testid="toolbar-arrow"></button>
            <button data-testid="toolbar-hand"></button>
            <button class="App-toolbar__extra-tools-trigger"></button>
          </div>
        </div>
        <div class="dropdown-menu-container">
          <button data-testid="toolbar-laser"></button>
        </div>
      </div>
    `;

    expect(syncMobileToolbar()).toBe(true);
    const fallbackText = document.querySelector<HTMLButtonElement>('[data-exq-mobile-tool="text"]');
    const rectBtn = document.querySelector<HTMLButtonElement>('[data-exq-mobile-tool="rectangle"]');
    const shapeGroup = document.querySelector<HTMLElement>('[data-exq-mobile-shape-group="1"]');
    expect(fallbackText).toBeTruthy();
    expect(fallbackText?.style.display).toBe('');
    expect(rectBtn).toBeTruthy();
    expect(shapeGroup?.querySelectorAll('[data-exq-mobile-shape]').length).toBe(5);

    const arrowBtn = shapeGroup?.querySelector<HTMLButtonElement>('[data-exq-mobile-shape="arrow"]');
    arrowBtn?.click();
    expect(setActiveTool).toHaveBeenCalledWith({ type: 'arrow' });
    expect(runtime.lastMobileShapeOther).toBe('arrow');

    rectBtn?.click();
    expect(setActiveTool).toHaveBeenCalledWith({ type: 'rectangle' });

    const nativeText = document.createElement('button');
    nativeText.setAttribute('data-testid', 'toolbar-text');
    document.querySelector('.mobile-toolbar')?.append(nativeText);
    syncMobileToolbar();
    expect(fallbackText?.style.display).toBe('none');

    expect(syncExtraToolsMenu()).toBe(true);
    expect(document.querySelector('[data-exq-extra-tool="image"]')).toBeTruthy();
    expect(document.querySelector('[data-exq-extra-tool="frame"]')).toBeTruthy();
  });

  it('injects persistent Duplicate and Delete buttons in MobileShapeActions and executes via direct API', () => {
    applyLanguage('ja-JP');
    let selectedIds: Record<string, boolean> = { el1: true };
    let selectedGroupIds: Record<string, boolean> = {};
    let sceneElements = [
      {
        id: 'el1',
        type: 'rectangle',
        x: 20,
        y: 30,
        width: 100,
        height: 50,
        groupIds: ['grp-1'],
        frameId: null,
        boundElements: [{ id: 'txt1', type: 'text' }],
        locked: false,
        isDeleted: false,
        seed: 1,
        version: 1,
        versionNonce: 1,
        updated: 1,
        created: 1,
        index: 'a0',
      },
      {
        id: 'txt1',
        type: 'text',
        x: 30,
        y: 40,
        width: 60,
        height: 20,
        containerId: 'el1',
        groupIds: ['grp-1'],
        frameId: null,
        boundElements: null,
        locked: false,
        isDeleted: false,
        seed: 2,
        version: 1,
        versionNonce: 2,
        updated: 1,
        created: 1,
        index: 'a1',
      },
    ] as unknown as Array<Record<string, unknown>>;

    const updateSceneMock = vi.fn(
      (arg: {
        elements?: Array<Record<string, unknown>>;
        appState?: {
          selectedElementIds?: Record<string, boolean>;
          selectedGroupIds?: Record<string, boolean>;
        };
      }) => {
        if (arg.elements) sceneElements = arg.elements;
        if (arg.appState?.selectedElementIds) selectedIds = arg.appState.selectedElementIds;
        if (arg.appState?.selectedGroupIds) selectedGroupIds = arg.appState.selectedGroupIds;
      },
    );

    attachExcalidrawAPI({
      getAppState: () => ({
        selectedElementIds: selectedIds,
        selectedGroupIds,
        viewModeEnabled: false,
      }),
      getSceneElements: () => sceneElements.filter((el) => !el.isDeleted),
      getSceneElementsIncludingDeleted: () => sceneElements,
      updateScene: updateSceneMock,
    } as unknown as ExcalidrawImperativeAPI);

    document.body.innerHTML = `
      <div class="mobile-shape-actions">
        <div class="left-styles"></div>
        <div class="right-actions">
          <div class="compact-action-item"><button>Undo</button></div>
          <div class="compact-action-item"><button>Redo</button></div>
        </div>
      </div>
    `;

    expect(syncMobileShapeActions()).toBe(true);
    const dupBtn = document.querySelector<HTMLButtonElement>('[data-exq-mobile-action="duplicate"]');
    const delBtn = document.querySelector<HTMLButtonElement>('[data-exq-mobile-action="delete"]');
    expect(dupBtn).toBeTruthy();
    expect(delBtn).toBeTruthy();
    expect(dupBtn?.parentElement?.style.display).toBe('');
    expect(delBtn?.parentElement?.style.display).toBe('');
    expect(dupBtn?.disabled).toBe(false);
    expect(delBtn?.disabled).toBe(false);

    dupBtn?.click();
    expect(updateSceneMock).toHaveBeenCalledTimes(1);
    expect(sceneElements.length).toBe(4);
    const dupRect = sceneElements[2];
    const dupText = sceneElements[3];
    expect(dupRect.id).not.toBe('el1');
    expect(dupRect.x).toBe(30);
    expect(dupRect.y).toBe(40);
    expect((dupRect.groupIds as string[])[0]).not.toBe('grp-1');
    expect(dupText.containerId).toBe(dupRect.id);
    expect((dupRect.boundElements as Array<{ id: string }>)[0].id).toBe(dupText.id);
    expect(selectedIds).toEqual({ [dupRect.id as string]: true });

    delBtn?.click();
    expect(updateSceneMock).toHaveBeenCalledTimes(2);
    expect(sceneElements[2].isDeleted).toBe(true);
    expect(sceneElements[3].isDeleted).toBe(true);
    expect(selectedIds).toEqual({});

    syncMobileShapeActions();
    expect(dupBtn?.disabled).toBe(true);
    expect(delBtn?.disabled).toBe(true);

    expect(duplicateSelectedElementsWithApi(runtime.api)).toBe(false);
    expect(deleteSelectedElementsWithApi(runtime.api)).toBe(false);

    const nativeDel = document.createElement('div');
    nativeDel.className = 'compact-action-item';
    document.querySelector('.right-actions')?.append(nativeDel);
    syncMobileShapeActions();
    expect(dupBtn?.parentElement?.style.display).toBe('');
    expect(delBtn?.parentElement?.style.display).toBe('none');
    expect(dupBtn?.parentElement?.nextElementSibling).toBe(nativeDel);

    const nativeDup = document.createElement('div');
    nativeDup.className = 'compact-action-item';
    document.querySelector('.right-actions')?.append(nativeDup);
    syncMobileShapeActions();
    expect(dupBtn?.parentElement?.style.display).toBe('none');
    expect(delBtn?.parentElement?.style.display).toBe('none');
  });

  it('renders Desktop-matched labeled B-2 context menu on mobile editable selections, skips B-2 on empty canvas, and clamps popover in viewport', () => {
    applyLanguage('ja-JP');
    const origW = window.innerWidth;
    const origH = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { value: 360, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 640, configurable: true });

    try {
      document.body.innerHTML = `
        <div class="excalidraw excalidraw--mobile">
          <div class="popover context-menu-popover" style="left: 170px; top: 140px;">
            <ul class="context-menu">
              <li data-testid="cut"><button class="context-menu-item">切り取り</button></li>
              <li data-testid="copy"><button class="context-menu-item">コピー</button></li>
              <li data-testid="paste"><button class="context-menu-item">貼り付け</button></li>
              <li data-testid="duplicateSelection"><button class="context-menu-item">複製</button></li>
              <li data-testid="deleteSelectedElements"><button class="context-menu-item">削除</button></li>
              <li data-testid="flipHorizontal"><button class="context-menu-item">水平方向に反転</button></li>
            </ul>
          </div>
        </div>
      `;

      const popover = document.querySelector<HTMLElement>('.context-menu-popover')!;
      popover.getBoundingClientRect = () =>
        ({
          left: 170,
          top: 140,
          width: 296,
          height: 54,
          right: 466,
          bottom: 194,
          x: 170,
          y: 140,
          toJSON: () => ({}),
        }) as DOMRect;

      expect(syncContextMenu()).toBe(true);
      const ul = document.querySelector('.context-menu')!;
      expect(ul.classList.contains('exq-ctx-mobile-b2')).toBe(true);
      expect(ul.classList.contains('exq-ctx-b2-expanded')).toBe(false);

      const moreBtn = ul.querySelector<HTMLButtonElement>('[data-exq-ctx-more="1"]');
      expect(moreBtn).toBeTruthy();
      expect(moreBtn?.textContent).toBe('その他');
      expect(moreBtn?.getAttribute('aria-expanded')).toBe('false');
      expect(popover.style.left).toBe('56px');

      moreBtn?.click();
      expect(ul.classList.contains('exq-ctx-b2-expanded')).toBe(true);
      expect(moreBtn?.getAttribute('aria-expanded')).toBe('true');

      document.body.innerHTML = `
        <div class="excalidraw excalidraw--mobile">
          <div class="popover context-menu-popover" style="left: 200px; top: 100px;">
            <ul class="context-menu">
              <li data-testid="paste"><button class="context-menu-item">貼り付け</button></li>
              <li data-testid="selectAll"><button class="context-menu-item">すべて選択</button></li>
            </ul>
          </div>
        </div>
      `;
      expect(syncContextMenu()).toBe(true);
      const canvasUl = document.querySelector('.context-menu')!;
      expect(canvasUl.classList.contains('exq-ctx-mobile-b2')).toBe(false);
      expect(canvasUl.querySelector('[data-exq-ctx-more="1"]')).toBeNull();
      clampContextMenuPopover(canvasUl);
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: origW, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: origH, configurable: true });
    }
  });
});
