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
  mobileShapeGroupTitle: string;
  toolRectangle: string;
  toolEllipse: string;
  toolText: string;
  toolImage: string;
  toolFrame: string;
  toolArrow: string;
  toolLine: string;
  toolDiamond: string;
  toolRedact: string;
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
  drawAssist: string;
  assistSnapToObjects: string;
  assistShowGrid: string;
  assistArrowBinding: string;
  assistMidpointSnap: string;
  customSettings: string;
  customBehaviorTitle: string;
  optAutoResetOnOpen: string;
  optTextAutoResize: string;
  optFastLoadSave: string;
  optModernContextMenu: string;
  penColor: string;
  penColorLabel: string;
  canvasBackground: string;
  bgColorLabel: string;
  prefBoxSelectionTitle: string;
  prefBoxOverlap: string;
  prefBoxContain: string;
  prefScrollActionTitle: string;
  prefScrollPan: string;
  prefScrollZoom: string;
  prefScreenModeTitle: string;
  prefZenMode: string;
  prefViewMode: string;
  prefStylesPanelTitle: string;
  prefStylesPanelAuto: string;
  prefStylesPanelCompact: string;
  prefStylesPanelFull: string;
  languageLabel: string;
  fontSettings: string;
  prefPreferJpFont: string;
  preferJpOptionJa: string;
  preferJpOptionZh: string;
  prefCodeLigatures: string;
  prefCodeLigaturesOn: string;
  prefCodeLigaturesOff: string;
  fontLabelHandDrawn: string;
  fontLabelNormal: string;
  fontLabelPop: string;
  fontLabelCode: string;
  fontLabelCodeHandDrawn: string;
  offlineFontsTitle: string;
  fontSlotsTitle: string;
  fontBuiltinBadge: string;
  fontOtherLanguagesTitle: string;
  fontLicensesButton: string;
  fontLicenseAuthorPrefix: string;
  fontLicenseCjkFallback: string;
  redactColorTitle: string;
  swapStrokeFillTitle: string;
  toastColorSwapped: string;
  cjkLangName: Record<CjkLang, string>;
  fontDownload: string;
  fontDelete: string;
  ctxCut: string;
  ctxCopy: string;
  ctxPaste: string;
  ctxDuplicate: string;
  ctxDelete: string;
  ctxMore: string;
  ctxLayer: string;
  ctxBringToFront: string;
  ctxBringForward: string;
  ctxSendBackward: string;
  ctxSendToBack: string;
  toastEmptyCanvas: string;
  toastCopiedSelected: string;
  toastCopiedAll: string;
  toastCopyFailed: string;
  toastSavedSelected: string;
  toastSavedAll: string;
  toastExportFailed: string;
  toastResetDone: string;
  toastPenColorChanged: string;
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
    shapeGroupTitle: 'Arrow, Line, Diamond, Blackout',
    mobileShapeGroupTitle: 'Ellipse, Arrow, Line, Diamond, Blackout',
    toolRectangle: 'Rectangle',
    toolEllipse: 'Ellipse',
    toolText: 'Text',
    toolImage: 'Image',
    toolFrame: 'Frame',
    toolArrow: 'Arrow',
    toolLine: 'Line',
    toolDiamond: 'Diamond',
    toolRedact: 'Blackout',
    toolEraser: 'Eraser',
    toolSticky: 'Sticky note',
    toolLasso: 'Lasso selection',
    toolLock: 'Keep using tool after drawing',
    resetCanvasTitle: 'Clear canvas',
    copyToClipboard: 'Copy to clipboard',
    saveAsImage: 'Save as image',
    exportSettings: 'Export settings',
    exportOnlySelected: 'Only selected',
    exportBackground: 'Transparent background',
    exportDarkMode: 'Dark mode',
    exportEmbedScene: 'Embed editable scene',
    exportFormat: 'Format',
    exportScale: 'Scale',
    drawAssist: 'Drawing assist',
    assistSnapToObjects: 'Snap to objects',
    assistShowGrid: 'Show grid',
    assistArrowBinding: 'Bind arrows to shapes',
    assistMidpointSnap: 'Snap arrows to midpoint',
    customSettings: 'Custom settings',
    customBehaviorTitle: 'Behavior',
    optAutoResetOnOpen: 'Reset canvas on open',
    optTextAutoResize: 'No fixed width on new text',
    optFastLoadSave: 'Skip load/save prompts',
    optModernContextMenu: 'Modern context menu',
    penColor: 'Default pen color',
    penColorLabel: 'Default pen color',
    canvasBackground: 'Canvas background',
    bgColorLabel: 'Background color',
    prefBoxSelectionTitle: 'Drag selection rule',
    prefBoxOverlap: 'Partial',
    prefBoxContain: 'Full',
    prefScrollActionTitle: 'Scroll wheel action',
    prefScrollPan: 'Pan',
    prefScrollZoom: 'Zoom',
    prefScreenModeTitle: 'Screen mode',
    prefZenMode: 'Zen',
    prefViewMode: 'View',
    prefStylesPanelTitle: 'Left style panel',
    prefStylesPanelAuto: 'Auto',
    prefStylesPanelCompact: 'Slim',
    prefStylesPanelFull: 'Expanded',
    languageLabel: 'Language',
    fontSettings: 'Font settings',
    prefPreferJpFont: 'Preferred fonts',
    preferJpOptionJa: 'Japanese',
    preferJpOptionZh: 'Standard / CJK',
    prefCodeLigatures: 'Code ligatures (=> !==)',
    prefCodeLigaturesOn: 'ON',
    prefCodeLigaturesOff: 'OFF',
    fontLabelHandDrawn: 'Hand-drawn',
    fontLabelNormal: 'Normal',
    fontLabelPop: 'Pop',
    fontLabelCode: 'Code',
    fontLabelCodeHandDrawn: 'Code (Hand-drawn)',
    offlineFontsTitle: 'Offline fonts',
    fontSlotsTitle: 'Active fonts & offline cache',
    fontBuiltinBadge: 'Built-in',
    fontOtherLanguagesTitle: 'Other languages (Xiaolai fallback)',
    fontLicensesButton: 'Font licenses & authors',
    fontLicenseAuthorPrefix: 'Author',
    fontLicenseCjkFallback: 'CJK fallback',
    redactColorTitle: 'Fill color',
    swapStrokeFillTitle: 'Toggle fill / swap stroke & background (Shift+X)',
    toastColorSwapped: 'Swapped stroke & background',
    cjkLangName: {
      ja: 'JP Hand-drawn',
      jaStandard: 'JP Normal / Code',
      jaPop: 'JP Pop',
      ko: 'Korean',
      zh: 'Chinese',
    },
    fontDownload: 'Download',
    fontDelete: 'Delete',
    ctxCut: 'Cut',
    ctxCopy: 'Copy',
    ctxPaste: 'Paste',
    ctxDuplicate: 'Duplicate',
    ctxDelete: 'Delete',
    ctxMore: 'More',
    ctxLayer: 'Layer',
    ctxBringToFront: 'Bring to front',
    ctxBringForward: 'Bring forward',
    ctxSendBackward: 'Send backward',
    ctxSendToBack: 'Send to back',
    toastEmptyCanvas: 'Nothing to export',
    toastCopiedSelected: 'Copied selected elements',
    toastCopiedAll: 'Copied entire canvas',
    toastCopyFailed: 'Failed to copy image',
    toastSavedSelected: 'Saved selected elements',
    toastSavedAll: 'Saved entire canvas',
    toastExportFailed: 'Failed to export image',
    toastResetDone: 'Canvas cleared',
    toastPenColorChanged: 'Pen color updated',
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
    shapeGroupTitle: '矢印・直線・ひし形・黒塗り',
    mobileShapeGroupTitle: '丸・矢印・直線・ひし形・黒塗り',
    toolRectangle: '四角形',
    toolEllipse: '丸',
    toolText: 'テキスト',
    toolImage: '画像',
    toolFrame: 'フレーム',
    toolArrow: '矢印',
    toolLine: '直線',
    toolDiamond: 'ひし形',
    toolRedact: '黒塗り',
    toolEraser: '消しゴム',
    toolSticky: '付箋',
    toolLasso: 'なげなわ選択',
    toolLock: '作成後もツールを連続使用',
    resetCanvasTitle: 'キャンバスをクリア',
    copyToClipboard: 'クリップボードにコピー',
    saveAsImage: '画像として保存',
    exportSettings: 'エクスポート設定',
    exportOnlySelected: '選択した図形のみ',
    exportBackground: '背景の透明化',
    exportDarkMode: 'ダークモード',
    exportEmbedScene: '編集データを画像に含める',
    exportFormat: '保存形式',
    exportScale: 'スケール',
    drawAssist: '描画アシスト',
    assistSnapToObjects: 'オブジェクトにスナップ',
    assistShowGrid: 'グリッドを表示',
    assistArrowBinding: '矢印を図形に結合',
    assistMidpointSnap: '矢印を中点にスナップ',
    customSettings: 'カスタム設定',
    customBehaviorTitle: '動作設定',
    optAutoResetOnOpen: '起動時にキャンバスをリセット',
    optTextAutoResize: 'テキスト挿入時に固定幅にしない',
    optFastLoadSave: '開く/保存の確認スキップ',
    optModernContextMenu: 'コンテキストメニューのモダン化',
    penColor: 'デフォルトのペンの色',
    penColorLabel: 'デフォルトのペンの色',
    canvasBackground: 'キャンバスの背景',
    bgColorLabel: '背景色',
    prefBoxSelectionTitle: 'ドラッグ選択の囲み判定',
    prefBoxOverlap: '一部',
    prefBoxContain: '全体',
    prefScrollActionTitle: 'スクロール時の動作',
    prefScrollPan: '画面移動',
    prefScrollZoom: '拡大・縮小',
    prefScreenModeTitle: '画面モード',
    prefZenMode: '集中',
    prefViewMode: '閲覧',
    prefStylesPanelTitle: '左の書式パネル表示',
    prefStylesPanelAuto: '自動',
    prefStylesPanelCompact: 'スリム固定',
    prefStylesPanelFull: '常に展開',
    languageLabel: '言語',
    fontSettings: 'フォント設定',
    prefPreferJpFont: '優先フォント',
    preferJpOptionJa: '日本語',
    preferJpOptionZh: '標準・中国語',
    prefCodeLigatures: 'コード合字 (=> !==)',
    prefCodeLigaturesOn: 'ON',
    prefCodeLigaturesOff: 'OFF',
    fontLabelHandDrawn: '手書き',
    fontLabelNormal: '標準',
    fontLabelPop: 'ポップ',
    fontLabelCode: 'コード',
    fontLabelCodeHandDrawn: 'コード（手書き風）',
    offlineFontsTitle: 'オフライン用フォント',
    fontSlotsTitle: '使用フォント・オフライン保存',
    fontBuiltinBadge: '同梱済み',
    fontOtherLanguagesTitle: 'その他の言語（Xiaolai 補完）',
    fontLicensesButton: 'フォントのライセンス・作者情報',
    fontLicenseAuthorPrefix: '作者',
    fontLicenseCjkFallback: 'CJK 補完',
    redactColorTitle: '塗りつぶし色',
    swapStrokeFillTitle: '塗りつぶし切替・ストロークと背景色を入替 (Shift+X)',
    toastColorSwapped: 'ストロークと背景色を入れ替えました',
    cjkLangName: {
      ja: '日本語 (手書き)',
      jaStandard: '日本語 (標準・コード)',
      jaPop: '日本語 (ポップ)',
      ko: '韓国語',
      zh: '中国語',
    },
    fontDownload: 'ダウンロード',
    fontDelete: '削除',
    ctxCut: '切り取り',
    ctxCopy: 'コピー',
    ctxPaste: '貼り付け',
    ctxDuplicate: '複製',
    ctxDelete: '削除',
    ctxMore: 'その他',
    ctxLayer: 'レイヤー',
    ctxBringToFront: '最前面に移動',
    ctxBringForward: '前面へ移動',
    ctxSendBackward: '背面へ移動',
    ctxSendToBack: '最背面に移動',
    toastEmptyCanvas: '書き出す内容がありません',
    toastCopiedSelected: '選択した図形をコピーしました',
    toastCopiedAll: 'キャンバス全体をコピーしました',
    toastCopyFailed: 'コピーに失敗しました',
    toastSavedSelected: '選択した図形を保存しました',
    toastSavedAll: 'キャンバス全体を保存しました',
    toastExportFailed: '保存に失敗しました',
    toastResetDone: 'キャンバスをクリアしました',
    toastPenColorChanged: 'ペンの色を変更しました',
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
    shapeGroupTitle: '箭头・直线・菱形・涂黑',
    mobileShapeGroupTitle: '椭圆・箭头・直线・菱形・涂黑',
    toolRectangle: '矩形',
    toolEllipse: '椭圆',
    toolText: '文本',
    toolImage: '图片',
    toolFrame: '画框',
    toolArrow: '箭头',
    toolLine: '直线',
    toolDiamond: '菱形',
    toolRedact: '涂黑',
    toolEraser: '橡皮擦',
    toolSticky: '便签',
    toolLasso: '套索选择',
    toolLock: '绘制后连续使用工具',
    resetCanvasTitle: '清空画布',
    copyToClipboard: '复制到剪贴板',
    saveAsImage: '保存为图片',
    exportSettings: '导出设置',
    exportOnlySelected: '仅导出选中项',
    exportBackground: '透明背景',
    exportDarkMode: '深色模式',
    exportEmbedScene: '在图片中嵌入可编辑数据',
    exportFormat: '保存格式',
    exportScale: '缩放比例',
    drawAssist: '绘图辅助',
    assistSnapToObjects: '对齐到对象',
    assistShowGrid: '显示网格',
    assistArrowBinding: '箭头绑定到图形',
    assistMidpointSnap: '箭头吸附到中点',
    customSettings: '自定义设置',
    customBehaviorTitle: '行为设置',
    optAutoResetOnOpen: '打开时重置画布',
    optTextAutoResize: '插入文本时不固定宽度',
    optFastLoadSave: '跳过打开/保存确认',
    optModernContextMenu: '现代右键菜单',
    penColor: '默认画笔颜色',
    penColorLabel: '默认画笔颜色',
    canvasBackground: '画布背景',
    bgColorLabel: '背景颜色',
    prefBoxSelectionTitle: '框选判定方式',
    prefBoxOverlap: '部分接触',
    prefBoxContain: '完全包含',
    prefScrollActionTitle: '滚轮滚动操作',
    prefScrollPan: '移动画布',
    prefScrollZoom: '缩放画面',
    prefScreenModeTitle: '显示模式',
    prefZenMode: '专注',
    prefViewMode: '浏览',
    prefStylesPanelTitle: '左侧样式面板显示',
    prefStylesPanelAuto: '自动',
    prefStylesPanelCompact: '精简固定',
    prefStylesPanelFull: '始终展开',
    languageLabel: '语言',
    fontSettings: '字体设置',
    prefPreferJpFont: '优先字体',
    preferJpOptionJa: '日语',
    preferJpOptionZh: '标准 / 中文',
    prefCodeLigatures: '代码连字 (=> !==)',
    prefCodeLigaturesOn: '开启',
    prefCodeLigaturesOff: '关闭',
    fontLabelHandDrawn: '手写',
    fontLabelNormal: '标准',
    fontLabelPop: '流行',
    fontLabelCode: '代码',
    fontLabelCodeHandDrawn: '代码（手写风）',
    offlineFontsTitle: '离线字体',
    fontSlotsTitle: '当前字体与离线缓存',
    fontBuiltinBadge: '已内置',
    fontOtherLanguagesTitle: '其他语言（Xiaolai 补充）',
    fontLicensesButton: '字体许可证与作者信息',
    fontLicenseAuthorPrefix: '作者',
    fontLicenseCjkFallback: 'CJK 补充',
    redactColorTitle: '填充颜色',
    swapStrokeFillTitle: '切换填充/交换描边与背景色 (Shift+X)',
    toastColorSwapped: '已交换描边与背景色',
    cjkLangName: {
      ja: '日语 (手写)',
      jaStandard: '日语 (标准/代码)',
      jaPop: '日语 (流行)',
      ko: '韩语',
      zh: '中文',
    },
    fontDownload: '下载',
    fontDelete: '删除',
    ctxCut: '剪切',
    ctxCopy: '复制',
    ctxPaste: '粘贴',
    ctxDuplicate: '再制',
    ctxDelete: '删除',
    ctxMore: '更多',
    ctxLayer: '图层',
    ctxBringToFront: '置于顶层',
    ctxBringForward: '上移一层',
    ctxSendBackward: '下移一层',
    ctxSendToBack: '置于底层',
    toastEmptyCanvas: '没有可导出的内容',
    toastCopiedSelected: '已复制选中的图形',
    toastCopiedAll: '已复制整个画布',
    toastCopyFailed: '复制图片失败',
    toastSavedSelected: '已保存选中的图形',
    toastSavedAll: '已保存整个画布',
    toastExportFailed: '保存图片失败',
    toastResetDone: '已清空画布',
    toastPenColorChanged: '已更改画笔颜色',
    toastBgChanged: '已更改画布背景',
    toastSceneSaved: '已保存场景文件',
    toastFileLoaded: '已加载文件',
    toastFileLoadFailed: '加载文件失败',
    toastFontDownloaded: (n) => `已下载${n}字体`,
    toastFontDownloadFailed: (n) => `下载${n}字体失败`,
    toastFontDeleted: (n) => `已删除${n}字体缓存`,
    toastFontDeleteFailed: (n) => `删除${n}字体缓存失败`,
  },
  'zh-TW': {
    shapeGroupTitle: '箭頭・直線・菱形・塗黑',
    mobileShapeGroupTitle: '橢圓・箭頭・直線・菱形・塗黑',
    toolRectangle: '矩形',
    toolEllipse: '橢圓',
    toolText: '文字',
    toolImage: '圖片',
    toolFrame: '畫框',
    toolArrow: '箭頭',
    toolLine: '直線',
    toolDiamond: '菱形',
    toolRedact: '塗黑',
    toolEraser: '橡皮擦',
    toolSticky: '便利貼',
    toolLasso: '套索選取',
    toolLock: '繪製後連續使用工具',
    resetCanvasTitle: '清除畫布',
    copyToClipboard: '複製到剪貼簿',
    saveAsImage: '儲存為圖片',
    exportSettings: '匯出設定',
    exportOnlySelected: '僅匯出選取項目',
    exportBackground: '透明背景',
    exportDarkMode: '深色模式',
    exportEmbedScene: '在圖片中嵌入可編輯資料',
    exportFormat: '儲存格式',
    exportScale: '縮放比例',
    drawAssist: '繪圖輔助',
    assistSnapToObjects: '對齊至物件',
    assistShowGrid: '顯示格線',
    assistArrowBinding: '箭頭綁定至圖形',
    assistMidpointSnap: '箭頭吸附至中點',
    customSettings: '自訂設定',
    customBehaviorTitle: '行為設定',
    optAutoResetOnOpen: '開啟時重設畫布',
    optTextAutoResize: '插入文字時不固定寬度',
    optFastLoadSave: '略過開啟/儲存確認',
    optModernContextMenu: '現代化右鍵選單',
    penColor: '預設畫筆顏色',
    penColorLabel: '預設畫筆顏色',
    canvasBackground: '畫布背景',
    bgColorLabel: '背景顏色',
    prefBoxSelectionTitle: '框選判定方式',
    prefBoxOverlap: '部分接觸',
    prefBoxContain: '完全包含',
    prefScrollActionTitle: '滾輪捲動操作',
    prefScrollPan: '移動畫布',
    prefScrollZoom: '縮放畫面',
    prefScreenModeTitle: '顯示模式',
    prefZenMode: '專注',
    prefViewMode: '瀏覽',
    prefStylesPanelTitle: '左側樣式面板顯示',
    prefStylesPanelAuto: '自動',
    prefStylesPanelCompact: '精簡固定',
    prefStylesPanelFull: '始終展開',
    languageLabel: '語言',
    fontSettings: '字體設定',
    prefPreferJpFont: '優先字體',
    preferJpOptionJa: '日文',
    preferJpOptionZh: '標準 / 中文',
    prefCodeLigatures: '程式碼連字 (=> !==)',
    prefCodeLigaturesOn: '開啟',
    prefCodeLigaturesOff: '關閉',
    fontLabelHandDrawn: '手寫',
    fontLabelNormal: '標準',
    fontLabelPop: '流行',
    fontLabelCode: '程式碼',
    fontLabelCodeHandDrawn: '程式碼（手寫風）',
    offlineFontsTitle: '離線字體',
    fontSlotsTitle: '目前字體與離線快取',
    fontBuiltinBadge: '已內建',
    fontOtherLanguagesTitle: '其他語言（Xiaolai 補充）',
    fontLicensesButton: '字體授權與作者資訊',
    fontLicenseAuthorPrefix: '作者',
    fontLicenseCjkFallback: 'CJK 補充',
    redactColorTitle: '填滿顏色',
    swapStrokeFillTitle: '切換填滿/交換筆畫與背景色 (Shift+X)',
    toastColorSwapped: '已交換筆畫與背景色',
    cjkLangName: {
      ja: '日文 (手寫)',
      jaStandard: '日文 (標準/程式碼)',
      jaPop: '日文 (流行)',
      ko: '韓文',
      zh: '中文',
    },
    fontDownload: '下載',
    fontDelete: '刪除',
    ctxCut: '剪下',
    ctxCopy: '複製',
    ctxPaste: '貼上',
    ctxDuplicate: '重製',
    ctxDelete: '刪除',
    ctxMore: '更多',
    ctxLayer: '圖層',
    ctxBringToFront: '移至最上層',
    ctxBringForward: '上移一層',
    ctxSendBackward: '下移一層',
    ctxSendToBack: '移至最下層',
    toastEmptyCanvas: '沒有可匯出的內容',
    toastCopiedSelected: '已複製選取的圖形',
    toastCopiedAll: '已複製整個畫布',
    toastCopyFailed: '複製圖片失敗',
    toastSavedSelected: '已儲存選取的圖形',
    toastSavedAll: '已儲存整個畫布',
    toastExportFailed: '儲存圖片失敗',
    toastResetDone: '已清除畫布',
    toastPenColorChanged: '已變更畫筆顏色',
    toastBgChanged: '已變更畫布背景',
    toastSceneSaved: '已儲存場景檔案',
    toastFileLoaded: '已載入檔案',
    toastFileLoadFailed: '載入檔案失敗',
    toastFontDownloaded: (n) => `已下載${n}字體`,
    toastFontDownloadFailed: (n) => `下載${n}字體失敗`,
    toastFontDeleted: (n) => `已刪除${n}字體快取`,
    toastFontDeleteFailed: (n) => `刪除${n}字體快取失敗`,
  },
  'ko-KR': {
    shapeGroupTitle: '화살표・직선・마름모・검은 가리기',
    mobileShapeGroupTitle: '원・화살표・직선・마름모・검은 가리기',
    toolRectangle: '사각형',
    toolEllipse: '원',
    toolText: '텍스트',
    toolImage: '이미지',
    toolFrame: '프레임',
    toolArrow: '화살표',
    toolLine: '직선',
    toolDiamond: '마름모',
    toolRedact: '검은 가리기',
    toolEraser: '지우개',
    toolSticky: '스티커 메모',
    toolLasso: '올가미 선택',
    toolLock: '그린 후에도 도구 계속 사용',
    resetCanvasTitle: '캔버스 지우기',
    copyToClipboard: '클립보드에 복사',
    saveAsImage: '이미지로 저장',
    exportSettings: '내보내기 설정',
    exportOnlySelected: '선택한 도형만',
    exportBackground: '배경 투명화',
    exportDarkMode: '다크 모드',
    exportEmbedScene: '이미지에 편집 데이터 포함',
    exportFormat: '저장 형식',
    exportScale: '배율',
    drawAssist: '그리기 보조',
    assistSnapToObjects: '개체에 스냅',
    assistShowGrid: '그리드 표시',
    assistArrowBinding: '화살표를 도형에 결합',
    assistMidpointSnap: '화살표를 중점에 스냅',
    customSettings: '사용자 설정',
    customBehaviorTitle: '동작 설정',
    optAutoResetOnOpen: '시작 시 캔버스 초기화',
    optTextAutoResize: '텍스트 삽입 시 너비 고정 안 함',
    optFastLoadSave: '열기/저장 확인 건너뛰기',
    optModernContextMenu: '모던 컨텍스트 메뉴',
    penColor: '기본 펜 색상',
    penColorLabel: '기본 펜 색상',
    canvasBackground: '캔버스 배경',
    bgColorLabel: '배경색',
    prefBoxSelectionTitle: '드래그 선택 기준',
    prefBoxOverlap: '일부',
    prefBoxContain: '전체',
    prefScrollActionTitle: '스크롤 동작',
    prefScrollPan: '화면 이동',
    prefScrollZoom: '확대/축소',
    prefScreenModeTitle: '화면 모드',
    prefZenMode: '집중',
    prefViewMode: '보기',
    prefStylesPanelTitle: '왼쪽 서식 패널 표시',
    prefStylesPanelAuto: '자동',
    prefStylesPanelCompact: '슬림 고정',
    prefStylesPanelFull: '항상 펼침',
    languageLabel: '언어',
    fontSettings: '글꼴 설정',
    prefPreferJpFont: '우선 글꼴',
    preferJpOptionJa: '일본어',
    preferJpOptionZh: '표준 / 한자',
    prefCodeLigatures: '코드 합자 (=> !==)',
    prefCodeLigaturesOn: '켜기',
    prefCodeLigaturesOff: '끄기',
    fontLabelHandDrawn: '손글씨',
    fontLabelNormal: '표준',
    fontLabelPop: '팝',
    fontLabelCode: '코드',
    fontLabelCodeHandDrawn: '코드 (손글씨풍)',
    offlineFontsTitle: '오프라인 글꼴',
    fontSlotsTitle: '사용 글꼴 및 오프라인 저장',
    fontBuiltinBadge: '내장됨',
    fontOtherLanguagesTitle: '기타 언어 (Xiaolai 보완)',
    fontLicensesButton: '글꼴 라이선스 및 제작자 정보',
    fontLicenseAuthorPrefix: '제작자',
    fontLicenseCjkFallback: 'CJK 보완',
    redactColorTitle: '채우기 색상',
    swapStrokeFillTitle: '채우기 전환 / 선과 배경색 바꾸기 (Shift+X)',
    toastColorSwapped: '선 색상과 배경색을 바꿨습니다',
    cjkLangName: {
      ja: '일본어 (손글씨)',
      jaStandard: '일본어 (표준/코드)',
      jaPop: '일본어 (팝)',
      ko: '한국어',
      zh: '중국어',
    },
    fontDownload: '다운로드',
    fontDelete: '삭제',
    ctxCut: '잘라내기',
    ctxCopy: '복사',
    ctxPaste: '붙여넣기',
    ctxDuplicate: '복제',
    ctxDelete: '삭제',
    ctxMore: '더보기',
    ctxLayer: '레이어',
    ctxBringToFront: '맨 앞으로 가져오기',
    ctxBringForward: '앞으로 가져오기',
    ctxSendBackward: '뒤로 보내기',
    ctxSendToBack: '맨 뒤로 보내기',
    toastEmptyCanvas: '내보낼 내용이 없습니다',
    toastCopiedSelected: '선택한 도형을 복사했습니다',
    toastCopiedAll: '전체 캔버스를 복사했습니다',
    toastCopyFailed: '이미지 복사에 실패했습니다',
    toastSavedSelected: '선택한 도형을 저장했습니다',
    toastSavedAll: '전체 캔버스를 저장했습니다',
    toastExportFailed: '이미지 저장에 실패했습니다',
    toastResetDone: '캔버스를 지웠습니다',
    toastPenColorChanged: '펜 색상을 변경했습니다',
    toastBgChanged: '캔버스 배경을 변경했습니다',
    toastSceneSaved: '장면 파일을 저장했습니다',
    toastFileLoaded: '파일을 불러왔습니다',
    toastFileLoadFailed: '파일 불러오기에 실패했습니다',
    toastFontDownloaded: (n) => `${n} 글꼴을 다운로드했습니다`,
    toastFontDownloadFailed: (n) => `${n} 글꼴 다운로드에 실패했습니다`,
    toastFontDeleted: (n) => `${n} 글꼴 캐시를 삭제했습니다`,
    toastFontDeleteFailed: (n) => `${n} 글꼴 캐시 삭제에 실패했습니다`,
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
