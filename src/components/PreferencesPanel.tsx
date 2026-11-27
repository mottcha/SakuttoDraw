import { CaptureUpdateAction } from '@excalidraw/excalidraw';
import type {
  AppLang,
  BoxSelectionPref,
  InputDevicePref,
  QuickSaveModePref,
  StylesPanelPref,
} from '../types/annotator';
import { runtime } from '../annotator/quickAnnotator/runtime';
import { getMessages } from '../i18n/messages';
import { savePrefs } from '../services/storageBridge';
import { isMacPlatform } from '../utils/common';
import { Icon } from './Icon';
import { handleRadioGroupKeyDown, PanelHeader } from './PanelPrimitives';
import { closeExcalidrawMainMenu, useMainMenuSubmenuDismiss } from './useOutsideDismiss';

export interface PreferencesLiveState {
  boxSelectionMode: BoxSelectionPref;
  inputDevice: InputDevicePref;
  stylesPanelMode: StylesPanelPref;
  quickSaveMode: QuickSaveModePref;
  zenModeEnabled: boolean;
  viewModeEnabled: boolean;
}

export function PreferencesVisualPanel({
  lang,
  prefState,
  onStylesPanelModeChange,
  onQuickSaveModeChange,
}: {
  lang: AppLang;
  prefState: PreferencesLiveState;
  onStylesPanelModeChange: (mode: StylesPanelPref) => void;
  onQuickSaveModeChange: (mode: QuickSaveModePref) => void;
}) {
  const t = getMessages(lang);
  const isMac = isMacPlatform();

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
        <PanelHeader
          title={t.prefBoxSelectionTitle}
          closeLabel={t.closeLabel}
          onClose={closeExcalidrawMainMenu}
          closeDataAttr="data-exq-pref-close"
        />
        <div
          className="exq-pref-card-grid"
          role="radiogroup"
          aria-label={t.prefBoxSelectionTitle}
          onKeyDown={handleRadioGroupKeyDown}
        >
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
        <div
          className="exq-pref-card-grid"
          role="radiogroup"
          aria-label={t.prefScrollActionTitle}
          onKeyDown={handleRadioGroupKeyDown}
        >
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
        <div
          className="exq-pref-card-grid exq-pref-card-grid--3"
          role="radiogroup"
          aria-label={t.prefStylesPanelTitle}
          onKeyDown={handleRadioGroupKeyDown}
        >
          {(
            [
              ['auto', 'panelAuto', t.prefStylesPanelAuto],
              ['compact', 'panelCompact', t.prefStylesPanelCompact],
              ['full', 'panelFull', t.prefStylesPanelFull],
            ] as const
          ).map(([mode, iconName, label]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={prefState.stylesPanelMode === mode}
              className={`exq-pref-card exq-pref-card--compact3${prefState.stylesPanelMode === mode ? ' exq-active' : ''}`}
              data-exq-pref-styles-panel={mode}
              onClick={() => onStylesPanelModeChange(mode)}
            >
              <Icon name={iconName} width={18} height={13} strokeWidth={1.6} />
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
            <span className="exq-pref-shortcut">{isMac ? '⌥Z' : 'Alt+Z'}</span>
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
            <span className="exq-pref-shortcut">{isMac ? '⌥R' : 'Alt+R'}</span>
          </button>
        </div>
      </div>

      <div className="exq-pref-group">
        <div className="exq-pref-group-title">{t.prefQuickSaveTitle}</div>
        <div
          className="exq-pref-card-grid"
          role="radiogroup"
          aria-label={t.prefQuickSaveTitle}
          onKeyDown={handleRadioGroupKeyDown}
        >
          <button
            type="button"
            role="radio"
            aria-checked={prefState.quickSaveMode === 'direct'}
            className={`exq-pref-card${prefState.quickSaveMode === 'direct' ? ' exq-active' : ''}`}
            data-exq-pref-quick-save="direct"
            onClick={() => onQuickSaveModeChange('direct')}
          >
            <Icon name="download" size={14} strokeWidth={1.8} />
            <span>{t.prefQuickSaveDirect}</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={prefState.quickSaveMode === 'dialog'}
            className={`exq-pref-card${prefState.quickSaveMode === 'dialog' ? ' exq-active' : ''}`}
            data-exq-pref-quick-save="dialog"
            onClick={() => onQuickSaveModeChange('dialog')}
          >
            <Icon name="folderSave" size={14} strokeWidth={1.8} />
            <span>{t.prefQuickSaveDialog}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
