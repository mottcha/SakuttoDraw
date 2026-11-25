import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement, OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import '@excalidraw/excalidraw/index.css';
import './styles/sakutto.css';
import type {
  AppLang,
  BoxSelectionPref,
  InputDevicePref,
  RedactMode,
  RedactStrength,
  StylesPanelPref,
  ThemeMode,
} from './types/annotator';
import { SakuttoMainMenu, type PreferencesLiveState } from './components/SakuttoMainMenu';
import { SakuttoRedactPanel } from './components/SakuttoRedactPanel';
import {
  attachExcalidrawAPI,
  bootQuickAnnotator,
  bootstrapCleanCanvas,
  REDACT_TOOL_CUSTOM_TYPE,
  runtime,
  setLangChangeListener,
} from './annotator/quickAnnotator';
import {
  createOrUpdateRedactElement,
  getRedactMeta,
  isRedactElement,
} from './annotator/redactProcessor';
import {
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
import { applyJapaneseGlyphOverride } from './annotator/jpGlyphOverride';

type RedactUiLayout = 'full' | 'compact' | 'phone';

interface RedactUiState {
  active: boolean;
  mode: RedactMode;
  strength: RedactStrength;
  selectedIds: string[];
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
      applyJapaneseGlyphOverride(resolvePreferJpFont(initResult.prefs));
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
    active: false,
    mode: runtime.prefs.redactOpts.mode,
    strength: runtime.prefs.redactOpts.strength,
    selectedIds: [],
    uiLayout: resolveRedactUiLayout(initialBootstrap.stylesPanelMode),
  }));
  const [redactBusy, setRedactBusy] = useState(false);
  const redactGeomRef = useRef<Map<string, string>>(new Map());
  const redactRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redactRefreshingRef = useRef(false);
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );

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
      if (redactRefreshTimerRef.current !== null) {
        clearTimeout(redactRefreshTimerRef.current);
      }
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

  const applyRedactSettingToSelected = useCallback(
    async (nextMode: RedactMode, nextStrength: RedactStrength) => {
      runtime.prefs.redactOpts = { mode: nextMode, strength: nextStrength };
      savePrefs(runtime.prefs);
      setRedactState((prev) => ({ ...prev, mode: nextMode, strength: nextStrength }));

      const api = runtime.api;
      if (!api || redactState.selectedIds.length === 0) return;

      setRedactBusy(true);
      redactRefreshingRef.current = true;
      try {
        for (const id of redactState.selectedIds) {
          const elItem = api.getSceneElements().find((item) => item.id === id && !item.isDeleted);
          if (!elItem) continue;
          await createOrUpdateRedactElement({
            api,
            rect: { x: elItem.x, y: elItem.y, width: elItem.width, height: elItem.height },
            mode: nextMode,
            strength: nextStrength,
            existingElementId: id,
            selectResult: true,
          });
        }
      } finally {
        redactRefreshingRef.current = false;
        setRedactBusy(false);
      }
    },
    [redactState.selectedIds],
  );

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
      const nextRedactActive =
        !nextZen &&
        !nextView &&
        (redactToolActive || redactSelectionOnly) &&
        !(resolveRedactUiLayout(runtime.prefs.stylesPanelMode) === 'phone' && openMenuBlocking);

      const firstMeta = redactSelectionOnly ? getRedactMeta(selectedElements[0]) : null;
      const nextMode = firstMeta ? firstMeta.mode : runtime.prefs.redactOpts.mode;
      const nextStrength = firstMeta ? firstMeta.strength : runtime.prefs.redactOpts.strength;
      const nextSelectedIds = redactSelectionOnly ? selectedElements.map((item) => item.id) : [];
      const nextLayout = resolveRedactUiLayout(runtime.prefs.stylesPanelMode);

      setRedactState((prev) => {
        if (
          prev.active === nextRedactActive &&
          prev.mode === nextMode &&
          prev.strength === nextStrength &&
          prev.uiLayout === nextLayout &&
          prev.selectedIds.length === nextSelectedIds.length &&
          prev.selectedIds.every((id, idx) => id === nextSelectedIds[idx])
        ) {
          return prev;
        }
        return {
          active: nextRedactActive,
          mode: nextMode,
          strength: nextStrength,
          selectedIds: nextSelectedIds,
          uiLayout: nextLayout,
        };
      });

      // Re-sample mosaic/blur redact elements smoothly when moved or resized
      if (!redactRefreshingRef.current && runtime.api) {
        const nextGeomMap = new Map<string, string>();
        const movedOrResized: Array<{ el: ExcalidrawElement; meta: NonNullable<ReturnType<typeof getRedactMeta>> }> = [];
        for (const item of elements) {
          if (item.isDeleted) continue;
          const meta = getRedactMeta(item);
          if (!meta) continue;
          const sig = `${Math.round(item.x * 10)}:${Math.round(item.y * 10)}:${Math.round(item.width * 10)}:${Math.round(item.height * 10)}`;
          const prevSig = redactGeomRef.current.get(item.id);
          nextGeomMap.set(item.id, sig);
          if (prevSig && prevSig !== sig && (meta.mode === 'mosaic' || meta.mode === 'blur')) {
            movedOrResized.push({ el: item, meta });
          }
        }
        redactGeomRef.current = nextGeomMap;

        if (movedOrResized.length > 0) {
          if (redactRefreshTimerRef.current !== null) {
            clearTimeout(redactRefreshTimerRef.current);
          }
          redactRefreshTimerRef.current = setTimeout(() => {
            redactRefreshTimerRef.current = null;
            const api = runtime.api;
            if (!api || redactRefreshingRef.current) return;
            void (async () => {
              redactRefreshingRef.current = true;
              try {
                for (const { el: targetEl, meta } of movedOrResized) {
                  const latest = api.getSceneElements().find((x) => x.id === targetEl.id && !x.isDeleted);
                  if (!latest) continue;
                  await createOrUpdateRedactElement({
                    api,
                    rect: { x: latest.x, y: latest.y, width: latest.width, height: latest.height },
                    mode: meta.mode,
                    strength: meta.strength,
                    existingElementId: latest.id,
                    selectResult: false,
                  });
                }
              } finally {
                redactRefreshingRef.current = false;
              }
            })();
          }, 180);
        }
      }

      scheduleScenePersist(elements, appState as unknown as Record<string, unknown>, files);
    },
    [],
  );

  return (
    <div className={`sakutto-app-root${redactState.active ? ' exq-redact-panel-active' : ''}`}>
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
        active={redactState.active}
        uiLayout={redactState.uiLayout}
        mode={redactState.mode}
        strength={redactState.strength}
        isBusy={redactBusy}
        onModeChange={(nextMode) => void applyRedactSettingToSelected(nextMode, redactState.strength)}
        onStrengthChange={(nextStrength) => void applyRedactSettingToSelected(redactState.mode, nextStrength)}
      />
    </div>
  );
}

export default App;
