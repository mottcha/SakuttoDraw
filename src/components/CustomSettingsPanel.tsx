import type { AppLang } from '../types/annotator';
import {
  applyCanvasBackground,
  applyPenColor,
  getCurrentCanvasBg,
  getCurrentPenColor,
} from '../annotator/quickAnnotator/actions';
import { CANVAS_BG_SWATCHES, QUICK_OPT_DEFS } from '../annotator/quickAnnotator/constants';
import { notifyRuntimeChange, runtime, showToast } from '../annotator/quickAnnotator/runtime';
import { getMessages } from '../i18n/messages';
import { PEN_COLOR_SWATCHES, savePrefs } from '../services/storageBridge';
import { Icon } from './Icon';
import { ColorSwatchGrid, PanelHeader, useRuntimeChangeTick } from './PanelPrimitives';
import { closeExcalidrawMainMenu, useMainMenuSubmenuDismiss } from './useOutsideDismiss';

export function CustomSettingsVisualPanel({ lang }: { lang: AppLang }) {
  useRuntimeChangeTick();
  const t = getMessages(lang);

  useMainMenuSubmenuDismiss();

  const curPen = getCurrentPenColor();
  const curBg = getCurrentCanvasBg();

  return (
    <div
      className="exq-pref-panel exq-custom-panel"
      data-exq-custom-panel="1"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="exq-pref-group">
        <PanelHeader
          title={t.customBehaviorTitle}
          closeLabel={t.closeLabel}
          onClose={closeExcalidrawMainMenu}
          closeDataAttr="data-exq-custom-close"
        />
        <div className="exq-custom-toggle-list" role="group" aria-label={t.customBehaviorTitle}>
          {QUICK_OPT_DEFS.map((def) => {
            const label = t[def.msgKey];
            const on = !!runtime.prefs.quickOpts[def.key];
            return (
              <button
                key={def.key}
                type="button"
                role="switch"
                aria-checked={on}
                data-exq-quick-opt={def.key}
                className={`exq-custom-toggle-card${on ? ' exq-active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const nextVal = !runtime.prefs.quickOpts[def.key];
                  runtime.prefs.quickOpts[def.key] = nextVal;
                  savePrefs(runtime.prefs);
                  notifyRuntimeChange();
                  showToast(`${label}: ${nextVal ? t.stateOn : t.stateOff}`);
                }}
              >
                <span className="exq-custom-toggle-icon" aria-hidden="true">
                  <Icon name={def.key} size={14} strokeWidth={2} />
                </span>
                <span className="exq-custom-toggle-label">{label}</span>
                <span className={`exq-switch${on ? ' exq-on' : ''}`} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="exq-pref-group">
        <div className="exq-pref-group-title exq-pref-group-title--icon">
          <Icon name="penColor" size={13} strokeWidth={2} />
          <span>{t.penColor}</span>
        </div>
        <ColorSwatchGrid
          colors={PEN_COLOR_SWATCHES}
          selectedColor={curPen}
          ariaLabel={t.penColor}
          gridClassName="exq-custom-swatch-row"
          buttonClassName="exq-custom-swatch"
          dataAttrName="data-exq-pen-color"
          onSelect={(hex) => {
            void applyPenColor(hex);
          }}
        />
      </div>

      <div className="exq-pref-group">
        <div className="exq-pref-group-title exq-pref-group-title--icon">
          <Icon name="canvasBackground" size={13} strokeWidth={2} />
          <span>{t.canvasBackground}</span>
        </div>
        <ColorSwatchGrid
          colors={CANVAS_BG_SWATCHES}
          selectedColor={curBg}
          ariaLabel={t.bgColorLabel}
          gridClassName="exq-custom-swatch-row"
          buttonClassName="exq-custom-swatch"
          dataAttrName="data-exq-bg-color"
          onSelect={(hex) => {
            void applyCanvasBackground(hex);
          }}
        />
      </div>
    </div>
  );
}
