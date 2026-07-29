/**
 * Deciding when two spellings name the same player.
 *
 * These archives spell the same person several ways — "Anand,V" (2,932 games)
 * and "Anand, Viswanathan" (1,325) are one player, and searching either finds
 * only part of his games. 1,860 of 10,561 surnames in the library carry more
 * than one spelling.
 *
 * The rule is deliberately conservative: surname plus first initial. That folds
 * the abbreviation cases together while keeping "Fischer,Gert" apart from
 * "Fischer, Robert James". Anything it cannot decide is left as two players
 * rather than guessed into one.
 */

export interface NameCount {
  readonly name: string
  readonly games: number
  readonly firstYear: number | null
  readonly lastYear: number | null
  readonly peakElo: number | null
}

export interface MergedPlayer {
  readonly sortKey: string
  readonly canonical: string
  readonly aliases: readonly string[]
  readonly games: number
  readonly firstYear: number | null
  readonly lastYear: number | null
  readonly peakElo: number | null
}

/**
 * A lifetime longer than this means the key has caught two different people —
 * a "Smith,J" from 1890 and another from 1990 — so they are kept apart.
 */
const IMPLAUSIBLE_CAREER_YEARS = 80

/** Surname plus first initial, lower case, punctuation removed. */
export function identityKey(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z, ]/g, ' ')
  const [surnamePart = '', restPart = ''] = cleaned.split(',')

  const surname = surnamePart.trim().replace(/\s+/g, ' ')
  const initial = restPart.trim().charAt(0)

  return initial === '' ? surname : `${surname} ${initial}`
}

/**
 * The fullest spelling wins: "Anand, Viswanathan" reads better than "Anand,V",
 * and a name with a real forename tells you which Fischer you are looking at.
 */
function preferredSpelling(a: string, b: string): string {
  const forename = (name: string) => (name.split(',')[1] ?? '').trim()
  const aLen = forename(a).length
  const bLen = forename(b).length
  if (aLen !== bLen) return aLen > bLen ? a : b
  return a.length >= b.length ? a : b
}

const minYear = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : Math.min(a, b)
const maxYear = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : Math.max(a, b)

/** Folds raw name rows into distinct players. */
export function mergePlayers(rows: readonly NameCount[]): MergedPlayer[] {
  const groups = new Map<string, NameCount[]>()

  for (const row of rows) {
    const key = identityKey(row.name)
    if (key === '') continue
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [row])
    else group.push(row)
  }

  const players: MergedPlayer[] = []

  for (const [sortKey, group] of groups) {
    const span = spanOf(group)
    // Too wide a career to be one person: keep every spelling separate rather
    // than merge two people into one.
    const clusters =
      span !== null && span > IMPLAUSIBLE_CAREER_YEARS
        ? group.map((row) => [row])
        : [group]

    for (const cluster of clusters) {
      players.push(toPlayer(sortKey, cluster))
    }
  }

  return players.sort((a, b) => b.games - a.games)
}

function spanOf(group: readonly NameCount[]): number | null {
  const first = group.reduce<number | null>((y, r) => minYear(y, r.firstYear), null)
  const last = group.reduce<number | null>((y, r) => maxYear(y, r.lastYear), null)
  return first === null || last === null ? null : last - first
}

function toPlayer(sortKey: string, cluster: readonly NameCount[]): MergedPlayer {
  return {
    sortKey,
    canonical: cluster.map((r) => r.name).reduce(preferredSpelling),
    aliases: cluster.map((r) => r.name),
    games: cluster.reduce((sum, r) => sum + r.games, 0),
    firstYear: cluster.reduce<number | null>((y, r) => minYear(y, r.firstYear), null),
    lastYear: cluster.reduce<number | null>((y, r) => maxYear(y, r.lastYear), null),
    peakElo: cluster.reduce<number | null>(
      (e, r) => (r.peakElo === null ? e : e === null ? r.peakElo : Math.max(e, r.peakElo)),
      null,
    ),
  }
}
