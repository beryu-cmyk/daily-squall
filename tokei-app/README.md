# とけいを よもう

特別支援学校小学部向けの、アナログ時計学習Webアプリです。
**アプリ本体は `index.html` の1ファイルだけ**です（HTML・CSS・JavaScriptを1ファイルにまとめ、外部CDN・外部通信なし）。

- GitHub Pages では `https://<ユーザー名>.github.io/daily-squall/tokei-app/` で開けます。
- 設定・結果・画像は、その端末のそのブラウザの中だけに保存されます（別端末・別ブラウザには引き継がれません。ブラウザのWebサイトデータを消すと消えます）。
- 教師画面へは、開始画面右下の「せんせい」→ 掛け算1問 で入ります（誤操作防止の簡易入口で、認証ではありません）。

## テスト（開発用・アプリの動作には不要）

```sh
cd tokei-app
npm test   # Node 18+ と Playwright（Chromium）が必要
```

- `tests/core.test.js`：`index.html` の `<script id="tokei-core">` を取り出して、問題生成・針の角度・12時の境界・短針ドラッグの時台判定などを確認します。
- `tests/ui.test.js`：Chromium で iPad 相当の画面サイズ・タッチ操作をエミュレーションして確認します。**iPad Safari 実機での確認の代わりにはなりません。**
