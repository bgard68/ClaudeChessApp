/**
 * What must never be tracked, and what must never have been.
 *
 * This exists because of `.claude/launch.json`, which sat in this repository's
 * public history for its whole life. Three separate guards were already
 * running and none of them said a word: gitleaks over the full history, GitHub
 * secret scanning, and GitHub push protection. All three look for credential
 * *patterns*. The file contained `npm run dev --port 5173`, so there was
 * nothing to find, and nothing anywhere asked the other question — which paths
 * is this repository tracking at all?
 *
 * The sequence is worth keeping, because every step of it looked correct:
 *
 *   07-29  .claude/launch.json committed. `.gitignore` had no rule for it
 *          yet, so it was tracked like any other file, correctly.
 *   07-30  the file deleted, and `.claude/` added to `.gitignore` in the same
 *          minute, five hours before the repository existed on GitHub.
 *   07-30  first push. `git push` sends history, not the tip, so all four
 *          commits that carried the file went up with it.
 *
 * So the tip was clean when it was published and the repository was still
 * exposed. That is the shape of the check below: not "is the tip clean" but
 * "was it ever dirty, anywhere in what this change adds".
 *
 * Two more things learned from that day and encoded here. Adding a path to
 * `.gitignore` does not untrack a file that is already tracked — git keeps
 * committing it until someone runs `git rm --cached` — so the first check asks
 * git directly which tracked files its own ignore rules now disown. And the
 * second check does not rely on `.gitignore` at all, because the first cannot
 * fire until somebody remembers to write the rule.
 *
 * Usage:
 *   node scripts/paths-check.mjs                      # index and worktree
 *   node scripts/paths-check.mjs --range main..HEAD   # every commit in a range
 *   node scripts/paths-check.mjs --repo <dir>         # against another checkout
 *   node scripts/paths-check.mjs --self-test          # prove it can fail
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

/**
 * Paths that must never be tracked, whatever `.gitignore` happens to say.
 *
 * Each carries its reason: a denylist without one becomes a list nobody dares
 * edit, because no one can tell which entries still matter.
 */
const FORBIDDEN = [
  { test: /(^|\/)\.claude\//, why: 'agent workspace - local tooling, not project source' },
  { test: /(^|\/)\.env(\.[^/]*)?$/, why: 'environment file - the usual home of a real secret' },
  { test: /\.(pem|key|pfx|p12|jks|keystore|asc)$/i, why: 'key material' },
  { test: /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.[^/]*)?$/, why: 'ssh private key' },
  { test: /(^|\/)\.npmrc$/, why: 'carries a registry auth token when one is set' },
  { test: /(^|\/)\.(netrc|pgpass|htpasswd)$/, why: 'stored credentials' },
  { test: /(^|\/)secrets?\.(json|ya?ml|toml|txt|ini)$/i, why: 'named as a secrets file' },
  { test: /\.local$/, why: 'local-only config, gitignored by convention here' },
  { test: /(^|\/)\.aws\/|(^|\/)\.ssh\//, why: 'credential directory' },
]

/** Runs git and returns stdout, or throws with git's own message. */
function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function lines(output) {
  return output.split(/\r?\n/).filter((line) => line !== '')
}

function forbid(path) {
  return FORBIDDEN.find((rule) => rule.test.test(path)) ?? null
}

/**
 * Tracked files that the repository's own ignore rules now disown.
 *
 * This is the one that would have caught it, and it would have caught it on
 * 07-30 the moment `.claude/` entered `.gitignore` — while the fix was still
 * `git rm --cached` and the repository was still private.
 */
function trackedButIgnored(cwd) {
  return lines(git(['ls-files', '--cached', '--ignored', '--exclude-standard'], cwd)).map(
    (path) => ({ path, why: 'tracked, but .gitignore says it should not be' }),
  )
}

/** Tracked files matching the denylist, ignore rules or no ignore rules. */
function forbiddenInIndex(cwd) {
  return lines(git(['ls-files'], cwd))
    .map((path) => ({ path, rule: forbid(path) }))
    .filter((hit) => hit.rule !== null)
    .map((hit) => ({ path: hit.path, why: hit.rule.why }))
}

/**
 * Forbidden paths touched anywhere in a range of commits.
 *
 * The point of the range: a path added in one commit and deleted in the next
 * leaves a clean tip and a dirty history, and history is what gets pushed.
 * Checking the tip would have passed this repository on the day it leaked.
 */
function forbiddenInRange(range, cwd) {
  const touched = new Set(
    lines(git(['log', '--format=', '--name-only', '--no-renames', range], cwd)),
  )
  return [...touched]
    .map((path) => ({ path, rule: forbid(path) }))
    .filter((hit) => hit.rule !== null)
    .map((hit) => ({ path: hit.path, why: `${hit.rule.why} (in a commit in ${range})` }))
}

/**
 * Every check, against one checkout. Returns the findings; the caller decides
 * what a finding means, which is what lets the self-test assert on them.
 */
export function check({ cwd = process.cwd(), range = null } = {}) {
  const findings = [
    ...trackedButIgnored(cwd),
    ...forbiddenInIndex(cwd),
    ...(range === null ? [] : forbiddenInRange(range, cwd)),
  ]

  // The same path can trip more than one rule; report it once, with reasons.
  const byPath = new Map()
  for (const finding of findings) {
    const existing = byPath.get(finding.path)
    if (existing === undefined) byPath.set(finding.path, [finding.why])
    else if (!existing.includes(finding.why)) existing.push(finding.why)
  }
  return [...byPath].map(([path, why]) => ({ path, why }))
}

/**
 * Which commits to examine when nothing was asked for.
 *
 * The repository's existing history contains the very file this check exists
 * for, and rewriting that history was considered and declined — the exposure
 * is a port number. So the default range is what a change *adds*, not
 * everything that has ever been. Where there is no base to compare against,
 * the range check is skipped and says so out loud: a check that quietly does
 * nothing is worse than no check, because you stop expecting it to catch
 * anything.
 */
function defaultRange(cwd) {
  for (const base of ['origin/main', 'main']) {
    try {
      git(['rev-parse', '--verify', '--quiet', base], cwd)
      const mergeBase = git(['merge-base', base, 'HEAD'], cwd).trim()
      const head = git(['rev-parse', 'HEAD'], cwd).trim()
      if (mergeBase === head) return null // nothing added on top of the base
      return `${mergeBase}..HEAD`
    } catch {
      // Not this one; try the next.
    }
  }
  return null
}

// ---------------------------------------------------------------- self-test

/** A throwaway repository, so the probes cannot touch the real one. */
function scratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'paths-check-probe-'))
  git(['init', '--quiet', '.'], dir)
  git(['config', 'user.email', 'probe@example.invalid'], dir)
  git(['config', 'user.name', 'probe'], dir)
  git(['config', 'commit.gpgsign', 'false'], dir)
  return dir
}

