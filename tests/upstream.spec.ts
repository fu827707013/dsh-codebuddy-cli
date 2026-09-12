import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CodeBuddyCredential } from '../src/auth.ts'
import { normalizeCredits, CodeBuddyUpstreamClient } from '../src/upstream.ts'

/**
 * Offline unit tests for CodeBuddyUpstreamClient, mocking the global `fetch`
 * so the multi-layer response parsing and the credit-remain selection logic in
 * `fetchCredits` are covered without a real account or network. This closes a
 * gap that previously relied solely on `scripts/live-e2e.mjs`.
 */

const CREDENTIAL: CodeBuddyCredential = {
  accessToken: 'at',
  refreshToken: 'rt',
  expiresAtMs: 0,
  domain: 'www.codebuddy.cn',
  uid: 'uid-1',
  source: 'cli',
}

/** Build the nested upstream billing document that `fetchCredits` unwraps. */
function billingEnvelope(accounts: unknown[]): string {
  return JSON.stringify({
    code: 0,
    msg: 'ok',
    data: {
      Response: {
        Data: {
          Accounts: accounts,
        },
      },
    },
  })
}

/** Minimal Response-like object satisfying `readEnvelope` (which calls `.text()`). */
function fakeResponse(body: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CodeBuddyUpstreamClient.fetchModels', () => {
  /** Build the models-catalog envelope that `fetchModels` unwraps. */
  function modelsEnvelope(models: unknown[], cliIds: string[]): string {
    return JSON.stringify({
      code: 0,
      msg: 'ok',
      data: {
        models,
        agents: [{ name: 'cli', models: cliIds }],
      },
    })
  }

  it('propagates supportsImages per model, treating unknown or disabled as text-only', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(modelsEnvelope([
      { id: 'm-img', name: 'Image Model', maxInputTokens: 100_000, maxOutputTokens: 32_000, supportsImages: true },
      { id: 'm-muted', name: 'Multimodal Switched Off', maxInputTokens: 100_000, maxOutputTokens: 32_000, supportsImages: true, disabledMultimodal: true },
      { id: 'm-text', name: 'Text Model', maxInputTokens: 100_000, maxOutputTokens: 32_000, supportsImages: false },
      { id: 'm-unknown', name: 'No Modality Field', maxInputTokens: 100_000, maxOutputTokens: 32_000 },
      { id: 'm-noncli', name: 'Not A CLI Model', maxInputTokens: 100_000, maxOutputTokens: 32_000, supportsImages: true },
    ], ['m-img', 'm-muted', 'm-text', 'm-unknown']))))

    const models = await new CodeBuddyUpstreamClient().fetchModels(CREDENTIAL)
    const byId = new Map(models.map(model => [model.id, model]))

    expect(models).toHaveLength(4)
    expect(byId.get('m-img')?.supportsImages).toBe(true)
    expect(byId.get('m-muted')?.supportsImages).toBe(false)
    expect(byId.get('m-text')?.supportsImages).toBe(false)
    // Absent field means unknown capability; the conservative answer is text-only.
    expect(byId.get('m-unknown')?.supportsImages).toBe(false)
  })

  it('keeps the catalog shape (name, contextWindow, maxTokens) alongside the flag', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(modelsEnvelope([
      { id: 'm-1', name: 'Model One', maxInputTokens: 168_000, maxOutputTokens: 32_000, supportsImages: true },
    ], ['m-1']))))

    const models = await new CodeBuddyUpstreamClient().fetchModels(CREDENTIAL)
    expect(models).toHaveLength(1)
    expect(models[0]).toEqual({
      id: 'm-1',
      name: 'Model One',
      contextWindow: 168_000,
      maxTokens: 32_000,
      supportsImages: true,
      reasoning: { supports: false, onlyReasoning: false, canDisableThinking: true },
      billing: { free: false },
    })
  })

  it('parses reasoning and billing metadata from the upstream fields', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(modelsEnvelope([
      {
        id: 'm-reason',
        name: 'Reasoner',
        maxInputTokens: 100_000, maxOutputTokens: 32_000,
        supportsReasoning: true,
        reasoning: { supportedEfforts: ['low', 'high', 'xhigh'], defaultEffort: 'high', canDisableThinking: true },
      },
      {
        id: 'm-free',
        name: 'Freebie',
        maxInputTokens: 100_000, maxOutputTokens: 32_000,
        supportsReasoning: true,
        onlyReasoning: true,
        reasoning: { canDisableThinking: false },
        credits: 'x0.00',
        tags: ['craft', 'badge:限时免费:#FF0000'],
      },
      {
        id: 'm-plain',
        name: 'Plain',
        maxInputTokens: 100_000, maxOutputTokens: 32_000,
      },
    ], ['m-reason', 'm-free', 'm-plain']))))

    const models = await new CodeBuddyUpstreamClient().fetchModels(CREDENTIAL)
    const byId = new Map(models.map(model => [model.id, model]))

    expect(byId.get('m-reason')?.reasoning).toEqual({
      supports: true,
      onlyReasoning: false,
      supportedEfforts: ['low', 'high', 'xhigh'],
      defaultEffort: 'high',
      canDisableThinking: true,
    })
    expect(byId.get('m-free')?.reasoning).toEqual({
      supports: true,
      onlyReasoning: true,
      canDisableThinking: false,
    })
    expect(byId.get('m-free')?.billing).toEqual({ credits: 'x0.00', badges: ['限时免费'], free: true })
    // A model with no reasoning or billing fields is explicitly non-reasoning
    // (supports: false) and carries no free/badge facts.
    expect(byId.get('m-plain')?.reasoning).toEqual({
      supports: false,
      onlyReasoning: false,
      canDisableThinking: true,
    })
    expect(byId.get('m-plain')?.billing).toEqual({ free: false })
  })
})

