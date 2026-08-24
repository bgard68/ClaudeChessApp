import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { GameFactory } from '@composition/GameFactory'
import type { AppServices } from '@composition/services'
import { ServicesProvider, useServices } from './ServicesContext'

// The provider's fallback path composes the real services, whose SQLite and
// engine adapters would spawn Workers here. The composition root is under its
// own test; this file only needs to see the provider reach for it.
const fakeServices = {
  rules: null,
  archive: null,
  store: null,
  createTicker: () => null,
  createEngine: () => null,
} as unknown as AppServices

vi.mock('@composition/services', () => ({
  getAppServices: vi.fn(() => fakeServices),
}))

function Probe() {
  const { services, factory } = useServices()
  return <span>{factory instanceof GameFactory && services !== undefined ? 'ok' : 'broken'}</span>
}

describe('ServicesProvider', () => {
  it('composes the app services when no stand-in is given', () => {
    expect(renderToString(<ServicesProvider><Probe /></ServicesProvider>)).toContain('ok')
  })

  it('hands an injected stand-in through untouched', () => {
    const value = { services: fakeServices, factory: new GameFactory(fakeServices) }

    function Same() {
      return <span>{useServices().factory === value.factory ? 'same' : 'different'}</span>
    }

    expect(
      renderToString(
        <ServicesProvider value={value}>
          <Same />
        </ServicesProvider>,
      ),
    ).toContain('same')
  })
})

describe('useServices', () => {
  it('refuses to run outside a provider', () => {
    expect(() => renderToString(<Probe />)).toThrow('useServices must be used inside a <ServicesProvider>')
  })
})
