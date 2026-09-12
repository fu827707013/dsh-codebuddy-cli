import { createServer, request } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CodeBuddyCredentialStore } from '../src/auth.ts'
import type { CodeBuddyCredential } from '../src/auth.ts'
import type { CodeBuddyCredits } from '../src/upstream.ts'
import {
  codeBuddyCheckInHandler,
  codeBuddyStatusHandler,
  codeBuddyWebStatus,
  codeBuddyLoginStartHandler,
  codeBuddyLoginPollHandler,
  codeBuddySwitchAccountHandler,
  codeBuddyDeleteAccountHandler,
  codeBuddyCreditStatsHandler,
  withAccounts,
} from '../src/web-status.ts'
import {
  CODEBUDDY_CHECKIN_PATH,
  CODEBUDDY_STATUS_PATH,
  CODEBUDDY_LOGIN_START_PATH,
  CODEBUDDY_LOGIN_POLL_PATH,
  CODEBUDDY_SWITCH_ACCOUNT_PATH,
  CODEBUDDY_DELETE_ACCOUNT_PATH,
  CODEBUDDY_CREDIT_STATS_PATH,
} from '../src/status-paths.ts'
import type { CodeBuddyWebCredits } from '../src/status-paths.ts'
import type { CodeBuddyStatusRouteOptions } from '../src/web-status.ts'
import type { CodeBuddyUsageStats } from '../src/upstream.ts'
import { AccountStore } from '../src/account-store.ts'

const CLEANUP: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(CLEANUP.splice(0).map(clean => clean()))
})

function nestedDoc(expiresAt: number): string {
  return JSON.stringify({
    auth: { accessToken: 'at', refreshToken: 'rt', expiresAt, domain: 'www.codebuddy.cn' },
    account: { uid: 'uid-1', nickname: '昵称' },
  })
}

/** Raw HTTP request with full header control (fetch forbids overriding Host). */
function requestOnce(options: {
  port: number
  method: string
  headers: Record<string, string>
}): Promise<{ status: number, body: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = request({
      host: '127.0.0.1',
      port: options.port,
      method: options.method,
      path: CODEBUDDY_STATUS_PATH,
      headers: options.headers,
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        body: Buffer.concat(chunks).toString('utf8'),
      }))
    })
    outgoing.on('error', reject)
    outgoing.end()
  })
}

async function startStatusServer(): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), 'wb-status-'))
  CLEANUP.push(() => rm(dir, { recursive: true, force: true }))
  const cli = join(dir, 'Tencent-Cloud.coding-copilot.info')
  await writeFile(cli, nestedDoc(Date.now() + 3600_000))
  const deps: CodeBuddyStatusRouteOptions = {
    store: new CodeBuddyCredentialStore({
      cliPath: cli,
      ownPath: join(dir, 'own.json'),
      refresh: async credential => ({ accessToken: credential.accessToken }),
    }),
    client: { fetchCredits: async () => ({ total: 0, accounts: [] }) },
    models: () => [],
  }
  const server = createServer(codeBuddyStatusHandler(deps))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  CLEANUP.push(() => new Promise<void>(resolve => server.close(() => resolve())))
  return port
}

describe('web status route gate', () => {
  it('serves a same-origin GET without an Origin header', async () => {
    const port = await startStatusServer()
    const response = await requestOnce({ port, method: 'GET', headers: { host: `127.0.0.1:${String(port)}` } })
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toMatchObject({ status: 'signed-in', nickname: '昵称' })
  })

  it('accepts localhost hosts and explicit loopback Origins', async () => {
    const port = await startStatusServer()
    const viaLocalhost = await requestOnce({ port, method: 'GET', headers: { host: `localhost:${String(port)}` } })
    expect(viaLocalhost.status).toBe(200)
    const viaOrigin = await requestOnce({
      port,
      method: 'GET',
      headers: { host: `127.0.0.1:${String(port)}`, origin: `http://127.0.0.1:${String(port)}` },
    })
    expect(viaOrigin.status).toBe(200)
  })

  it('drops a DNS-rebinding style request whose Host is not loopback', async () => {
    const port = await startStatusServer()
    const response = await requestOnce({ port, method: 'GET', headers: { host: 'evil.example:3080' } })
    expect(response.status).toBe(403)
  })

  it('drops a request whose Origin is not loopback even on a loopback Host', async () => {
    const port = await startStatusServer()
    const response = await requestOnce({
      port,
      method: 'GET',
      headers: { host: `127.0.0.1:${String(port)}`, origin: 'http://evil.example' },
    })
    expect(response.status).toBe(403)
  })

  it('answers 405 for non-GET methods', async () => {
    const port = await startStatusServer()
    const response = await requestOnce({ port, method: 'POST', headers: { host: `127.0.0.1:${String(port)}` } })
    expect(response.status).toBe(405)
  })
})

