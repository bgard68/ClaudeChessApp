<#
.SYNOPSIS
The publish gate: every check that must pass, plus proof the checks can fail.

.DESCRIPTION
Runs the project's real gates - typecheck, tests, dependency audit, a
gitleaks history scan and a forbidden-path check - then the negative probes:
a deliberately failing test, a deliberate type error, a planted fake
credential, and three planted forbidden paths. Each probe must be CAUGHT by
its tool; a gate that waves bad input through is broken, and a broken gate
fails this script just as surely as a broken build.

Plain ASCII and no here-strings on purpose: Windows PowerShell 5.1 reads
unmarked files as ANSI and refuses LF-only here-strings, and this script
must run identically under 5.1 locally and pwsh in CI.

Exit code 0 only when every gate passes and every probe is caught.
#>

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$script:failures = @()

function Invoke-Gate {
    param([string]$Name, [scriptblock]$Action)
    Write-Host ''
    Write-Host "== $Name" -ForegroundColor Cyan
    & $Action | Out-Host
    if ($LASTEXITCODE -ne 0) {
        $script:failures += $Name
        Write-Host "FAIL  $Name" -ForegroundColor Red
    } else {
        Write-Host "PASS  $Name" -ForegroundColor Green
    }
}

function Invoke-Advisory {
    # Reported, never fatal.
    #
    # For a question worth asking on every run whose answer does not depend on
    # the change being tested. A pull request cannot be held responsible for the
    # state of the tree it is branching from, and holding it responsible anyway
    # is not a stricter gate - it is a broken one. Dependabot pull request #81
    # sat red for a day over an advisory in a package it does not touch, and
    # auto-merge did exactly as it was told and refused to merge a red branch.
    # Every other open dependency update was stuck behind the same wall, none of
    # them able to fix it.
    #
    # Use it only where something else still asks the question in a place a
    # person reads. A warning nobody is accountable for is not a softer gate,
    # it is an absent one.
    param([string]$Name, [scriptblock]$Action)
    Write-Host ''
    Write-Host "== $Name (advisory)" -ForegroundColor Cyan
    & $Action | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARN  $Name - reported, not blocking" -ForegroundColor Yellow
        Write-Host "::warning title=$Name::Reported by the gate without blocking it. See .github/workflows/dependency-audit.yml, which owns this question on a schedule."
    } else {
        Write-Host "PASS  $Name" -ForegroundColor Green
    }
}

function Invoke-Probe {
    # The tool under test must REJECT the input; acceptance is the failure.
    param([string]$Name, [scriptblock]$Action)
    Write-Host ''
    Write-Host "== probe: $Name" -ForegroundColor Cyan
    & $Action | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $script:failures += "probe: $Name"
        Write-Host "FAIL  $Name - the gate did not catch it" -ForegroundColor Red
    } else {
        Write-Host "PASS  $Name - caught, as it must be" -ForegroundColor Green
    }
}

# ---------- The real gates ----------

Invoke-Gate 'typecheck' { & npx tsc --noEmit }
Invoke-Gate 'tests'     { & npx vitest run }
# Two audits, because "vulnerable" means two different things here.
#
# Production dependencies ship. An advisory in react, chess.js, stockfish or
# sqlite-wasm is in the bundle a person loads, so it blocks - this gate, and the
# deploy behind it. It reports nothing today, which is the point: it costs us
# nothing now and is in place for the day it does not.
#
# Development dependencies do not ship. A denial of service in a source-map
# parser that the coverage tool calls at build time cannot reach a user, and
# failing somebody else's branch over it is a category error that cost a day:
# Dependabot #81 went red over `source-map-js`, a package it does not touch and
# could not fix, and auto-merge then correctly declined to merge a red branch
# while every other dependency update queued behind it.
#
# Reported rather than ignored, and the distinction is load bearing. A
# development dependency that is *compromised* rather than merely buggy can
# inject into what we ship - the whole subject of SUPPLY-CHAIN.md - so this
# answer has to land somewhere a person reads. dependency-audit.yml owns that:
# it asks the same question daily against main, fails, and opens an issue. If
# that workflow is ever removed, this leg must go back to blocking, because it
# would then be the only thing asking.
#
# Still blocking in `npm run verify` either way. A person about to commit can
# fix an advisory and should be stopped by one; a dependency bump waiting on a
# required check cannot.
Invoke-Gate 'audit: production dependencies' { & npm audit --omit=dev --audit-level=moderate }
Invoke-Advisory 'audit: the whole tree, development included' { & npm audit --audit-level=moderate }
Invoke-Gate 'build'     { & npm run build }
Invoke-Gate 'smoke test against the built app' { & node scripts/smoke-test.mjs }
Invoke-Gate 'layout invariants on every screen' { & node scripts/layout-check.mjs }
Invoke-Gate 'behaviour in a real browser'       { & node scripts/behaviour-check.mjs }
Invoke-Gate 'the shell survives offline'        { & node scripts/offline-check.mjs }
Invoke-Gate 'accessibility on every screen'     { & node scripts/a11y-check.mjs }
Invoke-Gate 'forbidden paths'                   { & node scripts/paths-check.mjs }

