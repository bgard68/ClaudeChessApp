import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestPersistentStorage } from './persistence'

/*
 * What is at stake is the games someone played and the PGN files they
 * imported — the only things in the database the app cannot rebuild. A refusal
 * is an ordinary answer here, not an error, so every branch has to return a
 * plain boolean and none may throw: the caller shows a durability warning, and
 * an exception would take the whole screen down instead.
 */

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

/** Installs a `navigator.storage` stub for the duration of one test. */
const stubStorage = (storage: unknown): void => {
  Object.defineProperty(globalThis, 'navigator', {
    value: storage === undefined ? {} : { storage },
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  if (originalNavigator === undefined) {
    Reflect.deleteProperty(globalThis, 'navigator')
    return
  }
  Object.defineProperty(globalThis, 'navigator', originalNavigator)
})

describe('requestPersistentStorage', () => {
  it('requestPersistentStorage_AlreadyPersisted_ReturnsTrueWithoutPromptingAgain', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    stubStorage({ persisted: vi.fn().mockResolvedValue(true), persist })

    const granted = await requestPersistentStorage()

    expect(granted).toBe(true)
    // Asking again would be a second permission prompt for a settled question.
    expect(persist).not.toHaveBeenCalled()
  })

  it('requestPersistentStorage_NotYetPersistedAndBrowserGrants_ReturnsTrue', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    stubStorage({ persisted: vi.fn().mockResolvedValue(false), persist })

    const granted = await requestPersistentStorage()

    expect(granted).toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('requestPersistentStorage_BrowserRefuses_ReturnsFalse', async () => {
    stubStorage({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(false),
    })

    const granted = await requestPersistentStorage()

    expect(granted).toBe(false)
  })

  it('requestPersistentStorage_NoStorageApi_ReturnsFalse', async () => {
    stubStorage(undefined)

    const granted = await requestPersistentStorage()

    expect(granted).toBe(false)
  })

  // `persist()` is a Window method — a worker has `persisted()` but not this.
  it('requestPersistentStorage_StorageApiWithoutPersist_ReturnsFalse', async () => {
    stubStorage({ persisted: vi.fn().mockResolvedValue(false) })

    const granted = await requestPersistentStorage()

    expect(granted).toBe(false)
  })

  it('requestPersistentStorage_PersistThrows_ReportsEvictableRatherThanPropagating', async () => {
    stubStorage({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockRejectedValue(new Error('SecurityError')),
    })

    const granted = await requestPersistentStorage()

    expect(granted).toBe(false)
  })

  it('requestPersistentStorage_PersistedThrows_ReportsEvictableRatherThanPropagating', async () => {
    stubStorage({
      persisted: vi.fn().mockRejectedValue(new Error('SecurityError')),
      persist: vi.fn().mockResolvedValue(true),
    })

    const granted = await requestPersistentStorage()

    expect(granted).toBe(false)
  })

  it('requestPersistentStorage_PersistIsNotAFunction_ReturnsFalseWithoutCallingIt', async () => {
    stubStorage({ persisted: vi.fn().mockResolvedValue(false), persist: 'not-a-function' })

    const granted = await requestPersistentStorage()

    expect(granted).toBe(false)
  })
})