describe('status document catalog and credits cache', () => {
  const creditCounts: { count: number } = { count: 0 }

  function depsWithCatalog(models: CodeBuddyStatusRouteOptions['models']): CodeBuddyStatusRouteOptions {
    const store = {
      status: async () => ({ state: 'signed-in' as const }),
      current: async (): Promise<CodeBuddyCredential> => ({
        accessToken: 'at', refreshToken: 'rt', expiresAtMs: Date.now() + 3_600_000,
        domain: 'www.codebuddy.cn', uid: 'u', source: 'dsh',
      }),
    } as unknown as CodeBuddyCredentialStore
    return {
      store,
      client: {
        fetchCredits: async (): Promise<CodeBuddyCredits> => {
          creditCounts.count += 1
          return { total: 4_321, accounts: [{ packageName: '专业版', remain: 4_321, size: 10_000, total: 10_000, used: 5_679, expired: false, expiringSoon: false }] }
        },
      },
      models,
    }
  }

  it('ships whole-catalog rate and name maps for the dock', async () => {
    const deps = depsWithCatalog(() => [
      { id: 'glm-5.3', name: 'GLM-5.3', contextWindow: 1, maxTokens: 1, supportsImages: false, billing: { credits: 'x0.79 credits', free: false } },
      { id: 'hy3', name: 'Hy3', contextWindow: 1, maxTokens: 1, supportsImages: false, billing: { credits: 'x0.00', badges: ['限时免费'], free: true } },
    ])
    const document = await codeBuddyWebStatus(deps)
    if (document.status !== 'signed-in') throw new Error('expected signed-in')
    expect(document.catalog).toEqual({
      rates: { 'glm-5.3': 'x0.79', hy3: 'x0.00' },
      names: { 'glm-5.3': 'GLM-5.3', hy3: 'Hy3' },
    })
  })

  it('omits the catalog field for an empty model list', async () => {
    const deps = depsWithCatalog(() => [])
    const document = await codeBuddyWebStatus(deps)
    if (document.status !== 'signed-in') throw new Error('expected signed-in')
    expect(document.catalog).toBeUndefined()
  })

  it('memoizes the billing answer within the TTL window', async () => {
    creditCounts.count = 0
    const cache: { entry?: { at: number; credits: CodeBuddyWebCredits } } = {}
    const deps = depsWithCatalog(() => [])
    await codeBuddyWebStatus(deps, cache)
    await codeBuddyWebStatus(deps, cache)
    await codeBuddyWebStatus(deps, cache)
    expect(creditCounts.count).toBe(1)
  })

  it('does not share state across independent callers without a cache', async () => {
    creditCounts.count = 0
    const deps = depsWithCatalog(() => [])
    await codeBuddyWebStatus(deps)
    await codeBuddyWebStatus(deps)
    expect(creditCounts.count).toBe(2)
  })
})

