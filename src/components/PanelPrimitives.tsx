import {
  useEffect,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { subscribeRuntimeChange } from '../annotator/quickAnnotator/runtime';
import { EXCALIDRAW_SELECTORS } from '../excalidraw/domContract';
import { getSwatchToneClass } from '../utils/common';
import { Icon } from './Icon';

export function getExcalidrawPortalTarget(): Element | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector(EXCALIDRAW_SELECTORS.root) || document.body;
}

export function useRuntimeChangeTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeRuntimeChange(() => setTick((n) => n + 1)), []);
  return tick;
}

export function handleRadioGroupKeyDown(e: KeyboardEvent<HTMLElement>): void {
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  const radios = Array.from(
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)'),
  );
  if (radios.length === 0) return;
  const idx = radios.indexOf(target as HTMLButtonElement);
  if (idx < 0) return;

  e.preventDefault();
  e.stopPropagation();

  let nextIdx = idx;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    nextIdx = (idx + 1) % radios.length;
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    nextIdx = (idx - 1 + radios.length) % radios.length;
  } else if (e.key === 'Home') {
    nextIdx = 0;
  } else if (e.key === 'End') {
    nextIdx = radios.length - 1;
  }
  const nextRadio = radios[nextIdx];
  nextRadio?.focus();
  nextRadio?.click();
}

export function PanelHeader({
  title,
  closeLabel,
  onClose,
  closeDataAttr,
  closeRef,
}: {
  title: string;
  closeLabel: string;
  onClose?: () => void;
  closeDataAttr?: string;
  closeRef?: RefObject<HTMLButtonElement | null>;
}) {
  const dataProps = closeDataAttr ? { [closeDataAttr]: '1' } : {};
  return (
    <div className="exq-pref-group-header">
      <div className="exq-pref-group-title">{title}</div>
      {onClose && (
        <button
          ref={closeRef}
          type="button"
          className="exq-pref-close-btn"
          aria-label={closeLabel}
          {...dataProps}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }}
        >
          <Icon name="close" size={13} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}

export function ColorSwatchGrid({
  colors,
  selectedColor,
  ariaLabel,
  gridClassName,
  buttonClassName,
  dataAttrName,
  onSelect,
  firstButtonRef,
}: {
  colors: readonly string[];
  selectedColor: string;
  ariaLabel: string;
  gridClassName: string;
  buttonClassName: string;
  dataAttrName: string;
  onSelect: (hex: string) => void;
  firstButtonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const normalized = selectedColor.trim().toLowerCase();
  return (
    <div
      className={gridClassName}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleRadioGroupKeyDown}
    >
      {colors.map((hex, index) => {
        const isSelected = normalized === hex;
        const toneClass = getSwatchToneClass(hex);
        const dataProps = { [dataAttrName]: hex };
        return (
          <button
            key={hex}
            ref={index === 0 ? firstButtonRef : undefined}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={`${ariaLabel} ${hex}`}
            title={hex}
            className={`color-picker__button ${buttonClassName}${toneClass ? ` ${toneClass}` : ''}${isSelected ? ' active exq-active' : ''}`}
            style={{ '--swatch-color': hex, backgroundColor: hex } as CSSProperties}
            {...dataProps}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(hex);
            }}
          >
            <div className="color-picker__button-outline" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
