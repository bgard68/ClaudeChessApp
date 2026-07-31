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

describe('AppIcon', () => {
  it('renders every published icon as decorative SVG', () => {
    for (const name of ICONS) {
      const markup = renderToStaticMarkup(<AppIcon name={name} />)
      expect(markup).toContain('<svg')
      expect(markup).toContain('aria-hidden="true"')
      expect(markup).toContain('stroke="currentColor"')
    }
  })
})
