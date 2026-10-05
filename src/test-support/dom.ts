/**
 * The two browser APIs jsdom does not implement, and the screens need.
 *
 * Imported by the jsdom tests only — the node suite never touches this file,
 * and nothing in `src/` outside tests may import it.
 *
 * Both are stubs rather than polyfills, deliberately. Nothing here is
 * pretending to be a layout engine: real geometry, real breakpoints and real
 * resize behaviour are the browser scripts' job and are checked there against
 * actual Chrome. What these buy is the ability to *mount* a screen at all, so
 * that failure can be injected into its effects — which is the one thing
 * neither existing environment can do. See TESTING.md § A third environment,
 * for failure only.
 */

/** Never fires. A test that needs a resize is a test that needs a browser. */
class StubResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

export interface DomStubOptions {
  /**
   * What every media query answers. The archive's master/detail pane is gated
   * on `(min-width: 1100px)`, so a test of the preview has to say `true` and a
   * test of the narrow layout has to say `false`.
   */
  readonly matchMedia?: boolean
}

/**
 * Installs the stubs. Call once per test file, before rendering.
 *
 * Returns nothing to undo: these are additive globals in a jsdom environment
 * that vitest tears down per file anyway, and an `afterEach` restoring them
 * would only create the chance of a test running without them.
 */
export function installDomStubs({ matchMedia = false }: DomStubOptions = {}): void {
  globalThis.ResizeObserver ??= StubResizeObserver

  // jsdom has no layout, so it implements no scrolling. The archive scrolls the
  // selected row into view and the move list scrolls the current ply; both would
  // throw here, and neither has anything to say in a test without geometry.
  Element.prototype.scrollIntoView ??= () => {}

  globalThis.matchMedia = (query: string) =>
    ({
      matches: matchMedia,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
