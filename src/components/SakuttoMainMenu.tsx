import { useEffect, useState } from 'react';
import { MainMenu } from '@excalidraw/excalidraw';
import type { AppLang, CjkLang, CjkSetStatus, ThemeMode } from '../types/annotator';
import { getMessages, SUPPORTED_LANGS } from '../i18n/messages';
import {
  CJK_LANG_ORDER,
  cjkFontManifest,
  deleteLanguageFontSet,
  downloadLanguageFontSet,
  formatBytesToMB,
  isLanguageSetCached,
} from '../annotator/cjkFontManager';
import { applyLanguage, showToast } from '../annotator/quickAnnotator';

interface CjkUiState {
  statuses: Record<CjkLang, CjkSetStatus>;
  progress: Record<CjkLang, number>;
}

const cjkUiStore: CjkUiState = {
  statuses: { ja: 'uninstalled', ko: 'uninstalled', zh: 'uninstalled' },
  progress: { ja: 0, ko: 0, zh: 0 },
};

const cjkListeners = new Set<() => void>();

function notifyCjkListeners(): void {
  for (const listener of cjkListeners) {
    listener();
  }
}

async function toggleLanguageFontCache(cjkLang: CjkLang, uiLang: AppLang): Promise<void> {
  const currentStatus = cjkUiStore.statuses[cjkLang];
  if (currentStatus === 'downloading') return;

  const msgs = getMessages(uiLang);
  const display = msgs.cjkLangName[cjkLang];

  if (currentStatus === 'installed') {
    const res = await deleteLanguageFontSet(cjkLang);
    if (res.ok) {
      cjkUiStore.statuses = { ...cjkUiStore.statuses, [cjkLang]: 'uninstalled' };
      cjkUiStore.progress = { ...cjkUiStore.progress, [cjkLang]: 0 };
      notifyCjkListeners();
      showToast(msgs.toastFontDeleted(display));
    } else {
      showToast(msgs.toastFontDeleteFailed(display));
    }
    return;
  }

  cjkUiStore.statuses = { ...cjkUiStore.statuses, [cjkLang]: 'downloading' };
  cjkUiStore.progress = { ...cjkUiStore.progress, [cjkLang]: 0 };
  notifyCjkListeners();

  const res = await downloadLanguageFontSet(cjkLang, {
    onProgress: (done, total) => {
      const pct = total > 0 ? Math.round((done / total) * 100) : 100;
      cjkUiStore.progress = { ...cjkUiStore.progress, [cjkLang]: pct };
      notifyCjkListeners();
    },
  });

  if (res.ok) {
    cjkUiStore.statuses = { ...cjkUiStore.statuses, [cjkLang]: 'installed' };
    cjkUiStore.progress = { ...cjkUiStore.progress, [cjkLang]: 100 };
    notifyCjkListeners();
    showToast(msgs.toastFontDownloaded(display));
  } else {
    cjkUiStore.statuses = { ...cjkUiStore.statuses, [cjkLang]: 'uninstalled' };
    cjkUiStore.progress = { ...cjkUiStore.progress, [cjkLang]: 0 };
    notifyCjkListeners();
    showToast(msgs.toastFontDownloadFailed(display));
  }
}

function CjkFontCacheSection({ lang }: { lang: AppLang }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const onUpdate = () => setTick((n) => n + 1);
    cjkListeners.add(onUpdate);

    let cancelled = false;
    for (const cjkLang of CJK_LANG_ORDER) {
      void isLanguageSetCached(cjkLang).then((cached) => {
        if (cancelled) return;
        if (cjkUiStore.statuses[cjkLang] !== 'downloading') {
          const next: CjkSetStatus = cached ? 'installed' : 'uninstalled';
          if (cjkUiStore.statuses[cjkLang] !== next) {
            cjkUiStore.statuses = { ...cjkUiStore.statuses, [cjkLang]: next };
            notifyCjkListeners();
          }
        }
      });
    }

    return () => {
      cancelled = true;
      cjkListeners.delete(onUpdate);
    };
  }, []);

  const t = getMessages(lang);

  return (
    <>
      <MainMenu.Separator />
      <div
        className="exq-pref-fonts"
        data-exq-pref-fonts="1"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="exq-font-section-title">{t.offlineFontsTitle}</div>
        {CJK_LANG_ORDER.map((cjkLang) => {
          const meta = cjkFontManifest.sets[cjkLang];
          const sizeLabel = formatBytesToMB(meta.totalBytes);
          const status = cjkUiStore.statuses[cjkLang];
          const label = t.cjkLangName[cjkLang];
          const btnText =
            status === 'downloading'
              ? `${cjkUiStore.progress[cjkLang]}%`
              : status === 'installed'
                ? t.fontDelete
                : t.fontDownload;

          return (
            <div key={cjkLang} className="exq-font-row" data-exq-cjk-row={cjkLang}>
              <span className="exq-font-meta">
                <span>{label}</span>
                <span className="exq-font-size">({sizeLabel})</span>
              </span>
              <button
                type="button"
                className={`exq-font-btn${status === 'installed' ? ' exq-font-btn--installed' : ''}`}
                data-exq-cjk-btn={cjkLang}
                data-exq-cjk-state={status}
                aria-label={`${label} (${sizeLabel})`}
                disabled={status === 'downloading'}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void toggleLanguageFontCache(cjkLang, lang);
                }}
              >
                {btnText}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

export interface SakuttoMainMenuProps {
  lang: AppLang;
  themeMode: ThemeMode;
}

export function SakuttoMainMenu({ lang, themeMode }: SakuttoMainMenuProps) {
  const t = getMessages(lang);

  return (
    <MainMenu>
      <MainMenu.DefaultItems.LoadScene />
      <MainMenu.DefaultItems.SaveToActiveFile />
      <MainMenu.DefaultItems.Export />
      <MainMenu.DefaultItems.SaveAsImage />
      <MainMenu.Separator />
      <MainMenu.DefaultItems.Preferences
        additionalItems={<CjkFontCacheSection lang={lang} />}
      />
      <MainMenu.DefaultItems.ToggleTheme
        allowSystemTheme={true}
        theme={themeMode}
      />
      <MainMenu.ItemCustom className="exq-main-lang-item">
        <select
          className="dropdown-select dropdown-select__language exq-main-lang-select"
          data-exq-lang-select="1"
          aria-label={t.languageLabel}
          value={lang}
          onChange={(e) => {
            applyLanguage(e.target.value as AppLang);
          }}
        >
          {SUPPORTED_LANGS.map((item) => (
            <option key={item.code} value={item.code}>
              {item.nativeLabel}
            </option>
          ))}
        </select>
      </MainMenu.ItemCustom>
    </MainMenu>
  );
}
