import { afterEach, describe, expect, it, vi } from 'vitest'
import { startOAuthLogin, pollOAuthLogin, generateAccountId } from '../src/oauth.ts'
import type { CodeBuddyClientIdentity } from '../src/client-identity.ts'

const IDENTITY: CodeBuddyClientIdentity = {
  ideType: 'cli',
  ideName: 'cli',
  ideVersion: '2.108.1',
  productVersion: '2.108.1',
}

const originalFetch = globalThis.fetch
const originalAbortSignalTimeout = AbortSignal.timeout

afterEach(() => {
  globalThis.fetch = originalFetch
  AbortSignal.timeout = originalAbortSignalTimeout
  vi.restoreAllMocks()
})

/** Build a Response-like object the oauth module's readEnvelope consumes. */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('startOAuthLogin', () => {
  it('returns authUrl and state from the upstream envelope', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, {
      code: 0,
      msg: '',
      data: { state: 'st-1', authUrl: 'https://auth.example/login?state=st-1' },
    })) as unknown as typeof fetch
    const result = await startOAuthLogin(IDENTITY)
    expect(result).toEqual({ authUrl: 'https://auth.example/login?state=st-1', state: 'st-1' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('throws when the upstream returns a non-zero code', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { code: 10001, msg: 'bad state', data: {} })) as unknown as typeof fetch
    await expect(startOAuthLogin(IDENTITY)).rejects.toThrow(/bad state/)
  })

  it('throws when the envelope carries no authUrl', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { code: 0, msg: '', data: { state: 'st-1' } })) as unknown as typeof fetch
    await expect(startOAuthLogin(IDENTITY)).rejects.toThrow(/no authUrl/)
  })

  it('throws on non-JSON upstream responses', async () => {
    globalThis.fetch = vi.fn(async () => new Response('gateway error', { status: 200 })) as unknown as typeof fetch
    await expect(startOAuthLogin(IDENTITY)).rejects.toThrow(/non-JSON/)
  })
})

describe('pollOAuthLogin', () => {
  it('returns undefined while the login is pending', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { code: 11217, msg: 'pending', data: {} })) as unknown as typeof fetch
    expect(await pollOAuthLogin('st-1', IDENTITY)).toBeUndefined()
  })

  it('returns undefined on a non-OK HTTP status (keeps polling)', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(500, { code: 0, msg: '', data: {} })) as unknown as typeof fetch
    expect(await pollOAuthLogin('st-1', IDENTITY)).toBeUndefined()
  })

  it('parses the completed login into an OAuthLoginResult', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, {
        code: 0,
        msg: '',
        data: {
          accessToken: 'at-1',
          refreshToken: 'rt-1',
          expiresIn: 86400,
          domain: 'copilot.tencent.com',
        },
      }))
      // Account-info call.
      .mockResolvedValueOnce(jsonResponse(200, {
        code: 0,
        msg: '',
        data: { uid: 'uid-9', nickname: '账号九', enterpriseId: 'ent-9' },
      }))
    const result = await pollOAuthLogin('st-1', IDENTITY)
    expect(result).toBeDefined()
    expect(result?.accessToken).toBe('at-1')
    expect(result?.refreshToken).toBe('rt-1')
    expect(result?.uid).toBe('uid-9')
    expect(result?.nickname).toBe('账号九')
    expect(result?.enterpriseId).toBe('ent-9')
    expect(result?.domain).toBe('copilot.tencent.com')
    expect(result?.expiresAtMs).toBeGreaterThan(Date.now())
  })

  it('tolerates a failing account-info call (token still valid)', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, {
        code: 0, msg: '', data: { accessToken: 'at-1', refreshToken: 'rt-1', expiresIn: 86400, domain: '' },
      }))
      .mockRejectedValueOnce(new Error('account info down'))
    const result = await pollOAuthLogin('st-1', IDENTITY)
    expect(result?.accessToken).toBe('at-1')
    expect(result?.uid).toBe('')
    expect(result?.nickname).toBeUndefined()
  })

  it('falls back to the access token JWT payload when the account-info call returns no identity', async () => {
    // A JWT with a payload carrying sub / nickname / preferred_username.
    const payload = Buffer.from(JSON.stringify({
      sub: '63a96550-6697-4134-b4b2-76f741b9201d',
      nickname: 'Michael.fu',
      preferred_username: '17601391028',
    })).toString('base64url')
    const accessToken = `eyJhbGciOiJSUzI1NiJ9.${payload}.signature`
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, {
        code: 0, msg: '', data: { accessToken, refreshToken: 'rt-1', expiresIn: 86400, domain: '' },
      }))
      // Account-info call returns ok but with an empty shape.
      .mockResolvedValueOnce(jsonResponse(200, { code: 0, msg: '', data: {} }))
    const result = await pollOAuthLogin('st-1', IDENTITY)
    expect(result?.accessToken).toBe(accessToken)
    expect(result?.uid).toBe('63a96550-6697-4134-b4b2-76f741b9201d')
    expect(result?.nickname).toBe('Michael.fu')
  })

  it('prefers account-info identity over the JWT when both are present', async () => {
    const payload = Buffer.from(JSON.stringify({
      sub: 'uid-from-jwt', nickname: 'JWT名',
    })).toString('base64url')
    const accessToken = `h.${payload}.s`
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, {
        code: 0, msg: '', data: { accessToken, refreshToken: 'rt-1', expiresIn: 86400, domain: '' },
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        code: 0, msg: '', data: { uid: 'uid-api', nickname: 'API名', enterpriseId: 'ent-api' },
      }))
    const result = await pollOAuthLogin('st-1', IDENTITY)
    expect(result?.uid).toBe('uid-api')
    expect(result?.nickname).toBe('API名')
    expect(result?.enterpriseId).toBe('ent-api')
  })

  it('throws on a terminal failure code', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { code: 10002, msg: 'auth failed', data: {} })) as unknown as typeof fetch
    await expect(pollOAuthLogin('st-1', IDENTITY)).rejects.toThrow(/auth failed/)
  })
})

describe('generateAccountId', () => {
  it('generates distinct stable ids', () => {
    const a = generateAccountId()
    const b = generateAccountId()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[0-9a-f-]{36}$/i)
  })
})
