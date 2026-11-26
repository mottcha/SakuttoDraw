import { useEffect, useRef } from 'react';
import { CaptureUpdateAction } from '@excalidraw/excalidraw';
import { runtime, sendEscape } from '../annotator/quickAnnotator/runtime';
import { EXCALIDRAW_SELECTORS } from '../excalidraw/domContract';

const MAIN_MENU_SUBMENU_IGNORE_SELECTORS = [
  EXCALIDRAW_SELECTORS.preferencesSubmenu,
  '.exq-custom-settings-submenu',
  '.exq-font-settings-submenu',
  EXCALIDRAW_SELECTORS.mainMenu,
  EXCALIDRAW_SELECTORS.mainMenuTrigger,
] as const;

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

/** Dismisses open main menu submenus when clicking outside any submenu or main-menu trigger. */
export function useMainMenuSubmenuDismiss(): void {
  useOutsideDismiss({
    ignoreSelectors: MAIN_MENU_SUBMENU_IGNORE_SELECTORS,
    onDismiss: closeExcalidrawMainMenu,
  });
}
