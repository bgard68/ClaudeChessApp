import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArchivedGame, RecordedMove } from '@domain/archive/ArchivedGame'
import { Position } from '@domain/chess/Position'
import type { Ticker, TickListener } from '@domain/ports/Ticker'
import { ReplaySession, type ReplayState } from './ReplaySession'

/** Wall time one move occupies at 1× speed, as the session defines it. */
const MS_PER_MOVE = 1_200

/** A ticker a test drives by hand, so five minutes can pass instantly. */
class FakeTicker implements Ticker {
  isRunning = false
  private listener: TickListener | null = null
  readonly stops: number[] = []

  start(onTick: TickListener): void {
    this.isRunning = true
    this.listener = onTick
  }

  stop(): void {
    this.isRunning = false
    this.stops.push(1)
  }

  /** Advances time, as the real ticker would from a frame callback. */
  advance(ms: number): void {
    this.listener?.(ms)
  }
}

const position = (fen: string) => Position.fromFen(fen)

const START = position('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
const AFTER_E4 = position('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')
const AFTER_E5 = position('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2')
const AFTER_NF3 = position('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2')

const MOVES: readonly RecordedMove[] = [
  { ply: 1, color: 'white', san: 'e4', positionBefore: START, positionAfter: AFTER_E4 },
  { ply: 2, color: 'black', san: 'e5', positionBefore: AFTER_E4, positionAfter: AFTER_E5 },
  { ply: 3, color: 'white', san: 'Nf3', positionBefore: AFTER_E5, positionAfter: AFTER_NF3 },
].map((move) => ({ ...move, recordedClockMs: null }) as RecordedMove)

const game = (moves: readonly RecordedMove[] = MOVES): ArchivedGame =>
  ({
    white: 'Fischer',
    black: 'Spassky',
    moves,
    declaredTimeControl: null,
    outcome: { status: 'decisive', winner: 'white', reason: 'resignation' },
  }) as unknown as ArchivedGame

describe('ReplaySession', () => {
  let ticker: FakeTicker
  let session: ReplaySession

  beforeEach(() => {
    ticker = new FakeTicker()
    session = new ReplaySession(ticker, game())
  })

  describe('where it starts', () => {
    it('opens on the position before the first move', () => {
      expect(session.state.ply).toBe(0)
      expect(session.state.position.fen).toBe(START.fen)
      expect(session.state.lastMove).toBeNull()
      expect(session.state.isPlaying).toBe(false)
    })

    it('knows how long the game is', () => {
      expect(session.state.totalPlies).toBe(3)
    })

    // A game with no moves at all must not blow up on the starting position.
    it('survives a game with no moves', () => {
      const empty = new ReplaySession(ticker, game([]))
      expect(empty.state.totalPlies).toBe(0)
      expect(() => empty.state.position.fen).not.toThrow()
    })
  })

  describe('stepping', () => {
    it('shows the position a move produced, not the one before it', () => {
      session.next()
      expect(session.state.ply).toBe(1)
      expect(session.state.position.fen).toBe(AFTER_E4.fen)
      expect(session.state.lastMove?.san).toBe('e4')
    })

    it('goes back the way it came', () => {
      session.goTo(2)
      session.previous()
      expect(session.state.ply).toBe(1)
      expect(session.state.position.fen).toBe(AFTER_E4.fen)
    })

    it('jumps to either end', () => {
      session.last()
      expect(session.state.ply).toBe(3)
      expect(session.state.position.fen).toBe(AFTER_NF3.fen)
      session.first()
      expect(session.state.ply).toBe(0)
    })

    /*
     * Both ends clamp rather than throwing or wrapping. The transport buttons
     * stay enabled at the ends, and a held arrow key sends many more presses
     * than there are moves.
     */
    it('holds at the ends instead of running off them', () => {
      session.previous()
      expect(session.state.ply).toBe(0)

      session.goTo(999)
      expect(session.state.ply).toBe(3)
      session.next()
      expect(session.state.ply).toBe(3)

      session.goTo(-5)
      expect(session.state.ply).toBe(0)
    })
  })

  describe('telling anyone who is listening', () => {
    it('publishes each step', () => {
      const seen: ReplayState[] = []
      session.subscribe((state) => seen.push(state))

      session.next()
      session.next()

      expect(seen.map((state) => state.ply)).toEqual([1, 2])
    })

    // Nothing changed, so nothing is announced: a re-render per ignored click
    // is how a list this long starts to feel slow.
    it('says nothing when a step changes nothing', () => {
      const listener = vi.fn()
      session.subscribe(listener)

      session.first() // already at 0
      session.goTo(0)

      expect(listener).not.toHaveBeenCalled()
    })

    it('stops telling a listener that has unsubscribed', () => {
      const listener = vi.fn()
      const unsubscribe = session.subscribe(listener)
      session.next()
      unsubscribe()
      session.next()

      expect(listener).toHaveBeenCalledTimes(1)
    })
  })

  describe('playing', () => {
    it('starts the ticker and says it is playing', () => {
      session.play()
      expect(ticker.isRunning).toBe(true)
      expect(session.state.isPlaying).toBe(true)
    })

    it('advances a move once enough time has passed', () => {
      session.play()
      ticker.advance(MS_PER_MOVE)
      expect(session.state.ply).toBe(1)
    })

    it('does not advance before a move is due', () => {
      session.play()
      ticker.advance(MS_PER_MOVE - 1)
      expect(session.state.ply).toBe(0)
    })

    /*
     * One tick can cover several moves — a background tab delivers a single
     * large elapsed time when it wakes. Advancing one move per tick would run
     * the replay in slow motion for the rest of the game.
     */
    it('covers several moves when a tick arrives late', () => {
      session.play()
      ticker.advance(MS_PER_MOVE * 2)
      expect(session.state.ply).toBe(2)
    })

    it('runs faster when told to', () => {
      session.setSpeed(2)
      session.play()
      ticker.advance(MS_PER_MOVE)
      expect(session.state.ply).toBe(2)
    })

    it('runs slower too', () => {
      session.setSpeed(0.5)
      session.play()
      ticker.advance(MS_PER_MOVE)
      expect(session.state.ply).toBe(0)
      ticker.advance(MS_PER_MOVE)
      expect(session.state.ply).toBe(1)
    })

    it('pauses on its own at the end of the game', () => {
      session.play()
      ticker.advance(MS_PER_MOVE * 3)

      expect(session.state.ply).toBe(3)
      expect(session.state.isPlaying).toBe(false)
      expect(ticker.isRunning).toBe(false)
    })

    // Pressing play on the final position replays from the start, rather than
    // doing nothing and looking broken.
    it('restarts from the beginning when play is pressed at the end', () => {
      session.last()
      session.play()
      expect(session.state.ply).toBe(0)
      expect(session.state.isPlaying).toBe(true)
    })

    it('stops the ticker when paused', () => {
      session.play()
      session.pause()
      expect(ticker.isRunning).toBe(false)
      expect(session.state.isPlaying).toBe(false)
    })

    it('toggles between the two', () => {
      session.togglePlay()
      expect(session.state.isPlaying).toBe(true)
      session.togglePlay()
      expect(session.state.isPlaying).toBe(false)
    })

    it('ignores play while already playing', () => {
      session.play()
      session.play()
      expect(session.state.isPlaying).toBe(true)
    })
  })

  describe('speed', () => {
    it('starts at normal', () => {
      expect(session.state.speed).toBe(1)
    })

    it('announces a change', () => {
      const listener = vi.fn()
      session.subscribe(listener)
      session.setSpeed(4)
      expect(session.state.speed).toBe(4)
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('says nothing when set to the speed it already runs at', () => {
      const listener = vi.fn()
      session.subscribe(listener)
      session.setSpeed(1)
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('disposal', () => {
    it('stops the ticker and lets its listeners go', () => {
      const listener = vi.fn()
      session.subscribe(listener)
      session.play()
      const beforeDisposal = listener.mock.calls.length

      session.dispose()
      expect(ticker.isRunning).toBe(false)

      // Nothing more reaches the listener, whatever the session is asked to do.
      session.next()
      session.setSpeed(4)
      expect(listener.mock.calls).toHaveLength(beforeDisposal)
    })

    // Leaving the screen twice, or a double-invoked effect cleanup, must not
    // stop a ticker that a newer session has since started.
    it('can be disposed twice without stopping anything again', () => {
      session.dispose()
      const stopsAfterFirst = ticker.stops.length
      session.dispose()
      expect(ticker.stops).toHaveLength(stopsAfterFirst)
    })

    it('refuses to start playing once disposed', () => {
      session.dispose()
      session.play()
      expect(session.state.isPlaying).toBe(false)
      expect(ticker.isRunning).toBe(false)
    })
  })

  describe('the clock beside it', () => {
    // No game here carries recorded times, so every reading is simulated —
    // and the session has to say so rather than pass invention off as record.
    it('reports a simulated clock as simulated', () => {
      expect(session.state.clockSource).toBe('simulated')
      expect(session.clockModelInfo.source).toBe('simulated')
    })

    it('gives a reading for every position', () => {
      session.goTo(2)
      expect(session.state.clock).not.toBeUndefined()
      expect(session.state.clock.source).toBe('simulated')
    })
  })
})
