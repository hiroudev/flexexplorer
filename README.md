# FlexExplorer

Windows向けのカスタムファイルエクスプローラー。分割パネル・インスペクターのインラインプレビュー・コマンドパレットなど、軽量かつモダンな操作感を目指したデスクトップアプリ。

## ダウンロード

**[最新版をダウンロード](https://github.com/hiroudev/flexexplorer/releases/latest)**(`.msi` または `.exe`)

## 特徴

- 分割パネル表示、複数タブ・ワークスペース管理
- サイドパネルでのファイルプレビュー(インスペクター)
- コマンドパレット・GoToオーバーレイによるキーボード操作
- カスタムテーマ(プリセット11種 + シードカラーからの自動生成 + テーマデザイナーUI)

## 動作要件

- Windows 10 / 11 (64bit)

## ビルド方法

Tauri 2 + React + TypeScript 製。

```bash
npm install
npm run tauri:dev    # 開発起動
npm run tauri:build  # .msi / .exe を生成(src-tauri/target/release/bundle/ 配下)
```

Rust ツールチェーン([rustup](https://rustup.rs/))と Node.js が別途必要。

## ライセンス

[MIT](./LICENSE)
