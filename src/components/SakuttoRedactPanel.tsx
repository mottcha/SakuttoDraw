import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AppLang, RedactMode, RedactStrength } from '../types/annotator';
import { getMessages } from '../i18n/messages';

export interface SakuttoRedactPanelProps {
  lang: AppLang;
  active: boolean;
  uiLayout: 'full' | 'compact' | 'phone';
  mode: RedactMode;
  strength: RedactStrength;
  isBusy?: boolean;
  onModeChange: (mode: RedactMode) => void;
  onStrengthChange: (strength: RedactStrength) => void;
}

function RedactModeIcon({ mode, size = 16 }: { mode: RedactMode; size?: number }) {
  if (mode === 'mosaic') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <rect x="7" y="7" width="4" height="4" fill="currentColor" stroke="none" opacity="0.85" />
        <rect x="13" y="7" width="4" height="4" fill="currentColor" stroke="none" opacity="0.35" />
        <rect x="7" y="13" width="4" height="4" fill="currentColor" stroke="none" opacity="0.35" />
        <rect x="13" y="13" width="4" height="4" fill="currentColor" stroke="none" opacity="0.85" />
      </svg>
    );
  }
  if (mode === 'blur') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="5.5" strokeDasharray="2.5 2.5" />
        <circle cx="12" cy="12" r="9" strokeDasharray="2 3" opacity="0.65" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2.5" fill="currentColor" />
    </svg>
  );
}

