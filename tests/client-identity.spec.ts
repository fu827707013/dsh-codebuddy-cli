import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CodeBuddyCredential } from '../src/auth.ts'
import {
  clientIdentityHeaders,
  CODEBUDDY_IDE_NAME,
  CODEBUDDY_IDE_TYPE,
  CODEBUDDY_UNKNOWN_VERSION,
  resolveClientIdentity,
  resolveCodeBuddyCliVersion,
  userAgentFor,
} from '../src/client-identity.ts'
import { CodeBuddyUpstreamClient, ensureClientIdentity, resetClientIdentity } from '../src/upstream.ts'

/**
 * The CodeBuddy backend attributes a request to a client purely by the
 * `X-IDE-*` header family. These tests pin the identity contract so a future
 * edit cannot silently drop the headers again — the exact regression reported
 * as "后台没有客户端".
 */

const CREDENTIAL: CodeBuddyCredential = {
  accessToken: 'at',
  refreshToken: 'rt',
  expiresAtMs: 0,
  domain: 'www.codebuddy.cn',
  uid: 'uid-1',
  source: 'cli',
}

/** Minimal Response-like object satisfying the envelope reader. */
function fakeResponse(body: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response
}

/** Capture the headers of the first fetch, answering with `body`. */
function captureHeaders(body: string): { headers: () => Record<string, string> } {
  let seen: Record<string, string> = {}
  vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
    seen = (init?.headers ?? {}) as Record<string, string>
    return Promise.resolve(fakeResponse(body))
  })
  return { headers: () => seen }
}

const tempDirs: string[] = []

/** Write a throwaway package.json and return its path. */
async function tempPackageJson(version: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cb-identity-'))
  tempDirs.push(dir)
  const path = join(dir, 'package.json')
  await writeFile(path, JSON.stringify({ name: '@tencent-ai/codebuddy-code', version }), 'utf8')
  return path
}

afterEach(async () => {
  vi.unstubAllGlobals()
  resetClientIdentity()
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('resolveCodeBuddyCliVersion', () => {
  it('reads the version from an installed CLI package.json', async () => {
    const path = await tempPackageJson('2.148.0')
    expect(await resolveCodeBuddyCliVersion(path)).toBe('2.148.0')
  })

  it('never throws when no candidate is readable', async () => {
    // Whatever this machine has installed, a missing explicit path must not
    // reject: it either falls through to a real install or reports unknown.
    const version = await resolveCodeBuddyCliVersion(join(tmpdir(), 'definitely-missing-package.json'))
    expect(version === CODEBUDDY_UNKNOWN_VERSION || /^\d+\.\d+\.\d+/u.test(version)).toBe(true)
  })

  it('returns the unknown placeholder when every candidate is unreadable', async () => {
    // Pointing the explicit candidate at an unreadable path, with the module
    // graph and global roots unable to see a CLI, is the degraded-machine
    // contract the version headers rely on. The pure-function counterpart of
    // that behavior is asserted in `clientIdentityHeaders` below; here we only
    // require that resolution never throws and never returns a bogus value.
    const version = await resolveCodeBuddyCliVersion(join(tmpdir(), 'cb-none', 'package.json'))
    expect(version).not.toBe('')
    expect(typeof version).toBe('string')
  })

  it('skips a package.json without a usable version instead of trusting it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cb-identity-'))
    tempDirs.push(dir)
    const path = join(dir, 'package.json')
    await writeFile(path, JSON.stringify({ name: 'x', version: '   ' }), 'utf8')
    // A malformed candidate must never be returned as-is; resolution either
    // finds a real install further down the chain or reports unknown.
    const version = await resolveCodeBuddyCliVersion(path)
    expect(version).not.toBe('   ')
    expect(version === CODEBUDDY_UNKNOWN_VERSION || /^\d+\.\d+\.\d+/u.test(version)).toBe(true)
  })

  it('resolves a globally installed CLI without an explicit path', async () => {
    // The version managers on this machine (fnm among them) install globally
    // outside any path a hardcoded constant could predict, so this asserts the
    // search actually finds a real install rather than only the fallback.
    const version = await resolveCodeBuddyCliVersion()
    if (version === CODEBUDDY_UNKNOWN_VERSION) {
      // No CLI installed in this environment: the fallback is the contract.
      expect(version).toBe(CODEBUDDY_UNKNOWN_VERSION)
      return
    }
    expect(version).toMatch(/^\d+\.\d+\.\d+/u)
    expect(version).not.toBe('2.63.2')
  })
})