$gitleaks = Get-Command gitleaks -ErrorAction SilentlyContinue
if ($null -ne $gitleaks) {
    Invoke-Gate 'gitleaks history scan' { & gitleaks git --no-banner --exit-code 1 . }
} else {
    Write-Host ''
    Write-Host 'FAIL  gitleaks is not installed, and the publish gate requires it' -ForegroundColor Red
    $script:failures += 'gitleaks missing'
}

# ---------- The probes: each tool shown a thing it must reject ----------

# A failing unit test must fail the runner.
$probeTest = Join-Path $root 'src/gate-probe.test.ts'
$probeTestLines = @(
    "import { expect, it } from 'vitest'",
    "it('the gate can see a failing test', () => {",
    '  expect(1).toBe(2)',
    '})'
)
Set-Content -Path $probeTest -Value $probeTestLines -Encoding utf8
try {
    Invoke-Probe 'vitest rejects a failing test' { & npx vitest run src/gate-probe.test.ts }
} finally {
    Remove-Item $probeTest -Force -ErrorAction SilentlyContinue
}

# A type error must fail the compiler.
$probeTs = Join-Path ([System.IO.Path]::GetTempPath()) 'gate-probe-type-error.ts'
Set-Content -Path $probeTs -Value 'const wrong: number = "not a number"' -Encoding utf8
try {
    Invoke-Probe 'tsc rejects a type error' { & npx tsc --noEmit --strict $probeTs }
} finally {
    Remove-Item $probeTs -Force -ErrorAction SilentlyContinue
}

# A planted credential must trip the leak scanner.
if ($null -ne $gitleaks) {
    $probeDir = Join-Path ([System.IO.Path]::GetTempPath()) 'gate-probe-leak'
    New-Item -ItemType Directory -Force -Path $probeDir | Out-Null
    # A GitHub-PAT-shaped token, GENERATED at run time: a literal written here
    # would make this script itself a leak, which the pre-publish history scan
    # duly proved before this line learned better. PAT-shaped and not, say,
    # AWS-shaped, because that too was learned: current gitleaks allowlists
    # AWS's documented example key and has no rule for bare AWS key ids at all.
    $alphabet = ([char[]]'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
    $tokenBody = -join (1..36 | ForEach-Object { $alphabet | Get-Random })
    $planted = 'github_token = "ghp_' + $tokenBody + '"'
    Set-Content -Path (Join-Path $probeDir 'planted.txt') -Value $planted -Encoding utf8
    try {
        Invoke-Probe 'gitleaks rejects a planted secret' {
            & gitleaks dir --no-banner --exit-code 1 $probeDir
        }
    } finally {
        Remove-Item $probeDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Three planted forbidden paths must each be rejected: a file that .gitignore
# later disowns, a forbidden path with no ignore rule at all, and one added
# then deleted so the tip looks clean. That last is what actually happened
# here, and every check that examined the tip passed while it was true.
#
# Run as a gate rather than a probe because the probing is inside it: the
# self-test plants each violation in a throwaway repository and exits non-zero
# unless all three are caught. Inverting that here would only assert the
# script can fail, not that it fails for the right reasons.
Invoke-Gate 'path guard catches what it must' { & node scripts/paths-check.mjs --self-test }

# ---------- Verdict ----------

Write-Host ''
if ($script:failures.Count -gt 0) {
    Write-Host 'GATE FAILED:' -ForegroundColor Red
    $script:failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}
Write-Host 'GATE PASSED - every check green, every probe caught.' -ForegroundColor Green
exit 0
