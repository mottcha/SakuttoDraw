import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AppLang, CjkLang } from '../types/annotator';
import { cjkFontManifest, formatBytesToMB } from '../annotator/cjkFontManager';
import { applyCodeLigatures, applyPreferJpFont, runtime } from '../annotator/quickAnnotator/runtime';
import { EXCALIDRAW_SELECTORS } from '../excalidraw/domContract';
import { getMessages, type MessageCatalog } from '../i18n/messages';
import { resolvePreferJpFont } from '../services/storageBridge';
import { Icon } from './Icon';
import {
  refreshCjkCacheStatuses,
  toggleLanguageFontCache,
  useCjkFontCacheState,
} from './cjkFontStore';
import { closeExcalidrawMainMenu, useMainMenuSubmenuDismiss } from './useOutsideDismiss';

type FontSlotId = 'hand-drawn' | 'normal' | 'pop' | 'code' | 'code-hand';

interface FontSlotDef {
  id: FontSlotId;
  packWhenJp: CjkLang;
  renderIcon: () => ReactNode;
  getLabel: (t: MessageCatalog) => string;
  getSubtitle: (preferJp: boolean, codeLigatures: boolean) => string;
}

const FONT_SLOT_DEFS: readonly FontSlotDef[] = [
  {
    id: 'hand-drawn',
    packWhenJp: 'ja',
    renderIcon: () => <Icon name="drawAssist" size={13} strokeWidth={1.8} />,
    getLabel: (t) => t.fontLabelHandDrawn,
    getSubtitle: (preferJp) => (preferJp ? 'Excalifont + SetoJP' : 'Excalifont + Xiaolai'),
  },
  {
    id: 'normal',
    packWhenJp: 'jaStandard',
    renderIcon: () => (
      <span className="exq-font-glyph-icon" aria-hidden="true">
        A
      </span>
    ),
    getLabel: (t) => t.fontLabelNormal,
    getSubtitle: (preferJp) => (preferJp ? 'BIZ UDPGothic Bold' : 'Nunito'),
  },
  {
    id: 'pop',
    packWhenJp: 'jaPop',
    renderIcon: () => (
      <span className="exq-font-glyph-icon exq-font-glyph-icon--bold" aria-hidden="true">
        H
      </span>
    ),
    getLabel: (t) => t.fontLabelPop,
    getSubtitle: (preferJp) => (preferJp ? 'Lilita One + Mochiy Pop P One' : 'Lilita One'),
  },
  {
    id: 'code',
    packWhenJp: 'jaCode',
    renderIcon: () => <Icon name="code" size={13} strokeWidth={1.9} />,
    getLabel: (t) => t.fontLabelCode,
    getSubtitle: (preferJp, codeLigatures) => {
      if (preferJp) {
        return codeLigatures ? 'UDEV Gothic LG (Subset)' : 'UDEV Gothic (Subset)';
      }
      return codeLigatures ? 'Cascadia Code' : 'Cascadia Mono';
    },
  },
  {
    id: 'code-hand',
    packWhenJp: 'ja',
    renderIcon: () => <Icon name="code" size={13} strokeWidth={1.9} />,
    getLabel: (t) => t.fontLabelCodeHandDrawn,
    getSubtitle: (preferJp) => (preferJp ? 'Comic Shanns (1:2) + SetoJP' : 'Comic Shanns'),
  },
] as const;

interface FontCreditEntry {
  name: string;
  author: string;
  license: string;
  getUsage: (t: MessageCatalog) => string;
}

