# Deployment — Azure Static Web Apps

The app is fully static: a Vite build, the Stockfish worker, and the game
collections. No server code runs anywhere. Azure Static Web Apps (Free tier)
serves it from a CDN, and `public/staticwebapp.config.json` supplies the
headers a `<meta>` tag cannot — `frame-ancestors` above all. The page's main
Content-Security-Policy stays in the built HTML (see `vite.config.ts`); the
Azure config only adds what HTML cannot express, so there is no second copy
to drift.

## One-time: acquire the Azure assets

```bash
az login
az group create --name chess-app-rg --location eastus2
az staticwebapp create --name claude-chess-app --resource-group chess-app-rg --sku Free
az staticwebapp secrets list --name claude-chess-app --resource-group chess-app-rg --query properties.apiKey --output tsv
```

Put the printed token in the GitHub repository under
**Settings → Secrets and variables → Actions** as
`AZURE_STATIC_WEB_APPS_API_TOKEN`. That token is the only secret involved,
and it lives in GitHub's secret store — never in this repository.

The workflow refers to it as `${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}`,
which is a *name*, not a value: GitHub substitutes it at run time and masks it
in the logs. Nothing secret is committed, and nothing needs to be. The one
place the name appears outside the deploy step is
`HAS_DEPLOY_TOKEN: ${{ secrets.… != '' }}`, which evaluates to a boolean —
a step-level `if` may not read the `secrets` context, so the check rides
through `env`.

Only workflows triggered by `push` to `main` can see it. `ci.yml` and
`codeql.yml` run on `pull_request` and reference no secrets at all, which is
what stops a pull request from a fork reaching the token.

### Scoping it to the environment

The deploy job declares `environment: production`, so runs appear under the
repository's **Environments** tab with the site URL attached. Repository
secrets still resolve, so this changes nothing on its own — but it is what
makes the tightening possible: move the token to
**Settings → Environments → production → Environment secrets** and delete the
repository-level copy, and it becomes unreadable to any workflow that does not
name that environment. Required reviewers can be added there too, if a deploy
should ever need approval.

## After that

Every push to `main` runs `.github/workflows/azure-static-web-apps.yml`:
install, typecheck, tests, audit, gitleaks, build, smoke test, deploy. The
build is gated by the same checks as the local pre-commit hook, so nothing can
deploy that could not have been committed.

Two details of that install are load-bearing rather than incidental, and
[SUPPLY-CHAIN.md](SUPPLY-CHAIN.md) explains both in full:

- Dependencies come from `npm ci` against the committed lock. What deploys is
  the tree that was reviewed, not whatever npm would resolve at deploy time.
  Regenerating that lock has an order that must be followed — see
  [CLAUDE.md](../CLAUDE.md#the-lock-file) before you touch it.
- Every action is pinned to a commit SHA, so a moved tag cannot change what
  runs in the job that holds the deploy token.

`main` cannot be pushed to through a pull request without `gate` and `Analyze`
passing, so in normal use the deploy only ever runs on a commit that has
already been through the full gate.

To rehearse locally without deploying:

```bash
npm run build
npm run preview
```

## Housekeeping workflows

- `actions-cleanup.yml` deletes completed workflow runs weekly — the newest
  ten per workflow stay, nothing older than thirty days survives.
- `keepalive.yml` sends the deployed site one HEAD request a week (a few
  hundred bytes; the free tier allows 100 GB a month) and re-enables the
  scheduled workflows so GitHub's sixty-day idle switch-off never bites.
  Set the site's address as a repository variable named `SITE_URL`
  (**Settings → Secrets and variables → Actions → Variables**) once the
  Static Web App exists; until then the ping step skips itself.
