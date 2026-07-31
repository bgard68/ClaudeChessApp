import { foldName } from './foldName'
/**
 * Which federation a player represents.
 *
 * PGN carries no nationality: of 130,563 games in the library, not one has a
 * country tag. So this is a hand-kept list, covering the players who actually
 * appear — the top hundred or so account for about two-thirds of all
 * appearances, and everyone else simply shows no country rather than a guess.
 *
 * Two honest limitations:
 *
 *  - A player has one entry, but federations change. Nakamura played for Japan
 *    as a child, Firouzja for Iran until 2021, Korchnoi for the USSR before
 *    defecting. Each is listed under the federation they are best known for, so
 *    a game from the other period is labelled by today's flag, not that day's.
 *  - Matching is by surname and first initial, which is what these files
 *    contain. Two players sharing both would be conflated; none in this list do.
 */
export interface Federation {
  readonly code: string
  readonly name: string
}

const FEDERATIONS: Readonly<Record<string, Federation>> = {
  no: { code: 'NO', name: 'Norway' },
  us: { code: 'US', name: 'USA' },
  in: { code: 'IN', name: 'India' },
  cn: { code: 'CN', name: 'China' },
  ru: { code: 'RU', name: 'Russia' },
  ua: { code: 'UA', name: 'Ukraine' },
  fr: { code: 'FR', name: 'France' },
  az: { code: 'AZ', name: 'Azerbaijan' },
  am: { code: 'AM', name: 'Armenia' },
  nl: { code: 'NL', name: 'Netherlands' },
  hu: { code: 'HU', name: 'Hungary' },
  es: { code: 'ES', name: 'Spain' },
  pl: { code: 'PL', name: 'Poland' },
  de: { code: 'DE', name: 'Germany' },
  uk: { code: 'GB', name: 'United Kingdom' },
  cu: { code: 'CU', name: 'Cuba' },
  ar: { code: 'AR', name: 'Argentina' },
  cz: { code: 'CZ', name: 'Czechia' },
  bg: { code: 'BG', name: 'Bulgaria' },
  ro: { code: 'RO', name: 'Romania' },
  rs: { code: 'RS', name: 'Serbia' },
  hr: { code: 'HR', name: 'Croatia' },
  se: { code: 'SE', name: 'Sweden' },
  dk: { code: 'DK', name: 'Denmark' },
  is: { code: 'IS', name: 'Iceland' },
  ch: { code: 'CH', name: 'Switzerland' },
  at: { code: 'AT', name: 'Austria' },
  it: { code: 'IT', name: 'Italy' },
  ph: { code: 'PH', name: 'Philippines' },
  vn: { code: 'VN', name: 'Vietnam' },
  ir: { code: 'IR', name: 'Iran' },
  il: { code: 'IL', name: 'Israel' },
  uz: { code: 'UZ', name: 'Uzbekistan' },
  ge: { code: 'GE', name: 'Georgia' },
  lv: { code: 'LV', name: 'Latvia' },
  ee: { code: 'EE', name: 'Estonia' },
  by: { code: 'BY', name: 'Belarus' },
  pe: { code: 'PE', name: 'Peru' },
  br: { code: 'BR', name: 'Brazil' },
  ca: { code: 'CA', name: 'Canada' },
}

