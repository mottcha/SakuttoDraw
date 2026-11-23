<p align="center">
  <img src="public/pwa-192x192.png" alt="SakuttoDraw" width="84" height="84" />
</p>

<h1 align="center">SakuttoDraw</h1>

<p align="center">
  Excalidraw をベースに、スクリーンショットへの素早い注釈付けと画像書き出しに用途を絞ったローカル完結の Web アプリ（PWA）です。<br />
  リアルタイム共同編集やクラウド共有機能を持たず、描画・画像書き出しをすべてブラウザ内で完結させます。
</p>

<p align="center">
  <a href="https://mottcha.github.io/SakuttoDraw/">
    <img src="docs/images/launch-button.svg" alt="Open SakuttoDraw" width="216" height="42" />
  </a>
</p>

---

<p align="center">
  <img src="docs/images/screenshot.png" alt="SakuttoDraw" width="860" />
</p>

---

## 主な機能

- **注釈向けの UI 構成**  
  上部ツールバーをよく使う描画ツール中心に整理し、右上に「クリップボードへコピー」「画像として保存」の 2 ボタンを配置しています。PNG / SVG の切り替えやスケール・背景有無などの書き出し設定は左メニューから直接変更できます。
- **外部通信を行わないローカル動作**  
  フォントを含む全アセットをセルフホストし、`Content-Security-Policy` で外部オリジンへの通信を遮断しています。
- **クイック設定（「その他」メニュー内）**  
  起動時の自動リセット、既定の線色（ピンク）、テキスト入力時の自動リサイズ維持、ファイル開閉時の確認スキップ、キャンバス背景色を切り替えられます。
- **PWA 対応とオフライン用フォント管理**  
  アプリとしてインストールしてオフラインで利用できます。手書き CJK フォント（Xiaolai）は通常時オンデマンドで読み込み、左メニューの「環境設定」から日本語・韓国語・中国語セットを個別にオフライン保存・削除できます。
- **多言語 UI**  
  English / 日本語 / 简体中文 / 繁體中文 / 한국어 に対応しており、左メニュー下部の言語セレクターから切り替えられます。

---

## 開発・ビルド

```bash
npm install
npm run dev      # 開発サーバー起動
npm run test     # テスト実行
npm run build    # 本番ビルド (dist/)
```

`main` ブランチへのプッシュで `.github/workflows/deploy.yml` により GitHub Pages へデプロイされます。

---

## ライセンス・クレジット

- 本リポジトリのソースコードは [MIT License](LICENSE) のもとで公開されています。
- 描画エンジンとして [@excalidraw/excalidraw](https://github.com/excalidraw/excalidraw)（MIT License）を使用しており、その他のバンドル済み OSS ライブラリおよび同梱フォントの著作権表示・ライセンス全文は [THIRD-PARTY-NOTICES.txt](public/THIRD-PARTY-NOTICES.txt) に記載しています。
