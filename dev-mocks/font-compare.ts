import jpFontManifest from '../src/generated/jpFontManifest.json';

type PickerAxis = 'hand' | 'standard' | 'pop' | 'code';
type CodeFontChoice = 'cascadia' | 'comic';
type ComicJpFallback = 'mplus' | 'seto';
type PopMode = 'hybrid' | 'replace';
type FontSizeKey = 'S' | 'M' | 'L' | 'XL';
type ThemeMode = 'light' | 'dark';

interface MockState {
  activePickerAxis: PickerAxis;
  codeFont: CodeFontChoice;
  comicJpFallback: ComicJpFallback;
  codeLigatures: boolean;
  popMode: PopMode;
  standardWeight: 400 | 500 | 700;
  sizeKey: FontSizeKey;
  theme: ThemeMode;
  showGuides: boolean;
  editorsCollapsed: boolean;
  sampleText: string;
  codeSampleText: string;
  baselineStripText: string;
  uiMockCollapsed: boolean;
  previewCollapsed: boolean;
  localFontsLoaded: boolean;
  allFontsReady: boolean;
}

const GOOGLE_FONTS_RANGES = {
  LATIN:
    'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  LATIN_EXT:
    'U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
  CYRILLIC_EXT: 'U+0460-052F, U+1C80-1C88, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F',
  CYRILLIC: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116',
  VIETNAMESE:
    'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB',
} as const;

const FONT_SIZE_MAP: Record<FontSizeKey, number> = {
  S: 16,
  M: 20,
  L: 28,
  XL: 36,
};

const SAMPLE_PRESETS: ReadonlyArray<{ label: string; text: string }> = [
  {
    label: 'UI手順 (2行)',
    text: '① Secret Token を貼り付けてください。\n② Save Changes (Ctrl+S) を押して v2.4 設定を保存します。',
  },
  {
    label: 'UI注釈・混在',
    text: 'ここをクリック！ API Key設定 (v2.4) 2026/11/26 OK → 完了',
  },
  {
    label: 'JIS漢字確認',
    text: '設定を直ちに保存：真の解決・海外拠点・骨格・次回・変化・令和 (0123 ABC abc)',
  },
  {
    label: '長文・折り返し',
    text: 'スクリーンショット上の気になる箇所に矢印とテキストでサクッと注釈を追加。URLやエラーコード ERR_404 も読みやすく整理できます。',
  },
];

const CODE_PRESETS: ReadonlyArray<{ label: string; text: string }> = [
  {
    label: 'TypeScript + 日本語コメント',
    text: [
      '// APIキー検証 (0/O と 1/l/I の判別確認)',
      'const validateToken = (token: string): boolean => {',
      '  const prefix = "sk-0O1lI"; // 必須プレフィックス',
      '  return token !== "" && token.startsWith(prefix);',
      '};',
    ].join('\n'),
  },
  {
    label: '合字テスト (=> !== -> <= >=)',
    text: [
      'if (a !== b && x <= y && z >= 0) {',
      '  const fn = (v: number) => v === 1 ? "OK" : "NG";',
      '  // 矢印と演算子: -> <- <-> => !== === >= <= !=',
      '}',
    ].join('\n'),
  },
  {
    label: 'CLI / エラーログ',
    text: [
      '# 1. 本番ビルド後にサブパス配信を確認',
      'npm run build && curl -I http://127.0.0.1:4173/SakuttoDraw/',
      '-> HTTP/1.1 200 OK (CSP違反: 0件 / 外部通信: 0件)',
      'ERR_404: /fonts/Xiaolai/... が見つかりません',
    ].join('\n'),
  },
  {
    label: 'インデント・揃え確認',
    text: [
      'id:      "sakutto-01"   // 識別子',
      'status:  200 <= 299     // 正常応答',
      'retry:   [1, 2, 4, 8]   // 秒数バックオフ',
      'message: "保存が完了しました"',
    ].join('\n'),
  },
];