const FONT_CREDITS: readonly FontCreditEntry[] = [
  {
    name: 'Excalifont',
    author: 'Excalidraw',
    license: 'SIL OFL 1.1',
    getUsage: (t) => t.fontLabelHandDrawn,
  },
  {
    name: 'SetoJP (KosefontP-JP / SetoFont)',
    author: 'Nozomi Seto (瀬戸のぞみ) / LXGW',
    license: 'SIL OFL 1.1',
    getUsage: (t) => `${t.fontLabelHandDrawn} / ${t.fontLabelCodeHandDrawn}`,
  },
  {
    name: 'Xiaolai (小赖字体)',
    author: 'LXGW (based on SetoFont)',
    license: 'SIL OFL 1.1',
    getUsage: (t) => `${t.fontLabelHandDrawn} / ${t.fontLicenseCjkFallback}`,
  },
  {
    name: 'BIZ UDPGothic (Bold)',
    author: 'The BIZ UDGothic Project Authors (Morisawa Inc.)',
    license: 'SIL OFL 1.1',
    getUsage: (t) => t.fontLabelNormal,
  },
  {
    name: 'Nunito',
    author: 'The Nunito Project Authors',
    license: 'SIL OFL 1.1',
    getUsage: (t) => t.fontLabelNormal,
  },
  {
    name: 'Lilita One',
    author: 'Juan Montoreano',
    license: 'SIL OFL 1.1',
    getUsage: (t) => t.fontLabelPop,
  },
  {
    name: 'Mochiy Pop P One',
    author: 'The Mochiypop Project Authors',
    license: 'SIL OFL 1.1',
    getUsage: (t) => t.fontLabelPop,
  },
  {
    name: 'SakuttoCode (subset of UDEV Gothic)',
    author: 'Yuko Otawara / JetBrains Mono / BIZ UDGothic / Nerd Fonts',
    license: 'SIL OFL 1.1',
    getUsage: (t) => t.fontLabelCode,
  },
  {
    name: 'Cascadia Code / Mono',
    author: 'Microsoft Corporation',
    license: 'SIL OFL 1.1',
    getUsage: (t) => t.fontLabelCode,
  },
  {
    name: 'Comic Shanns / Narrow500',
    author: 'Shannon Miwa / Jesus Gonzalez / SakuttoDraw',
    license: 'MIT License',
    getUsage: (t) => t.fontLabelCodeHandDrawn,
  },
] as const;

