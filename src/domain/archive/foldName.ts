/**
 * Folds a player's name to plain ASCII letters.
 *
 * Both name lookups in the app match against ASCII tables — the curated
 * federation list is hand-written that way, and the FIDE directory ships 120
 * keys with no accented character among them. PGN files are under no such
 * discipline: the same player is "Ljubojevic" in one collection and
 * "Ljubojević" in another.
 *
 * Before this existed, each lookup dealt with the difference by throwing the
 * accented letter away — one deleted it, the other turned it into a space —
 * so "Ljubojević" matched nothing at all under either. Folding to the base
 * letter is what makes the two spellings the same name.
 */

/**
 * Latin letters with no canonical decomposition, so NFD leaves them intact.
 *
 * The accents NFD does handle — acute, grave, circumflex, caron, umlaut,
 * cedilla, ring — cover most of chess. These are the strokes and ligatures it
 * cannot, and they are not rare in the names this library holds: Ólafsson
 * decomposes, Đurić does not.
 */
const INDIVISIBLE: Readonly<Record<string, string>> = {
  'đ': 'd', // đ
  'ð': 'd', // ð
  'ø': 'o', // ø
  'ł': 'l', // ł
  'ħ': 'h', // ħ
  'ŧ': 't', // ŧ
  'ı': 'i', // ı
  'æ': 'ae', // æ
  'œ': 'oe', // œ
  'ß': 'ss', // ß
  'þ': 'th', // þ
}

/** Combining marks, which is what NFD leaves behind once it has split a letter. */
const COMBINING_MARKS = /[̀-ͯ]/g

const INDIVISIBLE_LETTERS = /[đðøłħŧıæœßþ]/g

export function foldName(name: string): string {
  return name
    .toLowerCase()
    // Splits an accented letter into its base plus a combining mark…
    .normalize('NFD')
    // …which is then dropped, leaving the base letter behind.
    .replace(COMBINING_MARKS, '')
    .replace(INDIVISIBLE_LETTERS, (character) => INDIVISIBLE[character] ?? character)
}
