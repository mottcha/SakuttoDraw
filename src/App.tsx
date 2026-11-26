import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import '@excalidraw/excalidraw/index.css';
import './styles/sakutto.css';
import type {
  AppLang,
  BoxSelectionPref,
  InputDevicePref,
  StylesPanelPref,
  ThemeMode,
} from './types/annotator';
import { applySakuttoFontOverrides } from './annotator/jpGlyphOverride';
import { REDACT_TOOL_CUSTOM_TYPE } from './annotator/quickAnnotator/constants';
import { restoreTempFillIfToolChanged } from './annotator/quickAnnotator/fillSwap';
import { bootQuickAnnotator } from './annotator/quickAnnotator/index';
import {
  attachExcalidrawAPI,
  runtime,
  scheduleSync,
  setLangChangeListener,
} from './annotator/quickAnnotator/runtime';
import {
  clearRedactStyleIsolationState,
  getRedactMeta,
  isRedactElement,
  syncRedactStyleIsolation,
  updateRedactElementsColor,
} from './annotator/redactProcessor';
import type { PreferencesLiveState } from './components/PreferencesPanel';
import { SakuttoMainMenu } from './components/SakuttoMainMenu';
import { SakuttoRedactPanel } from './components/SakuttoRedactPanel';
import {
  bootstrapCleanCanvas,
  cancelPendingScenePersist,
  flushPendingScenePersist,
  loadInitialSceneData,
  normalizeBoxSelectionMode,
  normalizeInputDevice,
  resolveDesktopUIMode,
  resolvePreferJpFont,
  sakuttoGetFormFactor,
  savePrefs,
  scheduleScenePersist,
  syncDesktopUIMode,
} from './services/storageBridge';

type RedactUiLayout = 'full' | 'compact' | 'phone';

interface RedactUiState {
  toolActive: boolean;
  selectionOnly: boolean;
  color: string;
  uiLayout: RedactUiLayout;
}

function resolveRedactUiLayout(pref: StylesPanelPref): RedactUiLayout {
  if (typeof window === 'undefined') return 'full';
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (sakuttoGetFormFactor(w, h) === 'phone') return 'phone';
  return resolveDesktopUIMode(pref, w, h);
}

let bootstrappedOnce = false;
const EXCALIDRAW_UI_OPTIONS = {
  getFormFactor: sakuttoGetFormFactor,
};

