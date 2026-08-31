# FlexExplorer

Windows向けのカスタムファイルエクスプローラー。分割パネル・インスペクターのインラインプレビュー・コマンドパレットなど、軽量かつモダンな操作感を目指したデスクトップアプリ。

## ダウンロード

**[最新版をダウンロード](https://github.com/hiroudev/flexexplorer/releases/latest)**（`.exe` インストーラー）

## 特徴

- 分割パネル表示、複数タブ・ワークスペース管理(ペイン幅はドラッグで調整可能)
- サイドパネルでのファイルプレビュー(インスペクター)
- コマンドパレット・GoToオーバーレイによるキーボード操作、Alt+←/→で戻る/進む、Ctrl+←/→でレイアウトグループ切替
- レイアウトグループを閉じる際は確認ダイアログ、タブと同様にCtrl+Shift+Gで復元可能
- インライン名前変更(F2、または選択中の行をゆっくり2回クリック)
- フォルダごとの付箋メモ(自分だけに表示、Ctrl+M)
- カスタムテーマ(プリセット11種 + シードカラーからの自動生成 + テーマデザイナーUI)
- UNCパス(ファイルサーバー等の `\\server\share\...`)にも対応
- 右クリックから新規作成(フォルダ・テキスト・Excel/Word/PowerPoint)、日付付きコピー
- 右クリックからWindowsネイティブのシェルメニュー(サードパーティ拡張含む)を呼び出し可能
- TortoiseSVN / WinMergeがインストールされていれば右クリックから直接操作可能(未インストール時は自動的に非表示)
- 外部ランチャー(BlueWind等)からフォルダを指定して起動可能

## 動作要件

- Windows 10 / 11 (64bit)

## ビルド方法

Tauri 2 + React + TypeScript 製。

```bash
npm install
npm run tauri:dev    # 開発起動
npm run tauri:build  # .exe インストーラーを生成(src-tauri/target/release/bundle/nsis/ 配下)
```

Rust ツールチェーン([rustup](https://rustup.rs/))と Node.js が別途必要。

## ライセンス

[MIT](./LICENSE)