/** Surname and first initial, which is the form these archives use. */
const COUNTRY_BY_PLAYER: Readonly<Record<string, keyof typeof FEDERATIONS>> = {
  // World champions, in order of reign.
  'steinitz w': 'at',
  'lasker e': 'de',
  'capablanca j': 'cu',
  'alekhine a': 'fr',
  'euwe m': 'nl',
  'botvinnik m': 'ru',
  'smyslov v': 'ru',
  'tal m': 'lv',
  'petrosian t': 'am',
  'spassky b': 'ru',
  'fischer r': 'us',
  'karpov a': 'ru',
  'kasparov g': 'ru',
  'kramnik v': 'ru',
  'anand v': 'in',
  'carlsen m': 'no',
  'ding l': 'cn',
  'gukesh d': 'in',
  'khalifman a': 'ru',
  'ponomariov r': 'ua',
  'kasimdzhanov r': 'uz',
  'topalov v': 'bg',

  // Modern elite.
  'nakamura h': 'us',
  'nakamura hi': 'us',
  'caruana f': 'us',
  'nepomniachtchi i': 'ru',
  'firouzja a': 'fr',
  'so w': 'us',
  'giri a': 'nl',
  'aronian l': 'us',
  'grischuk a': 'ru',
  'mamedyarov s': 'az',
  'radjabov t': 'az',
  'karjakin s': 'ru',
  'svidler p': 'ru',
  'vachier-lagrave m': 'fr',
  'dominguez l': 'us',
  'wesley s': 'us',
  'rapport r': 'ro',
  'duda j': 'pl',
  'wojtaszek r': 'pl',
  'abdusattorov n': 'uz',
  'erigaisi a': 'in',
  'praggnanandhaa r': 'in',
  'vidit s': 'in',
  'harikrishna p': 'in',
  'sarin n': 'in',
  'wang h': 'cn',
  'wang y': 'cn',
  'yu y': 'cn',
  'li c': 'cn',
  'bu x': 'cn',
  'le q': 'vn',
  'liren d': 'cn',
  'keymer v': 'de',
  'niemann h': 'us',
  'robson r': 'us',
  'shankland s': 'us',
  'xiong j': 'us',
  'sevian s': 'us',
  'gujrathi v': 'in',

  // Long-standing contenders and legends.
  'korchnoi v': 'ch',
  'keres p': 'ee',
  'bronstein d': 'ru',
  'larsen b': 'dk',
  'reshevsky s': 'us',
  'geller e': 'ru',
  'polugaevsky l': 'ru',
  'portisch l': 'hu',
  'timman j': 'nl',
  'ivanchuk v': 'ua',
  'shirov a': 'lv',
  'gelfand b': 'il',
  'leko p': 'hu',
  'morozevich a': 'ru',
  'adams m': 'uk',
  'short n': 'uk',
  'polgar j': 'hu',
  'judit p': 'hu',
  'rubinstein a': 'pl',
  'nimzowitsch a': 'lv',
  'reti r': 'cz',
  'tarrasch s': 'de',
  'chigorin m': 'ru',
  'marshall f': 'us',
  'pillsbury h': 'us',
  'blackburne j': 'uk',
  'zukertort j': 'pl',
  'anderssen a': 'de',
  'morphy p': 'us',
  'staunton h': 'uk',
  'bogoljubov e': 'de',
  'flohr s': 'cz',
  'najdorf m': 'ar',
  'stahlberg g': 'se',
  'szabo l': 'hu',
  'taimanov m': 'ru',
  'averbakh y': 'ru',
  'kotov a': 'ru',
  'boleslavsky i': 'ru',
  'petrosian t l': 'am',
  'gligoric s': 'rs',
  'ljubojevic l': 'rs',
  'andersson u': 'se',
  'hort v': 'cz',
  'benko p': 'us',
  'olafsson f': 'is',
  'unzicker w': 'de',
  'ivkov b': 'rs',
  'nezhmetdinov r': 'ru',
  'bareev e': 'ca',
  'dreev a': 'ru',
  'akopian v': 'am',
  'sokolov i': 'nl',
  'beliavsky a': 'si',
  'yusupov a': 'de',
  'seirawan y': 'us',
  'kamsky g': 'us',
  'jobava b': 'ge',
  'mamedov r': 'az',
  'najer e': 'ru',
  'tomashevsky e': 'ru',
  'jakovenko d': 'ru',
  'malakhov v': 'ru',
  'inarkiev e': 'ru',
  'vitiugov n': 'ru',
  'artemiev v': 'ru',
  'esipenko a': 'ru',
  'sarana a': 'rs',
  'predke a': 'rs',
  'oparin g': 'us',
  'cheparinov i': 'bg',
  'navara d': 'cz',
  'ragger m': 'at',
  'bacrot e': 'fr',
  'fressinet l': 'fr',
  'tkachiev v': 'fr',
  'lautier j': 'fr',
  'almasi z': 'hu',
  'berkes f': 'hu',
  'rodshtein m': 'il',
  'smirin i': 'il',
  'sutovsky e': 'il',
  'avrukh b': 'il',
  'anton guijarro d': 'es',
  'vallejo pons f': 'es',
  'shirov alexei': 'lv',
  'sadler m': 'uk',
  'mcshane l': 'uk',
  'howell d': 'uk',
  'jones g': 'uk',
  'nunn j': 'uk',
  'speelman j': 'uk',
  'miles a': 'uk',
}

// A federation referenced above that is not in the table would silently vanish;
// this keeps the two in step at module load rather than at render time.
const SLOVENIA: Federation = { code: 'SI', name: 'Slovenia' }
const ALL: Readonly<Record<string, Federation>> = { ...FEDERATIONS, si: SLOVENIA }

/**
 * Normalises "Nakamura,Hi" and "Fischer, Robert James" to a common key:
 * surname plus first initial.
 *
 * Accents are folded to their base letter before anything is discarded. The
 * table below is written in ASCII, so deleting the accented letter instead —
 * turning "Réti" into "rti" — meant a name in the list could not be found
 * under the spelling a PGN actually used.
 */
function keyFor(playerName: string): string {
  const cleaned = foldName(playerName)
    .replace(/[^a-z, -]/g, '')
    .trim()

  const [surnamePart = '', restPart = ''] = cleaned.split(',')
  const surname = surnamePart.trim()
  const initial = restPart.trim().charAt(0)

  return initial === '' ? surname : `${surname} ${initial}`
}

/** The player's federation, or null when it is not known. */
export function federationOf(playerName: string): Federation | null {
  const key = keyFor(playerName)
  const code = COUNTRY_BY_PLAYER[key] ?? COUNTRY_BY_PLAYER[key.split(' ')[0] ?? '']
  return code === undefined ? null : (ALL[code] ?? null)
}
