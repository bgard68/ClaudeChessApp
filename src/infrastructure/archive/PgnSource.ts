/**
 * Somewhere PGN text comes from.
 *
 * Exists so the archive can be tested against a string literal, and so a
 * bundled file, a user's upload, and a future remote database are all the same
 * thing to it.
 */
export interface PgnSource {
  readonly name: string
  load(): Promise<string>
}

export class StaticPgnSource implements PgnSource {
  constructor(
    readonly name: string,
    private readonly text: string,
  ) {}

  load(): Promise<string> {
    return Promise.resolve(this.text)
  }
}

export class HttpPgnSource implements PgnSource {
  constructor(
    readonly name: string,
    private readonly url: string,
  ) {}

  async load(): Promise<string> {
    const response = await fetch(this.url)
    if (!response.ok) {
      throw new Error(`Could not fetch ${this.url}: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
}
