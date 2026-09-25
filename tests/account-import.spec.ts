/**
 * Import-account route: adding an identity from a pasted token pair.
 *
 * The route's contract has two halves that these tests pin separately:
 *
 * 1. **Probe before persist.** Nothing may reach the account store until the
 *    credential has been exercised upstream. A failed import has to leave the
 *    on-disk document byte-identical, not merely answer `ok: false` — an
 *    account that exists but cannot authenticate would be worse than no
 *    account, because the store offers it in the switcher.
 * 2. **Store the refreshed pair, not the pasted one.** The upstream rotates
 *    the refresh token on every exchange and keeps the previous one valid, so
 *    persisting the pasted value would leave an untracked, permanently valid
 *    credential on the server.
 */

import { createServer, request } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AccountStore } from '../src/account-store.ts'
import { codeBuddyImportAccountHandler } from '../src/web-status.ts'
import { CODEBUDDY_IMPORT_ACCOUNT_PATH } from '../src/status-paths.ts'
import type { CodeBuddyStatusRouteOptions } from '../src/web-status.ts'
import type { CodeBuddyCredential } from '../src/auth.ts'
import type { CodeBuddyRefreshOutcome } from '../src/upstream.ts'
import type { CodeBuddyWebCredits } from '../src/status-paths.ts'

const CLEANUP: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(CLEANUP.splice(0).map(clean => clean()))
})

/**
 * Encode a JWT-shaped token whose payload carries the given claims.
 *
 * The route never verifies the signature (the claims are display metadata
 * only), so a real signature is unnecessary — but the three-segment shape is,
 * because that is what the decoder keys off.
 */
function fakeJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${header}.${payload}.sig`
}

interface Harness {
  port: number
  store: AccountStore
  dir: string
  /** Credentials the route passed to the upstream probes, in call order. */
  probes: CodeBuddyCredential[]
}

interface HarnessOptions {
  /** Refresh answer; throw to simulate a rejected refresh token. */
  refresh?: (credential: CodeBuddyCredential) => Promise<CodeBuddyRefreshOutcome>
  /** Catalog probe; throw to simulate a credential the chat plane refuses. */
  fetchModels?: (credential: CodeBuddyCredential) => Promise<readonly { id: string }[]>
  /** Credit answer for the import probe; a throw simulates an upstream failure. */
  credits?: () => Promise<CodeBuddyWebCredits>
  withAccountStore?: boolean
  withRefresh?: boolean
}

async function startImportServer(options: HarnessOptions = {}): Promise<Harness> {
  const dir = await mkdtemp(join(tmpdir(), 'wb-import-'))
  CLEANUP.push(() => rm(dir, { recursive: true, force: true }))
  const store = new AccountStore(join(dir, 'accounts.json'))
  const probes: CodeBuddyCredential[] = []

  const deps: CodeBuddyStatusRouteOptions = {
    store: {} as CodeBuddyStatusRouteOptions['store'],
    client: {
      fetchCredits: options.credits ?? (async () => ({ total: 0, accounts: [] })),
      ...options.fetchModels === undefined ? {} : {
        fetchModels: async (credential: CodeBuddyCredential) => {
          probes.push(credential)
          return options.fetchModels!(credential) as Promise<never>
        },
      },
    },
    models: () => [],
    ...options.withAccountStore === false ? {} : { accountStore: store },
    ...options.withRefresh === false ? {} : {
      refreshToken: async (credential: CodeBuddyCredential): Promise<CodeBuddyRefreshOutcome> => {
        probes.push(credential)
        if (options.refresh === undefined) return { accessToken: 'fresh-at', refreshToken: 'fresh-rt', expiresInSec: 3600 }
        return options.refresh(credential)
      },
    },
  }

  const server = createServer(codeBuddyImportAccountHandler(deps))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  CLEANUP.push(() => new Promise<void>(resolve => server.close(() => resolve())))
  return { port, store, dir, probes }
}

/** POST the import route with full header control. */
function postImport(
  port: number,
  body: unknown,
  overrides: { origin?: string | null, contentType?: string | null, host?: string } = {},
): Promise<{ status: number, body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { host: overrides.host ?? `127.0.0.1:${port}` }
    const origin = overrides.origin === undefined ? 'http://127.0.0.1:3080' : overrides.origin
    if (origin !== null) headers.origin = origin
    const type = overrides.contentType === undefined ? 'application/json' : overrides.contentType
    if (type !== null) headers['content-type'] = type
    const payload = typeof body === 'string' ? body : JSON.stringify(body)
    headers['content-length'] = String(Buffer.byteLength(payload))
    const outgoing = request({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: CODEBUDDY_IMPORT_ACCOUNT_PATH,
      headers,
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        body: Buffer.concat(chunks).toString('utf8'),
      }))
    })
    outgoing.on('error', reject)
    outgoing.end(payload)
  })
}

/** The on-disk document, or a sentinel when nothing was ever written. */
async function readAccountsFile(dir: string): Promise<string> {
  try {
    return await readFile(join(dir, 'accounts.json'), 'utf8')
  } catch {
    return '<<absent>>'
  }
}

describe('import account route', () => {
  it('stores the refreshed token pair and derives identity from the token', async () => {
    const harness = await startImportServer({
      refresh: async () => ({ accessToken: 'AT-NEW', refreshToken: 'RT-NEW', expiresInSec: 4752000 }),
      fetchModels: async () => [{ id: 'model-a' }],
    })
    const access = fakeJwt({ sub: 'uid-9', nickname: '昵称九' })

    const answer = await postImport(harness.port, { refreshToken: 'RT-PASTED', accessToken: access })
    expect(answer.status).toBe(200)
    const result = JSON.parse(answer.body) as { ok: boolean, account?: { uid: string, nickname?: string } }
    expect(result.ok).toBe(true)
    expect(result.account?.uid).toBe('uid-9')
    expect(result.account?.nickname).toBe('昵称九')

    // The stored record must hold the refreshed pair, never the pasted one.
    const doc = JSON.parse(await readFile(join(harness.dir, 'accounts.json'), 'utf8')) as {
      activeId?: string
      accounts: Record<string, { accessToken: string, refreshToken: string, expiresAtMs: number, uid: string }>
    }
    const stored = Object.values(doc.accounts)
    expect(stored).toHaveLength(1)
    expect(stored[0]?.accessToken).toBe('AT-NEW')
    expect(stored[0]?.refreshToken).toBe('RT-NEW')
    expect(stored[0]?.uid).toBe('uid-9')
    expect(doc.activeId).toBeTruthy()
    // expiresInSec from the refresh answer sets the stored expiry.
    expect(stored[0]?.expiresAtMs).toBeGreaterThan(Date.now() + 4_000_000_000)
  })

  it('probes with the refresh token before writing anything', async () => {
    const harness = await startImportServer({
      refresh: async () => ({ accessToken: 'AT-NEW' }),
      fetchModels: async () => [{ id: 'model-a' }],
    })
    await postImport(harness.port, { refreshToken: 'RT-PASTED' })
    // Two probes, refresh first: the refresh token is what proves liveness.
    expect(harness.probes).toHaveLength(2)
    expect(harness.probes[0]?.refreshToken).toBe('RT-PASTED')
    // The catalog probe uses the freshly minted token, not the pasted one.
    expect(harness.probes[1]?.accessToken).toBe('AT-NEW')
  })

  it('keeps the pasted refresh token when the answer omits a rotation', async () => {
    const harness = await startImportServer({
      refresh: async () => ({ accessToken: 'AT-NEW' }),
      fetchModels: async () => [{ id: 'model-a' }],
    })
    await postImport(harness.port, { refreshToken: 'RT-PASTED' })
    const doc = JSON.parse(await readFile(join(harness.dir, 'accounts.json'), 'utf8')) as {
      accounts: Record<string, { refreshToken: string }>
    }
    expect(Object.values(doc.accounts)[0]?.refreshToken).toBe('RT-PASTED')
  })

  it('rejects a refresh token the upstream refuses and writes nothing', async () => {
    const harness = await startImportServer({
      refresh: async () => { throw new Error('invalid refresh token') },
      fetchModels: async () => [{ id: 'model-a' }],
    })
    const answer = await postImport(harness.port, { refreshToken: 'RT-BAD' })
    const result = JSON.parse(answer.body) as { ok: boolean, error?: string }
    expect(result.ok).toBe(false)
    expect(result.error).toContain('invalid refresh token')
    // The decisive assertion: the store was never touched.
    expect(await readAccountsFile(harness.dir)).toBe('<<absent>>')
  })

  it('rejects a credential the catalog probe refuses and writes nothing', async () => {
    const harness = await startImportServer({
      refresh: async () => ({ accessToken: 'AT-NEW', refreshToken: 'RT-NEW' }),
      fetchModels: async () => { throw new Error('Offline user session not found') },
    })
    const answer = await postImport(harness.port, { refreshToken: 'RT-DEAD' })
    const result = JSON.parse(answer.body) as { ok: boolean, error?: string }
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Offline user session not found')
    // A refresh that succeeds for a session the chat plane refuses must not
    // produce an account either.
    expect(await readAccountsFile(harness.dir)).toBe('<<absent>>')
    // And the previously stored accounts (none here) stay untouched.
    const doc = await harness.store.read()
    expect(doc.accounts).toEqual({})
  })

  it('imports when neither token is a decodable JWT', async () => {
    const harness = await startImportServer({
      refresh: async () => ({ accessToken: 'not-a-jwt', refreshToken: 'RT-NEW' }),
      fetchModels: async () => [{ id: 'model-a' }],
    })
    const answer = await postImport(harness.port, { refreshToken: 'RT-OPAQUE', accessToken: 'opaque-at' })
    const result = JSON.parse(answer.body) as { ok: boolean, account?: { uid: string } }
    expect(result.ok).toBe(true)
    // No claims to read: the uid stays empty rather than failing the import.
    expect(result.account?.uid).toBe('')
  })

  it('prefers an explicit domain over the token-derived region', async () => {
    const harness = await startImportServer({
      refresh: async () => ({ accessToken: 'AT-NEW' }),
      fetchModels: async () => [{ id: 'model-a' }],
    })
    await postImport(harness.port, { refreshToken: 'RT', domain: 'workbuddy.ai' })
    expect(harness.probes[0]?.domain).toBe('workbuddy.ai')
  })

  it('lets the refresh answer override the requested domain', async () => {
    const harness = await startImportServer({
      refresh: async () => ({ accessToken: 'AT-NEW', domain: 'www.codebuddy.cn' }),
      fetchModels: async () => [{ id: 'model-a' }],
    })
    await postImport(harness.port, { refreshToken: 'RT', domain: 'workbuddy.ai' })
    const doc = JSON.parse(await readFile(join(harness.dir, 'accounts.json'), 'utf8')) as {
      accounts: Record<string, { domain: string }>
    }
    // The upstream is authoritative about where the account lives.
    expect(Object.values(doc.accounts)[0]?.domain).toBe('www.codebuddy.cn')
  })

  it('rejects a missing refresh token without probing', async () => {
    const harness = await startImportServer({
      refresh: async () => ({ accessToken: 'AT-NEW' }),
      fetchModels: async () => [{ id: 'model-a' }],
    })
    const answer = await postImport(harness.port, { accessToken: 'AT-ONLY' })
    expect(answer.status).toBe(400)
    expect(harness.probes).toHaveLength(0)
  })

  it('rejects a malformed body', async () => {
    const harness = await startImportServer({
      refresh: async () => ({ accessToken: 'AT-NEW' }),
      fetchModels: async () => [{ id: 'model-a' }],
    })
    const answer = await postImport(harness.port, '{not json')
    expect(answer.status).toBe(400)
  })

  it('answers 501 without an account store and writes nothing', async () => {
    const harness = await startImportServer({
      withAccountStore: false,
      refresh: async () => ({ accessToken: 'AT-NEW' }),
      fetchModels: async () => [{ id: 'model-a' }],
    })
    const answer = await postImport(harness.port, { refreshToken: 'RT' })
    expect(answer.status).toBe(501)
    expect(harness.probes).toHaveLength(0)
  })

  it('answers 501 when the catalog probe is not wired', async () => {
    // Without fetchModels the route cannot prove the credential serves chat,
    // so it must refuse rather than store an unexercised token.
    const harness = await startImportServer({
      refresh: async () => ({ accessToken: 'AT-NEW' }),
    })
    const answer = await postImport(harness.port, { refreshToken: 'RT' })
    expect(answer.status).toBe(501)
    expect(JSON.parse(answer.body)).toEqual({ error: 'import-unavailable' })
    expect(await readAccountsFile(harness.dir)).toBe('<<absent>>')
  })

  it('rejects a non-loopback Origin', async () => {
    const harness = await startImportServer({
      refresh: async () => ({ accessToken: 'AT-NEW' }),
      fetchModels: async () => [{ id: 'model-a' }],
    })
    const answer = await postImport(harness.port, { refreshToken: 'RT' }, { origin: 'https://evil.example' })
    expect(answer.status).toBe(403)
    expect(harness.probes).toHaveLength(0)
    expect(await readAccountsFile(harness.dir)).toBe('<<absent>>')
  })

  it('rejects an absent Origin', async () => {
    const harness = await startImportServer({
      refresh: async () => ({ accessToken: 'AT-NEW' }),
      fetchModels: async () => [{ id: 'model-a' }],
    })
    const answer = await postImport(harness.port, { refreshToken: 'RT' }, { origin: null })
    expect(answer.status).toBe(403)
    expect(harness.probes).toHaveLength(0)
  })

  it('rejects a non-JSON content type', async () => {
    const harness = await startImportServer({
      refresh: async () => ({ accessToken: 'AT-NEW' }),
      fetchModels: async () => [{ id: 'model-a' }],
    })
    const answer = await postImport(harness.port, { refreshToken: 'RT' }, { contentType: 'text/plain' })
    expect(answer.status).toBe(415)
    expect(harness.probes).toHaveLength(0)
  })

  it('rejects a non-loopback Host', async () => {
    const harness = await startImportServer({
      refresh: async () => ({ accessToken: 'AT-NEW' }),
      fetchModels: async () => [{ id: 'model-a' }],
    })
    const answer = await postImport(harness.port, { refreshToken: 'RT' }, { host: 'evil.example' })
    expect(answer.status).toBe(403)
    expect(harness.probes).toHaveLength(0)
  })

  it('never echoes token material in an error answer', async () => {
    const harness = await startImportServer({
      refresh: async () => { throw new Error('refresh rejected: eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.sig') },
      fetchModels: async () => [{ id: 'model-a' }],
    })
    const answer = await postImport(harness.port, { refreshToken: 'RT' })
    expect(answer.body).not.toContain('eyJhbGciOiJSUzI1NiJ9')
    expect(answer.body).toContain('[redacted token]')
  })

  // The account panel renders a balance per card. If the import answer omits
  // it, a freshly added account shows an empty panel until some later poll
  // refills it — which reads as a failed import even though it succeeded.
  it('returns the credit ledger with a successful import', async () => {
    const harness = await startImportServer({
      refresh: async () => ({ accessToken: 'AT-NEW' }),
      fetchModels: async () => [{ id: 'model-a' }],
      credits: async () => ({
        total: 2000,
        accounts: [
          { name: 'CodeBuddy个人版拉新权益包', amount: 1500 },
          { name: 'CodeBuddy个人体验版', amount: 500 },
        ],
      }) as unknown as CodeBuddyWebCredits,
    })
    const answer = await postImport(harness.port, { refreshToken: 'RT' })
    expect(answer.status).toBe(200)
    expect(JSON.parse(answer.body)).toMatchObject({
      ok: true,
      credits: {
        total: 2000,
        accounts: [
          { name: 'CodeBuddy个人版拉新权益包', amount: 1500 },
          { name: 'CodeBuddy个人体验版', amount: 500 },
        ],
      },
    })
  })

  // The account is already proven live by this point, so a credits outage must
  // degrade to "balance pending", never to a lost identity.
  it('still imports when the credit ledger refuses', async () => {
    const harness = await startImportServer({
      refresh: async () => ({ accessToken: 'AT-NEW' }),
      fetchModels: async () => [{ id: 'model-a' }],
      credits: async () => { throw new Error('billing upstream 503') },
    })
    const answer = await postImport(harness.port, { refreshToken: 'RT' })
    expect(answer.status).toBe(200)
    const payload = JSON.parse(answer.body) as { ok: boolean, credits?: unknown }
    expect(payload.ok).toBe(true)
    expect(payload.credits).toBeUndefined()
    const stored = JSON.parse(await readAccountsFile(harness.dir)) as { accounts: Record<string, unknown> }
    expect(Object.keys(stored.accounts)).toHaveLength(1)
  })
})
