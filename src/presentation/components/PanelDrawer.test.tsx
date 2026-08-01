import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { PanelDrawer } from './PanelDrawer'

/**
 * Stands in for a browser that answers the phone query one way or the other.
 * `renderToStaticMarkup` has no DOM at all, which is the third case and the
 * one that used to throw.
 */
function pretendViewport(matches: boolean) {
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    value: () => ({ matches, addEventListener() {}, removeEventListener() {} }),
  })
}

const CARD = 'phase2-panel-card phase2-moves-card'

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'matchMedia')
})

describe('PanelDrawer', () => {
  it('is the section it always was above the phone breakpoint', () => {
    pretendViewport(false)

    const markup = renderToStaticMarkup(
      <PanelDrawer className={CARD} title="Move history" note="45 ply">
        <div className="play__moves">1. e4 e5</div>
      </PanelDrawer>,
    )

    // The markup the play and replay panels had before there was a drawer at
    // all: the same element, the same classes, the same title row. A change
    // here is a change to the desktop, which this component exists not to be.
    expect(markup).toContain(`<section class="${CARD}">`)
    expect(markup).toContain('<div class="phase2-section-title">')
    expect(markup).toContain('<span>Move history</span>')
    expect(markup).toContain('<small>45 ply</small>')
    expect(markup).not.toContain('<details')
  })

  it('is a closed drawer on a phone', () => {
    pretendViewport(true)

    const markup = renderToStaticMarkup(
      <PanelDrawer className={CARD} title="Move history" note="45 ply">
        <div className="play__moves">1. e4 e5</div>
      </PanelDrawer>,
    )

    expect(markup).toContain('<details')
    expect(markup).toContain('panel-drawer')
    expect(markup).toContain('<summary')
    // Closed, or collapsing it buys a chevron and no room back.
    expect(markup).not.toContain('open=""')
  })

  it('renders where there is no browser to ask', () => {
    // No stub: this is the static-markup path, and it must not throw.
    expect(() =>
      renderToStaticMarkup(
        <PanelDrawer className={CARD} title="Move history" note="0 ply">
          <div className="play__moves" />
        </PanelDrawer>,
      ),
    ).not.toThrow()
  })
})
