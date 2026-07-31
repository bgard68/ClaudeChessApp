import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Credits } from './Credits'

const markup = renderToStaticMarkup(<Credits />)

describe('Credits', () => {
  it('starts collapsed, and says so', () => {
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('Credits and licences')
    // The body is not merely hidden — it is not rendered at all.
    expect(markup).not.toContain('credits__body')
  })
})

/*
 * The panel body only exists once the toggle is pressed, and these tests render
 * to static markup rather than driving a DOM. So this reads the source.
 *
 * That is a weaker test than rendering the open panel, and it is here anyway,
 * because what it guards is an obligation rather than a behaviour: the app
 * serves Stockfish — GPL-3.0 — to every visitor, and attribution with a licence
 * link is the condition of doing so. The bundled collections are other people's
 * assembled work too.
 *
 * The failure mode is silence. Nobody notices missing attribution the way they
 * notice a broken board, and the component renders perfectly well without it.
 */
describe('the attribution the licences require', () => {
  const source = readFileSync(new URL('./Credits.tsx', import.meta.url), 'utf8')

  it.each([
    ['Stockfish, by name', 'Stockfish'],
    ['a link to the GPL text the app ships', '/engine/LICENSE-stockfish.txt'],
    ['that it is redistributed unmodified', 'redistributed unmodified'],
    ['the championship dataset', 'Chess-Dataset'],
    ['where the famous games came from', 'pgnmentor.com'],
    ['where federations came from', 'ratings.fide.com'],
  ])('credits %s', (_what, needle) => {
    expect(source).toContain(needle)
  })

  it('disclaims affiliation rather than implying endorsement', () => {
    expect(source).toContain('Not affiliated')
  })
})
