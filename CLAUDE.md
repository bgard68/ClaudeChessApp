# Project directives

## Commit messages

Conventional Commits, matching the existing history:

- `type(scope): subject` — imperative mood, 72 characters or fewer, no trailing period.
- Types in use: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `perf`, `build`.
- Scope is the area touched (`engine`, `setup`, `play`, `archive`, `board`, …); omit it for repo-wide changes.
- The body explains **why**, not what the diff already shows.
- Run `npm run verify` (typecheck + tests + audit) before committing.

## Secrets

- Never commit secrets: no tokens, API keys, passwords, or credentials in code,
  config, docs, or history. This app is fully client-side and needs none —
  anything that looks like one is a mistake.
- `.env*` and `*.local` are gitignored; keep anything sensitive there or outside
  the repository entirely.
- If a secret ever lands in a commit: rotate it first, then rewrite history.
  Deleting the file in a later commit does not remove it.
