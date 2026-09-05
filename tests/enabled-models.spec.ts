import { createServer, request } from 'node:http'
import { describe, expect, it, afterEach } from 'vitest'
import { filterEnabledModels, FALLBACK_CODEBUDDY_MODELS } from '../src/catalog.ts'
import type { CodeBuddyModelInfo } from '../src/catalog.ts'
import type { CodeBuddyCredential } from '../src/auth.ts'
import type { CodeBuddyCredentialStore } from '../src/auth.ts'
import { codeBuddyEnabledModelsHandler, codeBuddyWebStatus } from '../src/web-status.ts'
import type { CodeBuddyStatusRouteOptions } from '../src/web-status.ts'
import { CODEBUDDY_MODELS_PATH } from '../src/status-paths.ts'

const CLEANUP: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(CLEANUP.splice(0).map(clean => clean()))
})

function model(id: string, name: string, credits?: string): CodeBuddyModelInfo {
  return {
    id,
    name,
    contextWindow: 1,
    maxTokens: 1,
    supportsImages: false,
    ...credits === undefined ? {} : { billing: { credits, free: credits === 'x0.00' } },
  }
}

const CATALOG: readonly CodeBuddyModelInfo[] = [
  model('auto', 'Auto'),
  model('glm-5.3', 'GLM-5.3', 'x0.79'),
  model('hy3', 'Hy3', 'x0.00'),
]

describe('filterEnabledModels', () => {
  it('serves the whole catalog for an absent selection', () => {
    expect(filterEnabledModels(CATALOG, undefined)).toEqual(CATALOG)
  })

  it('serves the whole catalog for an empty selection rather than emptying the picker', () => {
    expect(filterEnabledModels(CATALOG, [])).toEqual(CATALOG)
  })

  it('keeps only the selected ids, in catalog order', () => {
    expect(filterEnabledModels(CATALOG, ['hy3', 'auto']).map(entry => entry.id)).toEqual(['auto', 'hy3'])
  })

  it('ignores ids the catalog no longer serves', () => {
    expect(filterEnabledModels(CATALOG, ['auto', 'retired-model']).map(entry => entry.id)).toEqual(['auto'])
  })

  it('falls back to the whole catalog when the selection has gone entirely stale', () => {
    expect(filterEnabledModels(CATALOG, ['retired-a', 'retired-b'])).toEqual(CATALOG)
  })

  it('narrows the real fallback roster', () => {
    const kept = filterEnabledModels(FALLBACK_CODEBUDDY_MODELS, ['glm-5.3', 'hy4-preview'])
    expect(kept.map(entry => entry.id)).toEqual(['hy4-preview', 'glm-5.3'])
  })
})

/** Status deps over a fixed catalog, with a recording settings writer. */
function deps(options: {
  enabled?: readonly string[]
  writable?: boolean
  written?: { ids?: readonly string[] }
}): CodeBuddyStatusRouteOptions {
  const writable = options.writable ?? true
  const store = {
    status: async () => ({ state: 'signed-in' as const }),
    current: async (): Promise<CodeBuddyCredential> => ({
      accessToken: 'at', refreshToken: 'rt', expiresAtMs: Date.now() + 3_600_000,
      domain: 'www.codebuddy.cn', uid: 'u', source: 'dsh',
    }),
  } as unknown as CodeBuddyCredentialStore
  return {
    store,
    client: { fetchCredits: async () => ({ total: 0, accounts: [] }) },
    models: () => CATALOG,
    enabledModels: () => options.enabled,
    setEnabledModels: async ids => {
      if (!writable) return false
      if (options.written !== undefined) options.written.ids = ids
      return true
    },
    settingsWritable: () => writable,
  }
}

describe('status document selection block', () => {
  it('reports every model offered when nothing is stored', async () => {
    const document = await codeBuddyWebStatus(deps({}))
    if (document.status !== 'signed-in') throw new Error('expected signed-in')
    expect(document.selection?.restricted).toBe(false)
    expect(document.selection?.writable).toBe(true)
    expect(document.selection?.choices.map(choice => [choice.id, choice.enabled])).toEqual([
      ['auto', true], ['glm-5.3', true], ['hy3', true],
    ])
  })

  it('marks the stored selection and reports the restriction', async () => {
    const document = await codeBuddyWebStatus(deps({ enabled: ['auto'] }))
    if (document.status !== 'signed-in') throw new Error('expected signed-in')
    expect(document.selection?.restricted).toBe(true)
    expect(document.selection?.choices.map(choice => [choice.id, choice.enabled])).toEqual([
      ['auto', true], ['glm-5.3', false], ['hy3', false],
    ])
  })

  it('carries the display rate and badges each row renders', async () => {
    const document = await codeBuddyWebStatus(deps({}))
    if (document.status !== 'signed-in') throw new Error('expected signed-in')
    const byId = new Map(document.selection?.choices.map(choice => [choice.id, choice]))
    expect(byId.get('glm-5.3')?.credits).toBe('x0.79')
    expect(byId.get('hy3')?.free).toBe(true)
  })

  it('reports a non-writable selection when no settings provider is attached', async () => {
    const document = await codeBuddyWebStatus(deps({ writable: false }))
    if (document.status !== 'signed-in') throw new Error('expected signed-in')
    expect(document.selection?.writable).toBe(false)
  })
})

