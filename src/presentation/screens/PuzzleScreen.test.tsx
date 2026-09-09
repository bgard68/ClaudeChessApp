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
  it('PuzzleScreen_Generating_SaysSoAndWhereTheWorkHappens', () => {
    expect(markup).toContain('role="status"')
    expect(markup).toContain('Generating locally')
    expect(markup).toContain('Stockfish is composing')
  })

  it('PuzzleScreen_NotStartedYet_AdmitsItRatherThanClaimingProgress', () => {
    expect(markup).toContain('Warming up…')
  })

  it('PuzzleScreen_NoPuzzleYet_ShowsNoBoard', () => {
    expect(markup).not.toContain('data-square=')
  })
})

describe('puzzleFeedback', () => {
  it('PuzzleScreen_Hint_PointsAtTheKindOfMoveThatWorks', () => {
    const { message, icon } = puzzleFeedback('solving', 0)
    expect(message).toContain('Checks, captures, and threats')
    expect(icon).toBe('hint')
  })

  // Wrong is not failure — the puzzle is still there to solve, so the wording
  // says what went wrong rather than that you lost.
  it('PuzzleScreen_WrongMove_SaysWhatItCostAndWhatToLookFor', () => {
    const { message, icon } = puzzleFeedback('wrong', 0)
    expect(message).toContain('lets the mate slip away')
    expect(message).toContain('forcing move')
    expect(icon).toBe('warning')
  })

  it('PuzzleScreen_Solved_Congratulates', () => {
    expect(puzzleFeedback('solved', 1).message).toContain('Checkmate — solved!')
  })

  // A streak is only worth mentioning once it is a streak: "1 day running"
  // is just today, said pompously.
  it('PuzzleScreen_Streak_IsMentionedOnlyPastOneDay', () => {
    expect(puzzleFeedback('solved', 1).message).not.toContain('running')
    expect(puzzleFeedback('solved', 4).message).toContain('4 days running')
  })
})

describe('PuzzleProgress', () => {
  const progress = (props: Parameters<typeof PuzzleProgress>[0]) =>
    renderToStaticMarkup(<PuzzleProgress {...props} />)

  const states = (markup: string) =>
    [...markup.matchAll(/data-state="(\w+)"/g)].map((match) => match[1])

  it('PuzzleScreen_Steps_ShowOnePerMoveOfTheCombination', () => {
    expect(states(progress({ total: 3, remaining: 3, solved: false }))).toHaveLength(3)
  })

  // Nothing found yet, so the first step is the one being looked for and the
  // rest are still ahead.
  it('PuzzleScreen_BeforeAnythingIsFound_PointsAtTheFirstMove', () => {
    expect(states(progress({ total: 3, remaining: 3, solved: false }))).toEqual([
      'current',
      'upcoming',
      'upcoming',
    ])
  })

  it('PuzzleScreen_MovesFound_AdvanceThePointer', () => {
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
  it('PuzzleScreen_SolvingMove_CompletesEveryStepNotJustTheCounted', () => {
    const markup = progress({ total: 3, remaining: 1, solved: true })
    expect(states(markup)).toEqual(['complete', 'complete', 'complete'])
    expect(markup).toContain('Complete')
  })

  it('PuzzleScreen_MoreMovesThanExpected_NeverCountsPastTheEnd', () => {
    expect(states(progress({ total: 2, remaining: 5, solved: false }))).toEqual([
      'current',
      'upcoming',
    ])
  })
})
