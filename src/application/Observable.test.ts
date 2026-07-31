import { describe, expect, it, vi } from 'vitest'
import { Observable } from './Observable'

/*
 * The change-notification behind both LiveGame and ReplaySession, and so
 * behind every screen that shows either. Small enough to read in a minute,
 * and the dispatch-time mutation cases below are the ones that bite.
 */
describe('Observable', () => {
  it('gives every listener the value that was emitted', () => {
    const observable = new Observable<number>()
    const first = vi.fn()
    const second = vi.fn()
    observable.subscribe(first)
    observable.subscribe(second)

    observable.emit(7)

    expect(first).toHaveBeenCalledWith(7)
    expect(second).toHaveBeenCalledWith(7)
  })

  it('says nothing to nobody', () => {
    expect(() => new Observable<number>().emit(1)).not.toThrow()
  })

  it('stops telling a listener once it unsubscribes', () => {
    const observable = new Observable<number>()
    const listener = vi.fn()
    const unsubscribe = observable.subscribe(listener)

    observable.emit(1)
    unsubscribe()
    observable.emit(2)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(1)
  })

  it('is unbothered by unsubscribing twice', () => {
    const observable = new Observable<number>()
    const unsubscribe = observable.subscribe(vi.fn())
    unsubscribe()
    expect(() => unsubscribe()).not.toThrow()
  })

  // Listeners are held in a Set, so the same function twice is one listener.
  it('holds one entry per listener, not one per subscribe call', () => {
    const observable = new Observable<number>()
    const listener = vi.fn()
    observable.subscribe(listener)
    observable.subscribe(listener)

    observable.emit(1)

    expect(listener).toHaveBeenCalledTimes(1)
  })

  /*
   * React unsubscribes during dispatch as a matter of course: a listener sets
   * state, the component unmounts, and the cleanup runs while the loop is
   * still going. Iterating the live Set there would skip the next listener.
   */
  it('finishes the round even if a listener unsubscribes mid-dispatch', () => {
    const observable = new Observable<number>()
    const second = vi.fn()

    const unsubscribeFirst = observable.subscribe(() => unsubscribeFirst())
    observable.subscribe(second)

    observable.emit(1)

    expect(second).toHaveBeenCalledWith(1)
  })

  it('does not deliver to a listener subscribed during the same dispatch', () => {
    const observable = new Observable<number>()
    const late = vi.fn()
    observable.subscribe(() => observable.subscribe(late))

    observable.emit(1)

    // It joins in time for the next value, not the one already going out.
    expect(late).not.toHaveBeenCalled()
    observable.emit(2)
    expect(late).toHaveBeenCalledWith(2)
  })

  it('drops everyone when cleared', () => {
    const observable = new Observable<number>()
    const listener = vi.fn()
    observable.subscribe(listener)

    observable.clear()
    observable.emit(1)

    expect(listener).not.toHaveBeenCalled()
  })
})
