import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AppLang, CjkLang } from '../types/annotator';
import { cjkFontManifest, formatBytesToMB } from '../annotator/cjkFontManager';
import { applyCodeLigatures, applyPreferJpFont, runtime } from '../annotator/quickAnnotator/runtime';
import { getMessages, type MessageCatalog } from '../i18n/messages';
import { resolvePreferJpFont } from '../services/storageBridge';
import { Icon } from './Icon';
import {
  getExcalidrawPortalTarget,
  handleRadioGroupKeyDown,
  PanelHeader,
  useRuntimeChangeTick,
} from './PanelPrimitives';
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
    renderIcon: () => <Icon name="fontSettings" size={13} strokeWidth={2} />,
    getLabel: (t) => t.fontLabelHandDrawn,
    getSubtitle: (preferJp) => (preferJp ? 'Excalifont + SetoJP' : 'Excalifont + Xiaolai'),
  },
  {
    id: 'normal',
    packWhenJp: 'jaStandard',
    renderIcon: () => <span className="exq-font-slot-glyph">A</span>,
    getLabel: (t) => t.fontLabelNormal,
    getSubtitle: (preferJp) => (preferJp ? 'Nunito + BIZ UDPGothic' : 'Nunito'),
  },
  {
    id: 'pop',
    packWhenJp: 'jaPop',
    renderIcon: () => (
      <span className="exq-font-slot-glyph" style={{ fontWeight: 800 }}>
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
        return codeLigatures ? 'SakuttoCode LG' : 'SakuttoCode';
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

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function FontSettingsPanel({ lang }: { lang: AppLang }) {
  useRuntimeChangeTick();
  const cjkState = useCjkFontCacheState();
  const [otherCjkOpen, setOtherCjkOpen] = useState(false);
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const licenseBtnRef = useRef<HTMLButtonElement | null>(null);
  const licenseCloseRef = useRef<HTMLButtonElement | null>(null);
  const licenseDialogRef = useRef<HTMLDivElement | null>(null);
  const wasModalOpenRef = useRef(false);
  const licenseTitleId = useId();

  useMainMenuSubmenuDismiss();

  useEffect(() => {
    let cancelled = false;
    refreshCjkCacheStatuses(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (licenseModalOpen) {
      wasModalOpenRef.current = true;
      licenseCloseRef.current?.focus();
    } else if (wasModalOpenRef.current) {
      wasModalOpenRef.current = false;
      licenseBtnRef.current?.focus();
    }
  }, [licenseModalOpen]);

  useEffect(() => {
    if (!licenseModalOpen || typeof window === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        setLicenseModalOpen(false);
        return;
      }
      if (e.key === 'Tab') {
        const dialog = licenseDialogRef.current;
        if (!dialog) return;
        const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey) {
          if (active === first || !dialog.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last || !dialog.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [licenseModalOpen]);

  const t = getMessages(lang);
  const preferJpActive = resolvePreferJpFont({
    lang,
    preferJpFont: runtime.prefs.preferJpFont,
  });
  const codeLigaturesActive = runtime.prefs.codeLigatures;

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
    } else if (status === 'deleting') {
      buttonLabel = t.fontDeleting;
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
        disabled={status === 'downloading' || status === 'deleting'}
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

  const portalTarget = getExcalidrawPortalTarget();

  return (
    <>
      <div
        className="exq-pref-panel exq-font-settings-panel"
        data-exq-font-settings-panel="1"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="exq-pref-group" data-exq-code-ligatures-group="1">
          <PanelHeader
            title={t.prefCodeLigatures}
            closeLabel={t.closeLabel}
            onClose={closeExcalidrawMainMenu}
            closeDataAttr="data-exq-font-settings-close"
          />
          <div
            className="exq-pref-card-grid"
            role="radiogroup"
            aria-label={t.prefCodeLigatures}
            onKeyDown={handleRadioGroupKeyDown}
          >
            <button
              type="button"
              role="radio"
              aria-checked={codeLigaturesActive}
              className={`exq-pref-card${codeLigaturesActive ? ' exq-active' : ''}`}
              data-exq-code-ligatures="on"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                applyCodeLigatures(true);
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
                applyCodeLigatures(false);
              }}
            >
              <span>{t.prefCodeLigaturesOff}</span>
            </button>
          </div>
        </div>

        <div className="exq-font-linked-box">
          <div className="exq-font-linked-head" data-exq-prefer-jp-group="1">
            <div className="exq-pref-group-title">{t.prefPreferJpFont}</div>
            <div
              className="exq-font-seg-track"
              role="radiogroup"
              aria-label={t.prefPreferJpFont}
              onKeyDown={handleRadioGroupKeyDown}
            >
              <button
                type="button"
                role="radio"
                aria-checked={preferJpActive}
                className={`exq-font-seg-btn${preferJpActive ? ' exq-active' : ''}`}
                data-exq-prefer-jp-card="jp"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  applyPreferJpFont(true);
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
                  applyPreferJpFont(false);
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
                      slot.id === 'code-hand' ? (
                        <span className="exq-font-shared-badge" data-exq-cjk-shared="ja">
                          {t.fontPackSharedHint}
                        </span>
                      ) : (
                        renderPackActionButton(slot.packWhenJp, false)
                      )
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
          ref={licenseBtnRef}
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
            aria-labelledby={licenseTitleId}
            onClick={(e) => {
              e.stopPropagation();
              if (e.target === e.currentTarget) {
                setLicenseModalOpen(false);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div
              ref={licenseDialogRef}
              className="exq-font-license-dialog"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="exq-font-license-dialog-head">
                <h2 id={licenseTitleId} className="exq-font-license-dialog-title">
                  <Icon name="info" size={14} strokeWidth={2} />
                  <span>{t.fontLicensesButton}</span>
                </h2>
                <button
                  ref={licenseCloseRef}
                  type="button"
                  className="exq-pref-close-btn"
                  data-exq-font-licenses-close="1"
                  aria-label={t.closeLabel}
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