describe('check-in route gate', () => {
  /** Raw check-in POST with full header control. */
  function requestCheckIn(options: {
    port: number
    method: string
    headers: Record<string, string>
    body?: string
  }): Promise<{ status: number, body: string }> {
    return new Promise((resolve, reject) => {
      const outgoing = request({
        host: '127.0.0.1',
        port: options.port,
        method: options.method,
        path: CODEBUDDY_CHECKIN_PATH,
        headers: options.headers,
      }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
        }))
      })
      outgoing.on('error', reject)
      outgoing.end(options.body ?? '')
    })
  }

  async function startCheckInServer(
    checkIn: CodeBuddyStatusRouteOptions['checkIn'],
  ): Promise<number> {
    const credential: CodeBuddyCredential = {
      accessToken: 'at', refreshToken: 'rt', expiresAtMs: Date.now() + 3_600_000,
      domain: 'www.codebuddy.cn', uid: 'u', source: 'dsh',
    }
    const deps: CodeBuddyStatusRouteOptions = {
      store: { resolve: async () => credential } as unknown as CodeBuddyCredentialStore,
      client: { fetchCredits: async () => ({ total: 0, accounts: [] }) },
      models: () => [],
      ...checkIn === undefined ? {} : { checkIn },
    }
    const server = createServer(codeBuddyCheckInHandler(deps))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as { port: number }
    CLEANUP.push(() => new Promise<void>(resolve => server.close(() => resolve())))
    return port
  }

  const jsonHeaders = (port: number): Record<string, string> => ({
    host: `127.0.0.1:${String(port)}`,
    origin: `http://127.0.0.1:${String(port)}`,
    'content-type': 'application/json',
  })

  it('serves a check-in POST and returns the classified outcome', async () => {
    const port = await startCheckInServer(async () => ({ status: 'ok', message: 'success' }))
    const response = await requestCheckIn({
      port, method: 'POST', headers: jsonHeaders(port), body: '{}',
    })
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ status: 'ok', message: 'success' })
  })

  it('passes the resolved credential to the executor', async () => {
    const seen: string[] = []
    const port = await startCheckInServer(async (credential) => {
      seen.push(credential.accessToken)
      return { status: 'ok', message: '' }
    })
    await requestCheckIn({ port, method: 'POST', headers: jsonHeaders(port), body: '{}' })
    expect(seen).toEqual(['at'])
  })

  it('refuses a POST without an Origin header', async () => {
    const port = await startCheckInServer(async () => ({ status: 'ok', message: '' }))
    const response = await requestCheckIn({
      port, method: 'POST', headers: { host: `127.0.0.1:${String(port)}`, 'content-type': 'application/json' },
    })
    expect(response.status).toBe(403)
  })

  it('drops a request whose Host is not loopback', async () => {
    const port = await startCheckInServer(async () => ({ status: 'ok', message: '' }))
    const response = await requestCheckIn({
      port, method: 'POST', headers: { host: 'evil.example:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'application/json' },
    })
    expect(response.status).toBe(403)
  })

  it('answers 405 for non-POST methods', async () => {
    const port = await startCheckInServer(async () => ({ status: 'ok', message: '' }))
    const response = await requestCheckIn({ port, method: 'GET', headers: jsonHeaders(port) })
    expect(response.status).toBe(405)
  })

  it('answers 415 for a non-JSON content type', async () => {
    const port = await startCheckInServer(async () => ({ status: 'ok', message: '' }))
    const response = await requestCheckIn({
      port, method: 'POST',
      headers: { host: `127.0.0.1:${String(port)}`, origin: `http://127.0.0.1:${String(port)}`, 'content-type': 'text/plain' },
    })
    expect(response.status).toBe(415)
  })

  it('answers 501 when no check-in executor is attached', async () => {
    const port = await startCheckInServer(undefined)
    const response = await requestCheckIn({ port, method: 'POST', headers: jsonHeaders(port), body: '{}' })
    expect(response.status).toBe(501)
    expect(JSON.parse(response.body)).toEqual({ error: 'check-in-unavailable' })
  })

  it('answers 500 when the executor fails', async () => {
    const port = await startCheckInServer(async () => { throw new Error('boom') })
    const response = await requestCheckIn({ port, method: 'POST', headers: jsonHeaders(port), body: '{}' })
    expect(response.status).toBe(500)
    expect(JSON.parse(response.body)).toEqual({ error: 'boom' })
  })
})

