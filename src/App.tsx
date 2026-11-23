import { useCallback, useEffect, useMemo, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import '@excalidraw/excalidraw/index.css';
import './styles/sakutto.css';
import type { AppLang, ThemeMode } from './types/annotator';
import { SakuttoMainMenu } from './components/SakuttoMainMenu';
import {
  attachExcalidrawAPI,
  bootQuickAnnotator,
  bootstrapCleanCanvas,
  runtime,
  setLangChangeListener,
} from './annotator/quickAnnotator';
import {
  cancelPendingScenePersist,
  loadInitialSceneData,
  savePrefs,
  scheduleScenePersist,
} from './services/storageBridge';

let bootstrappedOnce = false;

export function App() {
  const initialBootstrap = useMemo(() => {
    if (!bootstrappedOnce) {
      bootstrappedOnce = true;
      const initResult = bootstrapCleanCanvas();
      runtime.prefs = initResult.prefs;
    }
    return {
      lang: runtime.prefs.lang,
      themeMode: runtime.prefs.themeMode,
      initialDataPromise: loadInitialSceneData(),
    };
  }, []);

  const [lang, setLang] = useState<AppLang>(initialBootstrap.lang);
  const [themeMode, setThemeMode] = useState<ThemeMode>(initialBootstrap.themeMode);
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
    return () => {
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

  const handleApi = useCallback((api: ExcalidrawImperativeAPI | null) => {
    attachExcalidrawAPI(api);
  }, []);

  const handleChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      scheduleScenePersist(elements, appState as unknown as Record<string, unknown>, files);
    },
    [],
  );

  return (
    <div className="sakutto-app-root">
      <Excalidraw
        langCode={lang}
        theme={resolvedTheme}
        onThemeChange={handleThemeChange}
        aiEnabled={false}
        initialData={initialBootstrap.initialDataPromise}
        onExcalidrawAPI={handleApi}
        onChange={handleChange}
      >
        <SakuttoMainMenu lang={lang} themeMode={themeMode} />
      </Excalidraw>
    </div>
  );
}

export default App;
