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

- **素早い注釈と書き出し**: よく使う描画ツールと「黒塗り」ツールを備え、PNG / SVG でのコピーや画像保存をすぐに行えます。
- **外部通信ゼロのローカル動作**: フォントを含む全アセットをセルフホストし、CSP で外部オリジンへの通信を遮断しています。
- **作業効率を高めるカスタム設定**: 起動時リセット、デフォルトのペン色・背景色、モダンな右クリックメニューなどを切り替えられます。
- **日本語対応の 5 フォントと PWA**: 手書き・標準・ポップ・コードなど 5 系統のフォントに対応し、オフライン保存と PWA インストールが可能です。
- **レスポンシブ・多言語 UI**: モバイルや狭い画面でもコンパクトに表示でき、日本語・英語・中国語（簡体 / 繁体）・韓国語に対応しています。

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
