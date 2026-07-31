import { describe, expect, it } from 'vitest'
import { foldName } from './foldName'

/*
 * Both name lookups match against ASCII tables — the curated federation list
 * is hand-written that way, and the shipped FIDE directory has 120 keys with
 * no accented character among them. So folding is what lets a PGN spelled
 * "Ljubojević" find the row filed under "ljubojevic".
 */
describe('foldName', () => {
  it('lower-cases, so spelling in capitals changes nothing', () => {
    expect(foldName('CARLSEN')).toBe('carlsen')
  })

  it.each([
    ['acute', 'Réti', 'reti'],
    ['grave', 'Èvora', 'evora'],
    ['circumflex', 'Côté', 'cote'],
    ['caron', 'Ljubojević', 'ljubojevic'],
    ['umlaut', 'Nybäck', 'nyback'],
    ['cedilla', 'Françoise', 'francoise'],
    ['ring', 'Ångström', 'angstrom'],
    ['double acute', 'Erdős', 'erdos'],
  ])('folds %s to the base letter', (_accent, name, expected) => {
    expect(foldName(name)).toBe(expected)
  })

  /*
   * NFD splits an accented letter into base plus mark, but a letter with a
   * stroke through it has no such split — it is one indivisible character.
   * Without these it would survive the fold and match nothing.
   */
  it.each([
    ['a stroked D', 'Đurić', 'duric'],
    ['a stroked O', 'Bjørn', 'bjorn'],
    ['a stroked L', 'Łukasz', 'lukasz'],
    ['a dotless i', 'Işık', 'isik'],
  ])('folds %s, which NFD cannot split', (_kind, name, expected) => {
    expect(foldName(name)).toBe(expected)
  })

  // Ligatures stand for two letters, so they fold to two.
  it.each([
    ['Æther', 'aether'],
    ['Œuvre', 'oeuvre'],
    ['Straße', 'strasse'],
  ])('expands the ligature in %s', (name, expected) => {
    expect(foldName(name)).toBe(expected)
  })

  /*
   * Everything that is not an accent is left exactly as it was. This folds
   * letters; deciding what counts as punctuation is each caller's own job,
   * and they disagree — one keeps hyphens, the other does not.
   */
  it('leaves the structure of the name alone', () => {
    expect(foldName('Vachier-Lagrave, Maxime')).toBe('vachier-lagrave, maxime')
    expect(foldName('Fischer, Robert James')).toBe('fischer, robert james')
    expect(foldName("O'Kelly de Galway, Alberic")).toBe("o'kelly de galway, alberic")
  })

  it('has nothing to do to a name already in ASCII', () => {
    expect(foldName('carlsen, magnus')).toBe('carlsen, magnus')
    expect(foldName('')).toBe('')
  })

  // Folding twice must not change anything the first pass settled.
  it('is stable when applied again', () => {
    const once = foldName('Ljubojević, Ljubomir')
    expect(foldName(once)).toBe(once)
  })
})
