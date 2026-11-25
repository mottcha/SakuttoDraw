import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { attachExcalidrawAPI, runtime } from '../annotator/quickAnnotator/runtime';
import { loadPrefs } from '../services/storageBridge';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export function resetDomAndRuntime(): void {
  document.body.innerHTML = '';
  localStorage.clear();
  attachExcalidrawAPI(null);
  runtime.prefs = loadPrefs(localStorage);
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
