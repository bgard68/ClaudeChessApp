import { describe, expect, it, vi } from 'vitest'
import { Observable } from './Observable'

/*
 * The change-notification behind both LiveGame and ReplaySession, and so
 * behind every screen that shows either. Small enough to read in a minute,
 * and the dispatch-time mutation cases below are the ones that bite.
 */
describe('Observable', () => {
  it('emit_TwoListeners_GivesBothTheEmittedValue', () => {
    const observable = new Observable<number>()
    const first = vi.fn()
    const second = vi.fn()
    observable.subscribe(first)
    observable.subscribe(second)

    observable.emit(7)

    expect(first).toHaveBeenCalledWith(7)
    expect(second).toHaveBeenCalledWith(7)
  })

  it('emit_NoListeners_SaysNothingToNobody', () => {
    expect(() => new Observable<number>().emit(1)).not.toThrow()
  })

  it('unsubscribe_ThenEmit_StopsTellingThatListener', () => {
    const observable = new Observable<number>()
    const listener = vi.fn()
    const unsubscribe = observable.subscribe(listener)

    observable.emit(1)
    unsubscribe()
    observable.emit(2)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(1)
  })

  it('unsubscribe_CalledTwice_DoesNotThrow', () => {
    const observable = new Observable<number>()
    const unsubscribe = observable.subscribe(vi.fn())
    unsubscribe()
    expect(() => unsubscribe()).not.toThrow()
  })

  // Listeners are held in a Set, so the same function twice is one listener.
  it('subscribe_SameListenerTwice_HoldsOneEntryPerListener', () => {
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
  it('emit_ListenerUnsubscribesMidDispatch_StillFinishesTheRound', () => {
    const observable = new Observable<number>()
    const second = vi.fn()

    const unsubscribeFirst = observable.subscribe(() => unsubscribeFirst())
    observable.subscribe(second)

    observable.emit(1)

    expect(second).toHaveBeenCalledWith(1)
  })

  it('emit_ListenerSubscribedDuringDispatch_IsNotDeliveredThisRound', () => {
    const observable = new Observable<number>()
    const late = vi.fn()
    observable.subscribe(() => observable.subscribe(late))

    observable.emit(1)

    // It joins in time for the next value, not the one already going out.
    expect(late).not.toHaveBeenCalled()
    observable.emit(2)
    expect(late).toHaveBeenCalledWith(2)
  })

  it('clear_WithListeners_DropsEveryone', () => {
    const observable = new Observable<number>()
    const listener = vi.fn()
    observable.subscribe(listener)

    observable.clear()
    observable.emit(1)

    expect(listener).not.toHaveBeenCalled()
  })
})