describe('account management routes', () => {
  /** Raw HTTP request against an arbitrary path with full header control. */
  function requestOnce(options: {
    port: number
    method: string
    path: string
    headers: Record<string, string>
    body?: string
  }): Promise<{ status: number, body: string }> {
    return new Promise((resolve, reject) => {
      const outgoing = request({
        host: '127.0.0.1',
        port: options.port,
        method: options.method,
        path: options.path,
        headers: options.headers,
      }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
        }))
      })
      outgoing.on('error', reject)
      outgoing.end(options.body ?? '')
    })
  }

  const jsonHeaders = (port: number): Record<string, string> => ({
    host: `127.0.0.1:${String(port)}`,
    origin: `http://127.0.0.1:${String(port)}`,
    'content-type': 'application/json',
  })

  async function startAccountServer(deps: CodeBuddyStatusRouteOptions): Promise<number> {
    const server = createServer((req, res) => {
      const handler = req.url === CODEBUDDY_LOGIN_START_PATH
        ? codeBuddyLoginStartHandler(deps)
        : req.url === CODEBUDDY_LOGIN_POLL_PATH
          ? codeBuddyLoginPollHandler(deps)
          : req.url === CODEBUDDY_SWITCH_ACCOUNT_PATH
            ? codeBuddySwitchAccountHandler(deps)
            : req.url === CODEBUDDY_DELETE_ACCOUNT_PATH
              ? codeBuddyDeleteAccountHandler(deps)
              : codeBuddyStatusHandler(deps)
      void handler(req, res)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as { port: number }
    CLEANUP.push(() => new Promise<void>(resolve => server.close(() => resolve())))
    return port
  }

  async function makeDeps(
    overrides: Partial<CodeBuddyStatusRouteOptions> = {},
    omit: ReadonlyArray<'loginStart' | 'loginPoll' | 'resolveIdentity' | 'accountStore'> = [],
  ): Promise<{
    deps: CodeBuddyStatusRouteOptions
    dir: string
  }> {
    const dir = await mkdtemp(join(tmpdir(), 'wb-accroutes-'))
    CLEANUP.push(() => rm(dir, { recursive: true, force: true }))
    const accountStore = new AccountStore(join(dir, 'accounts.json'))
    const credential: CodeBuddyCredential = {
      accessToken: 'at', refreshToken: 'rt', expiresAtMs: Date.now() + 3_600_000,
      domain: 'www.codebuddy.cn', uid: 'u', source: 'dsh',
    }
    const omitSet = new Set(omit)
    const deps: CodeBuddyStatusRouteOptions = {
      store: { resolve: async () => credential } as unknown as CodeBuddyCredentialStore,
      client: { fetchCredits: async () => ({ total: 0, accounts: [] }) },
      models: () => [],
      ...omitSet.has('accountStore') ? {} : { accountStore },
      ...omitSet.has('loginStart') ? {} : { loginStart: async () => ({ authUrl: 'https://auth.example/login?state=st-1', state: 'st-1' }) },
      ...omitSet.has('loginPoll') ? {} : { loginPoll: async () => undefined },
      ...omitSet.has('resolveIdentity') ? {} : { resolveIdentity: async () => ({ ideType: 'cli', ideName: 'cli', ideVersion: '2.108.1', productVersion: '2.108.1' }) },
      ...overrides,
    }
    return { deps, dir }
  }

  it('login start returns the authUrl and state', async () => {
    const { deps } = await makeDeps()
    const port = await startAccountServer(deps)
    const response = await requestOnce({
      port, method: 'POST', path: CODEBUDDY_LOGIN_START_PATH, headers: jsonHeaders(port), body: '{}',
    })
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ ok: true, authUrl: 'https://auth.example/login?state=st-1', state: 'st-1' })
  })

  it('login start answers 501 when no loginStart is attached', async () => {
    const { deps } = await makeDeps({}, ['loginStart', 'resolveIdentity'])
    const port = await startAccountServer(deps)
    const response = await requestOnce({
      port, method: 'POST', path: CODEBUDDY_LOGIN_START_PATH, headers: jsonHeaders(port), body: '{}',
    })
    expect(response.status).toBe(501)
    expect(JSON.parse(response.body)).toEqual({ error: 'login-unavailable' })
  })

  it('login poll reports not-done while pending', async () => {
    const { deps } = await makeDeps({ loginPoll: async () => undefined })
    const port = await startAccountServer(deps)
    const response = await requestOnce({
      port, method: 'POST', path: CODEBUDDY_LOGIN_POLL_PATH, headers: jsonHeaders(port),
      body: JSON.stringify({ state: 'st-1' }),
    })
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ done: false })
  })

  it('login poll stores the new account and returns it active', async () => {
    const { deps, dir } = await makeDeps({
      loginPoll: async () => ({
        accessToken: 'at-new', refreshToken: 'rt-new', expiresAtMs: Date.now() + 3600_000,
        uid: 'uid-new', nickname: '新账号', domain: 'www.codebuddy.cn',
      }),
    })
    const port = await startAccountServer(deps)
    const response = await requestOnce({
      port, method: 'POST', path: CODEBUDDY_LOGIN_POLL_PATH, headers: jsonHeaders(port),
      body: JSON.stringify({ state: 'st-1' }),
    })
    expect(response.status).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.done).toBe(true)
    expect(body.account).toMatchObject({ uid: 'uid-new', nickname: '新账号', active: true })
    // The account was persisted.
    const store = new AccountStore(join(dir, 'accounts.json'))
    const active = await store.activeCredential()
    expect(active?.nickname).toBe('新账号')
  })

  it('login poll answers 400 for a missing state', async () => {
    const { deps } = await makeDeps()
    const port = await startAccountServer(deps)
    const response = await requestOnce({
      port, method: 'POST', path: CODEBUDDY_LOGIN_POLL_PATH, headers: jsonHeaders(port), body: '{}',
    })
    expect(response.status).toBe(400)
  })

  it('switch account sets the active account', async () => {
    const { deps } = await makeDeps()
    await deps.accountStore!.add({
      id: 'acc-1', uid: 'u1', domain: 'www.codebuddy.cn',
      accessToken: 'a', refreshToken: 'r', expiresAtMs: Date.now() + 3600_000,
    })
    await deps.accountStore!.add({
      id: 'acc-2', uid: 'u2', domain: 'www.codebuddy.cn',
      accessToken: 'a', refreshToken: 'r', expiresAtMs: Date.now() + 3600_000,
    })
    const port = await startAccountServer(deps)
    const response = await requestOnce({
      port, method: 'POST', path: CODEBUDDY_SWITCH_ACCOUNT_PATH, headers: jsonHeaders(port),
      body: JSON.stringify({ id: 'acc-2' }),
    })
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ ok: true })
    const active = await deps.accountStore!.activeCredential()
    expect(active?.uid).toBe('u2')
  })

  it('switch account answers 404 for a missing account', async () => {
    const { deps } = await makeDeps()
    const port = await startAccountServer(deps)
    const response = await requestOnce({
      port, method: 'POST', path: CODEBUDDY_SWITCH_ACCOUNT_PATH, headers: jsonHeaders(port),
      body: JSON.stringify({ id: 'missing' }),
    })
    expect(response.status).toBe(404)
  })

  it('delete account removes it', async () => {
    const { deps } = await makeDeps()
    await deps.accountStore!.add({
      id: 'acc-1', uid: 'u1', domain: 'www.codebuddy.cn',
      accessToken: 'a', refreshToken: 'r', expiresAtMs: Date.now() + 3600_000,
    })
    const port = await startAccountServer(deps)
    const response = await requestOnce({
      port, method: 'POST', path: CODEBUDDY_DELETE_ACCOUNT_PATH, headers: jsonHeaders(port),
      body: JSON.stringify({ id: 'acc-1' }),
    })
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ ok: true })
    expect(await deps.accountStore!.summaries()).toHaveLength(0)
  })

  it('delete account answers 404 for a missing account', async () => {
    const { deps } = await makeDeps()
    const port = await startAccountServer(deps)
    const response = await requestOnce({
      port, method: 'POST', path: CODEBUDDY_DELETE_ACCOUNT_PATH, headers: jsonHeaders(port),
      body: JSON.stringify({ id: 'missing' }),
    })
    expect(response.status).toBe(404)
  })

  it('account routes refuse requests without an Origin header', async () => {
    const { deps } = await makeDeps()
    const port = await startAccountServer(deps)
    const response = await requestOnce({
      port, method: 'POST', path: CODEBUDDY_SWITCH_ACCOUNT_PATH,
      headers: { host: `127.0.0.1:${String(port)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'x' }),
    })
    expect(response.status).toBe(403)
  })

  it('withAccounts injects stored accounts into a signed-in document', async () => {
    const { deps } = await makeDeps()
    await deps.accountStore!.add({
      id: 'acc-1', uid: 'u1', nickname: '一号', domain: 'www.codebuddy.cn',
      accessToken: 'a', refreshToken: 'r', expiresAtMs: Date.now() + 3600_000,
    })
    const signedIn = { status: 'signed-in' as const, nickname: '一号' }
    const doc = await withAccounts(deps, signedIn)
    if (doc.status !== 'signed-in') throw new Error('expected signed-in')
    expect(doc.accounts).toHaveLength(1)
    expect(doc.accounts![0]).toMatchObject({ id: 'acc-1', uid: 'u1', active: true })
  })

  it('withAccounts injects an empty list into a signed-out document so the panel stays reachable', async () => {
    const { deps } = await makeDeps()
    const doc = await withAccounts(deps, { status: 'signed-out' })
    expect(doc).toEqual({ status: 'signed-out', accounts: [] })
  })

  it('withAccounts leaves the document untouched when no account store is attached', async () => {
    const { deps } = await makeDeps({}, ['accountStore'])
    const doc = await withAccounts(deps, { status: 'signed-out' })
    expect(doc).toEqual({ status: 'signed-out' })
  })

  /** Today's local date as YYYY-MM-DD, matching the host's own key. */
  function localToday(): string {
    const now = new Date()
    const pad = (v: number) => String(v).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  }

  it('withAccounts reports checkedInToday when the account checked in today', async () => {
    const { deps } = await makeDeps()
    await deps.accountStore!.add({
      id: 'acc-cin', uid: 'u-cin', nickname: '签到号', domain: 'www.codebuddy.cn',
      accessToken: 'a', refreshToken: 'r', expiresAtMs: Date.now() + 3600_000,
    })
    await deps.accountStore!.recordCheckIn('acc-cin', localToday(), 'ok')
    const doc = await withAccounts(deps, { status: 'signed-out' })
    expect(doc.status).toBe('signed-out')
    const accounts = 'accounts' in doc ? doc.accounts ?? [] : []
    expect(accounts[0]).toMatchObject({ id: 'acc-cin', checkedInToday: true })
  })

  it('withAccounts reports checkedInToday=false for a stale or failed record', async () => {
    const { deps } = await makeDeps()
    await deps.accountStore!.add({
      id: 'acc-stale', uid: 'u-stale', domain: 'www.codebuddy.cn',
      accessToken: 'a', refreshToken: 'r', expiresAtMs: Date.now() + 3600_000,
    })
    // Checked in yesterday → not today.
    await deps.accountStore!.recordCheckIn('acc-stale', '2020-01-01', 'ok')
    const stale = await withAccounts(deps, { status: 'signed-out' })
    const staleAccounts = 'accounts' in stale ? stale.accounts ?? [] : []
    expect(staleAccounts[0]).toMatchObject({ id: 'acc-stale', checkedInToday: false })
    // Failed today → not checked in either.
    await deps.accountStore!.recordCheckIn('acc-stale', localToday(), 'failed')
    const failed = await withAccounts(deps, { status: 'signed-out' })
    const failedAccounts = 'accounts' in failed ? failed.accounts ?? [] : []
    expect(failedAccounts[0]).toMatchObject({ id: 'acc-stale', checkedInToday: false })
  })

  it('withAccounts omits checkedInToday when no record exists', async () => {
    const { deps } = await makeDeps()
    await deps.accountStore!.add({
      id: 'acc-fresh', uid: 'u-fresh', domain: 'www.codebuddy.cn',
      accessToken: 'a', refreshToken: 'r', expiresAtMs: Date.now() + 3600_000,
    })
    const doc = await withAccounts(deps, { status: 'signed-out' })
    if (doc.status !== 'signed-out') throw new Error('expected signed-out')
    const accounts = 'accounts' in doc ? doc.accounts ?? [] : []
    expect(accounts[0]).toMatchObject({ id: 'acc-fresh' })
    expect(accounts[0]).not.toHaveProperty('checkedInToday')
  })

  it('check-in against a targeted account persists the result', async () => {
    const { deps } = await makeDeps({ checkIn: async () => ({ status: 'ok', message: 'done' }) })
    await deps.accountStore!.add({
      id: 'acc-target', uid: 'u-target', nickname: '目标', domain: 'www.codebuddy.cn',
      accessToken: 'a', refreshToken: 'r', expiresAtMs: Date.now() + 3600_000,
    })
    const server = createServer(codeBuddyCheckInHandler(deps))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as { port: number }
    CLEANUP.push(() => new Promise<void>(resolve => server.close(() => resolve())))
    const response = await requestOnce({
      port, method: 'POST', path: CODEBUDDY_CHECKIN_PATH, headers: jsonHeaders(port),
      body: JSON.stringify({ id: 'acc-target' }),
    })
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ status: 'ok', message: 'done' })
    const summaries = await deps.accountStore!.summaries()
    expect(summaries[0]?.lastCheckIn).toMatchObject({ date: localToday(), result: 'ok' })
  })

  it('check-in answers 404 for an unknown targeted account', async () => {
    const { deps } = await makeDeps({ checkIn: async () => ({ status: 'ok', message: 'done' }) })
    const server = createServer(codeBuddyCheckInHandler(deps))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as { port: number }
    CLEANUP.push(() => new Promise<void>(resolve => server.close(() => resolve())))
    const response = await requestOnce({
      port, method: 'POST', path: CODEBUDDY_CHECKIN_PATH, headers: jsonHeaders(port),
      body: JSON.stringify({ id: 'missing' }),
    })
    expect(response.status).toBe(404)
  })

  it('check-in answers 400 for a malformed body instead of falling back to the active account', async () => {
    const { deps } = await makeDeps({ checkIn: async () => ({ status: 'ok', message: 'done' }) })
    const server = createServer(codeBuddyCheckInHandler(deps))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as { port: number }
    CLEANUP.push(() => new Promise<void>(resolve => server.close(() => resolve())))
    for (const body of ['not-json', '[1,2]', 'null']) {
      const response = await requestOnce({
        port, method: 'POST', path: CODEBUDDY_CHECKIN_PATH, headers: jsonHeaders(port), body,
      })
      expect(response.status).toBe(400)
    }
  })
})

describe('credit-statistics route', () => {
  /** Raw HTTP request against the credit-stats path. */
  function requestStats(options: {
    port: number
    method: string
    headers: Record<string, string>
    body?: string
  }): Promise<{ status: number, body: string }> {
    return new Promise((resolve, reject) => {
      const outgoing = request({
        host: '127.0.0.1',
        port: options.port,
        method: options.method,
        path: CODEBUDDY_CREDIT_STATS_PATH,
        headers: options.headers,
      }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
        }))
      })
      outgoing.on('error', reject)
      outgoing.end(options.body ?? '')
    })
  }

  /** Build a deterministic usage stats document for the fetchUsage mock. */
  function usageStats(overrides: Partial<CodeBuddyUsageStats> = {}): CodeBuddyUsageStats {
    const today = new Date().toISOString().slice(0, 10)
    return {
      status: 'complete',
      rangeStart: today,
      rangeEnd: today,
      collectedAt: Date.now(),
      summary: { usageToday: 10, usage7Days: 20, usageThisMonth: 30 },
      daily: [{ date: today, usage: 10 }],
      models: [{ model: 'model-a', requestCount: 2, credit: 10 }],
      requests: [{ requestId: 'r1', model: 'model-a', client: 'cli', credit: 10, requestTime: `${today} 12:00:00`, date: today, ts: Date.now() }],
      detailLimit: 100,
      ...overrides,
    }
  }

  async function startStatsServer(deps: CodeBuddyStatusRouteOptions): Promise<number> {
    const server = createServer(codeBuddyCreditStatsHandler(deps))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as { port: number }
    CLEANUP.push(() => new Promise<void>(resolve => server.close(() => resolve())))
    return port
  }

  async function makeStatsDeps(
    usage: (c: CodeBuddyCredential) => Promise<CodeBuddyUsageStats>,
  ): Promise<CodeBuddyStatusRouteOptions> {
    const dir = await mkdtemp(join(tmpdir(), 'wb-stats-'))
    CLEANUP.push(() => rm(dir, { recursive: true, force: true }))
    const accountStore = new AccountStore(join(dir, 'accounts.json'))
    const credential: CodeBuddyCredential = {
      accessToken: 'at', refreshToken: 'rt', expiresAtMs: Date.now() + 3_600_000,
      domain: 'www.codebuddy.cn', uid: 'u', source: 'dsh',
    }
    return {
      store: { resolve: async () => credential } as unknown as CodeBuddyCredentialStore,
      client: { fetchCredits: async () => ({ total: 0, accounts: [] }) },
      models: () => [],
      accountStore,
      fetchUsage: usage,
    }
  }

  const jsonHeaders = (port: number): Record<string, string> => ({
    host: `127.0.0.1:${String(port)}`,
    origin: `http://127.0.0.1:${String(port)}`,
    'content-type': 'application/json',
  })

  it('serves a GET with aggregated statistics across stored accounts', async () => {
    const deps = await makeStatsDeps(async () => usageStats())
    await deps.accountStore!.add({
      id: 'stats-ok', uid: 'u1', nickname: '一号', domain: 'www.codebuddy.cn',
      accessToken: 'a', refreshToken: 'r', expiresAtMs: Date.now() + 3600_000,
    })
    const port = await startStatsServer(deps)
    const response = await requestStats({ port, method: 'GET', headers: { host: `127.0.0.1:${String(port)}` } })
    expect(response.status).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.status).toBe('complete')
    expect(body.summary.usageToday).toBe(10)
    expect(body.accounts).toHaveLength(1)
    expect(body.accounts[0]).toMatchObject({ accountId: 'stats-ok', ok: true })
  })

  it('marks a fully failed account fetch as unavailable', async () => {
    const deps = await makeStatsDeps(async () => {
      throw new Error('usage down')
    })
    await deps.accountStore!.add({
      id: 'stats-fail', uid: 'u2', nickname: '二号', domain: 'www.codebuddy.cn',
      accessToken: 'a', refreshToken: 'r', expiresAtMs: Date.now() + 3600_000,
    })
    const port = await startStatsServer(deps)
    const response = await requestStats({ port, method: 'GET', headers: { host: `127.0.0.1:${String(port)}` } })
    expect(response.status).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.status).toBe('unavailable')
    expect(body.accounts[0].ok).toBe(false)
  })

  it('POST with refresh=true clears the cache and re-fetches', async () => {
    let calls = 0
    const deps = await makeStatsDeps(async () => {
      calls += 1
      return usageStats()
    })
    await deps.accountStore!.add({
      id: 'stats-refresh', uid: 'u3', nickname: '三号', domain: 'www.codebuddy.cn',
      accessToken: 'a', refreshToken: 'r', expiresAtMs: Date.now() + 3600_000,
    })
    const port = await startStatsServer(deps)
    await requestStats({ port, method: 'GET', headers: { host: `127.0.0.1:${String(port)}` } })
    await requestStats({ port, method: 'GET', headers: { host: `127.0.0.1:${String(port)}` } })
    const cachedCalls = calls
    const refreshed = await requestStats({
      port, method: 'POST', headers: jsonHeaders(port), body: JSON.stringify({ refresh: true }),
    })
    expect(refreshed.status).toBe(200)
    expect(calls).toBe(cachedCalls + 1)
  })

  it('answers 403 for a non-loopback host', async () => {
    const deps = await makeStatsDeps(async () => usageStats())
    const port = await startStatsServer(deps)
    const response = await requestStats({ port, method: 'GET', headers: { host: 'evil.example:3080' } })
    expect(response.status).toBe(403)
  })
})
