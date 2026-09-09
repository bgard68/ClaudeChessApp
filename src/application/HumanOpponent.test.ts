import { describe, expect, it, vi } from 'vitest'
import type { LegalMove } from '@domain/chess/Move'
import type { Position } from '@domain/chess/Position'
import type { ClockSnapshot } from '@domain/clock/Clock'
import { HumanOpponent } from './HumanOpponent'
import { MoveRequestAbandoned, type MoveRequest } from './Opponent'

/*
 * The turn loop cannot tell a person from an engine, which is the whole point
 * of the `Opponent` port — so everything that makes a person different lives
 * here: a promise that stays pending until the board reports a drag, a refusal
 * for anything illegal, and the promotion choice a single square cannot express.
 */

const legal = (overrides: Partial<LegalMove> & Pick<LegalMove, 'from' | 'to'>): LegalMove => ({
  san: 'e4',
  piece: 'pawn',
  isCapture: false,
  isPromotion: false,
  ...overrides,
})

/** The four moves the rules offer for one pawn reaching the last rank. */
const PROMOTION_CANDIDATES: readonly LegalMove[] = [
  legal({ from: 'b7', to: 'b8', promotion: 'queen', san: 'b8=Q', isPromotion: true }),
  legal({ from: 'b7', to: 'b8', promotion: 'rook', san: 'b8=R', isPromotion: true }),
  legal({ from: 'b7', to: 'b8', promotion: 'bishop', san: 'b8=B', isPromotion: true }),
  legal({ from: 'b7', to: 'b8', promotion: 'knight', san: 'b8=N', isPromotion: true }),
]

const ORDINARY_MOVES: readonly LegalMove[] = [
  legal({ from: 'e2', to: 'e4' }),
  legal({ from: 'd2', to: 'd4', san: 'd4' }),
]

const requestFor = (legalMoves: readonly LegalMove[]): MoveRequest => ({
  position: { fen: 'irrelevant' } as Position,
  legalMoves,
  clock: {} as ClockSnapshot,
})

/** Keeps an abandoned request from surfacing as an unhandled rejection. */
const swallow = (promise: Promise<unknown>): Promise<unknown> => promise.catch(() => undefined)

describe('HumanOpponent.requestMove', () => {
  it('requestMove_BeforeAnyMoveIsOffered_LeavesThePromisePending', async () => {
    const player = new HumanOpponent()
    const settled = vi.fn()

    void player.requestMove(requestFor(ORDINARY_MOVES)).then(settled, settled)
    await Promise.resolve()

    expect(settled).not.toHaveBeenCalled()
    expect(player.isAwaitingMove).toBe(true)
  })

  it('requestMove_SecondRequestWhileOneIsPending_AbandonsTheFirst', async () => {
    const player = new HumanOpponent()
    const first = player.requestMove(requestFor(ORDINARY_MOVES))

    void swallow(player.requestMove(requestFor(ORDINARY_MOVES)))

    await expect(first).rejects.toThrow(MoveRequestAbandoned)
    expect(player.isAwaitingMove).toBe(true)
  })

  it('requestMove_NewRequest_ReplacesTheLegalMovesTheOldOneAllowed', async () => {
    const player = new HumanOpponent()
    void swallow(player.requestMove(requestFor(ORDINARY_MOVES)))

    void swallow(player.requestMove(requestFor([legal({ from: 'g1', to: 'f3', san: 'Nf3' })])))

    expect(player.offerMove({ from: 'e2', to: 'e4' })).toBe(false)
    expect(player.offerMove({ from: 'g1', to: 'f3' })).toBe(true)
  })
})

describe('HumanOpponent.offerMove', () => {
  it('offerMove_LegalMove_ResolvesTheRequestWithThatMove', async () => {
    const player = new HumanOpponent()
    const pending = player.requestMove(requestFor(ORDINARY_MOVES))

    const accepted = player.offerMove({ from: 'd2', to: 'd4' })

    expect(accepted).toBe(true)
    await expect(pending).resolves.toEqual({ from: 'd2', to: 'd4', promotion: undefined })
    expect(player.isAwaitingMove).toBe(false)
  })

  it('offerMove_NoMoveIsBeingAwaited_RefusesWithoutThrowing', () => {
    const player = new HumanOpponent()

    const accepted = player.offerMove({ from: 'e2', to: 'e4' })

    expect(accepted).toBe(false)
  })

  it.each([
    ['the move is not in the legal list', { from: 'a7', to: 'a5' }],
    ['only the destination matches', { from: 'e7', to: 'e4' }],
    ['only the origin matches', { from: 'e2', to: 'e5' }],
  ] as const)('offerMove_%s_RefusesWithoutThrowing', (_case, intent) => {
    const player = new HumanOpponent()
    void swallow(player.requestMove(requestFor(ORDINARY_MOVES)))

    const accepted = player.offerMove(intent)

    expect(accepted).toBe(false)
  })

  it('offerMove_AfterTheRequestIsAlreadyAnswered_RefusesTheSecondMove', async () => {
    const player = new HumanOpponent()
    const pending = player.requestMove(requestFor(ORDINARY_MOVES))
    player.offerMove({ from: 'e2', to: 'e4' })

    const second = player.offerMove({ from: 'd2', to: 'd4' })

    expect(second).toBe(false)
    await expect(pending).resolves.toEqual({ from: 'e2', to: 'e4', promotion: undefined })
  })

  it('offerMove_MoveOfferedAfterCancel_IsRefused', async () => {
    const player = new HumanOpponent()
    const pending = swallow(player.requestMove(requestFor(ORDINARY_MOVES)))
    player.cancel()

    const accepted = player.offerMove({ from: 'e2', to: 'e4' })

    expect(accepted).toBe(false)
    await pending
  })
})

