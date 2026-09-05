import { mkdtemp, mkdir, readFile, rm, writeFile, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  defaultAuthDirCandidates,
  parseCodeBuddyAuth,
  CodeBuddyCredentialStore,
  CODEBUDDY_AUTH_FILE_ENV,
  type CodeBuddyCredential,
} from '../src/auth.ts'// node:os's ESM namespace rejects vi.spyOn (non-configurable), so homedir is
// mocked at the module level; unset state falls through to the real one.
const fakeOs = vi.hoisted(() => ({
  home: undefined as string | undefined,
  release: undefined as string | undefined,
}))
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    homedir: () => fakeOs.home ?? actual.homedir(),
    release: () => fakeOs.release ?? actual.release(),
  }
})

const CLEANUP: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(CLEANUP.splice(0).map(clean => clean()))
})

function nestedDoc(expiresAt: number): string {
  return JSON.stringify({
    auth: { accessToken: 'at', refreshToken: 'rt', expiresAt, domain: 'www.codebuddy.cn' },
    account: { uid: 'uid-1', enterpriseId: 'ent-1', nickname: '昵称' },
  })
}

describe('parseCodeBuddyAuth', () => {
  it('reads the nested form with millisecond expiry', () => {
    const credential = parseCodeBuddyAuth(nestedDoc(1_792_128_236_868))
    expect(credential?.accessToken).toBe('at')
    expect(credential?.refreshToken).toBe('rt')
    expect(credential?.expiresAtMs).toBe(1_792_128_236_868)
    expect(credential?.uid).toBe('uid-1')
    expect(credential?.enterpriseId).toBe('ent-1')
    expect(credential?.nickname).toBe('昵称')
    expect(credential?.source).toBe('cli')
  })

  it('normalizes second-precision expiry to milliseconds', () => {
    const credential = parseCodeBuddyAuth(nestedDoc(1_792_128_236))
    expect(credential?.expiresAtMs).toBe(1_792_128_236_000)
  })

  it('reads the flat panel form', () => {
    const credential = parseCodeBuddyAuth(JSON.stringify({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: 0,
      domain: '',
      uid: 'uid-2',
    }))
    expect(credential?.accessToken).toBe('at')
    expect(credential?.uid).toBe('uid-2')
    expect(credential?.expiresAtMs).toBe(0)
  })

  it('rejects documents without an access token', () => {
    expect(parseCodeBuddyAuth('{}')).toBeUndefined()
    expect(parseCodeBuddyAuth('not json')).toBeUndefined()
    expect(parseCodeBuddyAuth(JSON.stringify({ auth: { refreshToken: 'rt' } }))).toBeUndefined()
  })
})

function credentialWith(expiresAtMs: number): CodeBuddyCredential {
  return {
    accessToken: 'at',
    refreshToken: 'rt',
    expiresAtMs,
    domain: 'www.codebuddy.cn',
    uid: 'uid-1',
    source: 'cli',
  }
}

void credentialWith

