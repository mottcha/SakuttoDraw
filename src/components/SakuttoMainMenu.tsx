import { useEffect, useState } from 'react';
import { CaptureUpdateAction, MainMenu } from '@excalidraw/excalidraw';
import type {
  AppLang,
  BoxSelectionPref,
  CjkLang,
  CjkSetStatus,
  InputDevicePref,
  StylesPanelPref,
  ThemeMode,
} from '../types/annotator';
import { getMessages, SUPPORTED_LANGS } from '../i18n/messages';
import {
  CJK_LANG_ORDER,
  cjkFontManifest,
  deleteLanguageFontSet,
  downloadLanguageFontSet,
  formatBytesToMB,
  isLanguageSetCached,
} from '../annotator/cjkFontManager';
import { applyLanguage, runtime, showToast } from '../annotator/quickAnnotator';
import { savePrefs } from '../services/storageBridge';

export interface PreferencesLiveState {
  boxSelectionMode: BoxSelectionPref;
  inputDevice: InputDevicePref;
  stylesPanelMode: StylesPanelPref;
  zenModeEnabled: boolean;
  viewModeEnabled: boolean;
}

interface CjkUiState {
  statuses: Record<CjkLang, CjkSetStatus>;
  progress: Record<CjkLang, number>;
}

const cjkUiStore: CjkUiState = {
  statuses: { ja: 'uninstalled', ko: 'uninstalled', zh: 'uninstalled' },
  progress: { ja: 0, ko: 0, zh: 0 },
};

const cjkListeners = new Set<() => void>();

function notifyCjkListeners(): void {
  for (const listener of cjkListeners) {
    listener();
  }
}

async function toggleLanguageFontCache(cjkLang: CjkLang, uiLang: AppLang): Promise<void> {
  const currentStatus = cjkUiStore.statuses[cjkLang];
  if (currentStatus === 'downloading') return;

  const msgs = getMessages(uiLang);
  const display = msgs.cjkLangName[cjkLang];

  if (currentStatus === 'installed') {
    const res = await deleteLanguageFontSet(cjkLang);
    if (res.ok) {
      cjkUiStore.statuses = { ...cjkUiStore.statuses, [cjkLang]: 'uninstalled' };
      cjkUiStore.progress = { ...cjkUiStore.progress, [cjkLang]: 0 };
      notifyCjkListeners();
      showToast(msgs.toastFontDeleted(display));
    } else {
      showToast(msgs.toastFontDeleteFailed(display));
    }
    return;
  }

  cjkUiStore.statuses = { ...cjkUiStore.statuses, [cjkLang]: 'downloading' };
  cjkUiStore.progress = { ...cjkUiStore.progress, [cjkLang]: 0 };
  notifyCjkListeners();

  const res = await downloadLanguageFontSet(cjkLang, {
    onProgress: (done, total) => {
      const pct = total > 0 ? Math.round((done / total) * 100) : 100;
      cjkUiStore.progress = { ...cjkUiStore.progress, [cjkLang]: pct };
      notifyCjkListeners();
    },
  });

  if (res.ok) {
    cjkUiStore.statuses = { ...cjkUiStore.statuses, [cjkLang]: 'installed' };
    cjkUiStore.progress = { ...cjkUiStore.progress, [cjkLang]: 100 };
    notifyCjkListeners();
    showToast(msgs.toastFontDownloaded(display));
  } else {
    cjkUiStore.statuses = { ...cjkUiStore.statuses, [cjkLang]: 'uninstalled' };
    cjkUiStore.progress = { ...cjkUiStore.progress, [cjkLang]: 0 };
    notifyCjkListeners();
    showToast(msgs.toastFontDownloadFailed(display));
  }
}

