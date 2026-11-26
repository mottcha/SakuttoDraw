import { useEffect, useRef } from 'react';
import { CaptureUpdateAction } from '@excalidraw/excalidraw';
import { runtime, sendEscape } from '../annotator/quickAnnotator/runtime';
import { EXCALIDRAW_SELECTORS } from '../excalidraw/domContract';

const MAIN_MENU_SUBMENU_IGNORE_SELECTORS = [
  EXCALIDRAW_SELECTORS.preferencesSubmenu,
  '.exq-custom-settings-submenu',
  '.exq-font-settings-submenu',
  '[data-exq-font-license-modal="1"]',
  EXCALIDRAW_SELECTORS.mainMenu,
  EXCALIDRAW_SELECTORS.mainMenuTrigger,
] as const;

/**
 * Dismisses the Excalidraw main menu / submenu cleanly via API, falling back to Escape only when needed.
 */
export function closeExcalidrawMainMenu(): void {
  if (runtime.api) {
    runtime.api.updateScene({
      appState: { openMenu: null },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    return;
  }
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

    const matchesIgnored = (node: unknown): boolean =>
      node instanceof Element && ignoreRef.current.some((sel) => node.closest(sel));

    const onPointerDownOutside = (e: PointerEvent) => {
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      if (path.some(matchesIgnored) || matchesIgnored(e.target)) {
        return;
      }
      onDismissRef.current();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
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