describe('CodeBuddyCredentialStore', () => {
  it('serves a fresh CLI credential without refreshing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cb-store-'))
    CLEANUP.push(() => rm(dir, { recursive: true, force: true }))
    const cli = join(dir, 'Tencent-Cloud.coding-copilot.info')
    await writeFile(cli, nestedDoc(Date.now() + 3600_000))
    let refreshes = 0
    const store = new CodeBuddyCredentialStore({
      cliPath: cli,
      ownPath: join(dir, 'own.json'),
      refresh: async () => {
        refreshes += 1
        return { accessToken: 'new' }
      },
    })
    await expect(store.resolve()).resolves.toMatchObject({ accessToken: 'at', source: 'cli' })
    expect(refreshes).toBe(0)
  })

  it('refreshes an expiring credential, persists the copy, and serves it next', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cb-store-'))
    CLEANUP.push(() => rm(dir, { recursive: true, force: true }))
    const cli = join(dir, 'Tencent-Cloud.coding-copilot.info')
    const own = join(dir, 'own.json')
    await writeFile(cli, nestedDoc(Date.now() - 1000))
    const store = new CodeBuddyCredentialStore({
      cliPath: cli,
      ownPath: own,
      refresh: async () => ({ accessToken: 'fresh', refreshToken: 'rt2', expiresInSec: 3600 }),
    })
    await expect(store.resolve()).resolves.toMatchObject({ accessToken: 'fresh', source: 'dsh' })
    const saved = JSON.parse(await readFile(own, 'utf8')) as { version: number, credential: { accessToken: string } }
    expect(saved.version).toBe(1)
    expect(saved.credential.accessToken).toBe('fresh')
    await expect(store.resolve()).resolves.toMatchObject({ accessToken: 'fresh' })
  })

  it('still returns a not-yet-expired token when refresh fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cb-store-'))
    CLEANUP.push(() => rm(dir, { recursive: true, force: true }))
    const cli = join(dir, 'Tencent-Cloud.coding-copilot.info')
    await writeFile(cli, nestedDoc(Date.now() + 60_000))
    const store = new CodeBuddyCredentialStore({
      cliPath: cli,
      ownPath: join(dir, 'own.json'),
      refreshMarginMs: 5 * 60_000,
      refresh: async () => {
        throw new Error('refresh endpoint down')
      },
    })
    await expect(store.resolve()).resolves.toMatchObject({ accessToken: 'at' })
  })

  it('serves the persisted copy with its expiry and identity after the CLI file disappears', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cb-store-'))
    CLEANUP.push(() => rm(dir, { recursive: true, force: true }))
    const cli = join(dir, 'Tencent-Cloud.coding-copilot.info')
    const own = join(dir, 'own.json')
    await writeFile(cli, nestedDoc(Date.now() - 1000))
    let refreshes = 0
    const store = new CodeBuddyCredentialStore({
      cliPath: cli,
      ownPath: own,
      refresh: async () => {
        refreshes += 1
        return { accessToken: 'fresh', refreshToken: 'rt2', expiresInSec: 3600 }
      },
    })
    await expect(store.resolve()).resolves.toMatchObject({ accessToken: 'fresh', source: 'dsh' })
    await rm(cli)
    const survived = await store.resolve()
    expect(refreshes).toBe(1)
    expect(survived).toMatchObject({ accessToken: 'fresh', uid: 'uid-1', enterpriseId: 'ent-1', nickname: '昵称', source: 'dsh' })
    expect(survived.expiresAtMs).toBeGreaterThan(Date.now() + 3000_000)
  })

  it('rejects an owned copy from another format version', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cb-store-'))
    CLEANUP.push(() => rm(dir, { recursive: true, force: true }))
    const own = join(dir, 'own.json')
    await writeFile(own, JSON.stringify({ version: 99, credential: { accessToken: 'at' } }))
    const store = new CodeBuddyCredentialStore({
      cliPath: join(dir, 'missing.info'),
      ownPath: own,
      refresh: async credential => ({ accessToken: credential.accessToken }),
    })
    await expect(store.resolve()).rejects.toThrow(/no signed-in CodeBuddy account/)
  })

  it('fails loudly when nothing is signed in', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cb-store-'))
    CLEANUP.push(() => rm(dir, { recursive: true, force: true }))
    const store = new CodeBuddyCredentialStore({
      cliPath: join(dir, 'missing.info'),
      ownPath: join(dir, 'own.json'),
      refresh: async credential => ({ accessToken: credential.accessToken }),
    })
    await expect(store.resolve()).rejects.toThrow(/no signed-in CodeBuddy account/)
  })

  it('applies a CLI-path repoint on the next read', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cb-store-'))
    CLEANUP.push(() => rm(dir, { recursive: true, force: true }))
    const first = join(dir, 'first.info')
    const second = join(dir, 'second.info')
    await writeFile(first, nestedDoc(Date.now() + 3600_000))
    await writeFile(second, JSON.stringify({
      auth: { accessToken: 'at-b', refreshToken: 'rt', expiresAt: Date.now() + 7200_000, domain: '' },
      account: { uid: 'uid-b', nickname: 'B' },
    }))
    const store = new CodeBuddyCredentialStore({
      cliPath: first,
      ownPath: join(dir, 'own.json'),
      refresh: async credential => ({ accessToken: credential.accessToken }),
    })
    await expect(store.resolve()).resolves.toMatchObject({ accessToken: 'at' })
    store.setCliPath(second)
    expect(store.cliAuthPath()).toBe(second)
    await expect(store.resolve()).resolves.toMatchObject({ accessToken: 'at-b', nickname: 'B' })
  })
})

