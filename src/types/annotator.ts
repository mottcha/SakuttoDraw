export type AppLang = 'en' | 'ja-JP' | 'ko-KR' | 'zh-CN' | 'zh-TW';
export type ThemeMode = 'light' | 'dark' | 'system';

export type ExportFormat = 'png' | 'svg';
export type ExportScale = 1 | 2 | 3;

export interface ExportOpts {
  onlySelected: boolean;
  background: boolean;
  darkMode: boolean;
  embedScene: boolean;
  padding: boolean;
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
export type CjkSetStatus = 'uninstalled' | 'downloading' | 'deleting' | 'installed';

export interface CjkFontSetMeta {
  files: string[];
  totalBytes: number;
}

export interface CjkFontManifest {
  sets: Record<CjkLang, CjkFontSetMeta>;
}

export interface JpFontChunkRef {
  file: string;
  rangeIndex?: number;
  unicodeRange?: string;
}

export interface FontPackManifest {
  chunks: JpFontChunkRef[];
}

export interface JpFontManifest {
  ranges?: string[];
  chunks: JpFontChunkRef[];
  bizUdpGothic?: FontPackManifest;
  mochiyPop?: FontPackManifest;
  sakuttoCode?: FontPackManifest;
  sakuttoCodeLgLatin?: JpFontChunkRef;
  comicShannsMono500?: FontPackManifest;
  cascadiaMono?: JpFontChunkRef;
  cascadiaCodeRangeIndex?: number;
  cascadiaCodeRange?: string;
}
