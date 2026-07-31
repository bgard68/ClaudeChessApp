# Supply chain and repository hardening

The app has no server, so the realistic attack is not against a running
backend. It is against the path that turns source into the files a browser
downloads: dependencies, GitHub Actions, and the deploy. This document records
what that path enforces, why each control is there, how to check it still
holds, and the mistakes that would quietly undo it.

Written after a security pass on 2026-07-30. See
[SECURITY.md](../SECURITY.md) for the threat model and how to report a
vulnerability.

---

## 1. What is enforced now

| Control | State |
| --- | --- |
| Merge to `main` | Pull request only; `gate` and `Analyze` must pass |
| Required approvals | 0 — deliberate, see [§6](#6-why-zero-required-approvals) |
| Dependency install | `npm ci` from the committed lock, never re-resolved |
| GitHub Actions | All 9 `uses:` pinned to a commit SHA |
| gitleaks binary | SHA256-verified before it is extracted |
| `GITHUB_TOKEN` | Explicit `contents: read` in each workflow |
| Secret scanning | On, with push protection |
| Private vuln reporting | On |
| CodeQL | Every push, every PR, weekly sweep |
| Dependabot | npm and github-actions, weekly |
| `npm audit` | Blocks the gate at moderate |
| Game collections | Committed, not fetched from third parties at build time |

Two things deliberately left off:

- **`enforce_admins` is off.** An admin can still push directly to `main`. That
  is a considered trade rather than an oversight — see [§7](#7-what-is-not-enforced-and-why).
- **Secret-scanning non-provider patterns and validity checks are off.** Not a
  choice. They are GitHub Advanced Security features; on a free plan the API
  accepts the request and silently ignores it. Do not spend time retrying.

---

## 2. Dependencies install from the lock

### What changed

Both workflows used to do this:

```yaml
- run: rm package-lock.json
- run: npm install --no-audit --no-fund
```

They now do this:

```yaml
- run: npm ci --no-audit --no-fund
```

### Why it mattered

Deleting the lock means the deployed build contains whatever npm resolved at
that second, not the tree anyone reviewed. A package compromised in the window
between the lock being written and the deploy running shipped to production
unread. `npm audit` does not close that gap — it only knows about advisories
that have already been published, and a fresh supply-chain compromise is by
definition not one of those.

This also quietly undercut a decision made deliberately elsewhere: the game
collections were committed to the repository precisely so that a build would
stop depending on third-party hosts staying up and unchanged. Re-resolving
every dependency on every deploy reintroduced a much larger version of the same
risk.

### Why the workaround existed

It was not baseless. A lock file written on Windows genuinely did omit the
Linux native bindings, and the deploy died on them:

```
Cannot find module '@rolldown/binding-linux-x64-gnu'
Unable to resolve @typescript/typescript-linux-x64
```

That is `npm/cli#4828`, and it is real.

### The part that was misunderstood

The bug is narrower than it reads. **npm prunes optional dependencies to the
current platform when it writes a lock from an installed tree — not when it
resolves one.** Regenerate with `--package-lock-only` and no `node_modules`
present, and every platform survives:

| | Before | After |
| --- | --- | --- |
| Packages | 66 | 115 |
| Linux entries | 0 | 20 |
| win32 / darwin | 3 / 0 | 6 / 6 |

All three bindings the Linux runner needs are now in the lock:
`@rolldown/binding-linux-x64-gnu`, `@typescript/typescript-linux-x64`,
`lightningcss-linux-x64-gnu`.

### How to regenerate the lock correctly

The order matters. `node_modules` must be gone first, or npm writes the lock
from the installed tree and prunes it back to your platform.

```bash
rm -rf node_modules package-lock.json
npm install --package-lock-only --no-audit --no-fund
npm ci --no-audit --no-fund
npm run verify
```

Then confirm the lock is genuinely cross-platform before committing:

```bash
node -e "const k=Object.keys(require('./package-lock.json').packages); console.log('packages:', k.length, '| linux:', k.filter(x=>/linux/.test(x)).length)"
```

Expect roughly `packages: 115 | linux: 20`. A result of `66 | 0` means the lock
was written from an installed tree and the deploy will fail.

### Why this will not silently regress

- A plain `npm install` does **not** prune the entries back. Day-to-day work is
  safe; only regenerating the lock the wrong way breaks it.
- If it does regress, `npm ci` fails on the Linux runner and the deploy stops.
  It fails loudly, which is why no extra guard was added — a check that only
  duplicates an existing loud failure is maintenance with no yield.

The trap to know about: it is **invisible from Windows**. The lock looks
fine, `npm ci` works locally, `npm run verify` passes, and only the Linux
deploy fails. That is why the rule is in
[CLAUDE.md](../CLAUDE.md#the-lock-file) as well as here.

---

## 3. Actions are pinned to commit SHAs

A tag is a mutable pointer. `actions/checkout@v7` resolves to whatever `v7`
names at the moment a run starts, and whoever controls the tag can move it
after you have reviewed it. These jobs check out the repository, install Node,
hold the Azure deploy token, and write security events — worth fixing the
version that actually runs.

All nine `uses:` lines carry a SHA with the tag in a trailing comment:

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
```

The comment is not decoration. That is the form Dependabot reads, so bumps keep
arriving as pull requests — a pin is only tolerable if something still tells you
when it is stale.

### Re-pinning after a Dependabot bump

Dependabot updates the SHA and the comment together, so normally there is
nothing to do. To pin a new action by hand, resolve the tag and then check the
result back against the source repository — a mistyped SHA fails as an
unresolvable action, and with the gate required that blocks *every* pull
request, not just one:

```bash
gh api repos/actions/checkout/commits/v7 --jq .sha
```

To audit every pin at once:

```bash
grep -rn "uses:" .github/workflows/
```

Nine lines, every one carrying a SHA — six distinct actions, since `checkout`
and `setup-node` appear in more than one workflow. When updating a pin by hand,
update every occurrence: `grep` counts them, memory does not.

Anything matching `@v[0-9]` is unpinned:

```bash
grep -rnE "uses: .*@v[0-9]" .github/workflows/
```

---

## 4. The gitleaks binary is verified before it runs

It used to be piped straight from `curl` into `tar`, which cannot verify
anything — the archive is unpacked as it arrives, so by the time a hash could
be computed the binary is already root-owned on `PATH`. In the deploy workflow
that same job goes on to hold the Azure token, so an unverified binary there
reaches production.

It is now downloaded, checked, and only then extracted:

```yaml
- name: Install gitleaks
  env:
    GITLEAKS_VERSION: 8.30.1
    GITLEAKS_SHA256: 551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
  run: |
    archive="gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
    curl -sSfL -o "$archive" \
      "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${archive}"
    echo "${GITLEAKS_SHA256}  ${archive}" | sha256sum -c -
    sudo tar -xzf "$archive" -C /usr/local/bin gitleaks
    rm "$archive"
```

### Upgrading gitleaks

Take the checksum from the release's own published list, never from a third
party:

```bash
curl -sSfL https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_checksums.txt | grep linux_x64
```

Update `GITLEAKS_VERSION` and `GITLEAKS_SHA256` together in **both**
`ci.yml` and `azure-static-web-apps.yml`. Then confirm the check actually
rejects a bad archive, rather than trusting that it would:

```bash
echo "0000000000000000000000000000000000000000000000000000000000000000  file.tar.gz" | sha256sum -c -
```

That must exit non-zero. A verification step nobody has seen fail is a
verification step nobody has tested.

---

## 5. Token permissions are stated, not inherited

Each workflow declares what it needs:

```yaml
permissions:
  contents: read
```

The repository default is already read-only, so this changes nothing today.
That is the point — a default is a setting someone can change, and a gate that
runs on pull requests should not silently widen along with it. `codeql.yml`
declares the `security-events: write` it genuinely needs;
`actions-cleanup.yml` and `keepalive.yml` declare `actions: write`.

Related, in `keepalive.yml`: a repository variable is passed through `env`
rather than interpolated into a shell line.

```yaml
env:
  SITE_URL: ${{ vars.SITE_URL }}
run: curl -sSIf "$SITE_URL" | head -1
```

`${{ }}` is substituted before the shell ever parses the line, so a variable
holding shell metacharacters would be executed rather than fetched. Only an
admin can set a repository variable, so this was never a live hole — but it is
the shape worth never writing, and `env` costs one line.

---

## 6. Why zero required approvals

`main` requires a pull request and requires `gate` and `Analyze` to pass. It
requires **no approving reviews**, which looks like a weakened setting and is
not.

GitHub does not let an author approve their own pull request. With a sole
maintainer and one required approval, every pull request was permanently
unmergeable through the normal path, and the only way to land anything was the
admin bypass. A rule that can only ever be satisfied by bypassing it is not
protection — it just moves every merge into the exception path and destroys the
signal that an exception was ever used.

So the gate is the reviewer. The pull request flow, the required checks, and
the audit trail all remain; the one rule that could not be satisfied is gone.

If a second maintainer ever joins, raise it back to 1:

```bash
gh api --method PATCH repos/bgard68/ClaudeChessApp/branches/main/protection/required_pull_request_reviews \
  --input - <<< '{"required_approving_review_count": 1, "dismiss_stale_reviews": true}'
```

---

## 7. What is not enforced, and why

**`enforce_admins` is off**, so an admin can push directly to `main` and bypass
everything above.

The argument for turning it on is obvious. The argument against is specific:
when CI itself is broken, the required check can never go green, so the fix for
the broken gate cannot be merged. That is not hypothetical here — the commit
chain `fc8a959` → `176ff74` was exactly that, direct pushes to `main` to repair
a gate that was failing on the npm lock issue. With `enforce_admins` on, that
recovery would have required temporarily disabling branch protection.

For a single-maintainer repository the bypass is the cheaper failure mode. It
is a genuine coin-flip, not a clear answer, and it is worth revisiting the
moment a second person has push access.

To turn it on:

```bash
gh api --method POST repos/bgard68/ClaudeChessApp/branches/main/protection/enforce_admins
```

---

## 8. Auditing the current state

None of the branch protection settings live in this repository, so reading the
workflows does not tell you what is actually enforced. These commands do.

**Branch protection:**

```bash
gh api repos/bgard68/ClaudeChessApp/branches/main/protection --jq '{checks: .required_status_checks.checks, approvals: .required_pull_request_reviews.required_approving_review_count, admins: .enforce_admins.enabled, force_push: .allow_force_pushes.enabled}'
```

**Repository security features:**

```bash
gh api repos/bgard68/ClaudeChessApp --jq .security_and_analysis
```

**Default token permission** — the single most important Actions setting:

```bash
gh api repos/bgard68/ClaudeChessApp/actions/permissions/workflow
```

**Secrets in the entire history**, not just the working tree:

```bash
gitleaks git --no-banner --exit-code 1 .
```

**Dependency advisories:**

```bash
npm audit --audit-level=moderate
```

**Everything the gate checks, in one command** — typecheck, tests, audit,
gitleaks, build, smoke test, and the negative probes proving each can fail:

```bash
pwsh scripts/test-gate.ps1
```

---

## 9. Verifying a change to the pipeline

The repository's own convention is that a check nobody has watched fail is not
a check. Applied to this work, that meant:

- The checksum step was run against the real archive (`OK`) **and** against a
  wrong hash (`FAILED`, exit 1) before it was committed.
- Every pinned SHA was resolved from its tag and then read back from the
  action's repository, because a typo here blocks every pull request.
- `npm ci` was proven on the Linux runner, not merely on Windows — Windows
  success is exactly the false signal that hid the original problem.
- All five workflow files were re-parsed as YAML after each edit.

When changing any of this, the useful question is not "does it pass?" but "have
I seen it fail for the right reason?"

---

## 10. History

| Change | Commit |
| --- | --- |
| Game collections committed instead of refetched | `901f0d6` |
| gitleaks verified, tokens scoped, `SITE_URL` via env | [#5](https://github.com/bgard68/ClaudeChessApp/pull/5) |
| Every action pinned to a commit SHA | [#6](https://github.com/bgard68/ClaudeChessApp/pull/6) |
| `npm ci` from a cross-platform lock | [#7](https://github.com/bgard68/ClaudeChessApp/pull/7) |
| Required status checks, approvals 0, private reporting | Repository settings, not in git |
