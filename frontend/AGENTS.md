<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# NeoVNDB frontend

## Toolchain

- Node is the version in `.node-version`; pnpm is the version in `packageManager`.
  Never use npm, npx or yarn; use `pnpm dlx` for a one-off tool.
- Add or remove a dependency with `pnpm add` / `pnpm remove`, and commit
  `pnpm-lock.yaml`. `next`, `eslint-config-next`, `react` and `react-dom` are
  pinned exactly; move them together.
- Before handing off: `pnpm typecheck`, `pnpm typecheck:tests`, `pnpm lint`,
  `pnpm format:check`, `pnpm test`, `pnpm build`.

## Versions

- Installed versions may be newer than your training data. Check an API against
  the package in `node_modules` before using it.
- Do not change Node, pnpm, or a dependency's major version unless asked.

## Writing

- `../docs/` is written in Chinese; README, comments and everything else in English.
- Write a comment or a doc line only when the code cannot say it.
- This file is the only agent instruction file; `CLAUDE.md` imports it.
