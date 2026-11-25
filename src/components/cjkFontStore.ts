import { useSyncExternalStore } from 'react';
import type { AppLang, CjkLang, CjkSetStatus } from '../types/annotator';
import {
  CJK_LANG_ORDER,
  deleteLanguageFontSet,
  downloadLanguageFontSet,
  isLanguageSetCached,
} from '../annotator/cjkFontManager';
import { showToast } from '../annotator/quickAnnotator/runtime';
import { getMessages } from '../i18n/messages';

export interface CjkUiSnapshot {
  statuses: Record<CjkLang, CjkSetStatus>;
  progress: Record<CjkLang, number>;
}

let snapshot: CjkUiSnapshot = {
  statuses: { ja: 'uninstalled', ko: 'uninstalled', zh: 'uninstalled' },
  progress: { ja: 0, ko: 0, zh: 0 },
};

const listeners = new Set<() => void>();

function updateSnapshot(next: CjkUiSnapshot): void {
  snapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): CjkUiSnapshot {
  return snapshot;
}

export function useCjkFontCacheState(): CjkUiSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function refreshCjkCacheStatuses(isCancelled: () => boolean): void {
  for (const cjkLang of CJK_LANG_ORDER) {
    void isLanguageSetCached(cjkLang).then((cached) => {
      if (isCancelled()) return;
      if (snapshot.statuses[cjkLang] === 'downloading') return;
      const nextStatus: CjkSetStatus = cached ? 'installed' : 'uninstalled';
      if (snapshot.statuses[cjkLang] !== nextStatus) {
        updateSnapshot({
          ...snapshot,
          statuses: { ...snapshot.statuses, [cjkLang]: nextStatus },
        });
      }
    });
  }
}

export async function toggleLanguageFontCache(cjkLang: CjkLang, uiLang: AppLang): Promise<void> {
  const currentStatus = snapshot.statuses[cjkLang];
  if (currentStatus === 'downloading') return;

  const msgs = getMessages(uiLang);
  const display = msgs.cjkLangName[cjkLang];

  if (currentStatus === 'installed') {
    const res = await deleteLanguageFontSet(cjkLang);
    if (res.ok) {
      updateSnapshot({
        statuses: { ...snapshot.statuses, [cjkLang]: 'uninstalled' },
        progress: { ...snapshot.progress, [cjkLang]: 0 },
      });
      showToast(msgs.toastFontDeleted(display));
    } else {
      showToast(msgs.toastFontDeleteFailed(display));
    }
    return;
  }

  updateSnapshot({
    statuses: { ...snapshot.statuses, [cjkLang]: 'downloading' },
    progress: { ...snapshot.progress, [cjkLang]: 0 },
  });

  const res = await downloadLanguageFontSet(cjkLang, {
    onProgress: (done, total) => {
      const pct = total > 0 ? Math.round((done / total) * 100) : 100;
      updateSnapshot({
        ...snapshot,
        progress: { ...snapshot.progress, [cjkLang]: pct },
      });
    },
  });

  if (res.ok) {
    updateSnapshot({
      statuses: { ...snapshot.statuses, [cjkLang]: 'installed' },
      progress: { ...snapshot.progress, [cjkLang]: 100 },
    });
    showToast(msgs.toastFontDownloaded(display));
  } else {
    updateSnapshot({
      statuses: { ...snapshot.statuses, [cjkLang]: 'uninstalled' },
      progress: { ...snapshot.progress, [cjkLang]: 0 },
    });
    showToast(msgs.toastFontDownloadFailed(display));
  }
}
