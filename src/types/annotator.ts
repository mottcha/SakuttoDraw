import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';

export type AppLang = 'en' | 'ja-JP' | 'ko-KR' | 'zh-CN' | 'zh-TW';
export type ThemeMode = 'light' | 'dark' | 'system';

export type ExportFormat = 'png' | 'svg';
export type ExportScale = 1 | 2 | 3;

export interface ExportOpts {
  onlySelected: boolean;
  background: boolean;
  darkMode: boolean;
  embedScene: boolean;
  format: ExportFormat;
  scale: ExportScale;
}

export type BoxSelectionPref = 'overlap' | 'contain';
export type InputDevicePref = 'trackpad' | 'mouse';

export interface QuickOpts {
  autoResetOnOpen: boolean;
  defaultPenColor: string;
  textAutoResize: boolean;
  fastLoadSave: boolean;
  modernContextMenu: boolean;
}

export interface Prefs {
  lang: AppLang;
  themeMode: ThemeMode;
  boxSelectionMode: BoxSelectionPref;
  inputDevice: InputDevicePref;
  exportOpts: ExportOpts;
  quickOpts: QuickOpts;
}

export type CjkLang = 'ja' | 'ko' | 'zh';
export type CjkSetStatus = 'uninstalled' | 'downloading' | 'installed';

export interface CjkFontSetMeta {
  label: string;
  files: string[];
  totalBytes: number;
}

export interface CjkFontManifest {
  sets: Record<CjkLang, CjkFontSetMeta>;
}

export type { ExcalidrawImperativeAPI };