function write(dir, path, body) {
  mkdirSync(dirname(join(dir, path)), { recursive: true })
  writeFileSync(join(dir, path), body)
}

function commit(dir, message) {
  git(['add', '-A'], dir)
  git(['commit', '--quiet', '--no-verify', '-m', message], dir)
}

/**
 * Each probe plants a violation this check must reject. A gate that waves bad
 * input through is broken, and this file is a gate.
 */
const PROBES = [
  {
    name: 'a tracked file that .gitignore later disowns',
    // The exact sequence of 07-29 and 07-30, in miniature.
    run(dir) {
      write(dir, '.claude/launch.json', '{"port":5173}\n')
      write(dir, '.gitignore', 'node_modules/\n')
      commit(dir, 'track it while no rule exists')
      appendFileSync(join(dir, '.gitignore'), '.claude/\n')
      commit(dir, 'add the ignore rule, forget the git rm --cached')
      return check({ cwd: dir })
    },
  },
  {
    name: 'a forbidden path with no ignore rule at all',
    run(dir) {
      write(dir, '.env', 'TOKEN=whatever\n')
      commit(dir, 'commit an env file')
      return check({ cwd: dir })
    },
  },
  {
    name: 'a forbidden path added and deleted, leaving a clean tip',
    // This is the one that matters: it is what actually happened here, and
    // every check that looked at the tip passed while it was true.
    run(dir) {
      write(dir, 'README.md', 'base\n')
      commit(dir, 'base')
      const base = git(['rev-parse', 'HEAD'], dir).trim()
      write(dir, '.claude/launch.json', '{"port":5173}\n')
      commit(dir, 'add it')
      rmSync(join(dir, '.claude/launch.json'))
      commit(dir, 'delete it again - the tip is now clean')
      const tip = check({ cwd: dir })
      if (tip.length > 0) throw new Error('the tip was supposed to look clean')
      return check({ cwd: dir, range: `${base}..HEAD` })
    },
  },
]

function selfTest() {
  let caught = 0
  for (const probe of PROBES) {
    const dir = scratchRepo()
    try {
      const findings = probe.run(dir)
      if (findings.length > 0) {
        console.log(`  PASS  caught: ${probe.name}`)
        caught += 1
      } else {
        console.log(`  FAIL  NOT caught: ${probe.name}`)
      }
    } catch (error) {
      console.log(`  FAIL  probe errored: ${probe.name} - ${error.message}`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  console.log(`\n${caught} of ${PROBES.length} probes caught.`)
  return caught === PROBES.length
}

// -------------------------------------------------------------------- main

const argv = process.argv.slice(2)
const valueOf = (flag) => {
  const at = argv.indexOf(flag)
  return at === -1 ? null : argv[at + 1] ?? null
}

if (argv.includes('--self-test')) {
  console.log('Probing that the path guard can fail:\n')
  process.exit(selfTest() ? 0 : 1)
}

const cwd = valueOf('--repo') ?? process.cwd()
// `--range ''` means "index only", which is what the pre-commit hook wants:
// there is no base to compare a range against until the commit exists.
const asked = argv.includes('--range') ? valueOf('--range') : undefined
const range = asked === undefined ? defaultRange(cwd) : asked === '' ? null : asked

console.log(`Checking tracked paths in ${cwd}`)
console.log(range === null ? '  range: none (no base to compare against)' : `  range: ${range}`)

const findings = check({ cwd, range })
if (findings.length === 0) {
  console.log('PATHS OK')
  process.exit(0)
}

console.error('\nFORBIDDEN PATHS:')
for (const finding of findings) {
  console.error(`  - ${finding.path}`)
  for (const why of finding.why) console.error(`      ${why}`)
}
console.error('\nIf one is already tracked, `git rm --cached <path>` untracks it without')
console.error('deleting it. Adding it to .gitignore alone does NOT untrack it.')
process.exit(1)
