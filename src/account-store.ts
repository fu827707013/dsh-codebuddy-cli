/**
 * Multi-account credential store for CodeBuddy CLI.
 *
 * Accounts added through OAuth login are stored here as a JSON document under
 * `$DSH_HOME`. Each account carries its own accessToken, refreshToken,
 * expiresAt, and identity fields (uid, nickname, domain, enterpriseId).
 *
 * The "active" account is the one the plugin currently serves; its credential
 * is resolved first, falling back to the CLI's own auth file when no account
 * is active (so the original single-account behavior is preserved).
 *
 * @module dsh-codebuddy-cli/account-store
 */

import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { CodeBuddyCredential } from './auth.ts'

/** Basename of the multi-account JSON file inside the Harness home. */
export const CODEBUDDY_ACCOUNTS_FILENAME = '.codebuddy-cli-accounts.json'

/** Current on-disk format version; readers reject others. */
const ACCOUNTS_FORMAT_VERSION = 1

/** On-disk shape of the accounts document. */
export interface AccountsDocument {
  version: typeof ACCOUNTS_FORMAT_VERSION
  /** Stable id of the currently active account, or undefined when none is active. */
  activeId?: string
  /** All stored accounts, keyed by stable id. */
  accounts: Record<string, StoredAccount>
}

/** One stored account as it appears on disk. */
export interface StoredAccount {
  /** Stable client-side id for this account (uuid or similar). */
  id: string
  /** Upstream user id. */
  uid: string
  /** Display name from the upstream profile. */
  nickname?: string
  /** Login domain (cn / global). */
  domain: string
  /** Enterprise id, if the account belongs to an enterprise. */
  enterpriseId?: string
  accessToken: string
  refreshToken: string
  /** Access token expiry, epoch milliseconds. */
  expiresAtMs: number
  /** Refresh token expiry, epoch milliseconds. */
  refreshExpiresAtMs?: number
  /** When this account was first stored. */
  addedAtMs: number
  /** Last daily check-in outcome, so the card can render today's state. */
  lastCheckIn?: {
    /** Local date (YYYY-MM-DD) the check-in result was recorded. */
    date: string
    result: 'ok' | 'already' | 'failed'
  }
}

/** Read-only summary of one account for status display. */
export interface AccountSummary {
  id: string
  uid: string
  nickname?: string
  domain: string
  enterpriseId?: string
  expiresAtMs: number
  active: boolean
  lastCheckIn?: StoredAccount['lastCheckIn']
}

/** Path of the multi-account file. */
export function codebuddyAccountsPath(): string {
  return join(resolveDshHome(), CODEBUDDY_ACCOUNTS_FILENAME)
}

/** Whether a filesystem error reports an absent path. */
function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

/** Parse and validate an accounts document; returns undefined when invalid. */
function parseDocument(text: string): AccountsDocument | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const document = parsed as Record<string, unknown>
  if (document['version'] !== ACCOUNTS_FORMAT_VERSION) return undefined
  if (typeof document['accounts'] !== 'object' || document['accounts'] === null || Array.isArray(document['accounts'])) {
    return undefined
  }
  const raw = document['accounts'] as Record<string, unknown>
  const accounts: Record<string, StoredAccount> = {}
  for (const [id, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const entry = value as Record<string, unknown>
    const accessToken = typeof entry['accessToken'] === 'string' ? entry['accessToken'] : ''
    if (accessToken === '') continue
    accounts[id] = {
      id,
      uid: typeof entry['uid'] === 'string' ? entry['uid'] : '',
      ...entry['nickname'] !== undefined && typeof entry['nickname'] === 'string' ? { nickname: entry['nickname'] } : {},
      domain: typeof entry['domain'] === 'string' ? entry['domain'] : '',
      ...entry['enterpriseId'] !== undefined && typeof entry['enterpriseId'] === 'string' ? { enterpriseId: entry['enterpriseId'] } : {},
      accessToken,
      refreshToken: typeof entry['refreshToken'] === 'string' ? entry['refreshToken'] : '',
      expiresAtMs: typeof entry['expiresAtMs'] === 'number' ? entry['expiresAtMs'] : 0,
      ...entry['refreshExpiresAtMs'] !== undefined && typeof entry['refreshExpiresAtMs'] === 'number' ? { refreshExpiresAtMs: entry['refreshExpiresAtMs'] } : {},
      addedAtMs: typeof entry['addedAtMs'] === 'number' ? entry['addedAtMs'] : Date.now(),
      ...parseLastCheckIn(entry),
    }
  }
  const activeId = typeof document['activeId'] === 'string' && document['activeId'] !== '' ? document['activeId'] : undefined
  return { version: ACCOUNTS_FORMAT_VERSION, ...activeId === undefined ? {} : { activeId }, accounts }
}

