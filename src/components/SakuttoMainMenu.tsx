import { MainMenu } from '@excalidraw/excalidraw';
import type { AppLang, StylesPanelPref, ThemeMode } from '../types/annotator';
import { applyLanguage } from '../annotator/quickAnnotator/runtime';
import { getMessages, SUPPORTED_LANGS } from '../i18n/messages';
import { CustomSettingsVisualPanel } from './CustomSettingsPanel';
import { Icon } from './Icon';
import {
  CjkFontCacheSection,
  type PreferencesLiveState,
  PreferencesVisualPanel,
} from './PreferencesPanel';

export interface SakuttoMainMenuProps {
  lang: AppLang;
  themeMode: ThemeMode;
  prefState: PreferencesLiveState;
  onStylesPanelModeChange: (mode: StylesPanelPref) => void;
}

export function SakuttoMainMenu({
  lang,
  themeMode,
  prefState,
  onStylesPanelModeChange,
}: SakuttoMainMenuProps) {
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
      >
        <PreferencesVisualPanel
          lang={lang}
          prefState={prefState}
          onStylesPanelModeChange={onStylesPanelModeChange}
        />
      </MainMenu.DefaultItems.Preferences>
      <MainMenu.Sub>
        <MainMenu.Sub.Trigger
          icon={<Icon name="sliders" size={16} strokeWidth={1.5} />}
          className="exq-custom-settings-trigger"
        >
          {t.customSettings}
        </MainMenu.Sub.Trigger>
        <MainMenu.Sub.Content className="exq-custom-settings-submenu">
          <CustomSettingsVisualPanel lang={lang} />
        </MainMenu.Sub.Content>
      </MainMenu.Sub>
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