describe('CodeBuddyUpstreamClient.fetchCredits', () => {
  it('unwraps the nested envelope and aggregates total across accounts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(billingEnvelope([
      { PackageName: 'pkg-a', CycleCapacitySize: 100, CycleCapacityRemain: 40 },
      { PackageName: 'pkg-b', CycleCapacitySize: 200, CycleCapacityRemain: 60 },
    ]))))

    const client = new CodeBuddyUpstreamClient()
    const credits = await client.fetchCredits(CREDENTIAL)

    expect(credits.total).toBe(100)
    expect(credits.accounts).toHaveLength(2)
    expect(credits.accounts[0]).toMatchObject({ packageName: 'pkg-a', remain: 40, size: 100, total: 100, used: 0, expired: false, expiringSoon: false })
    expect(credits.accounts[1]).toMatchObject({ packageName: 'pkg-b', remain: 60, size: 200, total: 200, used: 0, expired: false, expiringSoon: false })
  })

  it('selects cycle remain when size > 0 (first branch)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(billingEnvelope([
      { PackageName: 'pkg', CycleCapacitySize: 100, CycleCapacityRemain: 30, CapacityRemain: 999 },
    ]))))

    const credits = await new CodeBuddyUpstreamClient().fetchCredits(CREDENTIAL)
    // First branch: size>0 → cycleRemain, ignoring the larger CapacityRemain.
    expect(credits.accounts[0]).toMatchObject({ packageName: 'pkg', remain: 30, size: 100 })
  })

  it('selects cycle remain when there is cycle usage even without size (second branch)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(billingEnvelope([
      { PackageName: 'pkg', CycleCapacitySize: 0, CycleCapacityRemain: 20, CycleCapacityUsed: 5, CapacityRemain: 1 },
    ]))))

    const credits = await new CodeBuddyUpstreamClient().fetchCredits(CREDENTIAL)
    // Second branch: size<=0 but cycleUsed>0 → cycleRemain.
    expect(credits.accounts[0]).toMatchObject({ packageName: 'pkg', remain: 20, size: 0 })
  })

  it('falls back to capacity remain when no cycle fields (third branch)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(billingEnvelope([
      { PackageName: 'pkg', CapacityRemain: 77 },
    ]))))

    const credits = await new CodeBuddyUpstreamClient().fetchCredits(CREDENTIAL)
    // Third branch: no size, no cycle → capacityRemain.
    expect(credits.accounts[0]).toMatchObject({ packageName: 'pkg', remain: 77, size: 0 })
  })

  it('clamps a negative remain to zero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(billingEnvelope([
      { PackageName: 'pkg', CycleCapacitySize: 100, CycleCapacityRemain: -50 },
    ]))))

    const credits = await new CodeBuddyUpstreamClient().fetchCredits(CREDENTIAL)
    expect(credits.accounts[0]!.remain).toBe(0)
    expect(credits.total).toBe(0)
  })

  it('falls back to CapacitySize for size when cycle size is absent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(billingEnvelope([
      { PackageName: 'pkg', CapacitySize: 500, CapacityRemain: 120 },
    ]))))

    const credits = await new CodeBuddyUpstreamClient().fetchCredits(CREDENTIAL)
    // size falls back to CapacitySize=500; remain from third branch = 120.
    expect(credits.accounts[0]).toMatchObject({ packageName: 'pkg', remain: 120, size: 500 })
  })

  it('labels a missing package name as (unnamed)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(billingEnvelope([
      { CycleCapacitySize: 10, CycleCapacityRemain: 5 },
    ]))))

    const credits = await new CodeBuddyUpstreamClient().fetchCredits(CREDENTIAL)
    expect(credits.accounts[0]!.packageName).toBe('(unnamed)')
  })

  it('returns an empty list for an empty Accounts array', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(billingEnvelope([]))))

    const credits = await new CodeBuddyUpstreamClient().fetchCredits(CREDENTIAL)
    expect(credits.total).toBe(0)
    expect(credits.accounts).toEqual([])
  })

  it('skips non-object account entries', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(billingEnvelope([
      null,
      'not-an-object',
      42,
      { PackageName: 'valid', CycleCapacitySize: 10, CycleCapacityRemain: 7 },
    ]))))

    const credits = await new CodeBuddyUpstreamClient().fetchCredits(CREDENTIAL)
    expect(credits.accounts).toHaveLength(1)
    expect(credits.accounts[0]!.packageName).toBe('valid')
  })

  it('throws when the upstream business code is non-zero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(
      JSON.stringify({ code: 1, msg: 'billing error' }),
    )))

    await expect(new CodeBuddyUpstreamClient().fetchCredits(CREDENTIAL)).rejects.toThrow(/billing error/)
  })

  it('throws when the upstream returns non-JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse('not json')))

    await expect(new CodeBuddyUpstreamClient().fetchCredits(CREDENTIAL)).rejects.toThrow(/non-JSON/)
  })
})

