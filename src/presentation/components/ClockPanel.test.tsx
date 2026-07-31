import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ClockPanel } from './ClockPanel'

const panel = (props: Partial<Parameters<typeof ClockPanel>[0]> = {}) =>
  renderToStaticMarkup(
    <ClockPanel
      whiteMs={300_000}
      blackMs={300_000}
      activeColor="white"
      orientation="white"
      whiteName="Carlsen"
      blackName="Nepomniachtchi"
      {...props}
    />,
  )

/** Which name is written first in the markup — the top of the board. */
const topName = (markup: string) =>
  markup.indexOf('Carlsen') < markup.indexOf('Nepomniachtchi') ? 'Carlsen' : 'Nepomniachtchi'

describe('ClockPanel', () => {
  // The opponent sits across the board from you, so their clock has to sit
  // across the panel from yours. Getting this backwards puts your own clock
  // where you look for theirs.
  it('puts the opponent on top when you play White', () => {
    expect(topName(panel({ orientation: 'white' }))).toBe('Nepomniachtchi')
  })

  it('flips both when you play Black', () => {
    expect(topName(panel({ orientation: 'black' }))).toBe('Carlsen')
  })

  it('marks only the side to move as active', () => {
    const markup = panel({ activeColor: 'black' })
    expect(markup.match(/clock-face--active/g)).toHaveLength(1)
    const active = markup.slice(0, markup.indexOf('clock-face--active'))
    expect(active).toContain('clock-face--black')
  })

  it('marks neither side while the game is not running', () => {
    expect(panel({ activeColor: null })).not.toContain('clock-face--active')
  })

  // Thirty seconds is where the reading stops being informational and starts
  // being urgent, and the styling is the only thing that says so.
  it('flags a clock at or under thirty seconds as low', () => {
    expect(panel({ whiteMs: 30_000 })).toContain('clock-face--low')
    expect(panel({ whiteMs: 30_001 })).not.toContain('clock-face--low')
  })

  it('flags each side independently', () => {
    const markup = panel({ whiteMs: 5_000, blackMs: 600_000 })
    expect(markup.match(/clock-face--low/g)).toHaveLength(1)
  })

  // An untimed game has no reading to give. Zero would be a lie — it means
  // flag fall — so the display must not treat absent as empty.
  it('does not call an untimed clock low', () => {
    expect(panel({ whiteMs: null, blackMs: null })).not.toContain('clock-face--low')
  })

  it('shows the provenance note only when there is one', () => {
    expect(panel({ note: 'Simulated' })).toContain('Simulated')
    expect(panel({ note: null })).not.toContain('clock-note')
  })
})