export function FontSettingsPanel({ lang }: { lang: AppLang }) {
  const cjkState = useCjkFontCacheState();
  const [otherCjkOpen, setOtherCjkOpen] = useState(false);
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [, setTick] = useState(0);

  useMainMenuSubmenuDismiss();

  useEffect(() => {
    let cancelled = false;
    refreshCjkCacheStatuses(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!licenseModalOpen || typeof document === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setLicenseModalOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [licenseModalOpen]);

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

  const renderPackActionButton = (cjkLang: CjkLang, includeLangName: boolean) => {
    const meta = cjkFontManifest.sets[cjkLang];
    const sizeLabel = formatBytesToMB(meta.totalBytes);
    const status = cjkState.statuses[cjkLang];
    const langName = t.cjkLangName[cjkLang];
    const titleText =
      status === 'installed'
        ? `${langName} (${sizeLabel}) — ${t.fontDelete}`
        : `${langName} (${sizeLabel}) — ${t.fontDownload}`;

    let buttonLabel: string;
    if (status === 'downloading') {
      const pct = `${cjkState.progress[cjkLang]}%`;
      buttonLabel = includeLangName ? `${langName} ${pct}` : pct;
    } else if (status === 'installed') {
      buttonLabel = includeLangName ? langName : t.fontDelete;
    } else {
      buttonLabel = includeLangName ? `${langName} ${sizeLabel}` : sizeLabel;
    }

    return (
      <button
        key={cjkLang}
        type="button"
        className={`exq-font-action-btn${status === 'installed' ? ' exq-installed' : ''}`}
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
        {status === 'installed' ? (
          <Icon name="reset" size={11} strokeWidth={2.2} />
        ) : status === 'uninstalled' ? (
          <Icon name="download" size={11} strokeWidth={2.2} />
        ) : null}
        <span>{buttonLabel}</span>
      </button>
    );
  };

  const portalTarget =
    typeof document !== 'undefined'
      ? document.querySelector(EXCALIDRAW_SELECTORS.root) || document.body
      : null;

  return (
    <>
      <div
        className="exq-pref-panel exq-font-settings-panel"
        data-exq-font-settings-panel="1"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="exq-pref-group" data-exq-code-ligatures-group="1">
          <div className="exq-pref-group-header">
            <div className="exq-pref-group-title">{t.prefCodeLigatures}</div>
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

        <div className="exq-font-linked-box">
          <div className="exq-font-linked-head" data-exq-prefer-jp-group="1">
            <div className="exq-pref-group-title">{t.prefPreferJpFont}</div>
            <div className="exq-font-seg-track" role="radiogroup" aria-label={t.prefPreferJpFont}>
              <button
                type="button"
                role="radio"
                aria-checked={preferJpActive}
                className={`exq-font-seg-btn${preferJpActive ? ' exq-active' : ''}`}
                data-exq-prefer-jp-card="jp"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  selectPreferJpFont(true);
                }}
              >
                {t.preferJpOptionJa}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={!preferJpActive}
                className={`exq-font-seg-btn${!preferJpActive ? ' exq-active' : ''}`}
                data-exq-prefer-jp-card="zh"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  selectPreferJpFont(false);
                }}
              >
                {t.preferJpOptionZh}
              </button>
            </div>
          </div>

          <div className="exq-font-linked-body">
            <div className="exq-font-slots-title">{t.fontSlotsTitle}</div>
            <div className="exq-font-slot-list">
              {FONT_SLOT_DEFS.map((slot) => {
                const slotLabel = slot.getLabel(t);
                const subtitle = slot.getSubtitle(preferJpActive, codeLigaturesActive);

                return (
                  <div key={slot.id} className="exq-font-slot-row" data-exq-font-slot={slot.id}>
                    <div className="exq-font-slot-left">
                      <span className="exq-font-slot-icon" aria-hidden="true">
                        {slot.renderIcon()}
                      </span>
                      <div className="exq-font-slot-meta">
                        <div className="exq-font-slot-name">{slotLabel}</div>
                        <div className="exq-font-slot-sub">{subtitle}</div>
                        {!preferJpActive && slot.id === 'hand-drawn' && (
                          <div className="exq-font-cjk-grid">
                            {renderPackActionButton('zh', true)}
                            {renderPackActionButton('ko', true)}
                          </div>
                        )}
                      </div>
                    </div>
                    {preferJpActive ? (
                      renderPackActionButton(slot.packWhenJp, false)
                    ) : slot.id !== 'hand-drawn' ? (
                      <span className="exq-font-builtin-badge">{t.fontBuiltinBadge}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {preferJpActive && (
              <div className="exq-font-other-cjk">
                <button
                  type="button"
                  className="exq-font-other-cjk-toggle"
                  data-exq-other-cjk-toggle="1"
                  aria-expanded={otherCjkOpen}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOtherCjkOpen((prev) => !prev);
                  }}
                >
                  <span>{t.fontOtherLanguagesTitle}</span>
                  <Icon
                    name="caret"
                    size={12}
                    strokeWidth={2.2}
                    className={otherCjkOpen ? 'exq-caret-open' : undefined}
                  />
                </button>
                {otherCjkOpen && (
                  <div className="exq-font-cjk-grid">
                    {renderPackActionButton('zh', true)}
                    {renderPackActionButton('ko', true)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          className="exq-font-license-footer-btn"
          data-exq-font-licenses-btn="1"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setLicenseModalOpen(true);
          }}
        >
          <span className="exq-font-license-footer-left">
            <Icon name="info" size={13} strokeWidth={2} />
            <span>{t.fontLicensesButton}</span>
          </span>
          <span aria-hidden="true">›</span>
        </button>
      </div>

      {licenseModalOpen &&
        portalTarget &&
        createPortal(
          <div
            className="exq-font-license-backdrop"
            data-exq-font-license-modal="1"
            role="dialog"
            aria-modal="true"
            aria-label={t.fontLicensesButton}
            onClick={(e) => {
              e.stopPropagation();
              if (e.target === e.currentTarget) {
                setLicenseModalOpen(false);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div
              className="exq-font-license-dialog"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="exq-font-license-dialog-head">
                <div className="exq-font-license-dialog-title">
                  <Icon name="info" size={14} strokeWidth={2} />
                  <span>{t.fontLicensesButton}</span>
                </div>
                <button
                  type="button"
                  className="exq-pref-close-btn"
                  data-exq-font-licenses-close="1"
                  aria-label="Close"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setLicenseModalOpen(false);
                  }}
                >
                  <Icon name="close" size={13} strokeWidth={2.2} />
                </button>
              </div>
              <div className="exq-font-license-list">
                {FONT_CREDITS.map((credit) => (
                  <div key={credit.name} className="exq-font-license-item">
                    <div className="exq-font-license-row-top">
                      <span className="exq-font-license-name">{credit.name}</span>
                      <span className="exq-font-license-badge">{credit.license}</span>
                    </div>
                    <div className="exq-font-license-row-sub">
                      <span className="exq-font-license-author">
                        {t.fontLicenseAuthorPrefix}: {credit.author}
                      </span>
                      <span className="exq-font-license-usage">{credit.getUsage(t)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>,
          portalTarget,
        )}
    </>
  );
}