/** POST the write route with full header control. */
function postOnce(options: {
  port: number
  headers: Record<string, string>
  body?: string
  method?: string
}): Promise<{ status: number, body: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = request({
      host: '127.0.0.1',
      port: options.port,
      method: options.method ?? 'POST',
      path: CODEBUDDY_MODELS_PATH,
      headers: options.headers,
    }, res => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        body: Buffer.concat(chunks).toString('utf8'),
      }))
    })
    outgoing.on('error', reject)
    if (options.body !== undefined) outgoing.write(options.body)
    outgoing.end()
  })
}

async function startWriteServer(routeDeps: CodeBuddyStatusRouteOptions): Promise<number> {
  const server = createServer(codeBuddyEnabledModelsHandler(routeDeps))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  CLEANUP.push(() => new Promise<void>(resolve => server.close(() => resolve())))
  return port
}

function jsonHeaders(port: number): Record<string, string> {
  return {
    host: `127.0.0.1:${String(port)}`,
    origin: `http://127.0.0.1:${String(port)}`,
    'content-type': 'application/json',
  }
}

describe('enabled-model write route', () => {
  it('persists a selection and answers with the resulting block', async () => {
    const written: { ids?: readonly string[] } = {}
    const port = await startWriteServer(deps({ written }))
    const response = await postOnce({
      port,
      headers: jsonHeaders(port),
      body: JSON.stringify({ enabledModels: ['hy3', 'auto'] }),
    })
    expect(response.status).toBe(200)
    // Stored in catalog order, not request order.
    expect(written.ids).toEqual(['auto', 'hy3'])
    const answered = JSON.parse(response.body) as { selection: { restricted: boolean } }
    expect(answered.selection.restricted).toBe(true)
  })

  it('drops ids the catalog does not serve', async () => {
    const written: { ids?: readonly string[] } = {}
    const port = await startWriteServer(deps({ written }))
    const response = await postOnce({
      port,
      headers: jsonHeaders(port),
      body: JSON.stringify({ enabledModels: ['auto', 'not-a-model'] }),
    })
    expect(response.status).toBe(200)
    expect(written.ids).toEqual(['auto'])
  })

  it('accepts an empty array as the unrestricted selection', async () => {
    const written: { ids?: readonly string[] } = {}
    const port = await startWriteServer(deps({ written }))
    const response = await postOnce({
      port,
      headers: jsonHeaders(port),
      body: JSON.stringify({ enabledModels: [] }),
    })
    expect(response.status).toBe(200)
    expect(written.ids).toEqual([])
  })

  it('rejects a body that is not a string array', async () => {
    const port = await startWriteServer(deps({}))
    const response = await postOnce({
      port,
      headers: jsonHeaders(port),
      body: JSON.stringify({ enabledModels: [1, 2] }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects a non-POST method', async () => {
    const port = await startWriteServer(deps({}))
    const response = await postOnce({ port, method: 'GET', headers: jsonHeaders(port) })
    expect(response.status).toBe(405)
  })

  it('requires an Origin header on the mutating route', async () => {
    const port = await startWriteServer(deps({}))
    const response = await postOnce({
      port,
      headers: { host: `127.0.0.1:${String(port)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ enabledModels: [] }),
    })
    expect(response.status).toBe(403)
  })

  it('drops a cross-origin Origin', async () => {
    const port = await startWriteServer(deps({}))
    const response = await postOnce({
      port,
      headers: { ...jsonHeaders(port), origin: 'http://evil.example' },
      body: JSON.stringify({ enabledModels: [] }),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a non-JSON content type', async () => {
    const port = await startWriteServer(deps({}))
    const response = await postOnce({
      port,
      headers: { ...jsonHeaders(port), 'content-type': 'text/plain' },
      body: 'enabledModels=[]',
    })
    expect(response.status).toBe(415)
  })

  it('reports 501 when the Host stores no settings', async () => {
    const port = await startWriteServer(deps({ writable: false }))
    const response = await postOnce({
      port,
      headers: jsonHeaders(port),
      body: JSON.stringify({ enabledModels: ['auto'] }),
    })
    expect(response.status).toBe(501)
  })
})
