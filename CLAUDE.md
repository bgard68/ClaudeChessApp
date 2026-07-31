# Project directives

## Commit messages

Conventional Commits, matching the existing history:

- `type(scope): subject` — imperative mood, 72 characters or fewer, no trailing period.
- Types in use: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `perf`, `build`.
- Scope is the area touched (`engine`, `setup`, `play`, `archive`, `board`, …); omit it for repo-wide changes.
- The body explains **why**, not what the diff already shows.
- Run `npm run verify` (typecheck + tests + audit) before committing.

## The lock file

CI installs with `npm ci`, so the lock is what ships — not whatever npm would
resolve at deploy time.

- **Install with `npm ci`, and run it again after any pull that changed the
  lock.** A stale `node_modules` does not report itself; it surfaces as a type
  error in an unrelated file. When a typecheck fails somewhere your changes
  never went, check the install before reading the error — the same applies to
  a fresh worktree, which has no `node_modules` at all and silently resolves
  against the parent checkout's.
- Regenerate it with `npm install --package-lock-only` and **no `node_modules`
  present**. With a tree installed, npm writes the lock from that tree and
  keeps only the current platform's optional binaries (npm/cli#4828), which
  drops the Linux bindings the runner needs and breaks the deploy.
- A correct lock holds all three platforms. `@rolldown/binding-*`,
  `@typescript/typescript-*` and `lightningcss-*` should each appear in linux,
  win32 and darwin variants — roughly 115 packages, not 66.
- A plain `npm install` does not prune them back, so day-to-day work is safe.

## Secrets

- Never commit secrets: no tokens, API keys, passwords, or credentials in code,
  config, docs, or history. This app is fully client-side and needs none —
  anything that looks like one is a mistake.
- `.env*` and `*.local` are gitignored; keep anything sensitive there or outside
  the repository entirely.
- If a secret ever lands in a commit: rotate it first, then rewrite history.
  Deleting the file in a later commit does not remove it.