describe('auth-directory discovery', () => {
  it('prefers the CLI file over another .info file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cb-disc-'))
    CLEANUP.push(() => rm(dir, { recursive: true, force: true }))
    const other = join(dir, 'Other-Product.info')
    const later = new Date(Date.now() + 60_000)
    await writeFile(other, JSON.stringify({
      auth: { accessToken: 'at-other', refreshToken: 'rt', expiresAt: Date.now() + 7200_000, domain: '' },
      account: { uid: 'uid-other' },
    }))
    await utimes(other, later, later)
    const store = new CodeBuddyCredentialStore({
      cliPath: dir,
      ownPath: join(dir, 'own.json'),
      refresh: async credential => ({ accessToken: credential.accessToken }),
    })
    // The other product's file is newer, but the CLI's own file outranks it.
    const cli = join(dir, 'Tencent-Cloud.coding-copilot.info')
    await writeFile(cli, nestedDoc(Date.now() + 3600_000))
    await expect(store.current()).resolves.toMatchObject({ accessToken: 'at' })
  })

  it('prefers the lastLogin account over the newest file when the CLI file is absent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cb-disc-'))
    CLEANUP.push(() => rm(dir, { recursive: true, force: true }))
    const stale = join(dir, 'Product-A.info')
    const fresh = join(dir, 'Product-B.info')
    await writeFile(stale, JSON.stringify({
      auth: { accessToken: 'at-login', refreshToken: 'rt', expiresAt: Date.now() + 3600_000, domain: '' },
      account: { uid: 'uid-a', lastLogin: true },
    }))
    await writeFile(fresh, JSON.stringify({
      auth: { accessToken: 'at-fresh', refreshToken: 'rt', expiresAt: Date.now() + 7200_000, domain: '' },
      account: { uid: 'uid-b', lastLogin: false },
    }))
    // Make the non-login file strictly newer on disk.
    const later = new Date(Date.now() + 60_000)
    await utimes(fresh, later, later)
    const store = new CodeBuddyCredentialStore({
      cliPath: dir,
      ownPath: join(dir, 'own.json'),
      refresh: async credential => ({ accessToken: credential.accessToken }),
    })
    await expect(store.current()).resolves.toMatchObject({ accessToken: 'at-login' })
  })

  it('falls back to the newest mtime when ranks tie', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cb-disc-'))
    CLEANUP.push(() => rm(dir, { recursive: true, force: true }))
    const older = join(dir, 'Product-A.info')
    const newer = join(dir, 'Product-B.info')
    await writeFile(older, JSON.stringify({
      auth: { accessToken: 'at-older', refreshToken: 'rt', expiresAt: Date.now() + 3600_000, domain: '' },
      account: { uid: 'uid-a' },
    }))
    await writeFile(newer, JSON.stringify({
      auth: { accessToken: 'at-newer', refreshToken: 'rt', expiresAt: Date.now() + 7200_000, domain: '' },
      account: { uid: 'uid-b' },
    }))
    const later = new Date(Date.now() + 60_000)
    await utimes(newer, later, later)
    const store = new CodeBuddyCredentialStore({
      cliPath: dir,
      ownPath: join(dir, 'own.json'),
      refresh: async credential => ({ accessToken: credential.accessToken }),
    })
    await expect(store.current()).resolves.toMatchObject({ accessToken: 'at-newer' })
  })

  it('skips unparsable and token-less .info files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cb-disc-'))
    CLEANUP.push(() => rm(dir, { recursive: true, force: true }))
    await writeFile(join(dir, 'broken.info'), 'not json')
    await writeFile(join(dir, 'tokenless.info'), JSON.stringify({ auth: { refreshToken: 'rt' } }))
    await writeFile(join(dir, 'ignored.txt'), 'at')
    await expect(new CodeBuddyCredentialStore({
      cliPath: dir,
      ownPath: join(dir, 'own.json'),
      refresh: async credential => ({ accessToken: credential.accessToken }),
    }).current()).resolves.toBeUndefined()
  })

  it('treats a present but empty directory as authoritative and keeps scanning the owned copy', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cb-disc-'))
    CLEANUP.push(() => rm(dir, { recursive: true, force: true }))
    await mkdir(dir, { recursive: true })
    const own = join(dir, 'own.json')
    await writeFile(own, JSON.stringify({ version: 1, credential: { ...credentialWith(Date.now() + 3600_000), source: 'dsh' } }))
    const store = new CodeBuddyCredentialStore({
      cliPath: dir,
      ownPath: own,
      refresh: async credential => ({ accessToken: credential.accessToken }),
    })
    await expect(store.current()).resolves.toMatchObject({ accessToken: 'at', source: 'dsh' })
  })
})

