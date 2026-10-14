# Eureka Thumb — 文字だけサムネメーカー

記事や紹介文を貼ってボタンを押すだけで、**キャラなし・文字だけ**の派手なブログサムネを
**1280×670 PNG** で作るツール。

- **見出し** … 紹介している物・名前・SEO キーワードを大きく(1〜2行に自動改行)
- **キーワードチップ** … 検索されやすい語を最大3つ
- **エウレカの一言** … 主観的な感想セリフを手書きフォント+マーカーのアンダーラインで(吹き出しなし)
- 注意色(警告イエロー/レッドアラート/ディープブルー)、集中線・網点・警告テープの背景
- 文字はすべて端から 76px 以上内側。収まらなければ自動で縮小
- 「Genesis Vault」などのメディア名は自動で除去

文字はキャンバスにフォントで描くので、画像生成 AI のような文字化けは起きない。
生成後も見出し・サブ・キーワード・一言は手で直せる。

```bash
npm install
npm run dev      # http://localhost:3000
```

## 文字を考えるAI

生成ボタンを押すと、使えるAIを上から順に試して最初に答えたものを使う。画面の「文字を考えるAI」で固定もできる。

| AI | 料金 | 設定 |
|---|---|---|
| Claude | 有料 | `ANTHROPIC_API_KEY`(設定時は最優先) |
| Gemini | **無料枠** | `GEMINI_API_KEY`(Google AI Studio で無料発行、カード不要) |
| Pollinations | **無料・キー不要** | 何もしなくても使える |
| AIなし | 無料 | 上が全部ダメなとき、ブラウザ内でキーワード抽出 |

どのAIの出力も同じ文字数制限・メディア名除去を通る。

## 構成

```
src/app/page.tsx               画面
src/app/api/analyze/route.ts   AIで文字を作るAPI
src/lib/ai.ts                  Claude / Gemini / Pollinations の呼び出しと順番
src/components/ThumbMaker.tsx  入力・編集・プレビュー・ダウンロード
src/lib/render.ts              1280×670 キャンバス描画(配色テーマ・レイアウト)
src/lib/extract.ts             オフライン抽出
src/lib/copy.ts                文字数制限と禁止語の除去
```

フォント: Dela Gothic One(見出し)、Yomogi(手書きの一言) — Google Fonts。
