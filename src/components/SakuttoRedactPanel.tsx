import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import type { AppLang } from '../types/annotator';
import { EXCALIDRAW_CLASSES, EXCALIDRAW_SELECTORS } from '../excalidraw/domContract';
import { getMessages } from '../i18n/messages';
import { REDACT_COLOR_SWATCHES } from '../services/storageBridge';
import { getSwatchToneClass } from '../utils/common';
import {
  ColorSwatchGrid,
  getExcalidrawPortalTarget,
  PanelHeader,
} from './PanelPrimitives';
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
  firstButtonRef,
}: {
  lang: AppLang;
  color: string;
  variant?: 'full' | 'popover';
  showClose?: boolean;
  onClose?: () => void;
  onColorChange: (color: string) => void;
  firstButtonRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const t = getMessages(lang);

  return (
    <div className="exq-redact-card-body" data-exq-redact-panel="1">
      {variant === 'full' ? (
        <h3>{t.redactColorTitle}</h3>
      ) : (
        <PanelHeader
          title={t.redactColorTitle}
          closeLabel={t.closeLabel}
          onClose={showClose ? onClose : undefined}
        />
      )}
      <ColorSwatchGrid
        colors={REDACT_COLOR_SWATCHES}
        selectedColor={color}
        ariaLabel={t.redactColorTitle}
        gridClassName="exq-redact-color-grid"
        buttonClassName="exq-redact-color-swatch"
        dataAttrName="data-exq-redact-color"
        onSelect={onColorChange}
        firstButtonRef={firstButtonRef}
      />
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
  const mountTargetRef = useRef<Element | null>(null);
  mountTargetRef.current = mountTarget;
  const [mobileFlyoutPos, setMobileFlyoutPos] = useState<{ left: number; bottom: number } | null>(null);
  const mobileBtnRef = useRef<HTMLButtonElement | null>(null);
  const compactBtnRef = useRef<HTMLButtonElement | null>(null);
  const firstSwatchRef = useRef<HTMLButtonElement | null>(null);
  const wasPopoverOpenRef = useRef(false);

  useEffect(() => {
    if (!active) {
      setPopoverOpen(false);
      setMountTarget(null);
      mountTargetRef.current = null;
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
      mountTargetRef.current = next;
      setMountTarget((prev) => (prev === next ? prev : next));
    };

    updateTarget();

    let rafId: number | null = null;
    const scheduleUpdate = () => {
      if (mountTargetRef.current?.isConnected) return;
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
    const observeRoot = getExcalidrawPortalTarget();
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

  useLayoutEffect(() => {
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
    mountTarget?.addEventListener('scroll', updatePos, { passive: true });
    const vv = window.visualViewport;
    vv?.addEventListener('resize', updatePos);
    vv?.addEventListener('scroll', updatePos);
    return () => {
      window.removeEventListener('resize', updatePos, true);
      mountTarget?.removeEventListener('scroll', updatePos);
      vv?.removeEventListener('resize', updatePos);
      vv?.removeEventListener('scroll', updatePos);
    };
  }, [popoverOpen, uiLayout, mountTarget]);

  const flyoutVisible = popoverOpen && (uiLayout !== 'phone' || mobileFlyoutPos !== null);

  useEffect(() => {
    if (flyoutVisible && uiLayout !== 'full') {
      wasPopoverOpenRef.current = true;
      firstSwatchRef.current?.focus();
    } else if (!popoverOpen && wasPopoverOpenRef.current) {
      wasPopoverOpenRef.current = false;
      if (active) {
        (uiLayout === 'phone' ? mobileBtnRef.current : compactBtnRef.current)?.focus();
      }
    }
  }, [flyoutVisible, popoverOpen, uiLayout, active]);

  if (!active || !mountTarget) return null;

  const t = getMessages(lang);
  const triggerToneClass = getSwatchToneClass(color);
  const triggerSwatchStyle = { '--swatch-color': color, backgroundColor: color } as CSSProperties;

  if (uiLayout === 'full') {
    return createPortal(
      <div
        className={`${EXCALIDRAW_CLASSES.selectedShapeActionsContainer} exq-redact-integrated-container`}
        data-exq-redact-root="1"
      >
        <section className={EXCALIDRAW_CLASSES.selectedShapeActions}>
          <div
            className={`${EXCALIDRAW_CLASSES.island} ${EXCALIDRAW_CLASSES.appMenuLeft} exq-redact-integrated-full`}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className={EXCALIDRAW_CLASSES.selectedShapeActions}>
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
        className={`${EXCALIDRAW_CLASSES.selectedShapeActionsContainer} ${EXCALIDRAW_CLASSES.selectedShapeActionsContainerCompact} exq-redact-integrated-container`}
        data-exq-redact-root="1"
      >
        <section className={EXCALIDRAW_CLASSES.selectedShapeActions}>
          <div className="exq-redact-compact-wrap">
            <div
              className={`${EXCALIDRAW_CLASSES.island} ${EXCALIDRAW_CLASSES.compactShapeActionsIsland} exq-redact-compact-island`}
            >
              <div className={EXCALIDRAW_CLASSES.compactShapeActions}>
                <div className={EXCALIDRAW_CLASSES.compactActionItem}>
                  <button
                    ref={compactBtnRef}
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
                className={`${EXCALIDRAW_CLASSES.island} exq-redact-flyout exq-redact-flyout--side`}
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
                  firstButtonRef={firstSwatchRef}
                />
              </div>
            )}
          </div>
        </section>
      </div>,
      mountTarget,
    );
  }

  const portalContainer = getExcalidrawPortalTarget();

  return (
    <>
      {createPortal(
        <div
          className={`${EXCALIDRAW_CLASSES.compactActionItem} exq-redact-mobile-item`}
          data-exq-redact-root="1"
        >
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
            className={`${EXCALIDRAW_CLASSES.island} exq-redact-flyout exq-redact-flyout--up`}
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
              firstButtonRef={firstSwatchRef}
            />
          </div>,
          portalContainer,
        )}
    </>
  );
}