describe('Windows default auth-dir probing', () => {
  function windowsDoc(token: string): string {
    return JSON.stringify({
      auth: { accessToken: token, refreshToken: 'rt', expiresAt: Date.now() + 3600_000, domain: 'www.codebuddy.cn' },
      account: { uid: 'uid-w', nickname: 'Win 用户' },
    })
  }

  /** Fake a win32 home; probes are mocked in, dirs under a temp root. */
  async function fakeWindowsHome(): Promise<{ home: string, local: string, roaming: string }> {
    const home = await mkdtemp(join(tmpdir(), 'cb-win-'))
    CLEANUP.push(() => rm(home, { recursive: true, force: true }))
    const local = join(home, 'AppData', 'Local', 'CodeBuddyExtension', 'Data', 'Public', 'auth')
    const roaming = join(home, 'AppData', 'Roaming', 'CodeBuddyExtension', 'Data', 'Public', 'auth')
    return { home, local, roaming }
  }

  /** Run the case body as win32 with the given home; restore on exit. */
  async function asWindows<T>(home: string, run: () => Promise<T>): Promise<T> {
    const savedPlatform = process.platform
    const savedEnv = process.env[CODEBUDDY_AUTH_FILE_ENV]
    delete process.env[CODEBUDDY_AUTH_FILE_ENV]
    fakeOs.home = home
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      return await run()
    } finally {
      Object.defineProperty(process, 'platform', { value: savedPlatform, configurable: true })
      fakeOs.home = undefined
      if (savedEnv === undefined) delete process.env[CODEBUDDY_AUTH_FILE_ENV]
      else process.env[CODEBUDDY_AUTH_FILE_ENV] = savedEnv
    }
  }

  it('lists Local before Roaming on win32', async () => {
    const { home, local, roaming } = await fakeWindowsHome()
    await asWindows(home, async () => {
      const candidates = defaultAuthDirCandidates()
      expect(candidates).toEqual([local, roaming])
    })
  })

  it('reads the Local AppData CLI file when only it exists', async () => {
    const { home, local, roaming } = await fakeWindowsHome()
    await mkdir(local, { recursive: true })
    await writeFile(join(local, 'Tencent-Cloud.coding-copilot.info'), windowsDoc('at-local'))
    await asWindows(home, async () => {
      const store = new CodeBuddyCredentialStore({
        ownPath: join(home, 'own.json'),
        refresh: async credential => ({ accessToken: credential.accessToken }),
      })
      await expect(store.resolve()).resolves.toMatchObject({ accessToken: 'at-local', source: 'cli' })
      await expect(store.cliFilePresent()).resolves.toBe(true)
    })
    void roaming
  })

  it('falls back to Roaming when only it exists (older builds)', async () => {
    const { home, roaming } = await fakeWindowsHome()
    await mkdir(roaming, { recursive: true })
    await writeFile(join(roaming, 'Tencent-Cloud.coding-copilot.info'), windowsDoc('at-roaming'))
    await asWindows(home, async () => {
      const store = new CodeBuddyCredentialStore({
        ownPath: join(home, 'own.json'),
        refresh: async credential => ({ accessToken: credential.accessToken }),
      })
      await expect(store.resolve()).resolves.toMatchObject({ accessToken: 'at-roaming', source: 'cli' })
      await expect(store.cliFilePresent()).resolves.toBe(true)
    })
  })

  it('prefers Local when both exist', async () => {
    const { home, local, roaming } = await fakeWindowsHome()
    await mkdir(local, { recursive: true })
    await mkdir(roaming, { recursive: true })
    await writeFile(join(local, 'Tencent-Cloud.coding-copilot.info'), windowsDoc('at-local'))
    await writeFile(join(roaming, 'Tencent-Cloud.coding-copilot.info'), windowsDoc('at-roaming'))
    await asWindows(home, async () => {
      const store = new CodeBuddyCredentialStore({
        ownPath: join(home, 'own.json'),
        refresh: async credential => ({ accessToken: credential.accessToken }),
      })
      await expect(store.resolve()).resolves.toMatchObject({ accessToken: 'at-local' })
    })
  })

  it('reports signed-out and lists both candidates when neither exists', async () => {
    const { home, local, roaming } = await fakeWindowsHome()
    await asWindows(home, async () => {
      const store = new CodeBuddyCredentialStore({
        ownPath: join(home, 'own.json'),
        refresh: async credential => ({ accessToken: credential.accessToken }),
      })
      await expect(store.status()).resolves.toMatchObject({ state: 'signed-out' })
      await expect(store.cliFilePresent()).resolves.toBe(false)
      await expect(store.resolve()).rejects.toThrow(new RegExp(local.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)))
      await expect(store.resolve()).rejects.toThrow(/AppData.*Local[\s\S]*AppData.*Roaming/)
    })
  })

  it('uses an explicit cliPath verbatim without probing on win32', async () => {
    const { home, local, roaming } = await fakeWindowsHome()
    const explicit = join(home, 'explicit.info')
    await mkdir(local, { recursive: true })
    await writeFile(join(local, 'Tencent-Cloud.coding-copilot.info'), windowsDoc('at-local'))
    await writeFile(explicit, windowsDoc('at-explicit'))
    await asWindows(home, async () => {
      const store = new CodeBuddyCredentialStore({
        cliPath: explicit,
        ownPath: join(home, 'own.json'),
        refresh: async credential => ({ accessToken: credential.accessToken }),
      })
      await expect(store.resolve()).resolves.toMatchObject({ accessToken: 'at-explicit' })
      expect(store.cliAuthPath()).toBe(explicit)
      void roaming
    })
  })
})

