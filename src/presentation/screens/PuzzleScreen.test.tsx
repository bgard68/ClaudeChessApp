import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ServicesProvider } from '../ServicesContext'
import { PuzzleScreen, PuzzleProgress, puzzleFeedback } from './PuzzleScreen'

/*
 * Generating a puzzle needs the engine, and solving one needs clicks — neither
 * happens in a static render, so the screen itself is only reachable in its
 * first state. The logic behind the other states is exported and tested
 * directly below.
 */
const services = {
  services: { rules: {}, archive: {} },
  factory: {},
} as never

describe('PuzzleScreen', () => {
  const markup = renderToStaticMarkup(
    <ServicesProvider value={services}>
      <PuzzleScreen />
    </ServicesProvider>,
  )

  // Composing a mate takes real seconds of engine time. Saying so — and that
  // it is happening on this device — is the difference between waiting and
  // assuming it has hung.
  it('says it is working, and where the work is happening', () => {
    expect(markup).toContain('role="status"')
    expect(markup).toContain('Generating locally')
    expect(markup).toContain('Stockfish is composing')
  })

  it('admits it has not started yet rather than claiming progress', () => {
    expect(markup).toContain('Warming up…')
  })

  it('shows no board and no puzzle until there is one', () => {
    expect(markup).not.toContain('data-square=')
  })
})

describe('puzzleFeedback', () => {
  it('points a solver at the kind of move that works', () => {
    const { message, icon } = puzzleFeedback('solving', 0)
    expect(message).toContain('Checks, captures, and threats')
    expect(icon).toBe('hint')
  })

  // Wrong is not failure — the puzzle is still there to solve, so the wording
  // says what went wrong rather than that you lost.
  it('says what a wrong move cost, and what to look for instead', () => {
    const { message, icon } = puzzleFeedback('wrong', 0)
    expect(message).toContain('lets the mate slip away')
    expect(message).toContain('forcing move')
    expect(icon).toBe('warning')
  })

  it('congratulates a solve', () => {
    expect(puzzleFeedback('solved', 1).message).toContain('Checkmate — solved!')
  })

  // A streak is only worth mentioning once it is a streak: "1 day running"
  // is just today, said pompously.
  it('mentions a streak only once there is more than one day in it', () => {
    expect(puzzleFeedback('solved', 1).message).not.toContain('running')
    expect(puzzleFeedback('solved', 4).message).toContain('4 days running')
  })
})

describe('PuzzleProgress', () => {
  const progress = (props: Parameters<typeof PuzzleProgress>[0]) =>
    renderToStaticMarkup(<PuzzleProgress {...props} />)

  const states = (markup: string) =>
    [...markup.matchAll(/data-state="(\w+)"/g)].map((match) => match[1])

  it('shows one step per move of the combination', () => {
    expect(states(progress({ total: 3, remaining: 3, solved: false }))).toHaveLength(3)
  })

  // Nothing found yet, so the first step is the one being looked for and the
  // rest are still ahead.
  it('points at the first move before anything is found', () => {
    expect(states(progress({ total: 3, remaining: 3, solved: false }))).toEqual([
      'current',
      'upcoming',
      'upcoming',
    ])
  })

  it('advances the pointer as moves are found', () => {
    expect(states(progress({ total: 3, remaining: 1, solved: false }))).toEqual([
      'complete',
      'complete',
      'current',
    ])
    expect(progress({ total: 3, remaining: 1, solved: false })).toContain('2 of 3')
  })

  /*
   * Delivering the mate finishes the combination in one move, so the last
   * step is never counted down to zero the way the earlier ones are. Without
   * this, solving a mate in three leaves the final step showing as unfound.
   */
  it('completes every step on the solving move, not just the counted ones', () => {
    const markup = progress({ total: 3, remaining: 1, solved: true })
    expect(states(markup)).toEqual(['complete', 'complete', 'complete'])
    expect(markup).toContain('Complete')
  })

  it('never counts past the end if more moves arrive than expected', () => {
    expect(states(progress({ total: 2, remaining: 5, solved: false }))).toEqual([
      'current',
      'upcoming',
    ])
  })
})
