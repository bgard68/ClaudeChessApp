/**
 * Types for gameKey.mjs, which is plain JavaScript by necessity — the build
 * scripts must run under bare node with no compile step.
 *
 * Declared so `gameKey.test.ts` can import it and hold the two implementations
 * to the same answers without weakening `noImplicitAny` for the whole project.
 */
export function tagOf(pgn: string, name: string): string
export function personOf(pgn: string, name: string): string
export function moveTextOf(pgn: string): string
export function gameIdentity(pgn: string): string
export function gameKey(pgn: string): string
