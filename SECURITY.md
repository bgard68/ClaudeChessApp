# Security

## Reporting a vulnerability

Use GitHub's private reporting:
[**Report a vulnerability**](https://github.com/bgard68/ClaudeChessApp/security/advisories/new).
It opens a private advisory visible only to the maintainer, so a problem can be
fixed before it is described in public. Please do not open a public issue for
anything exploitable.

Expect a first response within a week. This is a personal project with one
maintainer, not a product with an on-call rotation — that is the honest
expectation to set rather than a service level nobody is paying for.

## What the threat model actually is

The app is worth describing precisely, because most of the categories a
security report usually falls into do not exist here.

- **No server.** Static files on a CDN. There is no backend, no API, no
  database server, no request handler anywhere.
- **No accounts, no authentication, no sessions.** Nothing to log into.
- **No personal data collected, transmitted, or stored remotely.** Your games
  live in your own browser's Origin Private File System. No analytics, no
  telemetry, no third-party scripts.
- **No secrets in the application.** A fully client-side app needs none, and
  anything shipped to the browser is public by definition. The only credential
  in the project is the Azure deployment token, which lives in GitHub's secret
  store and never in this repository.

So the realistic exposure is not data theft from a server that does not exist.
It is **the supply chain** — whether the code and dependencies that reach the
CDN are the ones that were reviewed — plus the usual client-side surface of a
page that parses untrusted input.

### Client-side surface worth reporting

- PGN parsing. The import path accepts arbitrary user-supplied files, and
  historical PGN is genuinely messy. A crash, hang, or unbounded allocation
  reachable from an imported file is a real bug.
- Content-Security-Policy bypass. The policy is in `vite.config.ts` and was
  measured against a running build rather than guessed. A way around it is
  worth reporting.
- Anything that escapes the OPFS database boundary or lets one origin read
  another's games.

### Not vulnerabilities here

- "The database is readable on the user's machine." It is meant to be — it is
  their data, on their disk, and any SQLite tool opens it.
- "The site has no login." There is nothing to protect behind one.
- "Dependency X has a CVE" with no path to exploitation in a static,
  serverless, single-origin page. `npm audit` runs on every build and blocks
  at moderate; a report that adds nothing to it is noise.

## How the supply chain is protected

That being the real exposure, it is documented in full — what is enforced, why
each control exists, how to verify it, and how to avoid regressing it:

**[docs/SUPPLY-CHAIN.md](docs/SUPPLY-CHAIN.md)**

In short: every push and pull request runs a gate that typechecks, tests,
audits, scans the whole history for secrets, builds, and smoke-tests the built
app — and then proves each of those checks can still fail. Dependencies install
from a committed lock rather than being re-resolved. Every GitHub Action is
pinned to a commit SHA. `main` cannot be merged into without the gate passing.