export function App() {
  const initialBootstrap = useMemo(() => {
    if (!bootstrappedOnce) {
      bootstrappedOnce = true;
      const initResult = bootstrapCleanCanvas();
      runtime.prefs = initResult.prefs;
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.lang = initResult.prefs.lang;
      }
      applySakuttoFontOverrides({
        preferJpFont: resolvePreferJpFont(initResult.prefs),
        codeLigatures: initResult.prefs.codeLigatures,
      });
    }
    syncDesktopUIMode(runtime.prefs.stylesPanelMode);
    return {
      lang: runtime.prefs.lang,
      themeMode: runtime.prefs.themeMode,
      boxSelectionMode: runtime.prefs.boxSelectionMode,
      inputDevice: runtime.prefs.inputDevice,
      stylesPanelMode: runtime.prefs.stylesPanelMode,
      initialDataPromise: loadInitialSceneData(),
    };
  }, []);

  const [lang, setLang] = useState<AppLang>(initialBootstrap.lang);
  const [themeMode, setThemeMode] = useState<ThemeMode>(initialBootstrap.themeMode);
  const [prefState, setPrefState] = useState<PreferencesLiveState>(() => ({
    boxSelectionMode: initialBootstrap.boxSelectionMode,
    inputDevice: initialBootstrap.inputDevice,
    stylesPanelMode: initialBootstrap.stylesPanelMode,
    zenModeEnabled: false,
    viewModeEnabled: false,
  }));
  const [redactState, setRedactState] = useState<RedactUiState>(() => ({
    toolActive: false,
    selectionOnly: false,
    color: runtime.prefs.redactOpts.color,
    uiLayout: resolveRedactUiLayout(initialBootstrap.stylesPanelMode),
  }));
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );
  const drawAssistSnapshotRef = useRef<{
    objectsSnapMode: boolean;
    gridMode: boolean;
    arrowBinding: boolean;
    midpointSnapping: boolean;
  } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    setLangChangeListener((nextLang) => setLang(nextLang));
    const cleanup = bootQuickAnnotator();
    const onUnload = () => flushPendingScenePersist();
    const onResize = () => {
      syncDesktopUIMode(runtime.prefs.stylesPanelMode);
      const nextLayout = resolveRedactUiLayout(runtime.prefs.stylesPanelMode);
      setRedactState((prev) =>
        prev.uiLayout === nextLayout ? prev : { ...prev, uiLayout: nextLayout },
      );
    };
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('resize', onResize, true);
    return () => {
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('resize', onResize, true);
      setLangChangeListener(null);
      cleanup();
      cancelPendingScenePersist();
    };
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    themeMode === 'system' ? (systemDark ? 'dark' : 'light') : themeMode;

  const handleThemeChange = useCallback((nextTheme: ThemeMode) => {
    setThemeMode(nextTheme);
    runtime.prefs.themeMode = nextTheme;
    savePrefs(runtime.prefs);
  }, []);

  const handleStylesPanelModeChange = useCallback((nextMode: StylesPanelPref) => {
    runtime.prefs.stylesPanelMode = nextMode;
    savePrefs(runtime.prefs);
    setPrefState((prev) =>
      prev.stylesPanelMode === nextMode ? prev : { ...prev, stylesPanelMode: nextMode },
    );
    const nextLayout = resolveRedactUiLayout(nextMode);
    setRedactState((prev) =>
      prev.uiLayout === nextLayout ? prev : { ...prev, uiLayout: nextLayout },
    );
    syncDesktopUIMode(nextMode, { triggerResize: true });
  }, []);

  const applyRedactColor = useCallback((nextColor: string) => {
    runtime.prefs.redactOpts = { color: nextColor };
    savePrefs(runtime.prefs);
    setRedactState((prev) => ({ ...prev, color: nextColor }));

    const api = runtime.api;
    if (!api) return;
    const selectedIdsMap = api.getAppState()?.selectedElementIds || {};
    const selectedRedactIds = api
      .getSceneElements()
      .filter((item) => !item.isDeleted && Boolean(selectedIdsMap[item.id]) && isRedactElement(item))
      .map((item) => item.id);
    if (selectedRedactIds.length === 0) return;

    updateRedactElementsColor({
      api,
      elementIds: selectedRedactIds,
      color: nextColor,
    });
  }, []);

  const handleApi = useCallback((api: ExcalidrawImperativeAPI | null) => {
    attachExcalidrawAPI(api);
  }, []);

  const handleChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      const nextBox: BoxSelectionPref = normalizeBoxSelectionMode(appState.boxSelectionMode);
      const nextDevice: InputDevicePref = normalizeInputDevice(appState.inputDevice);
      const nextZen = Boolean(appState.zenModeEnabled);
      const nextView = Boolean(appState.viewModeEnabled);

      setPrefState((prev) => {
        if (
          prev.boxSelectionMode === nextBox &&
          prev.inputDevice === nextDevice &&
          prev.zenModeEnabled === nextZen &&
          prev.viewModeEnabled === nextView
        ) {
          return prev;
        }
        return {
          ...prev,
          boxSelectionMode: nextBox,
          inputDevice: nextDevice,
          zenModeEnabled: nextZen,
          viewModeEnabled: nextView,
        };
      });

      const selectedIdsMap = appState.selectedElementIds || {};
      const selectedElements = elements.filter((item) => !item.isDeleted && Boolean(selectedIdsMap[item.id]));
      const redactToolActive =
        appState.activeTool?.type === 'custom' &&
        appState.activeTool?.customType === REDACT_TOOL_CUSTOM_TYPE;
      const redactSelectionOnly =
        selectedElements.length > 0 && selectedElements.every((item) => isRedactElement(item));
      const openMenuBlocking = Boolean(appState.openMenu);
      const nextLayout = resolveRedactUiLayout(runtime.prefs.stylesPanelMode);
      const nextToolActive =
        !nextZen &&
        !nextView &&
        redactToolActive &&
        !(nextLayout === 'phone' && openMenuBlocking);
      const nextSelectionOnly =
        !nextZen &&
        !nextView &&
        !redactToolActive &&
        redactSelectionOnly;

      const tempFillRestored = restoreTempFillIfToolChanged(runtime.api, appState);
      if (tempFillRestored) {
        clearRedactStyleIsolationState();
      } else {
        syncRedactStyleIsolation(runtime.api, appState, redactSelectionOnly);
      }

      const firstMeta = redactSelectionOnly ? getRedactMeta(selectedElements[0]) : null;
      const nextColor = firstMeta ? firstMeta.color : runtime.prefs.redactOpts.color;
      if (firstMeta && runtime.prefs.redactOpts.color !== firstMeta.color) {
        runtime.prefs.redactOpts = { color: firstMeta.color };
        savePrefs(runtime.prefs);
      }

      setRedactState((prev) => {
        if (
          prev.toolActive === nextToolActive &&
          prev.selectionOnly === nextSelectionOnly &&
          prev.color === nextColor &&
          prev.uiLayout === nextLayout
        ) {
          return prev;
        }
        return {
          toolActive: nextToolActive,
          selectionOnly: nextSelectionOnly,
          color: nextColor,
          uiLayout: nextLayout,
        };
      });

      const nextDrawAssist = {
        objectsSnapMode: Boolean(appState.objectsSnapModeEnabled),
        gridMode: Boolean(appState.gridModeEnabled),
        arrowBinding: appState.bindingPreference !== 'disabled',
        midpointSnapping: Boolean(appState.isMidpointSnappingEnabled),
      };
      const prevDrawAssist = drawAssistSnapshotRef.current;
      drawAssistSnapshotRef.current = nextDrawAssist;
      if (
        prevDrawAssist &&
        (prevDrawAssist.objectsSnapMode !== nextDrawAssist.objectsSnapMode ||
          prevDrawAssist.gridMode !== nextDrawAssist.gridMode ||
          prevDrawAssist.arrowBinding !== nextDrawAssist.arrowBinding ||
          prevDrawAssist.midpointSnapping !== nextDrawAssist.midpointSnapping)
      ) {
        scheduleSync();
      }

      scheduleScenePersist(elements, appState as unknown as Record<string, unknown>, files);
    },
    [],
  );

  const rootClassName = `sakutto-app-root${
    redactState.toolActive ? ' exq-redact-tool-active' : ''
  }${redactState.selectionOnly ? ' exq-redact-selected' : ''}`;

  return (
    <div className={rootClassName}>
      <Excalidraw
        langCode={lang}
        theme={resolvedTheme}
        onThemeChange={handleThemeChange}
        aiEnabled={false}
        UIOptions={EXCALIDRAW_UI_OPTIONS}
        initialData={initialBootstrap.initialDataPromise}
        onExcalidrawAPI={handleApi}
        onChange={handleChange}
      >
        <SakuttoMainMenu
          lang={lang}
          themeMode={themeMode}
          prefState={prefState}
          onStylesPanelModeChange={handleStylesPanelModeChange}
        />
      </Excalidraw>
      <SakuttoRedactPanel
        lang={lang}
        active={redactState.toolActive}
        uiLayout={redactState.uiLayout}
        color={redactState.color}
        onColorChange={applyRedactColor}
      />
    </div>
  );
}

export default App;
