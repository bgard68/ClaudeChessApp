/**
 * Architecture rules over the resolved module graph, run with
 * `npm run depcruise` here and as its own step in the CI gate.
 *
 * `src/architecture.test.ts` already pins which layer may import which, and
 * stays the authority on that. But it reads one file at a time against a
 * regex, so there are three things it structurally cannot ask, and these
 * rules exist to ask exactly those — nothing here restates the layer map:
 *
 *   - a cycle. Two files that import each other are invisible to any
 *     per-file check; every edge looks locally reasonable.
 *   - a test reached from shipped code. The test guards `test-support/`,
 *     but `src/testing/` and the `.test.ts` files themselves sat outside
 *     every rule — a fake that never errors is wrong the same silent way a
 *     ResizeObserver that never fires is.
 *   - a specifier that resolves to nothing. tsc checks what the type system
 *     sees, and vite/client declares every `*.css` import a module, so a
 *     mistyped stylesheet path type-checks and fails only at build.
 *
 * An exemption is a narrowing of the rule it weakens, written beside a
 * reason — the same contract as ACCEPTED in the architecture test. There
 * are none today.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Dependencies point inward and never back: a cycle has no inside.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-test',
      severity: 'error',
      comment:
        'Nothing that ships may import a test, a fake, or a jsdom stub. ' +
        'They fail by doing nothing rather than by throwing.',
      from: {
        pathNot: ['\\.test\\.(ts|tsx)$', '^src/test-support/', '^src/testing/'],
      },
      to: {
        path: ['\\.test\\.(ts|tsx)$', '^src/test-support/', '^src/testing/'],
      },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment:
        'Every import must land on a real module. What cannot resolve here ' +
        'cannot resolve for the bundler either.',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    // swc, because the typescript parser cannot be: dependency-cruiser
    // supports typescript <7 only, and this repo compiles with 7. Without a
    // parser it finds 0 modules and exits 0 — a gate that passes by seeing
    // nothing — which the module-count check in the CI step exists to catch.
    parser: 'swc',
    // The rules above are about this repository's own modules; what a
    // dependency imports internally is its business, not this gate's.
    doNotFollow: { path: 'node_modules' },
    // Resolves the @domain/@application/... aliases the same way the
    // bundler does: from the one mapping in tsconfig.json, not a copy.
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
