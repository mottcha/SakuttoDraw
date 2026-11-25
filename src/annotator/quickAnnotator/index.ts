// Quick annotator entry point: UI sync scheduling, boot, and public re-exports.
import { loadPrefs } from '../../services/storageBridge';
import {
  closeFloatingPopovers,
  runtime,
  scheduleSync,
  setSyncHandler,
  showToast,
} from './runtime';
import {
  installCtrlMultiSelectGuard,
  installFastLoadSaveInterceptor,
  installPrimaryToolRestoreGuard,
  installTextAutoResizeGuard,
  isEditableFocused,
} from './guards';
import { syncMobileShapeActions, syncMobileToolbar, syncToolbar } from './toolbar';
import { getCurrentPenColor, syncMainMenu } from './mainMenu';
import { syncExtraToolsMenu } from './extraToolsMenu';
import { syncContextMenu } from './contextMenu';
import { syncTopRightBar } from './topRightBar';
import {
  getActiveStrokeFillState,
  syncStylesPanelColorSwap,
  toggleFillOrSwapColorsWithApi,
} from './fillSwap';
import { installRedactDragController } from './redactDrag';

let observer: MutationObserver | null = null;

/* ================= Sync Loop & Boot ================= */
export function syncUI(): void {
  syncToolbar();
  syncMobileToolbar();
  syncMobileShapeActions();
  syncStylesPanelColorSwap();
  syncTopRightBar();
  syncMainMenu();
  syncExtraToolsMenu();
  syncContextMenu();
  observer?.takeRecords();
}

setSyncHandler(syncUI);

export function bootQuickAnnotator(): () => void {
  runtime.prefs = loadPrefs();
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = runtime.prefs.lang;
  }

  const cleanupTextGuard = installTextAutoResizeGuard();
  const cleanupCtrlMultiSelect = installCtrlMultiSelectGuard();
  const cleanupFastLoadSave = installFastLoadSaveInterceptor();
  const cleanupPrimaryToolGuard = installPrimaryToolRestoreGuard();
  const cleanupRedactDrag = installRedactDragController();

  const onDocClick = (e: MouseEvent) => {
    closeFloatingPopovers(e.target instanceof Node ? e.target : null);
  };
  const onDocKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeFloatingPopovers(null);
      return;
    }
    if (
      e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      e.key.toLowerCase() === 'x' &&
      !isEditableFocused()
    ) {
      const { eligible } = getActiveStrokeFillState(runtime.api);
      if (eligible) {
        e.preventDefault();
        toggleFillOrSwapColorsWithApi(runtime.api, {
          lang: runtime.prefs.lang,
          showToast,
          defaultPenColor: getCurrentPenColor(),
          targetMode: 'toggle',
        });
        scheduleSync();
      }
    }
  };

  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onDocKeyDown);

  syncUI();
  const target = document.body || document.documentElement;
  if (target) {
    observer = new MutationObserver(scheduleSync);
    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'disabled'],
    });
  }

  return () => {
    cleanupTextGuard();
    cleanupCtrlMultiSelect();
    cleanupFastLoadSave();
    cleanupPrimaryToolGuard();
    cleanupRedactDrag();
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onDocKeyDown);
    observer?.disconnect();
    observer = null;
  };
}

// Public API (kept identical to the former single-file quickAnnotator.ts)
export {
  CANVAS_BG_SWATCHES,
  DRAW_ASSIST_DEFS,
  EXPORT_TOGGLE_DEFS,
  EXTRA_T3_LEFT_ITEMS,
  EXTRA_T3_LOCK_ITEM,
  MOBILE_SHAPE_OTHER_ITEMS,
  QUICK_OPT_DEFS,
  REDACT_TOOL_CUSTOM_TYPE,
  SHAPE_OTHER_ITEMS,
} from './constants';
export { cloneNativeToolbarIcon } from './dom';
export {
  activateRedactTool,
  applyLanguage,
  applyPreferJpFont,
  attachExcalidrawAPI,
  isRedactToolActive,
  runtime,
  scheduleSync,
  setLangChangeListener,
  setSyncHandler,
  showToast,
} from './runtime';
export {
  installCtrlMultiSelectGuard,
  installFastLoadSaveInterceptor,
  installPrimaryToolRestoreGuard,
  installTextAutoResizeGuard,
  restorePrimaryFreedraw,
  restorePrimarySelection,
} from './guards';
export { syncMobileShapeActions, syncMobileToolbar, syncToolbar } from './toolbar';
export {
  applyCanvasBackground,
  applyPenColor,
  getCurrentCanvasBg,
  getCurrentPenColor,
  syncMainMenu,
} from './mainMenu';
export { activateLassoTool, syncExtraToolsMenu } from './extraToolsMenu';
export { clampContextMenuPopover, syncContextMenu } from './contextMenu';
export { runInstantExport, runInstantReset, syncTopRightBar } from './topRightBar';
export {
  computeSwappedStrokeFill,
  getActiveStrokeFillState,
  syncStylesPanelColorSwap,
  toggleFillOrSwapColorsWithApi,
} from './fillSwap';
export { installRedactDragController } from './redactDrag';
export {
  DEFAULT_PINK,
  DEFAULT_PREFS,
  bootstrapCleanCanvas,
  clearIndexedDbFiles,
  loadPrefs,
  normalizeFormat,
  normalizeScale,
  savePrefs,
  shouldSkipAutoReset,
} from '../../services/storageBridge';
export { filterTargetElementsForExport, inlinePreSplitFontsIntoSvg } from '../apiActions';