const state: MockState = {
  activePickerAxis: 'code',
  codeFont: 'cascadia',
  comicJpFallback: 'mplus',
  codeLigatures: true,
  popMode: 'hybrid',
  standardWeight: 500,
  sizeKey: 'M',
  theme: 'light',
  showGuides: true,
  editorsCollapsed: false,
  sampleText: SAMPLE_PRESETS[0].text,
  codeSampleText: CODE_PRESETS[0].text,
  baselineStripText: 'AaBbGg 0O1lI => !== あいう アイウ 漢字永置',
  uiMockCollapsed: false,
  previewCollapsed: false,
  localFontsLoaded: false,
  allFontsReady: false,
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getHandFamily(): string {
  return '"Sakutto-Excalifont", "Sakutto-SetoJP", sans-serif';
}

function getStandardFamily(): string {
  return '"M PLUS Rounded 1c", sans-serif';
}

function getPopFamily(): string {
  return state.popMode === 'hybrid'
    ? '"Sakutto-Lilita", "Mochiy Pop P One", sans-serif'
    : '"Mochiy Pop P One", sans-serif';
}

function getCodeFamily(
  choice: CodeFontChoice = state.codeFont,
  comicFallback: ComicJpFallback = state.comicJpFallback,
): string {
  if (choice === 'cascadia') {
    return '"Sakutto-Cascadia", "M PLUS Rounded 1c", monospace';
  }
  const jpFallback = comicFallback === 'seto' ? 'Sakutto-SetoJP' : 'M PLUS Rounded 1c';
  return `"Sakutto-ComicShanns", "${jpFallback}", monospace`;
}

function getCodeDisplayLabel(
  choice: CodeFontChoice = state.codeFont,
  comicFallback: ComicJpFallback = state.comicJpFallback,
  ligatures: boolean = state.codeLigatures,
): string {
  if (choice === 'cascadia') {
    return `Cascadia Code (合字${ligatures ? 'ON' : 'OFF'}) + M PLUS JP`;
  }
  return `Comic Shanns + ${comicFallback === 'seto' ? 'SetoJP' : 'M PLUS JP'}`;
}

function getCodeLigClass(choice: CodeFontChoice = state.codeFont, ligatures = state.codeLigatures): string {
  if (choice !== 'cascadia') return '';
  return ligatures ? 'fc-lig-on' : 'fc-lig-off';
}

async function registerLocalWoff2(
  family: string,
  relPath: string,
  unicodeRange?: string,
): Promise<FontFace> {
  const clean = relPath.replace(/^\/+/, '');
  const absUrl = new URL(`/${clean}`, window.location.origin).toString();
  const face = new FontFace(family, `url("${absUrl}") format("woff2")`, {
    display: 'swap',
    style: 'normal',
    weight: '100 900',
    ...(unicodeRange ? { unicodeRange } : {}),
  });
  document.fonts.add(face);
  return face.load();
}

async function loadSakuttoLocalFonts(): Promise<void> {
  const jobs: Array<Promise<FontFace>> = [
    registerLocalWoff2(
      'Sakutto-Lilita',
      'fonts/Lilita/Lilita-Regular-i7dPIFZ9Zz-WBtRtedDbYEF8RXi4EwQ.woff2',
      GOOGLE_FONTS_RANGES.LATIN,
    ),
    registerLocalWoff2(
      'Sakutto-Lilita',
      'fonts/Lilita/Lilita-Regular-i7dPIFZ9Zz-WBtRtedDbYE98RXi4EwSsbg.woff2',
      GOOGLE_FONTS_RANGES.LATIN_EXT,
    ),
    registerLocalWoff2(
      'Sakutto-Cascadia',
      'fonts/Cascadia/CascadiaCode-Regular.woff2',
    ),
    registerLocalWoff2(
      'Sakutto-ComicShanns',
      'fonts/ComicShanns/ComicShanns-Regular-279a7b317d12eb88de06167bd672b4b4.woff2',
      'U+20-7e,U+a1-a6,U+a8,U+ab-ac,U+af-b1,U+b4,U+b8,U+bb-bc,U+bf-cf,U+d1-d7,U+d9-de,U+e0-ef,U+f1-f7,U+f9-ff,U+131,U+152-153,U+2c6,U+2da,U+2dc,U+2013-2014,U+2018-201a,U+201c-201d,U+2020-2022,U+2026,U+2039-203a,U+2044,U+20ac,U+2191,U+2193,U+2212',
    ),
    registerLocalWoff2(
      'Sakutto-ComicShanns',
      'fonts/ComicShanns/ComicShanns-Regular-fcb0fc02dcbee4c9846b3e2508668039.woff2',
      'U+100-10f,U+112-125,U+128-130,U+134-137,U+139-13c,U+141-148,U+14c-151,U+154-161,U+164-165,U+168-17f,U+1bf,U+1f7,U+218-21b,U+237,U+1e80-1e85,U+1ef2-1ef3,U+a75b',
    ),
    registerLocalWoff2(
      'Sakutto-ComicShanns',
      'fonts/ComicShanns/ComicShanns-Regular-dc6a8806fa96795d7b3be5026f989a17.woff2',
      'U+2c7,U+2d8-2d9,U+2db,U+2dd,U+315,U+2190,U+2192,U+2200,U+2203-2204,U+2264-2265,U+f6c3',
    ),
    registerLocalWoff2(
      'Sakutto-ComicShanns',
      'fonts/ComicShanns/ComicShanns-Regular-6e066e8de2ac57ea9283adb9c24d7f0c.woff2',
      'U+3bb',
    ),
    registerLocalWoff2(
      'Sakutto-Excalifont',
      'fonts/Excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2',
      'U+20-7e,U+a0-a3,U+a5-a6,U+a8-ab,U+ad-b1,U+b4,U+b6-b8,U+ba-ff,U+131,U+152-153,U+2bc,U+2c6,U+2da,U+2dc,U+304,U+308,U+2013-2014,U+2018-201a,U+201c-201e,U+2020,U+2022,U+2024-2026,U+2030,U+2039-203a,U+20ac,U+2122,U+2212',
    ),
    registerLocalWoff2(
      'Sakutto-Excalifont',
      'fonts/Excalifont/Excalifont-Regular-be310b9bcd4f1a43f571c46df7809174.woff2',
      'U+100-130,U+132-137,U+139-149,U+14c-151,U+154-17e,U+192,U+1fc-1ff,U+218-21b,U+237,U+1e80-1e85,U+1ef2-1ef3,U+2113',
    ),
  ];

  for (const chunk of jpFontManifest.chunks) {
    const clean = chunk.file.replace(/^\/+/, '');
    const absUrl = new URL(`/${clean}`, window.location.origin).toString();
    const face = new FontFace('Sakutto-SetoJP', `url("${absUrl}") format("woff2")`, {
      display: 'swap',
      style: 'normal',
      weight: '100 900',
      unicodeRange: chunk.unicodeRange,
    });
    document.fonts.add(face);
  }

  await Promise.allSettled(jobs);
  state.localFontsLoaded = true;
  renderStatusPills();

  await document.fonts.ready;
  state.allFontsReady = true;
  renderStatusPills();
}

function renderStatusPills(): void {
  const el = document.getElementById('fc-status-pills');
  if (!el) return;
  el.innerHTML = `
    <span class="fc-status-pill ${state.localFontsLoaded ? 'is-ready' : ''}">
      ローカル同梱書体: ${state.localFontsLoaded ? '読込完了 (Excalifont+SetoJP / Lilita / Cascadia / Comic Shanns)' : '読込中...'}
    </span>
    <span class="fc-status-pill ${state.allFontsReady ? 'is-ready' : ''}">
      Google Fonts (2書体): ${state.allFontsReady ? '利用可能 (M PLUS Rounded 1c / Mochiy Pop P One)' : '読込中...'}
    </span>
  `;
}

function renderSampleBlock(
  fontFamilyCss: string,
  fontWeight: number,
  lineHeight: number,
  fontSizePx: number,
  text: string,
  extraClass = '',
): string {
  return `
    <div class="fc-sample-stage">
      <div class="fc-sample-box ${extraClass}" style="font-family:${escapeHtml(fontFamilyCss)};font-weight:${fontWeight};font-size:${fontSizePx}px;line-height:${lineHeight};">${escapeHtml(text)}</div>
      <div class="fc-baseline-strip">
        <span class="fc-baseline-row ${extraClass}" style="font-family:${escapeHtml(fontFamilyCss)};font-weight:${fontWeight};font-size:${fontSizePx}px;line-height:${lineHeight};">
          <i class="fc-baseline-rule" aria-hidden="true"></i>${escapeHtml(state.baselineStripText)}
        </span>
      </div>
    </div>
  `;
}

function renderUiMockSection(): string {
  const codeSubLabel =
    state.codeFont === 'cascadia'
      ? 'Cascadia + M PLUS JP'
      : `Comic Shanns + ${state.comicJpFallback === 'seto' ? 'SetoJP' : 'M PLUS JP'}`;
  const pickerButtons: Array<{
    axis: PickerAxis;
    glyph: string;
    title: string;
    sub: string;
    family: string;
    weight: number;
    extraClass: string;
  }> = [
    {
      axis: 'hand',
      glyph: 'あA',
      title: '手書き',
      sub: 'Excalifont + SetoJP',
      family: getHandFamily(),
      weight: 500,
      extraClass: '',
    },
    {
      axis: 'standard',
      glyph: 'あA',
      title: '標準',
      sub: `M PLUS Rounded w${state.standardWeight}`,
      family: getStandardFamily(),
      weight: state.standardWeight,
      extraClass: '',
    },
    {
      axis: 'pop',
      glyph: 'あA',
      title: 'ポップ',
      sub: state.popMode === 'hybrid' ? 'Lilita + Mochiy Pop' : 'Mochiy Pop 単体',
      family: getPopFamily(),
      weight: 400,
      extraClass: '',
    },
    {
      axis: 'code',
      glyph: '</>',
      title: 'コード',
      sub: codeSubLabel,
      family: getCodeFamily(),
      weight: state.standardWeight,
      extraClass: getCodeLigClass(),
    },
  ];

  const activePicker =
    pickerButtons.find((b) => b.axis === state.activePickerAxis) ?? pickerButtons[3];
  const liveText = state.activePickerAxis === 'code' ? state.codeSampleText : state.sampleText;
  const liveSize = FONT_SIZE_MAP[state.sizeKey];
  const liveLh =
    state.activePickerAxis === 'pop' && state.popMode === 'hybrid'
      ? 1.15
      : state.activePickerAxis === 'code'
        ? 1.35
        : 1.25;

  return `
    <section class="fc-panel ${state.uiMockCollapsed ? 'is-collapsed' : ''}" id="fc-ui-mock-panel">
      <div class="fc-panel-header">
        <h2 class="fc-panel-title">SakuttoDraw UI モック（プロパティ4択ピッカー × 環境設定「コード枠・合字」連動）</h2>
        <button type="button" class="fc-collapse-btn" data-action="toggle-ui-mock">
          ${state.uiMockCollapsed ? '展開する' : '折りたたむ'}
        </button>
      </div>
      <div class="fc-panel-body">
        <div class="fc-ui-mock-grid">
          <div class="fc-picker-showcase">
            <div class="fc-picker-label">
              <span>スタイルパネル「書体」4択イメージ（クリックで下のライブ確認を切替）</span>
              <span class="fc-badge fc-badge-code">選択中: ${escapeHtml(activePicker.title)}（${escapeHtml(activePicker.sub)}）</span>
            </div>
            <div class="fc-excalidraw-font-row" role="radiogroup" aria-label="書体4択モック">
              ${pickerButtons
                .map(
                  (b) => `
                  <button
                    type="button"
                    role="radio"
                    aria-checked="${state.activePickerAxis === b.axis}"
                    class="fc-excalidraw-font-btn ${state.activePickerAxis === b.axis ? 'is-active' : ''}"
                    data-picker-axis="${b.axis}"
                  >
                    <span class="fc-excalidraw-font-glyph ${b.extraClass}" style="font-family:${escapeHtml(b.family)};font-weight:${b.weight};">${escapeHtml(b.glyph)}</span>
                    <span class="fc-excalidraw-font-name">${b.title}</span>
                    <span class="fc-excalidraw-font-sub">${escapeHtml(b.sub)}</span>
                  </button>
                `,
                )
                .join('')}
            </div>

            <div class="fc-picker-live-box">
              <div class="fc-picker-label" style="margin-bottom:6px;">
                <span>選択中書体での即時描画プレビュー（${liveSize}px / lh ${liveLh}）</span>
                <span>${state.activePickerAxis === 'code' && state.codeFont === 'cascadia' ? (state.codeLigatures ? '合字 ON' : '合字 OFF') : ''}</span>
              </div>
              ${
                state.activePickerAxis === 'code'
                  ? `<pre class="fc-code-pre ${activePicker.extraClass}" style="font-family:${escapeHtml(activePicker.family)};font-weight:${activePicker.weight};font-size:${liveSize}px;line-height:${liveLh};">${escapeHtml(liveText)}</pre>`
                  : `<div class="fc-sample-box" style="font-family:${escapeHtml(activePicker.family)};font-weight:${activePicker.weight};font-size:${liveSize}px;line-height:${liveLh};">${escapeHtml(liveText)}</div>`
              }
            </div>
          </div>

          <aside class="exq-pref-mock-shell" aria-label="SakuttoDraw 環境設定モック">
            <div class="exq-pref-mock-titlebar">
              <span>環境設定 → フォント設定（UIモック）</span>
              <span class="fc-badge">設定連動</span>
            </div>

            <div class="exq-pref-group">
              <div class="exq-pref-group-title">
                <span>コード枠の書体</span>
                <span>&lt;/&gt; コード枠に反映</span>
              </div>
              <div class="exq-pref-card-grid" role="radiogroup" aria-label="コード枠の書体">
                <button
                  type="button"
                  role="radio"
                  aria-checked="${state.codeFont === 'cascadia'}"
                  class="exq-pref-card ${state.codeFont === 'cascadia' ? 'exq-active' : ''}"
                  data-code-font="cascadia"
                >
                  <span style="font-family:&quot;Sakutto-Cascadia&quot;,monospace;">Cascadia Code</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked="${state.codeFont === 'comic'}"
                  class="exq-pref-card ${state.codeFont === 'comic' ? 'exq-active' : ''}"
                  data-code-font="comic"
                >
                  <span style="font-family:&quot;Sakutto-ComicShanns&quot;,monospace;">Comic Shanns</span>
                </button>
              </div>
            </div>

            <div class="exq-pref-group">
              <div class="exq-pref-group-title">
                <span>コード合字 (=&gt; !== -&gt;)</span>
                <span>${state.codeFont === 'comic' ? 'Comic Shanns は合字なし' : 'Cascadia Code 有効'}</span>
              </div>
              <div class="exq-pref-card-grid" role="radiogroup" aria-label="コード合字">
                <button
                  type="button"
                  role="radio"
                  aria-checked="${state.codeLigatures}"
                  class="exq-pref-card ${state.codeLigatures ? 'exq-active' : ''}"
                  ${state.codeFont === 'comic' ? 'disabled' : ''}
                  data-ligatures="on"
                >
                  ON（合字あり）
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked="${!state.codeLigatures}"
                  class="exq-pref-card ${!state.codeLigatures ? 'exq-active' : ''}"
                  ${state.codeFont === 'comic' ? 'disabled' : ''}
                  data-ligatures="off"
                >
                  OFF（等幅そのまま）
                </button>
              </div>
            </div>

            <div class="exq-pref-group">
              <div class="exq-pref-group-title">
                <span>Comic Shanns の日本語補完</span>
                <span>${state.codeFont === 'comic' ? 'Comic Shanns 有効' : 'クリックで Comic Shanns に切替'}</span>
              </div>
              <div class="exq-pref-card-grid" role="radiogroup" aria-label="Comic Shanns 日本語補完">
                <button
                  type="button"
                  role="radio"
                  aria-checked="${state.codeFont === 'comic' && state.comicJpFallback === 'mplus'}"
                  class="exq-pref-card ${state.codeFont === 'comic' && state.comicJpFallback === 'mplus' ? 'exq-active' : ''}"
                  data-comic-fallback="mplus"
                >
                  <span>M PLUS Rounded 1c</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked="${state.codeFont === 'comic' && state.comicJpFallback === 'seto'}"
                  class="exq-pref-card ${state.codeFont === 'comic' && state.comicJpFallback === 'seto' ? 'exq-active' : ''}"
                  data-comic-fallback="seto"
                >
                  <span style="font-family:&quot;Sakutto-SetoJP&quot;,sans-serif;">SetoJP (手書き)</span>
                </button>
              </div>
            </div>

            <div class="exq-pref-group">
              <div class="exq-pref-group-title">
                <span>ポップ枠の英数字</span>
                <span>参考比較</span>
              </div>
              <div class="exq-pref-card-grid" role="radiogroup" aria-label="ポップ枠の英数字">
                <button
                  type="button"
                  role="radio"
                  aria-checked="${state.popMode === 'hybrid'}"
                  class="exq-pref-card ${state.popMode === 'hybrid' ? 'exq-active' : ''}"
                  data-pop-mode="hybrid"
                >
                  Lilita One 補完
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked="${state.popMode === 'replace'}"
                  class="exq-pref-card ${state.popMode === 'replace' ? 'exq-active' : ''}"
                  data-pop-mode="replace"
                >
                  Mochiy Pop 単体
                </button>
              </div>
            </div>

            <div class="exq-pref-tech-note">
              <strong>実装時の重要知見（Canvas 2D 合字制御）:</strong>
              ブラウザの <code>ctx.fillText()</code> は CSS の <code>font-variant-ligatures: none</code> を無視します。本実装で「合字 OFF」を Canvas / PNG / SVG で完全に効かせるには、<code>Cascadia Mono</code>（または <code>calt</code>/<code>liga</code> を除去した WOFF2 約40KB）へ FontFace ごと切り替える構成が確実です。
            </div>
          </aside>
        </div>
      </div>
    </section>
  `;
}

function renderPreviewSection(): string {
  const handFamily = getHandFamily();
  const stdFamily = getStandardFamily();
  const popFamily = getPopFamily();
  const popLh = state.popMode === 'hybrid' ? 1.15 : 1.25;
  const codeFamily = getCodeFamily();
  const codeLigCls = getCodeLigClass();
  const previewCodeSnippet = state.codeSampleText.split('\n').slice(0, 4).join('\n');

  return `
    <section class="fc-panel ${state.previewCollapsed ? 'is-collapsed' : ''}" id="fc-preview-panel">
      <div class="fc-panel-header">
        <h2 class="fc-panel-title">最終4軸スクショ注釈 同時プレビュー（設定変更がリアルタイム反映）</h2>
        <button type="button" class="fc-collapse-btn" data-action="toggle-preview">
          ${state.previewCollapsed ? '展開する' : '折りたたむ'}
        </button>
      </div>
      <div class="fc-panel-body">
        <div class="fc-scene-canvas">
          <svg class="fc-anno-svg" viewBox="0 0 1100 455" preserveAspectRatio="none" aria-hidden="true">
            <rect x="38" y="138" width="420" height="44" rx="6" fill="none" stroke="#e03131" stroke-width="3" stroke-dasharray="10 3" />
            <path d="M 790 60 Q 610 65 466 155" fill="none" stroke="#e03131" stroke-width="3" stroke-linecap="round" />
            <path d="M 480 144 L 464 156 L 483 159" fill="none" stroke="#e03131" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M 780 170 Q 600 225 160 248" fill="none" stroke="#1971c2" stroke-width="2.5" stroke-linecap="round" />
            <path d="M 173 240 L 158 248 L 174 255" fill="none" stroke="#1971c2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M 380 355 Q 410 310 350 292" fill="none" stroke="#0d9488" stroke-width="2.5" stroke-linecap="round" />
            <path d="M 366 290 L 348 291 L 358 304" fill="none" stroke="#0d9488" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>

          <div class="fc-mock-window">
            <div class="fc-mock-topbar">
              <div class="fc-mock-dots"><span></span><span></span><span></span></div>
              <span>Workspace Settings — API &amp; Sync (v2.4)</span>
              <span>user@example.com</span>
            </div>
            <div class="fc-mock-content">
              <div>
                <div class="fc-mock-field">
                  <div class="fc-mock-field-label">API Endpoint</div>
                  <div class="fc-mock-input">https://api.example.com/v2/annotate</div>
                </div>
                <div class="fc-mock-field">
                  <div class="fc-mock-field-label">Secret Token (sk-0O1lI-...)</div>
                  <div class="fc-mock-input">sk-0O1lI-94a1f00c-••••-88b2</div>
                </div>
                <div class="fc-mock-btn">Save Changes</div>
                <div class="fc-mock-toast">Warning: ERR_404 — Webhook URL is not verified yet.</div>
              </div>
              <div class="fc-mock-sidecard">
                <strong>Quick Tips</strong>
                <p style="margin:6px 0 0;opacity:0.8">
                  Toggle Auto-Sync to keep offline cache updated across tabs.
                </p>
              </div>
            </div>
          </div>

          <div class="fc-anno-text fc-anno-pop" style="font-family:${escapeHtml(popFamily)};font-weight:400;line-height:${popLh};">③ ここに入力! API Key</div>
          <div class="fc-anno-text fc-anno-standard" style="font-family:${escapeHtml(stdFamily)};font-weight:${state.standardWeight};line-height:1.25;">${escapeHtml(state.sampleText)}</div>
          <div class="fc-anno-text fc-anno-code ${codeLigCls}" style="font-family:${escapeHtml(codeFamily)};font-weight:${state.standardWeight};">${escapeHtml(previewCodeSnippet)}</div>
          <div class="fc-anno-text fc-anno-hand" style="font-family:${escapeHtml(handFamily)};font-weight:500;">① 手書きメモ (Excalifont + SetoJP)</div>
        </div>
      </div>
    </section>
  `;
}

function renderCodeComparisonSection(): string {
  const sizePx = FONT_SIZE_MAP[state.sizeKey];
  const variants: Array<{
    key: string;
    title: string;
    choice: CodeFontChoice;
    comicFallback: ComicJpFallback;
    ligatures: boolean;
    license: string;
    sizeBadge: string;
    note: string;
  }> = [
    {
      key: 'cascadia-on',
      title: 'Cascadia Code（合字 ON）+ M PLUS Rounded 1c',
      choice: 'cascadia',
      comicFallback: 'mplus',
      ligatures: true,
      license: 'SIL OFL 1.1',
      sizeBadge: '同梱済み 64KB + M PLUS JP',
      note: '=> !== === -> <= などが合字化され視認性が高い。開発者向け注釈のデフォルト候補。',
    },
    {
      key: 'cascadia-off',
      title: 'Cascadia Code（合字 OFF / Mono相当）+ M PLUS Rounded 1c',
      choice: 'cascadia',
      comicFallback: 'mplus',
      ligatures: false,
      license: 'SIL OFL 1.1',
      sizeBadge: 'Mono置換で約40KB + M PLUS JP',
      note: '合字を切ることで、コピペ・文字数確認・厳密な記号判別（= と == 等）を優先した表示。',
    },
    {
      key: 'comic-mplus',
      title: 'Comic Shanns + M PLUS Rounded 1c',
      choice: 'comic',
      comicFallback: 'mplus',
      ligatures: false,
      license: 'MIT + SIL OFL 1.1',
      sizeBadge: '同梱済み 31KB + M PLUS JP',
      note: '手書き感のある等幅に、すっきり読みやすい M PLUS Rounded 1c の日本語を組み合わせたバランス型。',
    },
    {
      key: 'comic-seto',
      title: 'Comic Shanns + SetoJP（手書き日本語補完）',
      choice: 'comic',
      comicFallback: 'seto',
      ligatures: false,
      license: 'MIT + SIL OFL 1.1',
      sizeBadge: '同梱済み 31KB + SetoJP (追加0KB)',
      note: '同じ手書き系同士で和欧の統一感が最も高く、すでに SetoJP が同梱済みのため追加フォント容量もゼロ。',
    },
  ];

  return `
    <section style="margin-bottom:24px;">
      <h2 style="margin:0 0 10px;font-size:16px;font-weight:700;">
        ④ コード枠 4パターン比較（Cascadia 合字ON/OFF・Comic Shanns + M PLUS / SetoJP）
      </h2>
      <div class="fc-code-compare-grid">
        ${variants
          .map((v) => {
            const isActive =
              state.codeFont === v.choice &&
              (v.choice === 'cascadia'
                ? state.codeLigatures === v.ligatures
                : state.comicJpFallback === v.comicFallback);
            const fam = getCodeFamily(v.choice, v.comicFallback);
            const ligCls = getCodeLigClass(v.choice, v.ligatures);
            return `
              <article class="fc-card ${isActive ? 'is-active-slot' : ''}">
                <div class="fc-card-head">
                  <div class="fc-card-title-group">
                    <h3 class="fc-card-name">${v.title}</h3>
                    <span class="fc-badge fc-badge-code">${v.sizeBadge}</span>
                    <span class="fc-badge">${v.license}</span>
                  </div>
                  <button
                    type="button"
                    class="fc-btn ${isActive ? 'is-selected' : ''}"
                    data-select-code-variant="${v.choice}:${v.choice === 'cascadia' ? (v.ligatures ? 'on' : 'off') : v.comicFallback}"
                  >
                    ${isActive ? '✓ 設定に適用中' : 'この設定にする'}
                  </button>
                </div>
                <div class="fc-card-note">${v.note}</div>
                <pre class="fc-code-pre ${ligCls}" style="font-family:${escapeHtml(fam)};font-weight:${state.standardWeight};font-size:${sizePx}px;line-height:1.35;">${escapeHtml(state.codeSampleText)}</pre>
                <div class="fc-glyph-strip ${ligCls}" style="font-family:${escapeHtml(fam)};font-weight:${state.standardWeight};">
                  0O o 1lI |[]{} () =&gt; !== === -&gt; &lt;= &gt;= // 日本語混在
                </div>
                ${renderSampleBlock(fam, state.standardWeight, 1.25, sizePx, state.sampleText, ligCls)}
              </article>
            `;
          })
          .join('')}
      </div>
    </section>
  `;
}

function renderFinal4AxisLineupSection(): string {
  const sizePx = FONT_SIZE_MAP[state.sizeKey];
  const ladderSizes: Array<{ key: FontSizeKey; px: number }> = [
    { key: 'S', px: 16 },
    { key: 'M', px: 20 },
    { key: 'L', px: 28 },
    { key: 'XL', px: 36 },
  ];

  const axes: Array<{
    title: string;
    badge: string;
    family: string;
    weight: number;
    lh: number;
    extraClass: string;
    text: string;
  }> = [
    {
      title: '① 手書き枠：Excalifont + SetoJP',
      badge: '現状維持 (SIL OFL 1.1)',
      family: getHandFamily(),
      weight: 500,
      lh: 1.25,
      extraClass: '',
      text: state.sampleText,
    },
    {
      title: `② 標準枠：M PLUS Rounded 1c 単体 (w${state.standardWeight})`,
      badge: '全置換・確定 (SIL OFL 1.1)',
      family: getStandardFamily(),
      weight: state.standardWeight,
      lh: 1.25,
      extraClass: '',
      text: state.sampleText,
    },
    {
      title: `③ ポップ枠：Mochiy Pop P One (${state.popMode === 'hybrid' ? 'Lilita補完' : '単体'})`,
      badge: '確定 (SIL OFL 1.1)',
      family: getPopFamily(),
      weight: 400,
      lh: state.popMode === 'hybrid' ? 1.15 : 1.25,
      extraClass: '',
      text: state.sampleText,
    },
    {
      title: `④ コード枠：${getCodeDisplayLabel()}`,
      badge: state.codeFont === 'cascadia' ? 'SIL OFL 1.1' : 'MIT + SIL OFL 1.1',
      family: getCodeFamily(),
      weight: state.standardWeight,
      lh: 1.35,
      extraClass: getCodeLigClass(),
      text: state.codeSampleText,
    },
  ];

  return `
    <section>
      <h2 style="margin:0 0 10px;font-size:16px;font-weight:700;">
        確定4軸のサイズ・ベースライン一覧（S:16 / M:20 / L:28 / XL:36）
      </h2>
      <div class="fc-lineup-grid">
        ${axes
          .map(
            (a) => `
            <article class="fc-card">
              <div class="fc-card-head">
                <div class="fc-card-title-group">
                  <h3 class="fc-card-name">${escapeHtml(a.title)}</h3>
                  <span class="fc-badge fc-badge-accent">${escapeHtml(a.badge)}</span>
                </div>
              </div>
              ${renderSampleBlock(a.family, a.weight, a.lh, sizePx, a.text, a.extraClass)}
              <div class="fc-ladder">
                ${ladderSizes
                  .map(
                    (s) => `
                    <div class="fc-ladder-item">
                      <span class="fc-ladder-tag">${s.key} (${s.px})</span>
                      <span class="${a.extraClass}" style="font-family:${escapeHtml(a.family)};font-weight:${a.weight};font-size:${s.px}px;line-height:${a.lh};">
                        sk_0O1lI =&gt; 変更保存
                      </span>
                    </div>
                  `,
                  )
                  .join('')}
              </div>
            </article>
          `,
          )
          .join('')}
      </div>
    </section>
  `;
}

function renderToolbar(): string {
  return `
    <div class="fc-toolbar ${state.editorsCollapsed ? 'is-editors-collapsed' : ''}">
      <div class="fc-toolbar-row">
        <div class="fc-control-group">
          <span class="fc-control-label">M PLUS Rounded 太さ:</span>
          <div class="fc-seg">
            ${([400, 500, 700] as const)
              .map(
                (w) => `
                  <button type="button" class="fc-seg-btn ${state.standardWeight === w ? 'is-active' : ''}" data-std-weight="${w}">
                    w${w}${w === 500 ? ' (推奨)' : ''}
                  </button>
                `,
              )
              .join('')}
          </div>
        </div>

        <div class="fc-control-group">
          <span class="fc-control-label">サイズ:</span>
          <div class="fc-seg">
            ${(['S', 'M', 'L', 'XL'] as const)
              .map(
                (k) => `
                  <button type="button" class="fc-seg-btn ${state.sizeKey === k ? 'is-active' : ''}" data-size="${k}">
                    ${k} (${FONT_SIZE_MAP[k]}px)
                  </button>
                `,
              )
              .join('')}
          </div>
        </div>

        <button type="button" class="fc-toggle-btn ${state.showGuides ? 'is-active' : ''}" data-action="toggle-guides">
          ガイド: ${state.showGuides ? 'ON' : 'OFF'}
        </button>

        <button type="button" class="fc-toggle-btn ${state.theme === 'dark' ? 'is-active' : ''}" data-action="toggle-theme">
          ${state.theme === 'dark' ? 'Dark' : 'Light'}
        </button>

        <button type="button" class="fc-toggle-btn" data-action="toggle-editors">
          テキスト編集欄: ${state.editorsCollapsed ? '開く' : '閉じる'}
        </button>
      </div>

      <div class="fc-editors-grid">
        <div class="fc-editor-box">
          <div class="fc-editor-head">
            <span class="fc-control-label">標準・ポップ用テキスト（複数行可）</span>
            <div class="fc-editor-presets">
              ${SAMPLE_PRESETS.map(
                (p, i) => `
                  <button type="button" class="fc-preset-btn" data-preset-idx="${i}">
                    ${escapeHtml(p.label)}
                  </button>
                `,
              ).join('')}
            </div>
          </div>
          <textarea
            class="fc-sample-textarea"
            id="fc-sample-input"
            rows="3"
            aria-label="標準・ポップ比較サンプルテキスト"
            placeholder="改行を含めて任意のテキストを入力..."
          >${escapeHtml(state.sampleText)}</textarea>
        </div>

        <div class="fc-editor-box">
          <div class="fc-editor-head">
            <span class="fc-control-label">コード枠用テキスト（複数行・日本語コメント可）</span>
            <div class="fc-editor-presets">
              ${CODE_PRESETS.map(
                (p, i) => `
                  <button type="button" class="fc-preset-btn" data-code-preset-idx="${i}">
                    ${escapeHtml(p.label)}
                  </button>
                `,
              ).join('')}
            </div>
          </div>
          <textarea
            class="fc-code-textarea"
            id="fc-code-input"
            rows="4"
            aria-label="複数行コード比較サンプルテキスト"
            placeholder="複数行コードや日本語コメントを入力..."
          >${escapeHtml(state.codeSampleText)}</textarea>
        </div>
      </div>
    </div>
  `;
}

function renderDynamicBody(): void {
  const bodyEl = document.getElementById('fc-dynamic-body');
  if (!bodyEl) return;
  bodyEl.innerHTML = `
    ${renderUiMockSection()}
    ${renderPreviewSection()}
    ${renderCodeComparisonSection()}
    ${renderFinal4AxisLineupSection()}
  `;
}

function renderApp(): void {
  document.documentElement.setAttribute('data-theme', state.theme);
  const root = document.getElementById('app');
  if (!root) return;

  root.innerHTML = `
    <div class="fc-page ${state.showGuides ? 'show-guides' : ''}">
      <header class="fc-header">
        <div class="fc-title-wrap">
          <h1>
            SakuttoDraw 最終4軸フォント＆環境設定モック
            <span class="fc-dev-tag">DEV ONLY</span>
          </h1>
          <p class="fc-subtitle">
            ①手書き (Excalifont+SetoJP) / ②標準 (M PLUS Rounded 1c) / ③ポップ (Mochiy Pop P One) / ④コード (Cascadia Code ⇄ Comic Shanns + 合字切替)
          </p>
        </div>
        <div class="fc-status-pills" id="fc-status-pills"></div>
      </header>
      <div id="fc-toolbar-host">${renderToolbar()}</div>
      <div id="fc-dynamic-body"></div>
    </div>
  `;

  renderStatusPills();
  renderDynamicBody();
}

function syncToolbarDom(): void {
  const host = document.getElementById('fc-toolbar-host');
  if (host) {
    host.innerHTML = renderToolbar();
  }
}

function syncPageClasses(): void {
  document.documentElement.setAttribute('data-theme', state.theme);
  const page = document.querySelector('.fc-page');
  if (page) {
    page.classList.toggle('show-guides', state.showGuides);
  }
}

function attachEvents(): void {
  const root = document.getElementById('app');
  if (!root) return;

  root.addEventListener('input', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    if (target.id === 'fc-sample-input') {
      state.sampleText = target.value;
      renderDynamicBody();
    } else if (target.id === 'fc-code-input') {
      state.codeSampleText = target.value;
      renderDynamicBody();
    }
  });

  root.addEventListener('click', (e) => {
    const el = (e.target instanceof Element ? e.target : null)?.closest<HTMLElement>(
      '[data-std-weight],[data-size],[data-action],[data-preset-idx],[data-code-preset-idx],[data-picker-axis],[data-code-font],[data-comic-fallback],[data-ligatures],[data-pop-mode],[data-select-code-variant]',
    );
    if (!el) return;

    if (el.dataset.stdWeight) {
      state.standardWeight = Number(el.dataset.stdWeight) as 400 | 500 | 700;
      syncToolbarDom();
      renderDynamicBody();
      return;
    }
    if (el.dataset.size) {
      state.sizeKey = el.dataset.size as FontSizeKey;
      syncToolbarDom();
      renderDynamicBody();
      return;
    }
    if (el.dataset.presetIdx !== undefined) {
      const preset = SAMPLE_PRESETS[Number(el.dataset.presetIdx)];
      if (preset) {
        state.sampleText = preset.text;
        const textarea = document.getElementById('fc-sample-input') as HTMLTextAreaElement | null;
        if (textarea) textarea.value = preset.text;
        renderDynamicBody();
      }
      return;
    }
    if (el.dataset.codePresetIdx !== undefined) {
      const preset = CODE_PRESETS[Number(el.dataset.codePresetIdx)];
      if (preset) {
        state.codeSampleText = preset.text;
        const textarea = document.getElementById('fc-code-input') as HTMLTextAreaElement | null;
        if (textarea) textarea.value = preset.text;
        renderDynamicBody();
      }
      return;
    }
    if (el.dataset.pickerAxis) {
      state.activePickerAxis = el.dataset.pickerAxis as PickerAxis;
      renderDynamicBody();
      return;
    }
    if (el.dataset.codeFont) {
      state.codeFont = el.dataset.codeFont as CodeFontChoice;
      renderDynamicBody();
      return;
    }
    if (el.dataset.comicFallback) {
      state.codeFont = 'comic';
      state.comicJpFallback = el.dataset.comicFallback as ComicJpFallback;
      renderDynamicBody();
      return;
    }
    if (el.dataset.ligatures) {
      state.codeLigatures = el.dataset.ligatures === 'on';
      renderDynamicBody();
      return;
    }
    if (el.dataset.popMode) {
      state.popMode = el.dataset.popMode as PopMode;
      renderDynamicBody();
      return;
    }
    if (el.dataset.selectCodeVariant) {
      const [choice, detail] = el.dataset.selectCodeVariant.split(':');
      state.codeFont = choice as CodeFontChoice;
      if (choice === 'cascadia') {
        state.codeLigatures = detail === 'on';
      } else if (detail === 'mplus' || detail === 'seto') {
        state.comicJpFallback = detail;
      }
      renderDynamicBody();
      return;
    }

    switch (el.dataset.action) {
      case 'toggle-guides':
        state.showGuides = !state.showGuides;
        syncPageClasses();
        syncToolbarDom();
        break;
      case 'toggle-theme':
        state.theme = state.theme === 'light' ? 'dark' : 'light';
        syncPageClasses();
        syncToolbarDom();
        break;
      case 'toggle-editors':
        state.editorsCollapsed = !state.editorsCollapsed;
        syncToolbarDom();
        break;
      case 'toggle-ui-mock':
        state.uiMockCollapsed = !state.uiMockCollapsed;
        renderDynamicBody();
        break;
      case 'toggle-preview':
        state.previewCollapsed = !state.previewCollapsed;
        renderDynamicBody();
        break;
    }
  });
}

renderApp();
attachEvents();
void loadSakuttoLocalFonts();
