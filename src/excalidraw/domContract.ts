/**
 * Upstream DOM contract for `@excalidraw/excalidraw` (`0.18.0-dabd83c`).
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

export const EXCALIDRAW_LS_KEYS = {
  desktopUIMode: 'excalidraw.desktopUIMode',
} as const;

export const EXCALIDRAW_CLASSES = {
  appToolbarDivider: 'App-toolbar__divider',
  compactActionButton: 'compact-action-button',
  compactActionItem: 'compact-action-item',
  radixMenuItem: 'radix-menu-item',
  dropdownMenuItem: 'dropdown-menu-item',
  dropdownMenuItemBase: 'dropdown-menu-item-base',
  dropdownMenuItemIcon: 'dropdown-menu-item__icon',
  dropdownMenuItemText: 'dropdown-menu-item__text',
  contextMenuItemSeparator: 'context-menu-item-separator',
  contextMenuItem: 'context-menu-item',
  selectedShapeActionsContainer: 'selected-shape-actions-container',
  selectedShapeActionsContainerCompact: 'selected-shape-actions-container--compact',
  selectedShapeActions: 'selected-shape-actions',
  compactShapeActions: 'compact-shape-actions',
  compactShapeActionsIsland: 'compact-shape-actions-island',
  island: 'Island',
  appMenuLeft: 'App-menu__left',
  colorPickerButton: 'color-picker__button',
  activeColor: 'active-color',
  propertiesTrigger: 'properties-trigger',
  compactSizing: 'compact-sizing',
  mobileBorder: 'mobile-border',
  toolIconChecked: 'ToolIcon--checked',
  active: 'active',
} as const;

export const EXCALIDRAW_CTX_TESTIDS = {
  cut: 'cut',
  copy: 'copy',
  paste: 'paste',
  duplicateSelection: 'duplicateSelection',
  deleteSelectedElements: 'deleteSelectedElements',
  sendToBack: 'sendToBack',
  sendBackward: 'sendBackward',
  bringForward: 'bringForward',
  bringToFront: 'bringToFront',
  cropEditor: 'cropEditor',
  flipHorizontal: 'flipHorizontal',
  flipVertical: 'flipVertical',
  hyperlink: 'hyperlink',
  copyElementLink: 'copyElementLink',
  toggleElementLock: 'toggleElementLock',
  unlockAllElements: 'unlockAllElements',
  selectAll: 'selectAll',
  group: 'group',
  ungroup: 'ungroup',
  toggleWrap: 'toggleWrap',
  autoResize: 'autoResize',
  unbindText: 'unbindText',
  bindText: 'bindText',
  wrapTextInContainer: 'wrapTextInContainer',
  toggleLinearEditor: 'toggleLinearEditor',
  togglePolygon: 'togglePolygon',
  selectAllElementsInFrame: 'selectAllElementsInFrame',
  removeAllElementsFromFrame: 'removeAllElementsFromFrame',
} as const;

export const EXCALIDRAW_FONT_PICKER_TESTIDS = {
  handDrawn: 'font-family-hand-drawn',
  normal: 'font-family-normal',
  code: 'font-family-code',
  prefix: 'font-family-',
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
  dropdownMenuItemText: `.${EXCALIDRAW_CLASSES.dropdownMenuItemText}`,
  toolPopoverContent: '.tool-popover-content',
  contextMenu: '.context-menu',
  contextMenuPopover: '.context-menu-popover',
  contextMenuItemButton: `:scope > button.${EXCALIDRAW_CLASSES.contextMenuItem}`,
  slimStyleActions: '.App-menu_top__left .compact-shape-actions, .compact-shape-actions-island .compact-shape-actions',
  mobileStyleActions: '.mobile-shape-actions',
  mobileStyleActionsLeft: '.mobile-shape-actions > div:first-child',
  desktopMenuTopLeft: '.App-menu_top__left',
  mainMenu: '.main-menu',
  mainMenuTrigger: '.main-menu-trigger',
  preferencesSubmenu: '.excalidraw-main-menu-preferences-submenu',
  fontPickerMenu: '.dropdown-menu.fonts',
  fontPickerTopPicks: '.FontPicker__top-picks',
  zIndexButton: '.zIndexButton',
  compactActionItem: `.${EXCALIDRAW_CLASSES.compactActionItem}`,
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

/** Builds a `li[data-testid="..."]` selector string for context menu items. */
export function ctxItemSelector(testId: string): string {
  return `li[data-testid="${testId}"]`;
}

/** Builds a `.App-toolbar [data-testid="..."]` selector string. */
export function toolbarTestIdSelector(testId: string): string {
  return `${EXCALIDRAW_SELECTORS.toolbar} [data-testid="${testId}"]`;
}
