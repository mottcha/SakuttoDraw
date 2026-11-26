// Quick annotator entry point: UI sync loop and boot lifecycle.
import { EXCALIDRAW_SELECTORS } from '../../excalidraw/domContract';
import { loadPrefs } from '../../services/storageBridge';
import { registerSceneReplaceHook } from '../apiActions';
import { getCurrentPenColor } from './actions';
import { syncContextMenu } from './contextMenu';
import { isEditableFocused } from './dom';
import { syncExtraToolsMenu } from './extraToolsMenu';
import { syncFontPicker } from './fontPicker';
import {
  getActiveStrokeFillState,
  syncStylesPanelColorSwap,
  toggleFillOrSwapColorsWithApi,
} from './fillSwap';
import {
  installCtrlMultiSelectGuard,
  installFastLoadSaveInterceptor,
  installPrimaryToolRestoreGuard,
  installTextAutoResizeGuard,
} from './guards';
import { syncMainMenu } from './mainMenu';
import { installRedactDragController } from './redactDrag';
import {
  cancelScheduledSync,
  clearToastState,
  closeFloatingPopovers,
  notifyRuntimeChange,
  runtime,
  scheduleSync,
  setSyncHandler,
  showToast,
} from './runtime';
import { syncMobileShapeActions, syncMobileToolbar, syncToolbar } from './toolbar';
import { syncTopRightBar } from './topRightBar';

let observer: MutationObserver | null = null;

/* ================= Sync Loop & Boot ================= */
export function syncUI(): void {
  try {
    syncToolbar();
    syncMobileToolbar();
    syncMobileShapeActions();
    syncStylesPanelColorSwap();
    syncTopRightBar();
    syncMainMenu();
    syncExtraToolsMenu();
    syncFontPicker();
    syncContextMenu();
  } finally {
    observer?.takeRecords();
  }
}

setSyncHandler(syncUI);

export function bootQuickAnnotator(
  options: { skipInitialPrefsLoad?: boolean } = {},
): () => void {
  observer?.disconnect();
  observer = null;
  cancelScheduledSync();
  setSyncHandler(syncUI);

  if (!options.skipInitialPrefsLoad) {
    runtime.prefs = loadPrefs();
  }
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = runtime.prefs.lang;
  }

  const cleanupTextGuard = installTextAutoResizeGuard();
  const cleanupCtrlMultiSelect = installCtrlMultiSelectGuard();
  const cleanupFastLoadSave = installFastLoadSaveInterceptor();
  const cleanupPrimaryToolGuard = installPrimaryToolRestoreGuard();
  const cleanupRedactDrag = installRedactDragController();
  const unregisterSceneReplace = registerSceneReplaceHook(notifyRuntimeChange);

  const onDocClick = (e: MouseEvent) => {
    closeFloatingPopovers(e.target instanceof Node ? e.target : null);
  };
  const onDocKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeFloatingPopovers(null);
      return;
    }
    if (
      !e.repeat &&
      !e.isComposing &&
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
  const target =
    document.querySelector(`.sakutto-app-root, ${EXCALIDRAW_SELECTORS.root}`) ||
    document.body ||
    document.documentElement;
  if (target) {
    observer = new MutationObserver((mutations) => {
      const hasRelevantMutation = mutations.some((m) => {
        const targetEl = m.target instanceof Element ? m.target : m.target.parentElement;
        return !targetEl?.closest('.exq-toast');
      });
      if (hasRelevantMutation) {
        scheduleSync();
      }
    });
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
    unregisterSceneReplace();
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onDocKeyDown);
    observer?.disconnect();
    observer = null;
    cancelScheduledSync();
    setSyncHandler(null);
    clearToastState();
  };
}
