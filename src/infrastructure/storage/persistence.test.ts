import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestPersistentStorage } from './persistence'

type StorageStub = Partial<{
  persisted: () => Promise<boolean>
  persist: () => Promise<boolean>
}>

function withStorage(storage: StorageStub | undefined) {
  vi.stubGlobal('navigator', storage === undefined ? {} : { storage })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestPersistentStorage', () => {
  it('reports false where the API does not exist', async () => {
    withStorage(undefined)
    await expect(requestPersistentStorage()).resolves.toBe(false)
  })

  it('reports false where storage exists but persist does not', async () => {
    // Workers get persisted() and estimate() but not persist() itself.
    withStorage({ persisted: () => Promise.resolve(false) })
    await expect(requestPersistentStorage()).resolves.toBe(false)
  })

  it('does not ask again once persistence was already granted', async () => {
    const persist = vi.fn(() => Promise.resolve(true))
    withStorage({ persisted: () => Promise.resolve(true), persist })

    await expect(requestPersistentStorage()).resolves.toBe(true)
    // Asking again could surface a second permission prompt.
    expect(persist).not.toHaveBeenCalled()
  })

  it('passes the browser’s answer through', async () => {
    withStorage({
      persisted: () => Promise.resolve(false),
      persist: () => Promise.resolve(true),
    })
    await expect(requestPersistentStorage()).resolves.toBe(true)

    withStorage({
      persisted: () => Promise.resolve(false),
      persist: () => Promise.resolve(false),
    })
    await expect(requestPersistentStorage()).resolves.toBe(false)
  })

  it('treats a browser that throws as a refusal', async () => {
    withStorage({
      persisted: () => Promise.reject(new Error('blocked')),
      persist: () => Promise.resolve(true),
    })
    await expect(requestPersistentStorage()).resolves.toBe(false)
  })
})