describe('normalizeCredits', () => {
  it('keeps a bare multiplier untouched', () => {
    expect(normalizeCredits('x0.79')).toBe('x0.79')
    expect(normalizeCredits('x0.00')).toBe('x0.00')
  })

  it('strips a trailing credits unit word', () => {
    expect(normalizeCredits('x0.79 credits')).toBe('x0.79')
    expect(normalizeCredits('x1.62 credits')).toBe('x1.62')
    expect(normalizeCredits('x0.79 CREDITS')).toBe('x0.79')
    expect(normalizeCredits('x0.79 credit')).toBe('x0.79')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeCredits('  x0.79 credits  ')).toBe('x0.79')
  })

  it('returns undefined for absent or empty values', () => {
    expect(normalizeCredits(undefined)).toBeUndefined()
    expect(normalizeCredits('')).toBeUndefined()
    expect(normalizeCredits('   ')).toBeUndefined()
    expect(normalizeCredits('credits')).toBeUndefined()
  })
})

describe('CodeBuddyUpstreamClient.checkIn', () => {
  it('POSTs the CN daily check-in endpoint and reports success', async () => {
    const fetchMock = vi.fn(async () => fakeResponse(JSON.stringify({ code: 0, msg: 'success', data: {} })))
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await new CodeBuddyUpstreamClient().checkIn(CREDENTIAL)
    expect(outcome).toEqual({ status: 'ok', message: 'success' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://copilot.tencent.com/v2/billing/meter/daily-checkin')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{}')
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer at')
    expect(headers['X-Domain']).toBe('www.codebuddy.cn')
  })

  it('falls back to a default X-Domain when the credential domain is empty', async () => {
    const fetchMock = vi.fn(async () => fakeResponse(JSON.stringify({ code: 0, msg: 'ok' })))
    vi.stubGlobal('fetch', fetchMock)

    await new CodeBuddyUpstreamClient().checkIn({ ...CREDENTIAL, domain: '' })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)['X-Domain']).toBe('www.codebuddy.cn')
  })

  it('classifies an upstream already-checked-in answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(JSON.stringify({ code: 1051, msg: '今日已签到' }))))

    const outcome = await new CodeBuddyUpstreamClient().checkIn(CREDENTIAL)
    expect(outcome.status).toBe('already')
    expect(outcome.message).toBe('今日已签到')
  })

  it('classifies an English already-checked-in answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(JSON.stringify({ code: 1, msg: 'Already checked in today' }))))

    const outcome = await new CodeBuddyUpstreamClient().checkIn(CREDENTIAL)
    expect(outcome.status).toBe('already')
  })

  it('reports a business-code failure as failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(JSON.stringify({ code: 500, msg: 'server exploded' }))))

    const outcome = await new CodeBuddyUpstreamClient().checkIn(CREDENTIAL)
    expect(outcome).toEqual({ status: 'failed', message: 'server exploded' })
  })

  it('reports a non-JSON upstream answer as failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse('not json', true, 200)))

    const outcome = await new CodeBuddyUpstreamClient().checkIn(CREDENTIAL)
    expect(outcome.status).toBe('failed')
  })

  it('reports a transport error as failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connect refused') }))

    const outcome = await new CodeBuddyUpstreamClient().checkIn(CREDENTIAL)
    expect(outcome.status).toBe('failed')
    expect(outcome.message).toContain('transport error')
  })

  it('refuses to check in a global (workbuddy) account', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await new CodeBuddyUpstreamClient().checkIn({ ...CREDENTIAL, domain: 'www.workbuddy.ai' })
    expect(outcome.status).toBe('failed')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('CodeBuddyUpstreamClient.fetchUsage', () => {
  /** Build an official-usage page envelope. */
  function usageEnvelope(total: number, rows: unknown[]): string {
    return JSON.stringify({ code: 0, msg: 'ok', data: { total, data: rows } })
  }

  function nowParts(daysAgo = 0): { date: string; time: string } {
    const date = new Date()
    date.setDate(date.getDate() - daysAgo)
    const pad = (v: number): string => String(v).padStart(2, '0')
    const dateKey = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    return { date: dateKey, time: `${dateKey} 12:00:00` }
  }

  it('aggregates today, 7-day, month, daily and per-model usage', async () => {
    const today = nowParts(0)
    const yesterday = nowParts(1)
    const old = nowParts(10)
    const rows = [
      { requestId: 'r1', credit: 1.5, model: 'model-a', client: 'cli', requestTime: today.time },
      { requestId: 'r2', credit: 2, model: 'model-a', client: 'cli', requestTime: yesterday.time },
      { requestId: 'r3', credit: 5, model: 'model-b', client: 'cli', requestTime: old.time },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(usageEnvelope(3, rows))))

    const stats = await new CodeBuddyUpstreamClient().fetchUsage(CREDENTIAL)

    expect(stats.status).toBe('complete')
    expect(stats.summary.usageToday).toBeCloseTo(1.5)
    expect(stats.summary.usage7Days).toBeCloseTo(3.5)
    expect(stats.summary.usageThisMonth).toBeGreaterThanOrEqual(8.5)
    expect(stats.requests).toHaveLength(3)
    expect(stats.requests[0]!.requestId).toBe('r1')
    // Daily series is zero-filled across the whole window.
    expect(stats.daily.length).toBeGreaterThan(20)
    const todayPoint = stats.daily.find(d => d.date === today.date)
    expect(todayPoint?.usage).toBeCloseTo(1.5)
    // Per-model aggregation.
    const modelA = stats.models.find(m => m.model === 'model-a')
    expect(modelA?.requestCount).toBe(2)
    expect(modelA?.credit).toBeCloseTo(3.5)
  })

  it('paginates when the first page is incomplete', async () => {
    const today = nowParts(0)
    const page1 = usageEnvelope(2, [
      { requestId: 'r1', credit: 1, model: 'm', client: 'cli', requestTime: today.time },
    ])
    const page2 = usageEnvelope(2, [
      { requestId: 'r2', credit: 2, model: 'm', client: 'cli', requestTime: today.time },
    ])
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fakeResponse(page1))
      .mockResolvedValueOnce(fakeResponse(page2))
    vi.stubGlobal('fetch', fetchMock)

    const stats = await new CodeBuddyUpstreamClient().fetchUsage(CREDENTIAL)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(stats.summary.usageToday).toBeCloseTo(3)
    expect(stats.requests).toHaveLength(2)
  })

  it('returns unavailable when the upstream reports an error code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(JSON.stringify({ code: 500, msg: 'usage down' }))))

    const stats = await new CodeBuddyUpstreamClient().fetchUsage(CREDENTIAL)
    expect(stats.status).toBe('unavailable')
    expect(stats.requests).toEqual([])
  })

  it('returns unavailable on a transport error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connect refused') }))

    const stats = await new CodeBuddyUpstreamClient().fetchUsage(CREDENTIAL)
    expect(stats.status).toBe('unavailable')
    expect(stats.summary.usageToday).toBe(0)
  })

  it('skips rows with invalid or negative credit', async () => {
    const today = nowParts(0)
    const rows = [
      { requestId: 'good', credit: 1, model: 'm', client: 'cli', requestTime: today.time },
      { requestId: 'bad-credit', credit: -5, model: 'm', client: 'cli', requestTime: today.time },
      { requestId: 'bad-time', credit: 2, model: 'm', client: 'cli', requestTime: 'not-a-date' },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(usageEnvelope(3, rows))))

    const stats = await new CodeBuddyUpstreamClient().fetchUsage(CREDENTIAL)
    expect(stats.requests).toHaveLength(1)
    expect(stats.requests[0]!.requestId).toBe('good')
  })
})
