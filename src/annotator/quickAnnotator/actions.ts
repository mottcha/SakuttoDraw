// Shared quick-annotator user actions (export, reset, pen color, canvas background).
import { EXCALIDRAW_SELECTORS } from '../../excalidraw/domContract';
import { getMessages } from '../../i18n/messages';
import {
  DEFAULT_PEN_COLOR,
  patchSavedAppState,
  readSavedAppState,
  resolvePreferJpFont,
  savePrefs,
} from '../../services/storageBridge';
import { normalizeHexColor, silently } from '../../utils/common';
import {
  applyCanvasBackgroundWithApi,
  applyPenColorWithApi,
  runInstantExportWithApi,
  runInstantResetWithApi,
} from '../apiActions';
import { closeFloatingPopovers, runtime, showToast } from './runtime';

async function withBusyLock<T>(
  triggerBtn: HTMLButtonElement | null | undefined,
  fn: () => Promise<T>,
  busyFallback: T,
): Promise<T> {
  if (runtime.isBusy) return busyFallback;
  runtime.isBusy = true;
  if (triggerBtn) triggerBtn.disabled = true;

  try {
    closeFloatingPopovers(null);
    return await fn();
  } finally {
    runtime.isBusy = false;
    if (triggerBtn) triggerBtn.disabled = false;
  }
}

export async function runInstantExport(
  mode: 'copy' | 'png',
  triggerBtn?: HTMLButtonElement | null,
) {
  return withBusyLock(
    triggerBtn,
    () =>
      runInstantExportWithApi(runtime.api, mode, runtime.prefs.exportOpts, {
        lang: runtime.prefs.lang,
        preferJpFont: resolvePreferJpFont(runtime.prefs),
        showToast,
      }),
    { ok: false, reason: 'busy' } as const,
  );
}

export async function runInstantReset(triggerBtn?: HTMLButtonElement | null) {
  return withBusyLock(
    triggerBtn,
    () =>
      runInstantResetWithApi(runtime.api, runtime.prefs, {
        showToast,
      }),
    { ok: false, pinkApplied: false, reason: 'busy' } as const,
  );
}

export function getCurrentCanvasBg(
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
): string {
  if (runtime.api) {
    const apiBg = silently(() => runtime.api?.getAppState()?.viewBackgroundColor?.trim());
    if (apiBg) return apiBg.toLowerCase();
  }
  const liveSwatch = silently(() =>
    document
      .querySelector<HTMLElement>(EXCALIDRAW_SELECTORS.canvasBgPopupTrigger)
      ?.style?.getPropertyValue('--swatch-color')
      ?.trim(),
  );
  if (liveSwatch) return liveSwatch.toLowerCase();
  if (runtime.lastCanvasBg) return runtime.lastCanvasBg.toLowerCase();
  const st = readSavedAppState(storage);
  if (typeof st.viewBackgroundColor === 'string' && st.viewBackgroundColor) {
    return st.viewBackgroundColor.toLowerCase();
  }
  return '#ffffff';
}

export async function applyCanvasBackground(hex: string): Promise<boolean> {
  if (runtime.isBusy) return false;
  const normalized = normalizeHexColor(hex, '#ffffff');
  runtime.lastCanvasBg = normalized;

  if (runtime.api) {
    const res = await applyCanvasBackgroundWithApi(runtime.api, normalized, {
      lang: runtime.prefs.lang,
      showToast,
    });
    return res.ok;
  }

  patchSavedAppState({ viewBackgroundColor: normalized });
  showToast(getMessages(runtime.prefs.lang).toastBgChanged);
  return true;
}

export function getCurrentPenColor(): string {
  return normalizeHexColor(runtime.prefs.quickOpts.defaultPenColor, DEFAULT_PEN_COLOR);
}

export async function applyPenColor(hex: string): Promise<boolean> {
  if (runtime.isBusy) return false;
  const normalized = normalizeHexColor(hex, DEFAULT_PEN_COLOR);
  runtime.prefs.quickOpts.defaultPenColor = normalized;
  savePrefs(runtime.prefs);

  if (runtime.api) {
    const res = await applyPenColorWithApi(runtime.api, normalized, {
      lang: runtime.prefs.lang,
      showToast,
    });
    return res.ok;
  }

  patchSavedAppState({ currentItemStrokeColor: normalized });
  showToast(getMessages(runtime.prefs.lang).toastPenColorChanged);
  return true;
}
