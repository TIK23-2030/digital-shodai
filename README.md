# デジタル唱題帳 v1.0

Tokyo Ikeda Kayokai向けの、スマートフォン対応デジタル唱題帳です。

## 主な機能

- 唱題タイマー
- 時間・分・秒の手動入力
- 今日の唱題時間の編集
- 毎日の目標設定
- 月間目標設定
- 目標達成日のカレンダーチェック
- 日付ごとのメモ
- 「今祈っていること」の記録
- 7日間グラフ
- バックアップと復元
- 昼・夕方・夜の自動テーマ
- PWA対応
- オフライン表示

## ファイル構成

```text
digital-daimoku-v1.0/
├── index.html
├── privacy.html
├── manifest.webmanifest
├── service-worker.js
├── README.md
├── LICENSE
└── assets/
    ├── css/
    │   └── style.css
    ├── js/
    │   └── app.js
    └── icons/
        └── icon.svg
```

## GitHub Pagesで公開する方法

1. GitHubで新しいPublicリポジトリを作成します。
2. このフォルダ内のファイルをすべてアップロードします。
3. GitHubの `Settings` → `Pages` を開きます。
4. `Source` を `Deploy from a branch` にします。
5. Branchを `main`、Folderを `/(root)` にします。
6. `Save` を押します。
7. 数分後、以下の形式で公開されます。

```text
https://ユーザー名.github.io/リポジトリ名/
```

## 更新方法

ファイルを編集後、GitHubへ上書きアップロードしてください。

Service Workerのキャッシュを更新したい場合は、`service-worker.js` 内の以下の値を変更します。

```js
const CACHE_NAME = "digital-daimoku-v1.0.0";
```

例：

```js
const CACHE_NAME = "digital-daimoku-v1.0.1";
```

## データ保存について

入力したデータは、利用者のブラウザ内の `localStorage` に保存されます。

- 別端末には自動で引き継がれません
- ブラウザの保存データを削除すると消える場合があります
- 設定画面からバックアップできます
- 運営者へ内容は送信されません

## 推奨ブラウザ

- iPhone Safari
- Android Chrome
- PC版 Chrome / Edge / Safari

## バージョン

v1.0.0