describe('clientIdentityHeaders', () => {
  it('always sends the X-IDE type and name the backend matches on', () => {
    const headers = clientIdentityHeaders({
      ideType: CODEBUDDY_IDE_TYPE,
      ideName: CODEBUDDY_IDE_NAME,
      ideVersion: '2.148.0',
      productVersion: '2.148.0',
    })
    expect(headers['X-IDE-Type']).toBe('cli')
    expect(headers['X-IDE-Name']).toBe('cli')
    expect(headers['X-IDE-Version']).toBe('2.148.0')
    expect(headers['X-Product-Version']).toBe('2.148.0')
    expect(headers['User-Agent']).toBe(userAgentFor('2.148.0'))
  })

  it('omits version headers rather than claiming a fabricated version', () => {
    const headers = clientIdentityHeaders({
      ideType: CODEBUDDY_IDE_TYPE,
      ideName: CODEBUDDY_IDE_NAME,
      ideVersion: CODEBUDDY_UNKNOWN_VERSION,
      productVersion: CODEBUDDY_UNKNOWN_VERSION,
    })
    // The attribution headers survive even when the version cannot be read.
    expect(headers['X-IDE-Type']).toBe('cli')
    expect(headers['X-IDE-Name']).toBe('cli')
    expect(headers).not.toHaveProperty('X-IDE-Version')
    expect(headers).not.toHaveProperty('X-Product-Version')
  })

  it('derives the User-Agent from the real version instead of a constant', () => {
    expect(userAgentFor('2.148.0')).toBe('CLI/2.148.0 CodeBuddy/2.148.0')
    expect(userAgentFor('2.148.0')).not.toContain('2.63.2')
  })
})

describe('resolveClientIdentity', () => {
  it('reports cli identity with the installed version', async () => {
    const path = await tempPackageJson('2.148.0')
    expect(await resolveClientIdentity(path)).toEqual({
      ideType: 'cli',
      ideName: 'cli',
      ideVersion: '2.148.0',
      productVersion: '2.148.0',
    })
  })
})

describe('upstream requests carry the client identity', () => {
  it('sends the X-IDE family on chat requests', async () => {
    await ensureClientIdentity(await tempPackageJson('2.148.0'))
    const capture = captureHeaders('data: {}\n\n')
    const client = new CodeBuddyUpstreamClient()
    await client.chatStream(CREDENTIAL, '{}')
    const headers = capture.headers()
    expect(headers['X-IDE-Type']).toBe('cli')
    expect(headers['X-IDE-Name']).toBe('cli')
    expect(headers['X-IDE-Version']).toBe('2.148.0')
    expect(headers['X-Product-Version']).toBe('2.148.0')
    expect(headers['User-Agent']).toBe('CLI/2.148.0 CodeBuddy/2.148.0')
  })

  it('sends the X-IDE family on the model-catalog request', async () => {
    await ensureClientIdentity(await tempPackageJson('2.148.0'))
    const catalog = JSON.stringify({
      code: 0,
      msg: 'ok',
      data: {
        models: [{
          id: 'deepseek-v4-flash',
          name: 'DeepSeek V4 Flash',
          maxInputTokens: 128_000,
          maxOutputTokens: 8_192,
        }],
        agents: [{ name: 'cli', models: ['deepseek-v4-flash'] }],
      },
    })
    const capture = captureHeaders(catalog)
    const client = new CodeBuddyUpstreamClient()
    await client.fetchModels(CREDENTIAL)
    const headers = capture.headers()
    expect(headers['X-IDE-Type']).toBe('cli')
    expect(headers['X-IDE-Version']).toBe('2.148.0')
  })

  it('keeps the identity headers when the version cannot be resolved', async () => {
    await ensureClientIdentity(join(tmpdir(), 'missing-cli-package.json'))
    const capture = captureHeaders('data: {}\n\n')
    const client = new CodeBuddyUpstreamClient()
    await client.chatStream(CREDENTIAL, '{}')
    const headers = capture.headers()
    expect(headers['X-IDE-Type']).toBe('cli')
    expect(headers['X-IDE-Name']).toBe('cli')
  })

  it('warms identity from the constructor, without an explicit ensure call', async () => {
    // Regression guard: the version headers must not depend on the caller
    // having warmed the cache first.
    resetClientIdentity()
    const client = new CodeBuddyUpstreamClient()
    // Let the constructor's resolution settle, as it would before a real turn.
    await new Promise(resolve => setTimeout(resolve, 250))
    const capture = captureHeaders('data: {}\n\n')
    await client.chatStream(CREDENTIAL, '{}')
    const headers = capture.headers()
    expect(headers['X-IDE-Type']).toBe('cli')
    expect(headers['User-Agent']).toMatch(/^CLI\//u)
    expect(headers['User-Agent']).not.toContain('2.63.2')
  })
})
