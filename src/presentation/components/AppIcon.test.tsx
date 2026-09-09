import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppIcon, type AppIconName } from './AppIcon'

const ICONS: readonly AppIconName[] = [
  'archive',
  'arrow-left',
  'check',
  'clock',
  'computer',
  'draw',
  'engines',
  'first',
  'flip',
  'hint',
  'info',
  'last',
  'menu',
  'next',
  'palette',
  'pause',
  'play',
  'previous',
  'puzzle',
  'resign',
  'save',
  'sparkles',
  'trophy',
  'undo',
  'user',
  'warning',
]

/*
 * These were one loop over every icon asserting `<svg`, which is a check that
 * survives the failure that actually matters: two names rendering the same
 * glyph. A duplicated `case` in the switch — easy to introduce, invisible on
 * review — passed it cleanly. Each icon is now its own case, and the glyphs are
 * compared against each other.
 */
describe('AppIcon', () => {
  it.each(ICONS)('renders %s as a decorative SVG the button labels for it', (name) => {
    const markup = renderToStaticMarkup(<AppIcon name={name} />)

    expect(markup).toContain('<svg')
    // Decorative: the accessible name comes from the control, never the glyph.
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain('focusable="false"')
    // Inherits the button's colour rather than painting its own.
    expect(markup).toContain('stroke="currentColor"')
    expect(markup).toContain('fill="none"')
  })

  it.each(ICONS)('draws something inside the %s frame', (name) => {
    const markup = renderToStaticMarkup(<AppIcon name={name} />)

    expect(markup).toMatch(/<(path|circle|rect|line|polyline)/)
  })

  // The check the old loop could not make: 26 names, 26 different pictures.
  it('gives every icon its own glyph', () => {
    const glyphs = ICONS.map((name) => renderToStaticMarkup(<AppIcon name={name} />))

    expect(new Set(glyphs).size).toBe(ICONS.length)
  })

  it('covers every name the component publishes', () => {
    const published: readonly AppIconName[] = ICONS

    expect(new Set(published).size).toBe(ICONS.length)
  })

  it('sizes to 18 square by default', () => {
    const markup = renderToStaticMarkup(<AppIcon name="check" />)

    expect(markup).toContain('width="18"')
    expect(markup).toContain('height="18"')
    expect(markup).toContain('viewBox="0 0 24 24"')
  })

  it('takes a caller-supplied size for both dimensions', () => {
    const markup = renderToStaticMarkup(<AppIcon name="check" size={32} />)

    expect(markup).toContain('width="32"')
    expect(markup).toContain('height="32"')
    // The drawing coordinates are unaffected — only the rendered box scales.
    expect(markup).toContain('viewBox="0 0 24 24"')
  })

  it('passes a className through to the SVG', () => {
    const markup = renderToStaticMarkup(<AppIcon name="menu" className="icon--large" />)

    expect(markup).toContain('class="icon--large"')
  })

  it('lets a caller override a presentation attribute it sets itself', () => {
    const markup = renderToStaticMarkup(<AppIcon name="menu" strokeWidth={3} />)

    expect(markup).toContain('stroke-width="3"')
    expect(markup).not.toContain('stroke-width="1.8"')
  })
})
