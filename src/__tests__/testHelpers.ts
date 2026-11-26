import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { clearTempFillSnapshot } from '../annotator/quickAnnotator/fillSwap';
import { syncUI } from '../annotator/quickAnnotator/index';
import {
  attachExcalidrawAPI,
  cancelScheduledSync,
  clearToastState,
  runtime,
  setSyncHandler,
} from '../annotator/quickAnnotator/runtime';
import { clearRedactStyleIsolationState } from '../annotator/redactProcessor';
import { resetCjkFontStoreForTests } from '../components/cjkFontStore';
import { loadPrefs, resetPersistedFilesCache } from '../services/storageBridge';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export function resetDomAndRuntime(): void {
  document.body.innerHTML = '';
  localStorage.clear();
  attachExcalidrawAPI(null);
  runtime.prefs = loadPrefs(localStorage);
  runtime.lastShapeOther = 'arrow';
  runtime.lastMobileShapeOther = 'ellipse';
  runtime.isBusy = false;
  runtime.drawAssistAccOpen = false;
  runtime.expAccOpen = false;
  runtime.lastCanvasBg = null;
  runtime.onLangChange = null;
  document.documentElement.lang = runtime.prefs.lang;
  clearRedactStyleIsolationState();
  clearTempFillSnapshot();
  resetPersistedFilesCache();
  resetCjkFontStoreForTests();
  cancelScheduledSync();
  clearToastState();
  setSyncHandler(syncUI);
}

export function createMockApi(overrides: Record<string, unknown> = {}): ExcalidrawImperativeAPI {
  return {
    getSceneElements: () => [],
    getAppState: () => ({ viewBackgroundColor: '#ffffff', selectedElementIds: {} }),
    getFiles: () => ({}),
    getName: () => 'test-scene',
    updateScene: () => {},
    resetScene: () => {},
    addFiles: () => {},
    history: { clear: () => {} },
    ...overrides,
  } as unknown as ExcalidrawImperativeAPI;
}