function RedactSettingsContent({
  lang,
  mode,
  strength,
  isBusy,
  showClose,
  onClose,
  onModeChange,
  onStrengthChange,
}: {
  lang: AppLang;
  mode: RedactMode;
  strength: RedactStrength;
  isBusy?: boolean;
  showClose?: boolean;
  onClose?: () => void;
  onModeChange: (mode: RedactMode) => void;
  onStrengthChange: (strength: RedactStrength) => void;
}) {
  const t = getMessages(lang);
  const modes: ReadonlyArray<{ id: RedactMode; label: string }> = [
    { id: 'mosaic', label: t.redactModeMosaic },
    { id: 'blur', label: t.redactModeBlur },
    { id: 'blackout', label: t.redactModeBlackout },
  ];
  const strengths: ReadonlyArray<{ id: RedactStrength; label: string }> = [
    { id: 'weak', label: t.redactStrengthWeak },
    { id: 'medium', label: t.redactStrengthMedium },
    { id: 'strong', label: t.redactStrengthStrong },
  ];
  const strengthDisabled = mode === 'blackout';

  return (
    <div className="exq-redact-card-body" data-exq-redact-panel="1">
      <div className="exq-pref-group">
        <div className="exq-pref-group-header">
          <div className="exq-pref-group-title">{t.redactModeTitle}</div>
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
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <div className="exq-pref-card-grid exq-pref-card-grid--3" role="radiogroup" aria-label={t.redactModeTitle}>
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              disabled={isBusy}
              className={`exq-redact-mode-card${mode === m.id ? ' exq-active' : ''}`}
              data-exq-redact-mode={m.id}
              onClick={() => onModeChange(m.id)}
            >
              <RedactModeIcon mode={m.id} size={15} />
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={`exq-pref-group${strengthDisabled ? ' exq-redact-group-disabled' : ''}`}>
        <div className="exq-pref-group-title">{t.redactStrengthTitle}</div>
        <div className="exq-pref-card-grid exq-pref-card-grid--3" role="radiogroup" aria-label={t.redactStrengthTitle}>
          {strengths.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={strength === s.id}
              disabled={isBusy || strengthDisabled}
              className={`exq-pref-card exq-pref-card--compact3${strength === s.id ? ' exq-active' : ''}`}
              data-exq-redact-strength={s.id}
              onClick={() => onStrengthChange(s.id)}
            >
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="exq-redact-note">{t.redactPrivacyNote}</div>
    </div>
  );
}

export function SakuttoRedactPanel({
  lang,
  active,
  uiLayout,
  mode,
  strength,
  isBusy,
  onModeChange,
  onStrengthChange,
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
        return document.querySelector('.mobile-shape-actions > div:first-child');
      }
      return document.querySelector('.App-menu_top__left');
    };

    const updateTarget = () => {
      const next = resolveTarget();
      setMountTarget((prev) => (prev === next ? prev : next));
    };

    updateTarget();
    const timer = setTimeout(updateTarget, 30);
    const mo =
      typeof MutationObserver !== 'undefined' && document.body
        ? new MutationObserver(updateTarget)
        : null;
    mo?.observe(document.body, { childList: true, subtree: true });

    return () => {
      clearTimeout(timer);
      mo?.disconnect();
    };
  }, [active, uiLayout]);

  useEffect(() => {
    if (!popoverOpen || typeof document === 'undefined') return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (
        target instanceof Element &&
        (target.closest('[data-exq-redact-root="1"]') || target.closest('[data-exq-redact-flyout="1"]'))
      ) {
        return;
      }
      setPopoverOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopoverOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [popoverOpen]);

  useEffect(() => {
    if (!popoverOpen || uiLayout !== 'phone' || typeof window === 'undefined') {
      setMobileFlyoutPos(null);
      return;
    }
    const updatePos = () => {
      const btn = mobileBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const flyoutW = Math.min(256, window.innerWidth - 24);
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

  if (uiLayout === 'full') {
    return createPortal(
      <div
        className="Island App-menu__left exq-redact-full-island"
        data-exq-redact-root="1"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="exq-redact-full-header">{t.redactSettingsTitle}</div>
        <RedactSettingsContent
          lang={lang}
          mode={mode}
          strength={strength}
          isBusy={isBusy}
          onModeChange={onModeChange}
          onStrengthChange={onStrengthChange}
        />
      </div>,
      mountTarget,
    );
  }

  if (uiLayout === 'compact') {
    return createPortal(
      <div className="exq-redact-compact-wrap" data-exq-redact-root="1">
        <div className="Island compact-shape-actions-island exq-redact-compact-island">
          <div className="compact-shape-actions">
            <div className="compact-action-item">
              <button
                type="button"
                className={`compact-action-button properties-trigger${popoverOpen ? ' active' : ''}`}
                data-exq-redact-trigger="1"
                title={t.redactSettingsTitle}
                aria-label={t.redactSettingsTitle}
                aria-expanded={popoverOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  setPopoverOpen((v) => !v);
                }}
              >
                <RedactModeIcon mode={mode} size={16} />
              </button>
            </div>
          </div>
        </div>
        {popoverOpen && (
          <div
            className="Island exq-redact-flyout exq-redact-flyout--side"
            role="dialog"
            aria-label={t.redactSettingsTitle}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <RedactSettingsContent
              lang={lang}
              mode={mode}
              strength={strength}
              isBusy={isBusy}
              showClose={true}
              onClose={() => setPopoverOpen(false)}
              onModeChange={onModeChange}
              onStrengthChange={onStrengthChange}
            />
          </div>
        )}
      </div>,
      mountTarget,
    );
  }

  // Phone: integrate directly into .mobile-shape-actions > div:first-child as a single compact-action-item,
  // and portal the upward popover outside overflow-x:auto so it is never clipped.
  const portalContainer =
    (typeof document !== 'undefined'
      ? document.querySelector('.excalidraw') || document.body
      : null);

  return (
    <>
      {createPortal(
        <div className="compact-action-item exq-redact-mobile-item" data-exq-redact-root="1">
          <button
            ref={mobileBtnRef}
            type="button"
            className={`compact-action-button properties-trigger${popoverOpen ? ' active' : ''}`}
            data-exq-redact-trigger="1"
            title={t.redactSettingsTitle}
            aria-label={t.redactSettingsTitle}
            aria-expanded={popoverOpen}
            onClick={(e) => {
              e.stopPropagation();
              setPopoverOpen((v) => !v);
            }}
          >
            <RedactModeIcon mode={mode} size={16} />
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
            aria-label={t.redactSettingsTitle}
            style={{ left: `${mobileFlyoutPos.left}px`, bottom: `${mobileFlyoutPos.bottom}px` }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <RedactSettingsContent
              lang={lang}
              mode={mode}
              strength={strength}
              isBusy={isBusy}
              showClose={true}
              onClose={() => setPopoverOpen(false)}
              onModeChange={onModeChange}
              onStrengthChange={onStrengthChange}
            />
          </div>,
          portalContainer,
        )}
    </>
  );
}
