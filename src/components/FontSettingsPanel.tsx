import { useEffect, useState } from 'react';
import type { AppLang } from '../types/annotator';
import { CJK_LANG_ORDER, cjkFontManifest, formatBytesToMB } from '../annotator/cjkFontManager';
import { applyCodeLigatures, applyPreferJpFont, runtime } from '../annotator/quickAnnotator/runtime';
import { getMessages } from '../i18n/messages';
import { resolvePreferJpFont } from '../services/storageBridge';
import { Icon } from './Icon';
import {
  refreshCjkCacheStatuses,
  toggleLanguageFontCache,
  useCjkFontCacheState,
} from './cjkFontStore';
import { closeExcalidrawMainMenu, useMainMenuSubmenuDismiss } from './useOutsideDismiss';

export function FontSettingsPanel({ lang }: { lang: AppLang }) {
  const cjkState = useCjkFontCacheState();
  const [, setTick] = useState(0);

  useMainMenuSubmenuDismiss();

  useEffect(() => {
    let cancelled = false;
    refreshCjkCacheStatuses(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, []);

  const t = getMessages(lang);
  const preferJpActive = resolvePreferJpFont({
    lang,
    preferJpFont: runtime.prefs.preferJpFont,
  });
  const codeLigaturesActive = runtime.prefs.codeLigatures;

  const selectPreferJpFont = (enabled: boolean) => {
    applyPreferJpFont(enabled);
    setTick((n) => n + 1);
  };

  const selectCodeLigatures = (enabled: boolean) => {
    applyCodeLigatures(enabled);
    setTick((n) => n + 1);
  };

  return (
    <div
      className="exq-pref-panel exq-font-settings-panel"
      data-exq-font-settings-panel="1"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="exq-pref-group" data-exq-prefer-jp-group="1">
        <div className="exq-pref-group-header">
          <div className="exq-pref-group-title">{t.prefPreferJpFont}</div>
          <button
            type="button"
            className="exq-pref-close-btn"
            data-exq-font-settings-close="1"
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
        <div className="exq-pref-card-grid" role="radiogroup" aria-label={t.prefPreferJpFont}>
          <button
            type="button"
            role="radio"
            aria-checked={preferJpActive}
            className={`exq-pref-card${preferJpActive ? ' exq-active' : ''}`}
            data-exq-prefer-jp-card="jp"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              selectPreferJpFont(true);
            }}
          >
            <Icon name="kanjiJp" size={15} strokeWidth={1.8} />
            <span>{t.preferJpOptionJa}</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!preferJpActive}
            className={`exq-pref-card${!preferJpActive ? ' exq-active' : ''}`}
            data-exq-prefer-jp-card="zh"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              selectPreferJpFont(false);
            }}
          >
            <Icon name="kanjiZh" size={15} strokeWidth={1.8} />
            <span>{t.preferJpOptionZh}</span>
          </button>
        </div>
      </div>

      <div className="exq-pref-group" data-exq-code-ligatures-group="1">
        <div className="exq-pref-group-title">{t.prefCodeLigatures}</div>
        <div className="exq-pref-card-grid" role="radiogroup" aria-label={t.prefCodeLigatures}>
          <button
            type="button"
            role="radio"
            aria-checked={codeLigaturesActive}
            className={`exq-pref-card${codeLigaturesActive ? ' exq-active' : ''}`}
            data-exq-code-ligatures="on"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              selectCodeLigatures(true);
            }}
          >
            <span>{t.prefCodeLigaturesOn}</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!codeLigaturesActive}
            className={`exq-pref-card${!codeLigaturesActive ? ' exq-active' : ''}`}
            data-exq-code-ligatures="off"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              selectCodeLigatures(false);
            }}
          >
            <span>{t.prefCodeLigaturesOff}</span>
          </button>
        </div>
      </div>

      <div className="exq-pref-group">
        <div className="exq-font-section-title">{t.offlineFontsTitle}</div>
        <div className="exq-font-chip-grid">
          {CJK_LANG_ORDER.map((cjkLang) => {
            const meta = cjkFontManifest.sets[cjkLang];
            const sizeLabel = formatBytesToMB(meta.totalBytes);
            const status = cjkState.statuses[cjkLang];
            const label = t.cjkLangName[cjkLang];
            const actionHint =
              status === 'downloading'
                ? `${cjkState.progress[cjkLang]}%`
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
                    <Icon name="reset" size={11} strokeWidth={2.2} />
                  ) : status === 'uninstalled' ? (
                    <Icon name="download" size={11} strokeWidth={2.2} />
                  ) : null}
                  <span>{actionHint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
