import { createServer, request } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CodeBuddyCredentialStore } from '../src/auth.ts'
import type { CodeBuddyCredential } from '../src/auth.ts'
import type { CodeBuddyCredits } from '../src/upstream.ts'
import { codeBuddyStatusHandler, codeBuddyWebStatus } from '../src/web-status.ts'
import { CODEBUDDY_STATUS_PATH } from '../src/status-paths.ts'
import type { CodeBuddyWebCredits } from '../src/status-paths.ts'
import type { CodeBuddyStatusRouteOptions } from '../src/web-status.ts'

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
          return { total: 4_321, accounts: [{ packageName: '专业版', remain: 4_321, size: 10_000 }] }
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
