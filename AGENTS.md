# AGENTS.md

SakuttoDraw を保守・改修する際の設計方針と不変条件（Invariants）です。

## 1. 構成と責務（一方向依存・直接インポート規約）

**互換バレルによる再エクスポートは禁止し、各モジュールは必要なシンボルを所有元から直接 import する。**

- `src/utils/`: 純粋ユーティリティ層。
  - `common.ts`: `silently` / `normalizeHexColor` / `nextElementNonce` / `makeElementId` / `isMacPlatform`。
  - `unicodeRange.ts`: CSS `unicode-range` の区間解析・一致判定・集合変換・差集合・シリアライズの単一ソース。
- `src/ui/iconDefs.ts`: 命令的 DOM 注入（`dom.ts`）と React（`components/Icon.tsx`）が共有する SVG アイコン定義の単一ソース。
- `src/excalidraw/`: `@excalidraw/excalidraw` 上流依存の隔離アダプタ層。
  - `domContract.ts`: 上流 DOM セレクタ（`EXCALIDRAW_SELECTORS`）・`data-testid`（`EXCALIDRAW_TESTIDS`）・ツール種別マップ（`TESTID_TO_TOOL_TYPE`）・コンテキストメニュー非表示対象（`CTX_HIDDEN_TESTIDS`）。
  - `fontsAdapter.ts`: `Fonts.registered` / `Fonts.loadedFontsCache` アクセス・`Xiaolai` 解決の隔離。
- `src/services/`:
  - `filesDb.ts`: `IndexedDB`（`files-db` / `files-store`）のトランザクション統一ラッパー（`onabort`/`onerror`/`oncomplete` すべてで確実に `db.close()`）。
  - `storageBridge.ts`: `localStorage`（`excalidraw`, `excalidraw-state`, `exq-annotator-prefs`）の永続化、`patchSavedAppState`、フォームファクタ／UI モード判定、デバウンス保存管理。
- `src/annotator/`:
  - `elementOps.ts`: 固定点選択展開（`expandSelectedElementIds`）・エクスポート対象抽出・API 経由の削除/複製。
  - `svgFontInliner.ts`: WASM 不使用の SVG 事前分割フォント埋め込み（`inlinePreSplitFontsIntoSvg`）。
  - `apiActions.ts`: クリア・背景色/ペン色変更・コピー/画像保存・ファイル開閉の `ExcalidrawImperativeAPI` 直結層。
  - `cjkFontManager.ts`: `Cache Storage`（`sakuttodraw-cjk-fonts`）に対する日本語・韓国語・中国語セットの手動ダウンロード・全件照合・共通チャンク保護付き削除。
  - `jpGlyphOverride.ts`: `Xiaolai`（ID 100）に対する `unicode-range` 厳密差集合による日本語手書き字形（`fonts/SetoJP/`、KosefontP-JP / SetoFont v6.20 由来・SIL OFL 1.1）へのランタイム差し替え・復元。日本語 UI（`ja-JP`）ではデフォルト ON、他言語ではデフォルト OFF。
  - `redactProcessor.ts`: 黒塗り矩形の作成・色更新・スタイル隔離。
  - `quickAnnotator/`: ツールバー・左メニュー書き出し領域・その他メニュー・右上 2 ボタン・右クリックメニューへの最小限の DOM 注入とイベントガード。**標準 `.App-toolbar` を自前 React ツールバーへ全面置換しないこと**（Excalidraw 内部の `data-viewport-ui` 余白計測・`preferredSelectionTool` の挙動を維持するため）。
    - `constants.ts` / `dom.ts` / `runtime.ts` / `actions.ts`: 静的定義、DOM/共通アコーディオン・スイッチビルダー、共有状態 `runtime` と `scheduleSync()`、およびロック付き共通ユーザーアクション。
    - `toolbar.ts` / `mainMenu.ts` / `extraToolsMenu.ts` / `contextMenu.ts` / `topRightBar.ts` / `fillSwap.ts` / `redactDrag.ts` / `guards.ts`: 機能モジュール。**依存は「機能モジュール → `actions` / `runtime` / `dom` / `constants`」の一方向 DAG を厳守し、機能モジュールから `index.ts` や兄弟機能モジュールを import しないこと**（再同期は `runtime.ts` の `scheduleSync()` を使用）。
    - `index.ts`: `syncUI` / `bootQuickAnnotator` のみを公開する起動・同期エントリ（re-export 禁止）。
- `src/components/`: `Icon.tsx`・`cjkFontStore.ts`・`useOutsideDismiss.ts` を基盤に、`PreferencesPanel.tsx`・`CustomSettingsPanel.tsx`・`SakuttoMainMenu.tsx`・`SakuttoRedactPanel.tsx` で React UI を構成。
- `src/App.tsx`: `<Excalidraw />` のマウント、初回 1 回のみの `bootstrapCleanCanvas()`、`langCode` / `themeMode`（`light | dark | system`）管理、`onChange` のデバウンス保存委譲。
- `src/styles/`: `sakutto.css` を `@import` エントリとし、`base.css`・`excalidraw-overrides.css`・`toolbar.css`・`menus.css`・`context-menu.css`・`mobile.css`・`redact-and-fill.css` の 7 パーシャルに分割。
- `src/i18n/messages.ts`: 5 ロケール（`en`, `ja-JP`, `zh-CN`, `zh-TW`, `ko-KR`）の UI 文言辞書とブラウザ言語自動判定。

## 2. 依存固定