/** Parse the optional `lastCheckIn` block of a stored account. */
function parseLastCheckIn(entry: Record<string, unknown>): Pick<StoredAccount, 'lastCheckIn'> {
  const raw = entry['lastCheckIn']
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const record = raw as Record<string, unknown>
  if (typeof record['date'] !== 'string' || record['date'] === '') return {}
  const result = record['result']
  if (result !== 'ok' && result !== 'already' && result !== 'failed') return {}
  return { lastCheckIn: { date: record['date'], result } }
}

/**
 * Multi-account credential store.
 *
 * The store reads and writes a JSON document under `$DSH_HOME`. Writes are
 * atomic and lock-protected. Reads are immutable snapshots — callers that
 * need a credential must copy it out.
 */
export class AccountStore {
  private readonly path: string

  constructor(path?: string) {
    this.path = path ?? codebuddyAccountsPath()
  }

  /** Read the full document; returns an empty document when the file is absent. */
  async read(): Promise<AccountsDocument> {
    try {
      const text = await readFile(this.path, 'utf8')
      const doc = parseDocument(text)
      return doc ?? { version: ACCOUNTS_FORMAT_VERSION, accounts: {} }
    } catch (error: unknown) {
      if (isENOENT(error)) return { version: ACCOUNTS_FORMAT_VERSION, accounts: {} }
      return { version: ACCOUNTS_FORMAT_VERSION, accounts: {} }
    }
  }

  /** Read and re-write the document inside a lock, applying a transform. */
  private async mutate<T>(fn: (doc: AccountsDocument) => { doc: AccountsDocument; result: T }): Promise<T> {
    return withFileLock(this.path, async () => {
      let doc: AccountsDocument
      try {
        const text = await readFile(this.path, 'utf8')
        doc = parseDocument(text) ?? { version: ACCOUNTS_FORMAT_VERSION, accounts: {} }
      } catch (error: unknown) {
        if (!isENOENT(error)) throw error
        doc = { version: ACCOUNTS_FORMAT_VERSION, accounts: {} }
      }
      const { doc: next, result } = fn(doc)
      await writeFileAtomic(this.path, `${JSON.stringify(next, null, 2)}\n`, {
        mode: 0o600,
        dirMode: 0o700,
      })
      return result
    })
  }

  /** Add a new account (or overwrite if the id already exists). Returns the stored account. */
  async add(account: Omit<StoredAccount, 'addedAtMs'>): Promise<StoredAccount> {
    return this.mutate(doc => {
      const stored: StoredAccount = { ...account, addedAtMs: Date.now() }
      const accounts = { ...doc.accounts, [account.id]: stored }
      const activeId = doc.activeId ?? account.id
      return { doc: { ...doc, activeId, accounts }, result: stored }
    })
  }

  /** Remove an account by id. Returns true if the account existed. */
  async remove(id: string): Promise<boolean> {
    return this.mutate(doc => {
      if (doc.accounts[id] === undefined) return { doc, result: false }
      const accounts = { ...doc.accounts }
      delete accounts[id]
      const activeId = doc.activeId === id ? undefined : doc.activeId
      const nextDoc: AccountsDocument = { version: ACCOUNTS_FORMAT_VERSION, accounts }
      if (activeId !== undefined) nextDoc.activeId = activeId
      return { doc: nextDoc, result: true }
    })
  }

  /** Set the active account by id. Returns false when the account does not exist. */
  async setActive(id: string): Promise<boolean> {
    return this.mutate(doc => {
      if (doc.accounts[id] === undefined) return { doc, result: false }
      return { doc: { ...doc, activeId: id }, result: true }
    })
  }

  /** Clear the active account (so the CLI file fallback takes over). */
  async clearActive(): Promise<void> {
    await this.mutate(doc => {
      const nextDoc: AccountsDocument = { version: ACCOUNTS_FORMAT_VERSION, accounts: doc.accounts }
      return { doc: nextDoc, result: undefined }
    })
  }

  /** Get the active account's stored credential, or undefined when none is active. */
  async activeCredential(): Promise<CodeBuddyCredential | undefined> {
    const doc = await this.read()
    if (doc.activeId === undefined) return undefined
    const account = doc.accounts[doc.activeId]
    if (account === undefined) return undefined
    return this.toCredential(account, 'dsh')
  }

