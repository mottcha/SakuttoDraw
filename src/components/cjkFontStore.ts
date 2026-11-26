import { useSyncExternalStore } from 'react';
import type { AppLang, CjkLang, CjkSetStatus } from '../types/annotator';
import {
  CJK_LANG_ORDER,
  deleteLanguageFontSet,
  downloadLanguageFontSet,
  getAllLanguageSetCacheStatuses,
} from '../annotator/cjkFontManager';
import { refreshSceneTextFonts, reloadErroredRegisteredFonts } from '../annotator/jpGlyphOverride';
import { runtime, showToast } from '../annotator/quickAnnotator/runtime';
import { getMessages } from '../i18n/messages';

export interface CjkUiSnapshot {
  statuses: Record<CjkLang, CjkSetStatus>;
  progress: Record<CjkLang, number>;
}

function createInitialRecord<T>(value: T): Record<CjkLang, T> {
  const out = {} as Record<CjkLang, T>;
  for (const lang of CJK_LANG_ORDER) {
    out[lang] = value;
  }
  return out;
}

let snapshot: CjkUiSnapshot = {
  statuses: createInitialRecord<CjkSetStatus>('uninstalled'),
  progress: createInitialRecord(0),
};

const listeners = new Set<() => void>();
let opSeq = 0;
const activeOpToken: Partial<Record<CjkLang, number>> = {};

export function resetCjkFontStoreForTests(): void {
  opSeq = 0;
  for (const lang of CJK_LANG_ORDER) {
    delete activeOpToken[lang];
  }
  snapshot = {
    statuses: createInitialRecord<CjkSetStatus>('uninstalled'),
    progress: createInitialRecord(0),
  };
}

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
  void getAllLanguageSetCacheStatuses({ pruneStale: true }).then((cachedMap) => {
    if (isCancelled()) return;
    let changed = false;
    const nextStatuses = { ...snapshot.statuses };
    for (const cjkLang of CJK_LANG_ORDER) {
      const cur = nextStatuses[cjkLang];
      if (cur === 'downloading' || cur === 'deleting') continue;
      const target: CjkSetStatus = cachedMap[cjkLang] ? 'installed' : 'uninstalled';
      if (cur !== target) {
        nextStatuses[cjkLang] = target;
        changed = true;
      }
    }
    if (changed) {
      updateSnapshot({
        ...snapshot,
        statuses: nextStatuses,
      });
    }
  });
}

export async function toggleLanguageFontCache(cjkLang: CjkLang, uiLang: AppLang): Promise<void> {
  const currentStatus = snapshot.statuses[cjkLang];
  if (currentStatus === 'downloading' || currentStatus === 'deleting') return;

  const msgs = getMessages(uiLang);
  const display = msgs.cjkLangName[cjkLang];
  const token = ++opSeq;
  activeOpToken[cjkLang] = token;

  if (currentStatus === 'installed') {
    const downloadingLangs = CJK_LANG_ORDER.filter((l) => snapshot.statuses[l] === 'downloading');
    updateSnapshot({
      ...snapshot,
      statuses: { ...snapshot.statuses, [cjkLang]: 'deleting' },
    });

    const res = await deleteLanguageFontSet(cjkLang, { protectedLangs: downloadingLangs });
    if (activeOpToken[cjkLang] !== token) return;
    if (res.ok) {
      updateSnapshot({
        statuses: { ...snapshot.statuses, [cjkLang]: 'uninstalled' },
        progress: { ...snapshot.progress, [cjkLang]: 0 },
      });
      showToast(msgs.toastFontDeleted(display));
    } else {
      updateSnapshot({
        ...snapshot,
        statuses: { ...snapshot.statuses, [cjkLang]: 'installed' },
      });
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
      if (activeOpToken[cjkLang] !== token || snapshot.statuses[cjkLang] !== 'downloading') return;
      const pct = total > 0 ? Math.round((done / total) * 100) : 100;
      updateSnapshot({
        ...snapshot,
        progress: { ...snapshot.progress, [cjkLang]: pct },
      });
    },
  });

  if (activeOpToken[cjkLang] !== token) return;

  if (res.ok) {
    updateSnapshot({
      statuses: { ...snapshot.statuses, [cjkLang]: 'installed' },
      progress: { ...snapshot.progress, [cjkLang]: 100 },
    });
    reloadErroredRegisteredFonts();
    void refreshSceneTextFonts(runtime.api);
    showToast(msgs.toastFontDownloaded(display));
  } else {
    updateSnapshot({
      statuses: { ...snapshot.statuses, [cjkLang]: 'uninstalled' },
      progress: { ...snapshot.progress, [cjkLang]: 0 },
    });
    showToast(msgs.toastFontDownloadFailed(display));
  }
}
