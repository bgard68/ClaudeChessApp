import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

const render = (markup: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(markup)

describe('AppShell', () => {
  it('anchors the skip link to a focusable main region', () => {
    const markup = render(
      <AppShell active="setup" onNavigate={vi.fn()}>
        <p>content</p>
      </AppShell>,
    )

    // A skip link that points at nothing is worse than no skip link: it reads
    // as an accessibility affordance while stranding the keyboard user.
    expect(markup).toContain('href="#main-content"')
    expect(markup).toContain('id="main-content"')
    expect(markup).toContain('tabindex="-1"')
  })

  it('marks exactly one navigation item as the current page', () => {
    const markup = render(
      <AppShell active="archive" onNavigate={vi.fn()}>
        <p>content</p>
      </AppShell>,
    )

    expect(markup.match(/aria-current="page"/g)).toHaveLength(1)
    // The current item is the one named for the active target, not merely the
    // first that happens to render.
    expect(markup).toContain('aria-current="page" aria-label="Browse championships"')
  })

  it.each([
    ['setup', 'Play'],
    ['puzzle', 'Puzzle of the day'],
    ['archive', 'Browse championships'],
  ] as const)('titles the %s screen "%s" by default', (active, title) => {
    const markup = render(
      <AppShell active={active} onNavigate={vi.fn()}>
        <p>content</p>
      </AppShell>,
    )

    expect(markup).toContain(`<p class="app-topbar__title">${title}</p>`)
  })

  it('lets the caller override the title and context', () => {
    const markup = render(
      <AppShell active="setup" onNavigate={vi.fn()} title="Live play" context="Round 3">
        <p>content</p>
      </AppShell>,
    )

    expect(markup).toContain('<p class="app-topbar__title">Live play</p>')
    expect(markup).toContain('<p class="app-topbar__eyebrow">Round 3</p>')
    // Only the eyebrow is overridden. The brand keeps its own tagline, which
    // is the same string by coincidence rather than by wiring.
    expect(markup).not.toContain('<p class="app-topbar__eyebrow">Local chess studio</p>')
    expect(markup).toContain('<small>Local chess studio</small>')
  })

  it('renders the screen it is given', () => {
    const markup = render(
      <AppShell active="setup" onNavigate={vi.fn()}>
        <p>the screen</p>
      </AppShell>,
    )

    expect(markup).toContain('<p>the screen</p>')
  })
})
