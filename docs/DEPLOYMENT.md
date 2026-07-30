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

## After that

Every push to `main` runs `.github/workflows/azure-static-web-apps.yml`:
install, typecheck, tests, build, deploy. The build is gated by the same
checks as the local pre-commit hook, so nothing can deploy that could not
have been committed.

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