/*
 * A pawn reaching the last rank makes from/to ambiguous — four legal moves
 * share both squares. Resolving that by picking a queen would silently
 * overrule a player who wanted a knight, so the move is refused until the
 * choice arrives.
 */
describe('HumanOpponent.offerMove promotion', () => {
  it('offerMove_PromotionWithNoPieceChosen_RefusesTheAmbiguousMove', () => {
    const player = new HumanOpponent()
    void swallow(player.requestMove(requestFor(PROMOTION_CANDIDATES)))

    const accepted = player.offerMove({ from: 'b7', to: 'b8' })

    expect(accepted).toBe(false)
    expect(player.isAwaitingMove).toBe(true)
  })

  it('offerMove_PromotionToKnight_ResolvesWithTheKnightNotTheQueen', async () => {
    const player = new HumanOpponent()
    const pending = player.requestMove(requestFor(PROMOTION_CANDIDATES))

    const accepted = player.offerMove({ from: 'b7', to: 'b8', promotion: 'knight' })

    expect(accepted).toBe(true)
    await expect(pending).resolves.toEqual({ from: 'b7', to: 'b8', promotion: 'knight' })
  })

  it('offerMove_PromotionToAPieceTheRulesDidNotOffer_Refuses', () => {
    const player = new HumanOpponent()
    void swallow(
      player.requestMove(
        requestFor([
          legal({ from: 'b7', to: 'b8', promotion: 'queen', san: 'b8=Q', isPromotion: true }),
        ]),
      ),
    )

    const accepted = player.offerMove({ from: 'b7', to: 'b8', promotion: 'rook' })

    expect(accepted).toBe(false)
  })

  /*
   * The reverse case: an ordinary move carrying a stray promotion field. The
   * board sends one whenever a promotion dialog was open, and refusing here
   * would reject a perfectly legal move.
   */
  it('offerMove_OrdinaryMoveCarryingAStrayPromotion_IgnoresTheStrayField', async () => {
    const player = new HumanOpponent()
    const pending = player.requestMove(requestFor(ORDINARY_MOVES))

    const accepted = player.offerMove({ from: 'e2', to: 'e4', promotion: 'queen' })

    expect(accepted).toBe(true)
    await expect(pending).resolves.toEqual({ from: 'e2', to: 'e4', promotion: undefined })
  })
})

describe('HumanOpponent lifecycle', () => {
  it('cancel_WithARequestInFlight_RejectsItAsAbandoned', async () => {
    const player = new HumanOpponent()
    const pending = player.requestMove(requestFor(ORDINARY_MOVES))

    player.cancel()

    await expect(pending).rejects.toThrow(MoveRequestAbandoned)
    expect(player.isAwaitingMove).toBe(false)
  })

  it('cancel_WithNothingInFlight_DoesNothing', () => {
    const player = new HumanOpponent()

    const cancelling = () => player.cancel()

    expect(cancelling).not.toThrow()
    expect(player.isAwaitingMove).toBe(false)
  })

  it('dispose_WithARequestInFlight_AbandonsItToo', async () => {
    const player = new HumanOpponent()
    const pending = player.requestMove(requestFor(ORDINARY_MOVES))

    player.dispose()

    await expect(pending).rejects.toThrow(MoveRequestAbandoned)
  })

  it('constructor_NoNameGiven_IdentifiesTheSeatAsAHumanCalledPlayer', () => {
    const player = new HumanOpponent()

    expect(player.kind).toBe('human')
    expect(player.name).toBe('Player')
  })

  it('constructor_NameGiven_UsesItForTheSeat', () => {
    const player = new HumanOpponent('Bobby')

    expect(player.name).toBe('Bobby')
  })
})