describe('WSL default auth-dir probing', () => {
  const AUTH_TAIL = join('CodeBuddyExtension', 'Data', 'Public', 'auth')

  async function asWsl<T>(options: {
    home: string
    env?: Partial<Record<'APPDATA' | 'LOCALAPPDATA' | 'USERPROFILE', string>>
  }, run: () => Promise<T>): Promise<T> {
    const savedPlatform = process.platform
    const savedEnv = Object.fromEntries(
      ['APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'WSL_DISTRO_NAME', 'WSL_INTEROP']
        .map(name => [name, process.env[name]]),
    )
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    fakeOs.home = options.home
    fakeOs.release = '6.6.87.2-microsoft-standard-WSL2'
    delete process.env['APPDATA']
    delete process.env['LOCALAPPDATA']
    delete process.env['USERPROFILE']
    delete process.env['WSL_DISTRO_NAME']
    delete process.env['WSL_INTEROP']
    Object.assign(process.env, options.env)
    try {
      return await run()
    } finally {
      Object.defineProperty(process, 'platform', { value: savedPlatform, configurable: true })
      fakeOs.home = undefined
      fakeOs.release = undefined
      for (const [name, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
    }
  }

  it('probes the matching mounted Windows profile before the Linux path', async () => {
    await asWsl({ home: '/home/alice' }, async () => {
      expect(defaultAuthDirCandidates()).toEqual([
        join('/mnt/c/Users/alice/AppData/Local', AUTH_TAIL),
        join('/mnt/c/Users/alice/AppData/Roaming', AUTH_TAIL),
        join('/home/alice/.config', AUTH_TAIL),
      ])
    })
  })

  // The assertion needs a real POSIX filesystem: the plugin translates a
  // Windows-form USERPROFILE into `/mnt/<drive>` form, and only a Linux host
  // can both produce and read such a path from tmpdir.
  it.runIf(process.platform !== 'win32')('uses translated WSL environment paths when the Windows user differs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cb-wsl-'))
    CLEANUP.push(() => rm(root, { recursive: true, force: true }))
    const windowsProfile = join(root, 'Users', 'windows-alice')
    const local = join(windowsProfile, 'AppData', 'Local', AUTH_TAIL)
    await mkdir(local, { recursive: true })
    await writeFile(join(local, 'Tencent-Cloud.coding-copilot.info'), nestedDoc(Date.now() + 3600_000))

    await asWsl({ home: '/home/linux-alice', env: { USERPROFILE: windowsProfile } }, async () => {
      const store = new CodeBuddyCredentialStore({
        ownPath: join(root, 'own.json'),
        refresh: async credential => ({ accessToken: credential.accessToken }),
      })
      expect(store.cliAuthDir()).toBe(local)
      await expect(store.resolve()).resolves.toMatchObject({ accessToken: 'at', source: 'cli' })
    })
  })

  it('converts Windows-form AppData environment paths to WSL mount paths', async () => {
    await asWsl({
      home: '/home/alice',
      env: {
        LOCALAPPDATA: String.raw`D:\Users\alice\AppData\Local`,
        APPDATA: String.raw`D:\Users\alice\AppData\Roaming`,
      },
    }, async () => {
      expect(defaultAuthDirCandidates().slice(0, 2)).toEqual([
        join('/mnt/d/Users/alice/AppData/Local', AUTH_TAIL),
        join('/mnt/d/Users/alice/AppData/Roaming', AUTH_TAIL),
      ])
    })
  })
})
