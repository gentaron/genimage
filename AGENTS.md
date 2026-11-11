<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- ecosystem:begin (自動生成: gentaron/infocollect の ecosystem/registry.json から。手で直さない) -->

## エコシステム（このリポジトリの外側）

- 役割: Eureka Thumb — 記事を貼るだけの文字サムネメーカー（発信パイプライン）
- 上流（ここが受け取るもの）: infocollect（記事）、genesisvault（記事）、Gentarog（記事）
- 下流（ここが渡すもの）: なし
- 渡しているもの（produces）の形を変えるときは、下流のリポジトリ名をコミットメッセージに書き、壊さない移行にする。
- 調べ物は MCP の `infocollect-kb` を先に使う（`kb_search` / `kb_context`。毎日の AI 情報・論文・リリース・過去記事・全リポジトリの役割が入っている）。出典の URL を必ず添える。
- 大きな作業は MCP の `forge` で小さなカードに割り、無料のエージェントに配る（`forge_add_cards`）。マージは人が承認する。
- 進め方: 方向づけ → 作業ループ → 判断の記録 → 更新 → 完了。完了の前に、このリポジトリの検証コマンドが通ることを確かめる。
- 全体の地図: https://github.com/gentaron/infocollect/blob/HEAD/ecosystem/README.md

<!-- ecosystem:end -->
