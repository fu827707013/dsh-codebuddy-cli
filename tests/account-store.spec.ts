import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AccountStore } from '../src/account-store.ts'
import type { StoredAccount } from '../src/account-store.ts'

const CLEANUP: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(CLEANUP.splice(0).map(clean => clean()))
})

async function makeStore(): Promise<{ store: AccountStore, dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'wb-accounts-'))
  CLEANUP.push(() => rm(dir, { recursive: true, force: true }))
  return { store: new AccountStore(join(dir, 'accounts.json')), dir }
}

function account(overrides: Partial<Omit<StoredAccount, 'addedAtMs'>> = {}): Omit<StoredAccount, 'addedAtMs'> {
  return {
    id: overrides.id ?? 'acc-1',
    uid: overrides.uid ?? 'uid-1',
    domain: overrides.domain ?? 'www.codebuddy.cn',
    accessToken: overrides.accessToken ?? 'at-1',
    refreshToken: overrides.refreshToken ?? 'rt-1',
    expiresAtMs: overrides.expiresAtMs ?? Date.now() + 3_600_000,
    ...overrides.nickname !== undefined ? { nickname: overrides.nickname } : {},
    ...overrides.enterpriseId !== undefined ? { enterpriseId: overrides.enterpriseId } : {},
    ...overrides.refreshExpiresAtMs !== undefined ? { refreshExpiresAtMs: overrides.refreshExpiresAtMs } : {},
  }
}

describe('AccountStore', () => {
  it('reads an empty document when the file is absent', async () => {
    const { store } = await makeStore()
    const doc = await store.read()
    expect(doc.accounts).toEqual({})
    expect(doc.activeId).toBeUndefined()
  })

  it('adds an account and makes it active when none is active', async () => {
    const { store } = await makeStore()
    await store.add(account())
    const summaries = await store.summaries()
    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({ id: 'acc-1', uid: 'uid-1', active: true })
  })

  it('does not change the active account when one already exists', async () => {
    const { store } = await makeStore()
    await store.add(account({ id: 'acc-1' }))
    await store.add(account({ id: 'acc-2', uid: 'uid-2' }))
    const active = await store.activeCredential()
    expect(active?.uid).toBe('uid-1')
  })

  it('switches the active account and persists it across reads', async () => {
    const { store } = await makeStore()
    await store.add(account({ id: 'acc-1', uid: 'uid-1' }))
    await store.add(account({ id: 'acc-2', uid: 'uid-2' }))
    expect(await store.setActive('acc-2')).toBe(true)
    const active = await store.activeCredential()
    expect(active?.uid).toBe('uid-2')
    // A fresh store instance reads the same persisted document.
    const reloaded = new AccountStore((store as unknown as { path: string }).path)
    const summaries = await reloaded.summaries()
    expect(summaries.find(s => s.id === 'acc-2')?.active).toBe(true)
  })

  it('returns false when switching to a missing account', async () => {
    const { store } = await makeStore()
    expect(await store.setActive('missing')).toBe(false)
  })

  it('removes an account and clears active when the active one is removed', async () => {
    const { store } = await makeStore()
    await store.add(account({ id: 'acc-1' }))
    expect(await store.remove('acc-1')).toBe(true)
    expect(await store.activeCredential()).toBeUndefined()
    expect(await store.remove('acc-1')).toBe(false)
  })

  it('keeps another account active when a non-active one is removed', async () => {
    const { store } = await makeStore()
    await store.add(account({ id: 'acc-1' }))
    await store.add(account({ id: 'acc-2', uid: 'uid-2' }))
    await store.setActive('acc-1')
    await store.remove('acc-2')
    const active = await store.activeCredential()
    expect(active?.uid).toBe('uid-1')
  })

  it('returns a credential through credentialFor for a specific id', async () => {
    const { store } = await makeStore()
    await store.add(account({ id: 'acc-1' }))
    await store.add(account({ id: 'acc-2', uid: 'uid-2', nickname: '二号' }))
    const cred = await store.credentialFor('acc-2')
    expect(cred?.uid).toBe('uid-2')
    expect(cred?.nickname).toBe('二号')
    expect(cred?.source).toBe('dsh')
  })

  it('returns undefined for a missing account id', async () => {
    const { store } = await makeStore()
    expect(await store.credentialFor('missing')).toBeUndefined()
  })

  it('updates tokens for an existing account', async () => {
    const { store } = await makeStore()
    await store.add(account({ id: 'acc-1' }))
    await store.updateTokens('acc-1', {
      accessToken: 'at-new',
      refreshToken: 'rt-new',
      expiresAtMs: Date.now() + 7200_000,
    })
    const cred = await store.credentialFor('acc-1')
    expect(cred?.accessToken).toBe('at-new')
    expect(cred?.refreshToken).toBe('rt-new')
    expect(cred?.expiresAtMs).toBeGreaterThan(Date.now() + 3600_000)
  })

  it('ignores token updates for a missing account', async () => {
    const { store } = await makeStore()
    await expect(store.updateTokens('missing', {
      accessToken: 'at', expiresAtMs: Date.now(),
    })).resolves.toBeUndefined()
  })

  it('clearActive clears the active account', async () => {
    const { store } = await makeStore()
    await store.add(account({ id: 'acc-1' }))
    await store.clearActive()
    expect(await store.activeCredential()).toBeUndefined()
    // Account still stored, just not active.
    expect(await store.summaries()).toHaveLength(1)
  })

  it('carries identity fields through to the credential', async () => {
    const { store } = await makeStore()
    await store.add(account({
      id: 'acc-1',
      enterpriseId: 'ent-1',
      refreshExpiresAtMs: Date.now() + 7200_000,
    }))
    const cred = await store.activeCredential()
    expect(cred?.enterpriseId).toBe('ent-1')
    expect(cred?.refreshExpiresAtMs).toBeGreaterThan(0)
  })

  it('falls back to the JWT payload for uid and nickname when not stored', async () => {
    const { store } = await makeStore()
    const payload = Buffer.from(JSON.stringify({
      sub: 'sub-from-jwt', nickname: 'JWT 昵称',
    })).toString('base64url')
    await store.add(account({
      id: 'acc-1',
      uid: '',
      accessToken: `h.${payload}.s`,
    }))
    const summaries = await store.summaries()
    expect(summaries[0]?.uid).toBe('sub-from-jwt')
    expect(summaries[0]?.nickname).toBe('JWT 昵称')
  })

  it('prefers stored identity fields over the JWT payload', async () => {
    const { store } = await makeStore()
    const payload = Buffer.from(JSON.stringify({
      sub: 'sub-from-jwt', nickname: 'JWT 昵称',
    })).toString('base64url')
    await store.add(account({
      id: 'acc-1',
      uid: 'stored-uid',
      nickname: '存储昵称',
      accessToken: `h.${payload}.s`,
    }))
    const summaries = await store.summaries()
    expect(summaries[0]?.uid).toBe('stored-uid')
    expect(summaries[0]?.nickname).toBe('存储昵称')
  })
})
