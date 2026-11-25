import { useEffect, useRef } from 'react';
import { CaptureUpdateAction } from '@excalidraw/excalidraw';
import { runtime, sendEscape } from '../annotator/quickAnnotator/runtime';

/**
 * Dismisses the Excalidraw main menu / submenu cleanly via API and Escape fallback.
 */
export function closeExcalidrawMainMenu(): void {
  runtime.api?.updateScene({
    appState: { openMenu: null },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  if (typeof document !== 'undefined') {
    sendEscape(document);
  }
}

/**
 * Invokes `onDismiss` when clicking/tapping outside `ignoreSelectors` (and optionally on Escape).
 */
export function useOutsideDismiss({
  active = true,
  ignoreSelectors,
  onDismiss,
  closeOnEscape = false,
}: {
  active?: boolean;
  ignoreSelectors: readonly string[];
  onDismiss: () => void;
  closeOnEscape?: boolean;
}): void {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const ignoreRef = useRef(ignoreSelectors);
  ignoreRef.current = ignoreSelectors;

  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    const onPointerDownOutside = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (ignoreRef.current.some((sel) => target.closest(sel))) {
        return;
      }
      onDismissRef.current();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismissRef.current();
      }
    };

    document.addEventListener('pointerdown', onPointerDownOutside, true);
    if (closeOnEscape) {
      document.addEventListener('keydown', onKeyDown, true);
    }

    return () => {
      document.removeEventListener('pointerdown', onPointerDownOutside, true);
      if (closeOnEscape) {
        document.removeEventListener('keydown', onKeyDown, true);
      }
    };
  }, [active, closeOnEscape]);
}