- `@excalidraw/excalidraw` は `0.18.0-dabd83c` に厳密固定する（`^`/`~` なし）。別バージョンへ移行する際は `src/excalidraw/`（`domContract.ts`, `fontsAdapter.ts`）、`src/styles/excalidraw-overrides.css`、`scripts/sync-excalidraw-assets.mjs` を起点に再検証する。
- `package.json` の `"overrides": { "nanoid@3.3.3": "^3.3.20" }` はピンポイント指定を維持する（グローバル指定にすると `@excalidraw/mermaid-to-excalidraw` の `nanoid@4` 依存と競合する）。

## 3. CSP と外部通信ゼロ

- `index.html` の CSP は `script-src 'self'`（`'unsafe-eval'` / `'wasm-unsafe-eval'` 不可）、`connect-src 'self' blob: data:`、`font-src 'self' data:`、`frame-src 'none'` / `child-src 'none'` / `object-src 'none'` を維持し、インライン `<script>` を置かない。
- `src/main.tsx` は `import './initAssetPath'` の後に `await import('./App')` を動的インポートする順序を維持する（静的 `import` にすると `EXCALIDRAW_ASSET_PATH` 設定前に `@excalidraw/excalidraw` が評価される）。
- `vite.config.ts` の `stripExcalidrawCdn`（`https://esm.sh/...` フォールバック URL 除去）は本番 Rollup `transform` と開発 `optimizeDeps.esbuildOptions.plugins` の両方で適用し続ける。

## 4. WASM 不使用の SVG フォント埋め込み

- 内蔵 WOFF2 WASM サブセッターは `new Function()` を呼ぶため厳格 CSP 下で `EvalError` になる。
- `runInstantExportWithApi` の SVG 書き出しでは必ず `skipInliningFonts: true` を指定し、`inlinePreSplitFontsIntoSvg` で `Fonts.registered` から使用文字の `unicode-range` に一致する事前分割済み `.woff2` チャンクのみを Base64 化して `<defs><style class="style-fonts">` へ挿入する。

## 5. 再発防止ルール

1. **`installTextAutoResizeGuard()`（`src/annotator/quickAnnotator/guards.ts`）**: `pointerdown` 直後にツールロック OFF 時は `activeTool.type` が `'selection'` へ戻るため、`onPointerMove` / `onPointerUp` で `isTextToolActive()` を再チェックしないこと（`downPos` と `pointerId` のみで判定する）。
2. **デバウンス保存の競合防止（`src/services/storageBridge.ts`）**: キャンバスを破壊的に書き換える処理（`runInstantResetWithApi`, `runDirectFileLoadWithApi` 等）の先頭で必ず `cancelPendingScenePersist()` を呼ぶ。
3. **`bootstrapCleanCanvas()` の単一実行（`src/App.tsx`）**: `App.tsx` の初回初期化で 1 回のみ実行し、`bootQuickAnnotator()` 内で再実行しない。
4. **`scripts/sync-excalidraw-assets.mjs`**: 縮小済み変数名に依存しない解析を維持し、`ja` / `ko` / `zh` のいずれかが 0 件なら例外で停止する。
5. **日本語字形差し替えの重複防止（`src/annotator/jpGlyphOverride.ts`）**: `Fonts.registered` の `Xiaolai` エントリに `SetoJP` チャンクを追加する際は、必ず既存 `Xiaolai` チャンクの `unicode-range` から `SetoJP` 担当コードポイントを差集合で除外し、二重フェッチおよび SVG 重複埋め込みを防ぐこと。
6. **契約テスト（`src/__tests__/upstreamContract.test.ts`）**: `CTX_HIDDEN_TESTIDS` と `excalidraw-overrides.css` の 1 対 1 一致、`quickAnnotator/` 内の一方向 DAG、およびバレル re-export ゼロを維持すること。

## 6. PWA・フォントキャッシュ・多言語

- `vite.config.ts` の `base: './'` およびマニフェストの `start_url: './'`, `scope: './'`、`lang: 'en'`、PNG アイコンを維持し、サブパス（`/SakuttoDraw/`）でも同一ビルドで動作させる。
- `fonts/Xiaolai/**`・`fonts/SetoJP/**`・`fonts/BizUdpGothic/**`・`fonts/MochiyPop/**`・`fonts/SakuttoCode/**` はプリキャッシュせず、`runtimeCaching`（`CacheFirst`, `sakuttodraw-cjk-fonts`）＋環境設定内の手動 DL / 削除とする。`manifestTransforms` で未使用チャンク（`CodeMirrorEditor-*`, `subset-shared*`, `subset-worker*`、5 ロケール以外の翻訳）を除外する。
- `deleteLanguageFontSet` では `computeExclusiveFilesForDeletion` で他言語セットとの共有チャンクを保護し、`isLanguageSetCached` は `cache.keys()` で全チャンクを照合する。
- UI 文言の追加・変更時は 5 ロケール（`en`, `ja-JP`, `zh-CN`, `zh-TW`, `ko-KR`）すべてを更新する。

## 7. 変更後の必須検証

1. `npm run test` が全件パスすること。
2. `npm run build`（`tsc --noEmit` + Vite + `dist/sw.js` 生成）がエラー 0 件で完了すること。
3. `dist/` に `esm.sh`・`.map`・ローカル絶対パスが含まれないこと。
4. UI・CSP・エクスポート変更時は `/SakuttoDraw/` サブパス配信で実測し、外部リクエスト 0 件・CSP 違反 0 件・コンソールエラー 0 件・404 エラー 0 件を確認すること。
