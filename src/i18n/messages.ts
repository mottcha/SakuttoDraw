import type { AppLang, CjkLang } from '../types/annotator';

export const SUPPORTED_LANGS: ReadonlyArray<{ code: AppLang; nativeLabel: string }> = [
  { code: 'en', nativeLabel: 'English' },
  { code: 'ja-JP', nativeLabel: '日本語' },
  { code: 'zh-CN', nativeLabel: '简体中文' },
  { code: 'zh-TW', nativeLabel: '繁體中文' },
  { code: 'ko-KR', nativeLabel: '한국어' },
] as const;

export interface MessageCatalog {
  shapeGroupTitle: string;
  toolArrow: string;
  toolLine: string;
  toolDiamond: string;
  toolEraser: string;
  toolSticky: string;
  toolLasso: string;
  toolLock: string;
  resetCanvasTitle: string;
  copyToClipboard: string;
  saveAsImage: string;
  exportSettings: string;
  exportOnlySelected: string;
  exportBackground: string;
  exportDarkMode: string;
  exportEmbedScene: string;
  exportFormat: string;
  exportScale: string;
  quickSettings: string;
  optAutoResetOnOpen: string;
  optDefaultPink: string;
  optTextAutoResize: string;
  optFastLoadSave: string;
  canvasBackground: string;
  bgColorLabel: string;
  languageLabel: string;
  offlineFontsTitle: string;
  cjkLangName: Record<CjkLang, string>;
  fontDownload: string;
  fontDelete: string;
  ctxBringToFront: string;
  ctxSendToBack: string;
  toastEmptyCanvas: string;
  toastCopiedSelected: string;
  toastCopiedAll: string;
  toastCopyFailed: string;
  toastSavedSelected: string;
  toastSavedAll: string;
  toastExportFailed: string;
  toastResetDone: string;
  toastBgChanged: string;
  toastSceneSaved: string;
  toastFileLoaded: string;
  toastFileLoadFailed: string;
  toastFontDownloaded: (langName: string) => string;
  toastFontDownloadFailed: (langName: string) => string;
  toastFontDeleted: (langName: string) => string;
  toastFontDeleteFailed: (langName: string) => string;
}

