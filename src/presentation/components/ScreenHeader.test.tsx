import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ScreenHeader } from './ScreenHeader'

describe('ScreenHeader', () => {
  it('renders the shared page semantics without owning navigation', () => {
    const markup = renderToStaticMarkup(
      <ScreenHeader
        kicker="Training"
        title="Puzzle of the day"
        description="Find the continuation."
        onBack={vi.fn()}
        backLabel="Back to play"
        metrics={<span>3 day streak</span>}
        actions={<button type="button">Start over</button>}
      />,
    )

    expect(markup).toContain('<header class="screen-header">')
    expect(markup).toContain('<h1>Puzzle of the day</h1>')
    expect(markup).toContain('Back to play')
    expect(markup).toContain('3 day streak')
    expect(markup).toContain('Start over')
  })
})
