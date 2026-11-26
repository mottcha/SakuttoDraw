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
export type StylesPanelPref = 'auto' | 'compact' | 'full';

export interface RedactOpts {
  color: string;
}

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
  stylesPanelMode: StylesPanelPref;
  preferJpFont: boolean | null;
  codeLigatures: boolean;
  exportOpts: ExportOpts;
  quickOpts: QuickOpts;
  redactOpts: RedactOpts;
}

export type CjkLang = 'ja' | 'jaStandard' | 'jaPop' | 'jaCode' | 'ko' | 'zh';
export type CjkSetStatus = 'uninstalled' | 'downloading' | 'installed';

export interface CjkFontSetMeta {
  label: string;
  files: string[];
  totalBytes: number;
}

export interface CjkFontManifest {
  sets: Record<CjkLang, CjkFontSetMeta>;
}

export interface JpFontChunkMeta {
  file: string;
  unicodeRange: string;
  bytes: number;
}

export interface FontPackManifest {
  source: string;
  totalBytes: number;
  chunks: JpFontChunkMeta[];
}

export interface CascadiaMonoManifest {
  file: string;
  unicodeRange: string;
  bytes: number;
}

export interface JpFontManifest {
  source: string;
  totalBytes: number;
  chunks: JpFontChunkMeta[];
  bizUdpGothic?: FontPackManifest;
  mochiyPop?: FontPackManifest;
  sakuttoCode?: FontPackManifest;
  sakuttoCodeLgLatin?: JpFontChunkMeta;
  comicShannsMono500?: FontPackManifest;
  cascadiaMono?: CascadiaMonoManifest;
  cascadiaCodeRange?: string;
}

export type { ExcalidrawImperativeAPI };