  /** Get a specific account's stored credential. */
  async credentialFor(id: string): Promise<CodeBuddyCredential | undefined> {
    const doc = await this.read()
    const account = doc.accounts[id]
    if (account === undefined) return undefined
    return this.toCredential(account, 'dsh')
  }

  /** Update a stored account's tokens (after a refresh). */
  async updateTokens(id: string, tokens: {
    accessToken: string
    refreshToken?: string
    expiresAtMs: number
    refreshExpiresAtMs?: number
    domain?: string
  }): Promise<void> {
    await this.mutate(doc => {
      const existing = doc.accounts[id]
      if (existing === undefined) return { doc, result: undefined }
      const updated: StoredAccount = {
        ...existing,
        accessToken: tokens.accessToken,
        ...tokens.refreshToken !== undefined && tokens.refreshToken !== '' ? { refreshToken: tokens.refreshToken } : {},
        expiresAtMs: tokens.expiresAtMs,
        ...tokens.refreshExpiresAtMs !== undefined ? { refreshExpiresAtMs: tokens.refreshExpiresAtMs } : {},
        ...tokens.domain !== undefined && tokens.domain !== '' ? { domain: tokens.domain } : {},
      }
      const accounts = { ...doc.accounts, [id]: updated }
      return { doc: { ...doc, accounts }, result: undefined }
    })
  }

  /** Record a daily check-in outcome for an account. No-op when the id is unknown. */
  async recordCheckIn(id: string, date: string, result: 'ok' | 'already' | 'failed'): Promise<void> {
    await this.mutate(doc => {
      const existing = doc.accounts[id]
      if (existing === undefined) return { doc, result: undefined }
      const updated: StoredAccount = { ...existing, lastCheckIn: { date, result } }
      const accounts = { ...doc.accounts, [id]: updated }
      return { doc: { ...doc, accounts }, result: undefined }
    })
  }

  /** Summaries of all stored accounts, with the active one flagged. */
  async summaries(): Promise<readonly AccountSummary[]> {
    const doc = await this.read()
    const activeId = doc.activeId
    return Object.values(doc.accounts).map(account => {
      // Fall back to the access token's JWT payload for identity fields that
      // were not captured at login time (the account-info endpoint may have
      // been unavailable). This keeps already-stored accounts displayable.
      const fallback = account.uid === '' && account.nickname === undefined
        ? jwtIdentity(account.accessToken)
        : undefined
      const uid = account.uid !== '' ? account.uid : (fallback?.uid ?? '')
      const nickname = account.nickname ?? fallback?.nickname
      return {
        id: account.id,
        uid,
        ...nickname !== undefined ? { nickname } : {},
        domain: account.domain,
        ...account.enterpriseId !== undefined ? { enterpriseId: account.enterpriseId } : {},
        expiresAtMs: account.expiresAtMs,
        active: account.id === activeId,
        ...account.lastCheckIn !== undefined ? { lastCheckIn: account.lastCheckIn } : {},
      }
    })
  }

  /** Convert a stored account to a CodeBuddyCredential. */
  private toCredential(account: StoredAccount, source: 'cli' | 'dsh'): CodeBuddyCredential {
    const credential: CodeBuddyCredential = {
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      expiresAtMs: account.expiresAtMs,
      domain: account.domain,
      uid: account.uid,
      source,
    }
    if (account.refreshExpiresAtMs !== undefined) credential.refreshExpiresAtMs = account.refreshExpiresAtMs
    if (account.enterpriseId !== undefined) credential.enterpriseId = account.enterpriseId
    if (account.nickname !== undefined) credential.nickname = account.nickname
    return credential
  }
}

/**
 * Decode `sub` / `nickname` claims from a CodeBuddy access token JWT without
 * verifying the signature. Display-only identity, so verification is not
 * needed; any failure yields undefined.
 */
function jwtIdentity(accessToken: string): { uid: string; nickname?: string } | undefined {
  const parts = accessToken.split('.')
  if (parts.length < 2) return undefined
  const payload = parts[1]
  if (payload === undefined) return undefined
  let claims: Record<string, unknown>
  try {
    const padded = payload.replace(/-/gu, '+').replace(/_/gu, '/')
    const parsed: unknown = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    claims = parsed as Record<string, unknown>
  } catch {
    return undefined
  }
  const uid = typeof claims['sub'] === 'string' ? claims['sub'] : ''
  if (uid === '') return undefined
  let nickname: string | undefined
  if (typeof claims['nickname'] === 'string') nickname = claims['nickname']
  else if (typeof claims['preferred_username'] === 'string') nickname = claims['preferred_username']
  return { uid, ...nickname !== undefined ? { nickname } : {} }
}
