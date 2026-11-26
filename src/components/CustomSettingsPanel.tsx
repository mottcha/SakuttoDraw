import { useState } from 'react';
import type { AppLang } from '../types/annotator';
import {
  applyCanvasBackground,
  applyPenColor,
  getCurrentCanvasBg,
  getCurrentPenColor,
} from '../annotator/quickAnnotator/actions';
import { CANVAS_BG_SWATCHES, QUICK_OPT_DEFS } from '../annotator/quickAnnotator/constants';
import { runtime, showToast } from '../annotator/quickAnnotator/runtime';
import { getMessages } from '../i18n/messages';
import { PEN_COLOR_SWATCHES, savePrefs } from '../services/storageBridge';
import { Icon } from './Icon';
import { closeExcalidrawMainMenu, useMainMenuSubmenuDismiss } from './useOutsideDismiss';

export function CustomSettingsVisualPanel({ lang }: { lang: AppLang }) {
  const [, setTick] = useState(0);
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
        <div className="exq-pref-group-header">
          <div className="exq-pref-group-title">{t.customBehaviorTitle}</div>
          <button
            type="button"
            className="exq-pref-close-btn"
            data-exq-custom-close="1"
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
        <div className="exq-custom-toggle-list" role="group" aria-label={t.customBehaviorTitle}>
          {QUICK_OPT_DEFS.map((def) => {
            const label = t[def.msgKey];
            const on = !!runtime.prefs.quickOpts[def.key];
            return (
              <div
                key={def.key}
                role="menuitemcheckbox"
                aria-checked={on}
                className={`exq-custom-toggle-card${on ? ' exq-active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const nextVal = !runtime.prefs.quickOpts[def.key];
                  runtime.prefs.quickOpts[def.key] = nextVal;
                  savePrefs(runtime.prefs);
                  setTick((n) => n + 1);
                  showToast(`${label}: ${nextVal ? 'ON' : 'OFF'}`);
                }}
              >
                <span className="exq-custom-toggle-icon" aria-hidden="true">
                  <Icon name={def.key} size={14} strokeWidth={2} />
                </span>
                <span className="exq-custom-toggle-label">{label}</span>
                <button
                  type="button"
                  className={`exq-switch${on ? ' exq-on' : ''}`}
                  data-exq-quick-opt={def.key}
                  aria-label={label}
                  aria-pressed={on}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="exq-pref-group">
        <div className="exq-pref-group-title exq-pref-group-title--icon">
          <Icon name="penColor" size={13} strokeWidth={2} />
          <span>{t.penColor}</span>
        </div>
        <div className="exq-custom-swatch-row" role="radiogroup" aria-label={t.penColorLabel}>
          {PEN_COLOR_SWATCHES.map((hex) => (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-checked={curPen === hex}
              className={`exq-custom-swatch${curPen === hex ? ' exq-active' : ''}`}
              style={{ background: hex }}
              data-exq-pen-color={hex}
              title={hex}
              aria-label={`${t.penColorLabel} ${hex}`}
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await applyPenColor(hex);
                setTick((n) => n + 1);
              }}
            />
          ))}
        </div>
      </div>

      <div className="exq-pref-group">
        <div className="exq-pref-group-title exq-pref-group-title--icon">
          <Icon name="canvasBackground" size={13} strokeWidth={2} />
          <span>{t.canvasBackground}</span>
        </div>
        <div className="exq-custom-swatch-row" role="radiogroup" aria-label={t.bgColorLabel}>
          {CANVAS_BG_SWATCHES.map((hex) => (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-checked={curBg === hex}
              className={`exq-custom-swatch${curBg === hex ? ' exq-active' : ''}`}
              style={{ background: hex }}
              data-exq-bg-color={hex}
              title={hex}
              aria-label={`${t.bgColorLabel} ${hex}`}
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await applyCanvasBackground(hex);
                setTick((n) => n + 1);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
