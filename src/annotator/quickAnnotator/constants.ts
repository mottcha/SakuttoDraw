// Static definitions (tool groups, swatches, option defs) shared by the injected UI.

export const REDACT_TOOL_CUSTOM_TYPE = 'sakutto-redact';

export const SHAPE_OTHER_ITEMS = [
  { id: 'arrow', testId: 'toolbar-arrow', msgKey: 'toolArrow', shortcut: 'A' },
  { id: 'line', testId: 'toolbar-line', msgKey: 'toolLine', shortcut: 'L' },
  { id: 'diamond', testId: 'toolbar-diamond', msgKey: 'toolDiamond', shortcut: 'D' },
  { id: 'redact', testId: 'toolbar-redact', msgKey: 'toolRedact', shortcut: '' },
] as const;

export const MOBILE_SHAPE_OTHER_ITEMS = [
  { id: 'ellipse', testId: 'toolbar-ellipse', msgKey: 'toolEllipse', shortcut: 'O' },
  { id: 'arrow', testId: 'toolbar-arrow', msgKey: 'toolArrow', shortcut: 'A' },
  { id: 'line', testId: 'toolbar-line', msgKey: 'toolLine', shortcut: 'L' },
  { id: 'diamond', testId: 'toolbar-diamond', msgKey: 'toolDiamond', shortcut: 'D' },
  { id: 'redact', testId: 'toolbar-redact', msgKey: 'toolRedact', shortcut: '' },
] as const;

export const EXTRA_T3_LEFT_ITEMS = [
  { id: 'eraser', testId: 'toolbar-eraser', msgKey: 'toolEraser', shortcut: 'E' },
  { id: 'sticky', testId: 'toolbar-stickynote', msgKey: 'toolSticky', shortcut: 'N' },
  { id: 'lasso', testId: 'toolbar-lasso', msgKey: 'toolLasso', shortcut: '' },
] as const;

export const EXTRA_T3_LOCK_ITEM = {
  id: 'lock',
  testId: 'toolbar-lock',
  msgKey: 'toolLock',
  shortcut: 'Q',
} as const;

export const CANVAS_BG_SWATCHES = ['#ffffff', '#f8f9fa', '#f5faff', '#fffce8', '#fdf8f6'] as const;

export const EXPORT_TOGGLE_DEFS = [
  { key: 'onlySelected', id: 'exportOnlySelected', msgKey: 'exportOnlySelected' },
  { key: 'background', id: 'exportBackgroundSwitch', msgKey: 'exportBackground' },
  { key: 'darkMode', id: 'exportDarkModeSwitch', msgKey: 'exportDarkMode' },
  { key: 'embedScene', id: 'exportEmbedSwitch', msgKey: 'exportEmbedScene' },
] as const;

export const DRAW_ASSIST_DEFS = [
  { key: 'objectsSnapMode', msgKey: 'assistSnapToObjects', shortcut: 'Alt+S' },
  { key: 'gridMode', msgKey: 'assistShowGrid', shortcut: "Ctrl+'" },
  { key: 'arrowBinding', msgKey: 'assistArrowBinding', shortcut: '' },
  { key: 'midpointSnapping', msgKey: 'assistMidpointSnap', shortcut: '' },
] as const;

export const QUICK_OPT_DEFS = [
  { key: 'autoResetOnOpen', msgKey: 'optAutoResetOnOpen' },
  { key: 'textAutoResize', msgKey: 'optTextAutoResize' },
  { key: 'fastLoadSave', msgKey: 'optFastLoadSave' },
  { key: 'modernContextMenu', msgKey: 'optModernContextMenu' },
] as const;
