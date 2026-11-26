import { CaptureUpdateAction } from '@excalidraw/excalidraw';
import type {
  AppLang,
  BoxSelectionPref,
  InputDevicePref,
  StylesPanelPref,
} from '../types/annotator';
import { runtime } from '../annotator/quickAnnotator/runtime';
import { getMessages } from '../i18n/messages';
import { savePrefs } from '../services/storageBridge';
import { Icon } from './Icon';
import { closeExcalidrawMainMenu, useMainMenuSubmenuDismiss } from './useOutsideDismiss';

export interface PreferencesLiveState {
  boxSelectionMode: BoxSelectionPref;
  inputDevice: InputDevicePref;
  stylesPanelMode: StylesPanelPref;
  zenModeEnabled: boolean;
  viewModeEnabled: boolean;
}

export function PreferencesVisualPanel({
  lang,
  prefState,
  onStylesPanelModeChange,
}: {
  lang: AppLang;
  prefState: PreferencesLiveState;
  onStylesPanelModeChange: (mode: StylesPanelPref) => void;
}) {
  const t = getMessages(lang);

  useMainMenuSubmenuDismiss();

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
              closeExcalidrawMainMenu();
            }}
          >
            <Icon name="close" size={13} strokeWidth={2.2} />
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
            <Icon name="overlap" size={14} strokeWidth={1.6} />
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
            <Icon name="contain" size={14} strokeWidth={1.6} />
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
            <Icon name="pan" size={13} strokeWidth={2} />
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
            <Icon name="zoom" size={13} strokeWidth={2} />
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
              className={`exq-pref-card exq-pref-card--compact3${prefState.stylesPanelMode === mode ? ' exq-active' : ''}`}
              data-exq-pref-styles-panel={mode}
              onClick={() => onStylesPanelModeChange(mode)}
            >
              <svg width="18" height="13" viewBox="0 0 26 18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <rect x="1" y="1" width="24" height="16" rx="2.5" opacity="0.45" />
                {mode === 'full' ? (
                  <rect x="3" y="3.5" width="9.5" height="11" rx="1.2" fill="currentColor" stroke="none" />
                ) : (
                  <rect x="3" y="3.5" width="3.5" height="11" rx="1" fill="currentColor" stroke="none" />
                )}
                {mode === 'auto' && (
                  <path
                    d="M11 9h9m-2.5-2.5L20 9l-2.5 2.5M13.5 6.5L11 9l2.5 2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </svg>
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
            <Icon name="zen" size={14} strokeWidth={2} />
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
            <Icon name="view" size={14} strokeWidth={2} />
            <span>{t.prefViewMode}</span>
            <span className="exq-pref-shortcut">Alt+R</span>
          </button>
        </div>
      </div>
    </div>
  );
}
