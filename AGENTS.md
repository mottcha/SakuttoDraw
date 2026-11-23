# AGENTS.md

SakuttoDraw を保守・改修する際の設計方針と不変条件（Invariants）です。

## 1. 構成と責務

- `src/App.tsx`: `<Excalidraw />` のマウント、初回1回のみの `bootstrapCleanCanvas()`、`langCode` / `themeMode`（`light | dark | system`）管理、`onChange` のデバウンス保存委譲。
- `src/components/SakuttoMainMenu.tsx`: 公式 `<MainMenu>` の構成（ファイル操作・`Preferences` サブメニュー・3択 `ToggleTheme`・言語セレクター）。`Preferences` の `additionalItems` としてオフライン用 CJK フォント管理 UI を配置する。
- `src/annotator/quickAnnotator.ts`: ツールバー・左メニュー書き出し領域・その他メニュー・右上2ボタン・右クリックメニューへの最小限の DOM 注入とイベントガード。**標準 `.App-toolbar` を自前 React ツールバーへ全面置換しないこと**（Excalidraw 内部の `data-viewport-ui` 余白計測・`preferredSelectionTool` の挙動を維持するため）。
- `src/annotator/apiActions.ts`: クリア・背景色変更・コピー/画像保存・ファイル開閉を `ExcalidrawImperativeAPI` と公式エクスポート関数へ直結する層。
- `src/services/storageBridge.ts`: `localStorage`（`excalidraw`, `excalidraw-state`, `exq-annotator-prefs`）と `IndexedDB`（`files-db` / `files-store`）の永続化およびデバウンス保存管理。
- `src/annotator/cjkFontManager.ts`: `Cache Storage`（`sakuttodraw-cjk-fonts`）に対する日本語・韓国語・中国語セットの手動ダウンロード・全件照合・共通チャンク保護付き削除。
- `src/styles/sakutto.css`: 標準 UI の非表示、ツールバーの `order` 並べ替え、自前ウィジェットのスタイル。
- `src/i18n/messages.ts`: 5 ロケール（`en`, `ja-JP`, `zh-CN`, `zh-TW`, `ko-KR`）の UI 文言辞書とブラウザ言語自動判定。

## 2. 依存固定

- `@excalidraw/excalidraw` は `0.18.0-2c3dcc0` に厳密固定する（`^`/`~` なし）。別バージョンへ移行する際は DOM セレクタ（`data-testid`）、`Fonts.registered`、`AppTextTool` の挙動、`scripts/sync-excalidraw-assets.mjs` を再検証する。
- `package.json` の `"overrides": { "nanoid@3.3.3": "^3.3.20" }` はピンポイント指定を維持する（グローバル指定にすると `@excalidraw/mermaid-to-excalidraw` の `nanoid@4` 依存と競合する）。

## 3. CSP と外部通信ゼロ

- `index.html` の CSP は `script-src 'self'`（`'unsafe-eval'` / `'wasm-unsafe-eval'` 不可）、`connect-src 'self' blob: data:`、`font-src 'self' data:`、`frame-src 'none'` / `child-src 'none'` / `object-src 'none'` を維持し、インライン `<script>` を置かない。
- `src/main.tsx` は `import './initAssetPath'` の後に `await import('./App')` を動的インポートする順序を維持する（静的 `import` にすると `EXCALIDRAW_ASSET_PATH` 設定前に `@excalidraw/excalidraw` が評価される）。
- `vite.config.ts` の `stripExcalidrawCdn`（`https://esm.sh/...` フォールバック URL 除去）は本番 Rollup `transform` と開発 `optimizeDeps.esbuildOptions.plugins` の両方で適用し続ける。

## 4. WASM 不使用の SVG フォント埋め込み

- 内蔵 WOFF2 WASM サブセッターは `new Function()` を呼ぶため厳格 CSP 下で `EvalError` になる。
- `runInstantExportWithApi` の SVG 書き出しでは必ず `skipInliningFonts: true` を指定し、`inlinePreSplitFontsIntoSvg` で `Fonts.registered` から使用文字の `unicode-range` に一致する事前分割済み `.woff2` チャンクのみを Base64 化して `<defs><style class="style-fonts">` へ挿入する。

## 5. 再発防止ルール

1. **`installTextAutoResizeGuard()`（`src/annotator/quickAnnotator.ts`）**: `pointerdown` 直後にツールロック OFF 時は `activeTool.type` が `'selection'` へ戻るため、`onPointerMove` / `onPointerUp` で `isTextToolActive()` を再チェックしないこと（`downPos` と `pointerId` のみで判定する）。
2. **デバウンス保存の競合防止（`src/services/storageBridge.ts`）**: キャンバスを破壊的に書き換える処理（`runInstantResetWithApi`, `runDirectFileLoadWithApi` 等）の先頭で必ず `cancelPendingScenePersist()` を呼ぶ。
3. **`bootstrapCleanCanvas()` の単一実行（`src/App.tsx`）**: `App.tsx` の初回初期化で 1 回のみ実行し、`bootQuickAnnotator()` 内で再実行しない。
4. **`scripts/sync-excalidraw-assets.mjs`**: 縮小済み変数名に依存しない解析を維持し、`ja` / `ko` / `zh` のいずれかが 0 件なら例外で停止する。

## 6. PWA・フォントキャッシュ・多言語

- `vite.config.ts` の `base: './'` およびマニフェストの `start_url: './'`, `scope: './'`、`lang: 'en'`、PNG アイコンを維持し、サブパス（`/SakuttoDraw/`）でも同一ビルドで動作させる。
- `fonts/Xiaolai/**` はプリキャッシュせず、`runtimeCaching`（`CacheFirst`, `sakuttodraw-cjk-fonts`）＋環境設定内の手動 DL / 削除とする。`manifestTransforms` で未使用チャンク（`CodeMirrorEditor-*`, `subset-shared*`, `subset-worker*`、5 ロケール以外の翻訳）を除外する。
- `deleteLanguageFontSet` では `computeExclusiveFilesForDeletion` で他言語セットとの共有チャンクを保護し、`isLanguageSetCached` は `cache.keys()` で全チャンクを照合する。
- UI 文言の追加・変更時は 5 ロケール（`en`, `ja-JP`, `zh-CN`, `zh-TW`, `ko-KR`）すべてを更新する。

## 7. 変更後の必須検証

1. `npm run test` が全件パスすること。
2. `npm run build`（`tsc --noEmit` + Vite + `dist/sw.js` 生成）がエラー 0 件で完了すること。
3. `dist/` に `esm.sh`・`.map`・ローカル絶対パスが含まれないこと。
4. UI・CSP・エクスポート変更時は `/SakuttoDraw/` サブパス配信で実測し、外部リクエスト 0 件・CSP 違反 0 件・コンソールエラー 0 件・404 エラー 0 件を確認すること。
