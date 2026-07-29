import { federationOf as curatedFederation } from '@domain/archive/playerCountry'
import { identityKey } from './playerIdentity'

export interface PlayerFederation {
  /** FIDE's three-letter code, e.g. NOR. */
  readonly code: string
  readonly country: string
  /** GM, IM, WGM… or null for an untitled player. */
  readonly title: string | null
}

interface FideRecord {
  readonly fed: string
  readonly title: string
  readonly elo: number | null
}

const DIRECTORY_URL = '/games/player-federations.json'

/** The federations that actually appear; anything else shows its code alone. */
const COUNTRY_NAMES: Readonly<Record<string, string>> = {
  NOR: 'Norway', USA: 'USA', IND: 'India', CHN: 'China', RUS: 'Russia',
  UKR: 'Ukraine', FRA: 'France', AZE: 'Azerbaijan', ARM: 'Armenia',
  NED: 'Netherlands', HUN: 'Hungary', ESP: 'Spain', POL: 'Poland',
  GER: 'Germany', ENG: 'England', CUB: 'Cuba', ARG: 'Argentina',
  CZE: 'Czechia', BUL: 'Bulgaria', ROU: 'Romania', SRB: 'Serbia',
  CRO: 'Croatia', SWE: 'Sweden', DEN: 'Denmark', ISL: 'Iceland',
  SUI: 'Switzerland', AUT: 'Austria', ITA: 'Italy', PHI: 'Philippines',
  VIE: 'Vietnam', IRI: 'Iran', ISR: 'Israel', UZB: 'Uzbekistan',
  GEO: 'Georgia', LAT: 'Latvia', EST: 'Estonia', BLR: 'Belarus',
  PER: 'Peru', BRA: 'Brazil', CAN: 'Canada', SLO: 'Slovenia',
  SCO: 'Scotland', WLS: 'Wales', IRL: 'Ireland', FIN: 'Finland',
  NOR2: 'Norway', TUR: 'Turkey', GRE: 'Greece', BEL: 'Belgium',
  POR: 'Portugal', MEX: 'Mexico', COL: 'Colombia', CHI: 'Chile',
  AUS: 'Australia', NZL: 'New Zealand', RSA: 'South Africa',
  EGY: 'Egypt', KAZ: 'Kazakhstan', MGL: 'Mongolia', INA: 'Indonesia',
  SGP: 'Singapore', JPN: 'Japan', KOR: 'South Korea', SVK: 'Slovakia',
  LTU: 'Lithuania', MDA: 'Moldova', BIH: 'Bosnia', MKD: 'North Macedonia',
  MNE: 'Montenegro', ALB: 'Albania', TKM: 'Turkmenistan', KGZ: 'Kyrgyzstan',
}

/** Two-letter codes the curated list uses, mapped to FIDE's three. */
const FIDE_CODE: Readonly<Record<string, string>> = {
  NO: 'NOR', US: 'USA', IN: 'IND', CN: 'CHN', RU: 'RUS', UA: 'UKR',
  FR: 'FRA', AZ: 'AZE', AM: 'ARM', NL: 'NED', HU: 'HUN', ES: 'ESP',
  PL: 'POL', DE: 'GER', GB: 'ENG', CU: 'CUB', AR: 'ARG', CZ: 'CZE',
  BG: 'BUL', RO: 'ROU', RS: 'SRB', HR: 'CRO', SE: 'SWE', DK: 'DEN',
  IS: 'ISL', CH: 'SUI', AT: 'AUT', IT: 'ITA', PH: 'PHI', VN: 'VIE',
  IR: 'IRI', IL: 'ISR', UZ: 'UZB', GE: 'GEO', LV: 'LAT', EE: 'EST',
  BY: 'BLR', PE: 'PER', BR: 'BRA', CA: 'CAN', SI: 'SLO',
}

let directory: Readonly<Record<string, FideRecord>> = {}
let loading: Promise<void> | null = null

/**
 * Loads FIDE's federation and title data, once.
 *
 * Fetched rather than bundled: it is 212 KB of data that only the archive
 * screen needs, and putting it in the main script would make every visitor pay
 * for it before the board appears.
 */
export function loadFederations(): Promise<void> {
  loading ??= fetch(DIRECTORY_URL)
    .then((response) => (response.ok ? response.json() : {}))
    .then((json: Record<string, FideRecord>) => {
      directory = json
    })
    .catch(() => {
      // A missing file costs flags, not function.
      directory = {}
    })
  return loading
}

/**
 * The federation and title for a player, or null when neither source knows.
 *
 * The hand-verified list wins over FIDE. FIDE has no record of players who died
 * before it existed, and an exact namesake can be matched instead — Botvinnik
 * resolves to a living Israeli player of the same name, and his own games are
 * too old to carry a rating that would expose the mistake.
 */
export function federationFor(playerName: string): PlayerFederation | null {
  const record = directory[identityKey(playerName)]
  const fideTitle = record?.title ? record.title : null

  const curated = curatedFederation(playerName)
  if (curated !== null) {
    const code = FIDE_CODE[curated.code] ?? curated.code
    /*
     * The title is taken from FIDE only when both sources name the same
     * federation. Disagreement means the FIDE row is a namesake rather than
     * this player — Botvinnik matches a living Israeli — and a title borrowed
     * from a stranger would be no better than an invented one.
     */
    return { code, country: curated.name, title: record?.fed === code ? fideTitle : null }
  }

  if (record === undefined) return null

  return {
    code: record.fed,
    country: COUNTRY_NAMES[record.fed] ?? record.fed,
    title: fideTitle,
  }
}
