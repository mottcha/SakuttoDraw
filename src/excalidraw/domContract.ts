/**
 * Upstream DOM contract for `@excalidraw/excalidraw` (`0.18.0-2c3dcc0`).
 * Centralizing selectors, `data-testid`s, and tool mappings isolates DOM changes
 * during upstream upgrades to this module (and `src/styles/excalidraw-overrides.css`).
 */

export const EXCALIDRAW_TESTIDS = {
  selection: 'toolbar-selection',
  freedraw: 'toolbar-freedraw',
  text: 'toolbar-text',
  rectangle: 'toolbar-rectangle',
  ellipse: 'toolbar-ellipse',
  arrow: 'toolbar-arrow',
  line: 'toolbar-line',
  diamond: 'toolbar-diamond',
  eraser: 'toolbar-eraser',
  stickynote: 'toolbar-stickynote',
  lasso: 'toolbar-lasso',
  lock: 'toolbar-lock',
  image: 'toolbar-image',
  frame: 'toolbar-frame',
  laser: 'toolbar-laser',
  imageExport: 'image-export-button',
  loadButton: 'load-button',
  jsonExport: 'json-export-button',
} as const;

export const EXCALIDRAW_SELECTORS = {
  root: '.excalidraw',
  mobileRoot: '.excalidraw--mobile',
  interactiveCanvas: 'canvas.interactive',
  wysiwygTextarea: 'textarea.excalidraw-wysiwyg',
  toolbar: '.App-toolbar',
  toolbarStack: '.App-toolbar .Stack_horizontal',
  toolbarPrimaryButton: '.App-toolbar .Stack_horizontal > button[data-testid]',
  mobileToolbar: '.App-toolbar .mobile-toolbar',
  extraToolsTrigger: '.App-toolbar__extra-tools-trigger',
  topRightContainer: '.layer-ui__wrapper__top-right, .excalidraw-ui-top-right',
  mainMenuContainer: `.dropdown-menu-container:has([data-testid="${EXCALIDRAW_TESTIDS.imageExport}"])`,
  extraToolsMenuContainer: `.dropdown-menu-container:has([data-testid="${EXCALIDRAW_TESTIDS.image}"], [data-testid="${EXCALIDRAW_TESTIDS.laser}"])`,
  dropdownMenuContainer: '.dropdown-menu-container',
  toolPopoverContent: '.tool-popover-content',
  contextMenu: '.context-menu',
  contextMenuPopover: '.context-menu-popover',
  slimStyleActions: '.App-menu_top__left .compact-shape-actions, .compact-shape-actions-island .compact-shape-actions',
  mobileStyleActions: '.mobile-shape-actions',
  mobileStyleActionsLeft: '.mobile-shape-actions > div:first-child',
  desktopMenuTopLeft: '.App-menu_top__left',
  mainMenu: '.main-menu',
  mainMenuTrigger: '.main-menu-trigger',
  preferencesSubmenu: '.excalidraw-main-menu-preferences-submenu',
  zIndexButton: '.zIndexButton',
  compactActionItem: '.compact-action-item',
  strokePopupTrigger: '[data-openpopup="elementStroke"]',
  bgPopupTrigger: '[data-openpopup="elementBackground"]',
  canvasBgPopupTrigger: '[data-openpopup="canvasBackground"]',
} as const;

export const TESTID_TO_TOOL_TYPE: Readonly<Record<string, string>> = {
  [EXCALIDRAW_TESTIDS.rectangle]: 'rectangle',
  [EXCALIDRAW_TESTIDS.ellipse]: 'ellipse',
  [EXCALIDRAW_TESTIDS.text]: 'text',
  [EXCALIDRAW_TESTIDS.image]: 'image',
  [EXCALIDRAW_TESTIDS.frame]: 'frame',
  [EXCALIDRAW_TESTIDS.arrow]: 'arrow',
  [EXCALIDRAW_TESTIDS.line]: 'line',
  [EXCALIDRAW_TESTIDS.diamond]: 'diamond',
  [EXCALIDRAW_TESTIDS.eraser]: 'eraser',
  [EXCALIDRAW_TESTIDS.stickynote]: 'stickynote',
  [EXCALIDRAW_TESTIDS.lasso]: 'lasso',
};

/**
 * Native context-menu items hidden in SakuttoDraw (`src/styles/excalidraw-overrides.css`
 * must stay in exact 1-to-1 sync with this set; verified by `upstreamContract.test.ts`).
 */
export const CTX_HIDDEN_TESTIDS: ReadonlySet<string> = new Set([
  'wrapSelectionInFrame',
  'copyAsPng',
  'copyAsSvg',
  'copyText',
  'copyAsText',
  'copyStyles',
  'pasteStyles',
  'addToLibrary',
  'sendBackward',
  'bringForward',
  'gridMode',
  'objectsSnapMode',
  'arrowBinding',
  'midpointSnapping',
  'zenMode',
  'viewMode',
  'minimap',
  'stats',
]);

/** Builds a `[data-testid="..."]` selector string. */
export function testIdSelector(testId: string): string {
  return `[data-testid="${testId}"]`;
}

/** Builds a `.App-toolbar [data-testid="..."]` selector string. */
export function toolbarTestIdSelector(testId: string): string {
  return `${EXCALIDRAW_SELECTORS.toolbar} [data-testid="${testId}"]`;
}