const MESSAGES: Record<AppLang, MessageCatalog> = {
  en: {
    shapeGroupTitle: 'Arrow, Line, Diamond',
    toolArrow: 'Arrow',
    toolLine: 'Line',
    toolDiamond: 'Diamond',
    toolEraser: 'Eraser',
    toolSticky: 'Sticky note',
    toolLasso: 'Lasso selection',
    toolLock: 'Keep selected tool active after drawing',
    resetCanvasTitle: 'Clear canvas',
    copyToClipboard: 'Copy to clipboard',
    saveAsImage: 'Save as image',
    exportSettings: 'Export settings',
    exportOnlySelected: 'Only selected',
    exportBackground: 'Background',
    exportDarkMode: 'Dark mode',
    exportEmbedScene: 'Embed scene',
    exportFormat: 'Format',
    exportScale: 'Scale',
    quickSettings: 'Quick settings',
    optAutoResetOnOpen: 'Auto-reset on open',
    optDefaultPink: 'Default pink stroke',
    optTextAutoResize: 'Auto-resize text',
    optFastLoadSave: 'Skip load/save prompts',
    canvasBackground: 'Canvas background',
    bgColorLabel: 'Background color',
    languageLabel: 'Language',
    offlineFontsTitle: 'Hand-drawn fonts (offline)',
    cjkLangName: { ja: 'Japanese', ko: 'Korean', zh: 'Chinese' },
    fontDownload: 'Download',
    fontDelete: 'Delete',
    ctxBringToFront: 'Bring to front',
    ctxSendToBack: 'Send to back',
    toastEmptyCanvas: 'Nothing to export',
    toastCopiedSelected: 'Copied selected elements',
    toastCopiedAll: 'Copied entire canvas',
    toastCopyFailed: 'Failed to copy image',
    toastSavedSelected: 'Saved selected elements',
    toastSavedAll: 'Saved entire canvas',
    toastExportFailed: 'Failed to export image',
    toastResetDone: 'Canvas cleared',
    toastBgChanged: 'Canvas background updated',
    toastSceneSaved: 'Scene saved',
    toastFileLoaded: 'File loaded',
    toastFileLoadFailed: 'Failed to load file',
    toastFontDownloaded: (n) => `${n} font cached for offline use`,
    toastFontDownloadFailed: (n) => `Failed to download ${n} font`,
    toastFontDeleted: (n) => `${n} font cache deleted`,
    toastFontDeleteFailed: (n) => `Failed to delete ${n} font cache`,
  },
  'ja-JP': {
    shapeGroupTitle: '矢印・直線・ひし形',
    toolArrow: '矢印',
    toolLine: '直線',
    toolDiamond: 'ひし形',
    toolEraser: '消しゴム',
    toolSticky: '付箋',
    toolLasso: 'なげなわ選択',
    toolLock: '描画後もツールを固定',
    resetCanvasTitle: 'キャンバスをクリア',
    copyToClipboard: 'クリップボードにコピー',
    saveAsImage: '画像として保存',
    exportSettings: 'エクスポート設定',
    exportOnlySelected: '選択した図形のみ',
    exportBackground: '背景',
    exportDarkMode: 'ダークモード',
    exportEmbedScene: 'シーンを埋め込む',
    exportFormat: '保存形式',
    exportScale: 'スケール',
    quickSettings: 'クイック設定',
    optAutoResetOnOpen: '起動時に自動リセット',
    optDefaultPink: '既定色をピンク',
    optTextAutoResize: 'テキスト自動サイズ変更',
    optFastLoadSave: '開く/保存の確認スキップ',
    canvasBackground: 'キャンバスの背景',
    bgColorLabel: '背景色',
    languageLabel: '言語',
    offlineFontsTitle: '手書きフォントキャッシュ (オフライン用)',
    cjkLangName: { ja: '日本語', ko: '韓国語', zh: '中国語' },
    fontDownload: 'ダウンロード',
    fontDelete: '削除',
    ctxBringToFront: '最前面に移動',
    ctxSendToBack: '最背面に移動',
    toastEmptyCanvas: '書き出す内容がありません',
    toastCopiedSelected: '選択した図形をコピーしました',
    toastCopiedAll: 'キャンバス全体をコピーしました',
    toastCopyFailed: 'コピーに失敗しました',
    toastSavedSelected: '選択した図形を保存しました',
    toastSavedAll: 'キャンバス全体を保存しました',
    toastExportFailed: '保存に失敗しました',
    toastResetDone: 'キャンバスをクリアしました',
    toastBgChanged: 'キャンバスの背景を変更しました',
    toastSceneSaved: 'シーンを保存しました',
    toastFileLoaded: 'ファイルを読み込みました',
    toastFileLoadFailed: 'ファイルの読み込みに失敗しました',
    toastFontDownloaded: (n) => `${n}フォントをダウンロードしました`,
    toastFontDownloadFailed: (n) => `${n}フォントのダウンロードに失敗しました`,
    toastFontDeleted: (n) => `${n}フォントのキャッシュを削除しました`,
    toastFontDeleteFailed: (n) => `${n}フォントの削除に失敗しました`,
  },
  'zh-CN': {
    shapeGroupTitle: '箭头・直线・菱形',
    toolArrow: '箭头',
    toolLine: '直线',
    toolDiamond: '菱形',
    toolEraser: '橡皮擦',
    toolSticky: '便签',
    toolLasso: '套索选择',
    toolLock: '绘制后保持所选工具',
    resetCanvasTitle: '清空画布',
    copyToClipboard: '复制到剪贴板',
    saveAsImage: '保存为图片',
    exportSettings: '导出设置',
    exportOnlySelected: '仅导出选中项',
    exportBackground: '背景',
    exportDarkMode: '深色模式',
    exportEmbedScene: '嵌入场景数据',
    exportFormat: '保存格式',
    exportScale: '缩放比例',
    quickSettings: '快捷设置',
    optAutoResetOnOpen: '打开时自动重置',
    optDefaultPink: '默认粉色画笔',
    optTextAutoResize: '文本自动调整大小',
    optFastLoadSave: '跳过打开/保存确认',
    canvasBackground: '画布背景',
    bgColorLabel: '背景颜色',
    languageLabel: '语言',
    offlineFontsTitle: '手写字体缓存（离线用）',
    cjkLangName: { ja: '日语', ko: '韩语', zh: '中文' },
    fontDownload: '下载',
    fontDelete: '删除',
    ctxBringToFront: '置于顶层',
    ctxSendToBack: '置于底层',
    toastEmptyCanvas: '没有可导出的内容',
    toastCopiedSelected: '已复制选中的图形',
    toastCopiedAll: '已复制整个画布',
    toastCopyFailed: '复制图片失败',
    toastSavedSelected: '已保存选中的图形',
    toastSavedAll: '已保存整个画布',
    toastExportFailed: '保存图片失败',
    toastResetDone: '已清空画布',
    toastBgChanged: '已更改画布背景',
    toastSceneSaved: '已保存场景文件',
    toastFileLoaded: '已加载文件',
    toastFileLoadFailed: '加载文件失败',
    toastFontDownloaded: (n) => `已下载${n}手写字体`,
    toastFontDownloadFailed: (n) => `下载${n}手写字体失败`,
    toastFontDeleted: (n) => `已删除${n}手写字体缓存`,
    toastFontDeleteFailed: (n) => `删除${n}手写字体缓存失败`,
  },
  'zh-TW': {
    shapeGroupTitle: '箭頭・直線・菱形',
    toolArrow: '箭頭',
    toolLine: '直線',
    toolDiamond: '菱形',
    toolEraser: '橡皮擦',
    toolSticky: '便利貼',
    toolLasso: '套索選取',
    toolLock: '繪製後保持所選工具',
    resetCanvasTitle: '清除畫布',
    copyToClipboard: '複製到剪貼簿',
    saveAsImage: '儲存為圖片',
    exportSettings: '匯出設定',
    exportOnlySelected: '僅匯出選取項目',
    exportBackground: '背景',
    exportDarkMode: '深色模式',
    exportEmbedScene: '嵌入場景資料',
    exportFormat: '儲存格式',
    exportScale: '縮放比例',
    quickSettings: '快速設定',
    optAutoResetOnOpen: '開啟時自動重設',
    optDefaultPink: '預設粉紅色畫筆',
    optTextAutoResize: '文字自動調整大小',
    optFastLoadSave: '略過開啟/儲存確認',
    canvasBackground: '畫布背景',
    bgColorLabel: '背景顏色',
    languageLabel: '語言',
    offlineFontsTitle: '手寫字體快取（離線用）',
    cjkLangName: { ja: '日文', ko: '韓文', zh: '中文' },
    fontDownload: '下載',
    fontDelete: '刪除',
    ctxBringToFront: '移至最上層',
    ctxSendToBack: '移至最下層',
    toastEmptyCanvas: '沒有可匯出的內容',
    toastCopiedSelected: '已複製選取的圖形',
    toastCopiedAll: '已複製整個畫布',
    toastCopyFailed: '複製圖片失敗',
    toastSavedSelected: '已儲存選取的圖形',
    toastSavedAll: '已儲存整個畫布',
    toastExportFailed: '儲存圖片失敗',
    toastResetDone: '已清除畫布',
    toastBgChanged: '已變更畫布背景',
    toastSceneSaved: '已儲存場景檔案',
    toastFileLoaded: '已載入檔案',
    toastFileLoadFailed: '載入檔案失敗',
    toastFontDownloaded: (n) => `已下載${n}手寫字體`,
    toastFontDownloadFailed: (n) => `下載${n}手寫字體失敗`,
    toastFontDeleted: (n) => `已刪除${n}手寫字體快取`,
    toastFontDeleteFailed: (n) => `刪除${n}手寫字體快取失敗`,
  },
  'ko-KR': {
    shapeGroupTitle: '화살표・직선・마름모',
    toolArrow: '화살표',
    toolLine: '직선',
    toolDiamond: '마름모',
    toolEraser: '지우개',
    toolSticky: '스티커 메모',
    toolLasso: '올가미 선택',
    toolLock: '그린 후에도 도구 고정',
    resetCanvasTitle: '캔버스 지우기',
    copyToClipboard: '클립보드에 복사',
    saveAsImage: '이미지로 저장',
    exportSettings: '내보내기 설정',
    exportOnlySelected: '선택한 도형만',
    exportBackground: '배경',
    exportDarkMode: '다크 모드',
    exportEmbedScene: '장면 데이터 포함',
    exportFormat: '저장 형식',
    exportScale: '배율',
    quickSettings: '빠른 설정',
    optAutoResetOnOpen: '시작 시 자동 초기화',
    optDefaultPink: '기본 선 색상 핑크',
    optTextAutoResize: '텍스트 자동 크기 조절',
    optFastLoadSave: '열기/저장 확인 건너뛰기',
    canvasBackground: '캔버스 배경',
    bgColorLabel: '배경색',
    languageLabel: '언어',
    offlineFontsTitle: '손글씨 글꼴 캐시 (오프라인용)',
    cjkLangName: { ja: '일본어', ko: '한국어', zh: '중국어' },
    fontDownload: '다운로드',
    fontDelete: '삭제',
    ctxBringToFront: '맨 앞으로 가져오기',
    ctxSendToBack: '맨 뒤로 보내기',
    toastEmptyCanvas: '내보낼 내용이 없습니다',
    toastCopiedSelected: '선택한 도형을 복사했습니다',
    toastCopiedAll: '전체 캔버스를 복사했습니다',
    toastCopyFailed: '이미지 복사에 실패했습니다',
    toastSavedSelected: '선택한 도형을 저장했습니다',
    toastSavedAll: '전체 캔버스를 저장했습니다',
    toastExportFailed: '이미지 저장에 실패했습니다',
    toastResetDone: '캔버스를 지웠습니다',
    toastBgChanged: '캔버스 배경을 변경했습니다',
    toastSceneSaved: '장면 파일을 저장했습니다',
    toastFileLoaded: '파일을 불러왔습니다',
    toastFileLoadFailed: '파일 불러오기에 실패했습니다',
    toastFontDownloaded: (n) => `${n} 손글씨 글꼴을 다운로드했습니다`,
    toastFontDownloadFailed: (n) => `${n} 손글씨 글꼴 다운로드에 실패했습니다`,
    toastFontDeleted: (n) => `${n} 손글씨 글꼴 캐시를 삭제했습니다`,
    toastFontDeleteFailed: (n) => `${n} 손글씨 글꼴 캐시 삭제에 실패했습니다`,
  },
};

export function normalizeAppLang(value: unknown): AppLang | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase().replace(/_/g, '-');
  if (!v) return null;
  if (v === 'ja' || v.startsWith('ja-')) return 'ja-JP';
  if (v === 'ko' || v.startsWith('ko-')) return 'ko-KR';
  if (v === 'zh-tw' || v === 'zh-hk' || v === 'zh-mo' || v.includes('hant')) return 'zh-TW';
  if (v === 'zh' || v.startsWith('zh-')) return 'zh-CN';
  if (v === 'en' || v.startsWith('en-')) return 'en';
  return null;
}

export function detectBrowserLang(
  nav: Pick<Navigator, 'language' | 'languages'> | null = typeof navigator !== 'undefined' ? navigator : null,
): AppLang {
  if (!nav) return 'en';
  const candidates = [
    ...(Array.isArray(nav.languages) ? nav.languages : []),
    nav.language,
  ];
  for (const cand of candidates) {
    const matched = normalizeAppLang(cand);
    if (matched) return matched;
  }
  return 'en';
}

export function getMessages(lang: AppLang): MessageCatalog {
  return MESSAGES[lang] ?? MESSAGES.en;
}