function PrefIcon({ name }: { name: 'overlap' | 'contain' | 'pan' | 'zoom' | 'zen' | 'view' | 'dl' | 'trash' }) {
  if (name === 'overlap') {
    return (
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <rect x="2.5" y="2.5" width="9.5" height="9.5" rx="1.5" strokeDasharray="2.5 2" />
        <rect x="7.5" y="7.5" width="9.5" height="9.5" rx="2" fill="currentColor" fillOpacity="0.18" />
      </svg>
    );
  }
  if (name === 'contain') {
    return (
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <rect x="2" y="2" width="16" height="16" rx="2" strokeDasharray="2.5 2" />
        <rect x="6" y="6" width="8" height="8" rx="1.5" fill="currentColor" fillOpacity="0.22" />
      </svg>
    );
  }
  if (name === 'pan') {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="5 9 2 12 5 15" />
        <polyline points="9 5 12 2 15 5" />
        <polyline points="15 19 12 22 9 19" />
        <polyline points="19 9 22 12 19 15" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="12" y1="2" x2="12" y2="22" />
      </svg>
    );
  }
  if (name === 'zoom') {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="11" y1="8" x2="11" y2="14" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
    );
  }
  if (name === 'zen') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 3H5a2 2 0 0 0-2 2v3" />
        <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
        <path d="M3 16v3a2 2 0 0 0 2 2h3" />
        <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
      </svg>
    );
  }
  if (name === 'view') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  if (name === 'trash') {
    return (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 6h18" />
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      </svg>
    );
  }
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function PreferencesVisualPanel({
  lang,
  prefState,
  onStylesPanelModeChange,
}: {
  lang: AppLang;
  prefState: PreferencesLiveState;
  onStylesPanelModeChange: (mode: StylesPanelPref) => void;
}) {
  const t = getMessages(lang);

  const closePreferencesMenu = () => {
    runtime.api?.updateScene({
      appState: { openMenu: null },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    if (typeof document !== 'undefined') {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }),
      );
    }
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onPointerDownOutside = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest('.excalidraw-main-menu-preferences-submenu') ||
        target.closest('.main-menu') ||
        target.closest('.main-menu-trigger')
      ) {
        return;
      }
      closePreferencesMenu();
    };
    document.addEventListener('pointerdown', onPointerDownOutside, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDownOutside, true);
    };
  }, []);

  const setBoxSelectionMode = (mode: BoxSelectionPref) => {
    runtime.prefs.boxSelectionMode = mode;
    savePrefs(runtime.prefs);
    runtime.api?.updateScene({
      appState: { boxSelectionMode: mode },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  };

  const setInputDevice = (device: InputDevicePref) => {
    runtime.prefs.inputDevice = device;
    savePrefs(runtime.prefs);
    runtime.api?.updateScene({
      appState: { inputDevice: device },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  };

  const toggleZenMode = () => {
    const current = runtime.api?.getAppState()?.zenModeEnabled ?? prefState.zenModeEnabled;
    runtime.api?.updateScene({
      appState: { zenModeEnabled: !current },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    });
  };

  const toggleViewMode = () => {
    const current = runtime.api?.getAppState()?.viewModeEnabled ?? prefState.viewModeEnabled;
    runtime.api?.updateScene({
      appState: { viewModeEnabled: !current },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    });
  };

  return (
    <div
      className="exq-pref-panel"
      data-exq-pref-panel="1"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="exq-pref-group">
        <div className="exq-pref-group-header">
          <div className="exq-pref-group-title">{t.prefBoxSelectionTitle}</div>
          <button
            type="button"
            className="exq-pref-close-btn"
            data-exq-pref-close="1"
            aria-label="Close"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              closePreferencesMenu();
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="exq-pref-card-grid" role="radiogroup" aria-label={t.prefBoxSelectionTitle}>
          <button
            type="button"
            role="radio"
            aria-checked={prefState.boxSelectionMode === 'overlap'}
            className={`exq-pref-card${prefState.boxSelectionMode === 'overlap' ? ' exq-active' : ''}`}
            data-exq-pref-box="overlap"
            onClick={() => setBoxSelectionMode('overlap')}
          >
            <PrefIcon name="overlap" />
            <span>{t.prefBoxOverlap}</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={prefState.boxSelectionMode === 'contain'}
            className={`exq-pref-card${prefState.boxSelectionMode === 'contain' ? ' exq-active' : ''}`}
            data-exq-pref-box="contain"
            onClick={() => setBoxSelectionMode('contain')}
          >
            <PrefIcon name="contain" />
            <span>{t.prefBoxContain}</span>
          </button>
        </div>
      </div>

      <div className="exq-pref-group">
        <div className="exq-pref-group-title">{t.prefScrollActionTitle}</div>
        <div className="exq-pref-card-grid" role="radiogroup" aria-label={t.prefScrollActionTitle}>
          <button
            type="button"
            role="radio"
            aria-checked={prefState.inputDevice === 'trackpad'}
            className={`exq-pref-card${prefState.inputDevice === 'trackpad' ? ' exq-active' : ''}`}
            data-exq-pref-scroll="trackpad"
            onClick={() => setInputDevice('trackpad')}
          >
            <PrefIcon name="pan" />
            <span>{t.prefScrollPan}</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={prefState.inputDevice === 'mouse'}
            className={`exq-pref-card${prefState.inputDevice === 'mouse' ? ' exq-active' : ''}`}
            data-exq-pref-scroll="mouse"
            onClick={() => setInputDevice('mouse')}
          >
            <PrefIcon name="zoom" />
            <span>{t.prefScrollZoom}</span>
          </button>
        </div>
      </div>

      <div className="exq-pref-group">
        <div className="exq-pref-group-title">{t.prefStylesPanelTitle}</div>
        <div className="exq-pref-card-grid exq-pref-card-grid--3" role="radiogroup" aria-label={t.prefStylesPanelTitle}>
          {(
            [
              ['auto', t.prefStylesPanelAuto],
              ['compact', t.prefStylesPanelCompact],
              ['full', t.prefStylesPanelFull],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={prefState.stylesPanelMode === mode}
              className={`exq-pref-card${prefState.stylesPanelMode === mode ? ' exq-active' : ''}`}
              data-exq-pref-styles-panel={mode}
              onClick={() => onStylesPanelModeChange(mode)}
            >
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="exq-pref-group">
        <div className="exq-pref-group-title">{t.prefScreenModeTitle}</div>
        <div className="exq-pref-card-grid">
          <button
            type="button"
            aria-pressed={prefState.zenModeEnabled}
            className={`exq-pref-card${prefState.zenModeEnabled ? ' exq-active' : ''}`}
            data-exq-pref-mode="zen"
            onClick={toggleZenMode}
          >
            <PrefIcon name="zen" />
            <span>{t.prefZenMode}</span>
            <span className="exq-pref-shortcut">Alt+Z</span>
          </button>
          <button
            type="button"
            aria-pressed={prefState.viewModeEnabled}
            className={`exq-pref-card${prefState.viewModeEnabled ? ' exq-active' : ''}`}
            data-exq-pref-mode="view"
            onClick={toggleViewMode}
          >
            <PrefIcon name="view" />
            <span>{t.prefViewMode}</span>
            <span className="exq-pref-shortcut">Alt+R</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function CjkFontCacheSection({ lang }: { lang: AppLang }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const onUpdate = () => setTick((n) => n + 1);
    cjkListeners.add(onUpdate);

    let cancelled = false;
    for (const cjkLang of CJK_LANG_ORDER) {
      void isLanguageSetCached(cjkLang).then((cached) => {
        if (cancelled) return;
        if (cjkUiStore.statuses[cjkLang] !== 'downloading') {
          const next: CjkSetStatus = cached ? 'installed' : 'uninstalled';
          if (cjkUiStore.statuses[cjkLang] !== next) {
            cjkUiStore.statuses = { ...cjkUiStore.statuses, [cjkLang]: next };
            notifyCjkListeners();
          }
        }
      });
    }

    return () => {
      cancelled = true;
      cjkListeners.delete(onUpdate);
    };
  }, []);

  const t = getMessages(lang);

  return (
    <>
      <MainMenu.Separator />
      <div
        className="exq-pref-fonts"
        data-exq-pref-fonts="1"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="exq-font-section-title">{t.offlineFontsTitle}</div>
        <div className="exq-font-chip-grid">
          {CJK_LANG_ORDER.map((cjkLang) => {
            const meta = cjkFontManifest.sets[cjkLang];
            const sizeLabel = formatBytesToMB(meta.totalBytes);
            const status = cjkUiStore.statuses[cjkLang];
            const label = t.cjkLangName[cjkLang];
            const actionHint =
              status === 'downloading'
                ? `${cjkUiStore.progress[cjkLang]}%`
                : status === 'installed'
                  ? t.fontDelete
                  : sizeLabel;
            const titleText =
              status === 'installed'
                ? `${label} (${sizeLabel}) — ${t.fontDelete}`
                : `${label} (${sizeLabel}) — ${t.fontDownload}`;

            return (
              <button
                key={cjkLang}
                type="button"
                className={`exq-font-chip${status === 'installed' ? ' exq-font-chip--installed' : ''}`}
                data-exq-cjk-row={cjkLang}
                data-exq-cjk-btn={cjkLang}
                data-exq-cjk-state={status}
                title={titleText}
                aria-label={titleText}
                disabled={status === 'downloading'}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void toggleLanguageFontCache(cjkLang, lang);
                }}
              >
                <span className="exq-font-chip-name">{label}</span>
                <span className="exq-font-chip-sub">
                  {status === 'installed' ? (
                    <PrefIcon name="trash" />
                  ) : status === 'uninstalled' ? (
                    <PrefIcon name="dl" />
                  ) : null}
                  <span>{actionHint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

export interface SakuttoMainMenuProps {
  lang: AppLang;
  themeMode: ThemeMode;
  prefState: PreferencesLiveState;
  onStylesPanelModeChange: (mode: StylesPanelPref) => void;
}

export function SakuttoMainMenu({
  lang,
  themeMode,
  prefState,
  onStylesPanelModeChange,
}: SakuttoMainMenuProps) {
  const t = getMessages(lang);

  return (
    <MainMenu>
      <MainMenu.DefaultItems.LoadScene />
      <MainMenu.DefaultItems.SaveToActiveFile />
      <MainMenu.DefaultItems.Export />
      <MainMenu.DefaultItems.SaveAsImage />
      <MainMenu.Separator />
      <MainMenu.DefaultItems.Preferences
        additionalItems={<CjkFontCacheSection lang={lang} />}
      >
        <PreferencesVisualPanel
          lang={lang}
          prefState={prefState}
          onStylesPanelModeChange={onStylesPanelModeChange}
        />
      </MainMenu.DefaultItems.Preferences>
      <MainMenu.DefaultItems.ToggleTheme
        allowSystemTheme={true}
        theme={themeMode}
      />
      <MainMenu.ItemCustom className="exq-main-lang-item">
        <select
          className="dropdown-select dropdown-select__language exq-main-lang-select"
          data-exq-lang-select="1"
          aria-label={t.languageLabel}
          value={lang}
          onChange={(e) => {
            applyLanguage(e.target.value as AppLang);
          }}
        >
          {SUPPORTED_LANGS.map((item) => (
            <option key={item.code} value={item.code}>
              {item.nativeLabel}
            </option>
          ))}
        </select>
      </MainMenu.ItemCustom>
    </MainMenu>
  );
}
