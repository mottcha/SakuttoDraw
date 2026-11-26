import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { AppLang } from '../types/annotator';
import { EXCALIDRAW_SELECTORS } from '../excalidraw/domContract';
import { getMessages } from '../i18n/messages';
import { REDACT_COLOR_SWATCHES } from '../services/storageBridge';
import { getSwatchToneClass } from '../utils/common';
import { Icon } from './Icon';
import { useOutsideDismiss } from './useOutsideDismiss';

export interface SakuttoRedactPanelProps {
  lang: AppLang;
  active: boolean;
  uiLayout: 'full' | 'compact' | 'phone';
  color: string;
  onColorChange: (color: string) => void;
}

const REDACT_DISMISS_IGNORE_SELECTORS = [
  '[data-exq-redact-root="1"]',
  '[data-exq-redact-flyout="1"]',
] as const;

function RedactSwatchContent({
  lang,
  color,
  variant = 'popover',
  showClose,
  onClose,
  onColorChange,
}: {
  lang: AppLang;
  color: string;
  variant?: 'full' | 'popover';
  showClose?: boolean;
  onClose?: () => void;
  onColorChange: (color: string) => void;
}) {
  const t = getMessages(lang);
  const normalized = color.trim().toLowerCase();

  return (
    <div className="exq-redact-card-body" data-exq-redact-panel="1">
      {variant === 'full' ? (
        <h3 aria-hidden="true">{t.redactColorTitle}</h3>
      ) : (
        <div className="exq-pref-group-header">
          <div className="exq-pref-group-title">{t.redactColorTitle}</div>
          {showClose && (
            <button
              type="button"
              className="exq-pref-close-btn"
              aria-label="Close"
              onClick={(e) => {
                e.stopPropagation();
                onClose?.();
              }}
            >
              <Icon name="close" size={13} strokeWidth={2.2} />
            </button>
          )}
        </div>
      )}
      <div className="exq-redact-color-grid" role="radiogroup" aria-label={t.redactColorTitle}>
        {REDACT_COLOR_SWATCHES.map((hex) => {
          const isSelected = normalized === hex;
          const toneClass = getSwatchToneClass(hex);
          return (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${t.redactColorTitle} ${hex}`}
              title={hex}
              className={`color-picker__button exq-redact-color-swatch${toneClass ? ` ${toneClass}` : ''}${isSelected ? ' active exq-active' : ''}`}
              data-exq-redact-color={hex}
              style={{ '--swatch-color': hex, backgroundColor: hex } as CSSProperties}
              onClick={() => onColorChange(hex)}
            >
              <div className="color-picker__button-outline" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SakuttoRedactPanel({
  lang,
  active,
  uiLayout,
  color,
  onColorChange,
}: SakuttoRedactPanelProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [mountTarget, setMountTarget] = useState<Element | null>(null);
  const [mobileFlyoutPos, setMobileFlyoutPos] = useState<{ left: number; bottom: number } | null>(null);
  const mobileBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!active) {
      setPopoverOpen(false);
      setMountTarget(null);
      return;
    }

    const resolveTarget = () => {
      if (typeof document === 'undefined') return null;
      if (uiLayout === 'phone') {
        return document.querySelector(EXCALIDRAW_SELECTORS.mobileStyleActionsLeft);
      }
      return document.querySelector(EXCALIDRAW_SELECTORS.desktopMenuTopLeft);
    };

    const updateTarget = () => {
      const next = resolveTarget();
      setMountTarget((prev) => (prev === next ? prev : next));
    };

    updateTarget();

    let rafId: number | null = null;
    const scheduleUpdate = () => {
      if (rafId !== null) return;
      if (typeof requestAnimationFrame === 'function') {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          updateTarget();
        });
      } else {
        updateTarget();
      }
    };

    const timer = setTimeout(updateTarget, 30);
    const observeRoot =
      typeof document !== 'undefined'
        ? document.querySelector(EXCALIDRAW_SELECTORS.root) || document.body
        : null;
    const mo =
      typeof MutationObserver !== 'undefined' && observeRoot
        ? new MutationObserver(scheduleUpdate)
        : null;
    if (observeRoot) {
      mo?.observe(observeRoot, { childList: true, subtree: true });
    }

    return () => {
      clearTimeout(timer);
      if (rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
      }
      mo?.disconnect();
    };
  }, [active, uiLayout]);

  useOutsideDismiss({
    active: popoverOpen,
    ignoreSelectors: REDACT_DISMISS_IGNORE_SELECTORS,
    onDismiss: () => setPopoverOpen(false),
    closeOnEscape: true,
  });

  useEffect(() => {
    if (!popoverOpen || uiLayout !== 'phone' || typeof window === 'undefined') {
      setMobileFlyoutPos(null);
      return;
    }
    const updatePos = () => {
      const btn = mobileBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const flyoutW = Math.min(228, window.innerWidth - 24);
      const center = rect.left + rect.width / 2;
      const clampedLeft = Math.max(12, Math.min(window.innerWidth - flyoutW - 12, center - flyoutW / 2));
      const bottom = Math.max(12, window.innerHeight - rect.top + 8);
      setMobileFlyoutPos({ left: Math.round(clampedLeft), bottom: Math.round(bottom) });
    };
    updatePos();
    window.addEventListener('resize', updatePos, true);
    return () => window.removeEventListener('resize', updatePos, true);
  }, [popoverOpen, uiLayout]);

  if (!active || !mountTarget) return null;

  const t = getMessages(lang);
  const triggerToneClass = getSwatchToneClass(color);
  const triggerSwatchStyle = { '--swatch-color': color, backgroundColor: color } as CSSProperties;

  if (uiLayout === 'full') {
    return createPortal(
      <div
        className="selected-shape-actions-container exq-redact-integrated-container"
        data-exq-redact-root="1"
      >
        <section className="selected-shape-actions">
          <div
            className="Island App-menu__left exq-redact-integrated-full"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="selected-shape-actions">
              <RedactSwatchContent
                lang={lang}
                color={color}
                variant="full"
                onColorChange={onColorChange}
              />
            </div>
          </div>
        </section>
      </div>,
      mountTarget,
    );
  }

  if (uiLayout === 'compact') {
    return createPortal(
      <div
        className="selected-shape-actions-container selected-shape-actions-container--compact exq-redact-integrated-container"
        data-exq-redact-root="1"
      >
        <section className="selected-shape-actions">
          <div className="exq-redact-compact-wrap">
            <div className="Island compact-shape-actions-island exq-redact-compact-island">
              <div className="compact-shape-actions">
                <div className="compact-action-item">
                  <button
                    type="button"
                    className={`color-picker__button active-color properties-trigger compact-sizing exq-redact-trigger-btn${triggerToneClass ? ` ${triggerToneClass}` : ''}${popoverOpen ? ' active' : ''}`}
                    data-exq-redact-trigger="1"
                    style={triggerSwatchStyle}
                    title={t.redactColorTitle}
                    aria-label={t.redactColorTitle}
                    aria-expanded={popoverOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPopoverOpen((v) => !v);
                    }}
                  >
                    <div className="color-picker__button-outline" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
            {popoverOpen && (
              <div
                className="Island exq-redact-flyout exq-redact-flyout--side"
                role="dialog"
                aria-label={t.redactColorTitle}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <RedactSwatchContent
                  lang={lang}
                  color={color}
                  variant="popover"
                  showClose={true}
                  onClose={() => setPopoverOpen(false)}
                  onColorChange={onColorChange}
                />
              </div>
            )}
          </div>
        </section>
      </div>,
      mountTarget,
    );
  }

  const portalContainer =
    typeof document !== 'undefined'
      ? document.querySelector(EXCALIDRAW_SELECTORS.root) || document.body
      : null;

  return (
    <>
      {createPortal(
        <div className="compact-action-item exq-redact-mobile-item" data-exq-redact-root="1">
          <button
            ref={mobileBtnRef}
            type="button"
            className={`color-picker__button active-color properties-trigger compact-sizing mobile-border exq-redact-trigger-btn${triggerToneClass ? ` ${triggerToneClass}` : ''}${popoverOpen ? ' active' : ''}`}
            data-exq-redact-trigger="1"
            style={triggerSwatchStyle}
            title={t.redactColorTitle}
            aria-label={t.redactColorTitle}
            aria-expanded={popoverOpen}
            onClick={(e) => {
              e.stopPropagation();
              setPopoverOpen((v) => !v);
            }}
          >
            <div className="color-picker__button-outline" aria-hidden="true" />
          </button>
        </div>,
        mountTarget,
      )}
      {popoverOpen &&
        portalContainer &&
        mobileFlyoutPos &&
        createPortal(
          <div
            className="Island exq-redact-flyout exq-redact-flyout--up"
            data-exq-redact-flyout="1"
            role="dialog"
            aria-label={t.redactColorTitle}
            style={{ left: `${mobileFlyoutPos.left}px`, bottom: `${mobileFlyoutPos.bottom}px` }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <RedactSwatchContent
              lang={lang}
              color={color}
              variant="popover"
              showClose={true}
              onClose={() => setPopoverOpen(false)}
              onColorChange={onColorChange}
            />
          </div>,
          portalContainer,
        )}
    </>
  );
}
