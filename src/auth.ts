/**
 * CodeBuddy CLI credential resolution. The primary source is the CodeBuddy
 * CLI's own auth file (`<authDir>/<product>.info`, e.g.
 * `Tencent-Cloud.coding-copilot.info`), read-only; a plugin-owned copy under
 * `$DSH_HOME` holds token refreshes so the CLI's file is never written.
 * The effective credential is whichever of the two expires later, so a
 * refresh by either side wins.
 *
 * The CLI shares the `CodeBuddyExtension/Data/Public/auth` directory with the
 * desktop IDE but writes one `.info` file per signed-in product. Discovery
 * scans that directory and picks the CLI's own file first, then any file
 * whose account is flagged `lastLogin`, then the most recently written file.
 *
 * @module dsh-codebuddy-cli/auth
 */

import { readFile, readdir, rm, stat } from 'node:fs/promises'
import { homedir, release } from 'node:os'
import { basename, join } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { CodeBuddyRefreshOutcome } from './upstream.ts'

/** Normalized CodeBuddy credential, timestamps in epoch milliseconds. */
export interface CodeBuddyCredential {
  accessToken: string
  refreshToken: string
  expiresAtMs: number
  refreshExpiresAtMs?: number
  domain: string
  uid: string
  enterpriseId?: string
  nickname?: string
  /** Which storage the credential was read from; refreshes are always `dsh`. */
  source: 'cli' | 'dsh'
}

/** Read-only sign-in summary for status and doctor output. */
export interface CodeBuddyAuthStatus {
  state: 'signed-in' | 'signed-out'
  expiresAtMs?: number
  refreshExpiresAtMs?: number
  nickname?: string
  domain?: string
  source?: 'cli' | 'dsh'
}

/** Constructor options; only {@link refresh} is required. */
export interface CodeBuddyStoreOptions {
  /** Explicit CLI auth-file path, overriding env and platform defaults. */
  cliPath?: string
  /** Explicit plugin-owned copy path, defaulting under `$DSH_HOME`. */
  ownPath?: string
  /** Performs the upstream token refresh. */
  refresh: (credential: CodeBuddyCredential) => Promise<CodeBuddyRefreshOutcome>
  /** Refresh this long before actual expiry; default five minutes. */
  refreshMarginMs?: number
}

/** Basename of the plugin-owned credential copy inside the Harness home. */
export const CODEBUDDY_AUTH_FILENAME = '.codebuddy-cli-auth.json'

/** Env variable that overrides the CLI auth-file location. */
export const CODEBUDDY_AUTH_FILE_ENV = 'CODEBUDDY_CLI_AUTH_FILE'

/** Current on-disk format of the plugin-owned copy; readers reject others. */
const OWN_FORMAT_VERSION = 1

interface OwnDocument {
  version: typeof OWN_FORMAT_VERSION
  credential: CodeBuddyCredential
}

/** Plugin-owned copy path inside the Harness home. */
export function codebuddyOwnAuthPath(): string {
  return join(resolveDshHome(), CODEBUDDY_AUTH_FILENAME)
}

/**
 * The auth directory's leaf path under the CodeBuddyExtension data root.
 * The CLI and the desktop IDE share this directory; each writes its own
 * `<product>.info` file inside.
 */
const AUTH_DIR_RELATIVE = ['CodeBuddyExtension', 'Data', 'Public', 'auth'] as const

/**
 * The CLI's own auth file name. This is the file `codebuddy` CLI rewrites on
 * login and refresh; when present it wins over every other candidate.
 */
const CLI_AUTH_FILENAME = 'Tencent-Cloud.coding-copilot.info'

/** Whether this Linux process is running inside Windows Subsystem for Linux. */
function isWsl(): boolean {
  if (process.platform !== 'linux') return false
  if (process.env['WSL_DISTRO_NAME'] !== undefined || process.env['WSL_INTEROP'] !== undefined) return true
  return release().toLowerCase().includes('microsoft')
}

/** Convert a Windows drive path to WSL's conventional `/mnt/<drive>` form. */
function windowsPathForWsl(value: string | undefined): string | undefined {
  const path = value?.trim()
  if (!path) return undefined
  if (path.startsWith('/')) return path
  const drivePath = /^([a-z]):[\\/](.*)$/iu.exec(path)
  if (drivePath === null) return undefined
  return join('/mnt', drivePath[1]!.toLowerCase(), ...drivePath[2]!.split(/[\\/]+/u))
}

/** Windows auth directories visible from a WSL process. */
function wslAuthDirCandidates(home: string): string[] {
  const profile = windowsPathForWsl(process.env['USERPROFILE'])
    ?? join('/mnt/c/Users', basename(home))
  const localAppData = windowsPathForWsl(process.env['LOCALAPPDATA'])
    ?? join(profile, 'AppData', 'Local')
  const roamingAppData = windowsPathForWsl(process.env['APPDATA'])
    ?? join(profile, 'AppData', 'Roaming')
  return [
    join(localAppData, ...AUTH_DIR_RELATIVE),
    join(roamingAppData, ...AUTH_DIR_RELATIVE),
  ]
}

/**
 * Platform-default candidates for the auth directory, in probe order.
 * Windows probes both AppData roots: current builds write under
 * `%LOCALAPPDATA%` (Local), older ones under `%APPDATA%` (Roaming). WSL probes
 * those same Windows locations through its mounted Windows profile before the
 * native Linux location.
 */
export function defaultAuthDirCandidates(): string[] {
  const home = homedir()
  if (process.platform === 'darwin') {
    return [join(home, 'Library', 'Application Support', ...AUTH_DIR_RELATIVE)]
  }
  if (process.platform === 'win32') {
    return [
      join(home, 'AppData', 'Local', ...AUTH_DIR_RELATIVE),
      join(home, 'AppData', 'Roaming', ...AUTH_DIR_RELATIVE),
    ]
  }
  if (process.platform === 'linux') {
    const linux = join(home, '.config', ...AUTH_DIR_RELATIVE)
    return isWsl() ? [...wslAuthDirCandidates(home), linux] : [linux]
  }
  return []
}

/** First platform-default candidate; see {@link defaultAuthDirCandidates}. */
export function defaultAuthDir(): string | undefined {
  return defaultAuthDirCandidates()[0]
}

/** Normalize an expiry that may arrive in seconds or milliseconds. */
function expiryToMs(value: number): number {
  if (value <= 0) return 0
  return value > 1e12 ? value : value * 1000
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * Parse a CodeBuddy auth document in either on-disk shape: the nested form
 * `{"auth":{...},"account":{...}}` (both the CLI and the desktop IDE write
 * this) and the flat panel form. Returns undefined when the document carries
 * no access token.
 */
export function parseCodeBuddyAuth(text: string): CodeBuddyCredential | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const document = parsed as Record<string, unknown>
  let auth: Record<string, unknown>
  let identity: Record<string, unknown>
  if (typeof document['auth'] === 'object' && document['auth'] !== null) {
    auth = document['auth'] as Record<string, unknown>
    identity = typeof document['account'] === 'object' && document['account'] !== null
      ? document['account'] as Record<string, unknown>
      : {}
  } else {
    auth = document
    identity = document
  }
  const accessToken = typeof auth['accessToken'] === 'string' ? auth['accessToken'] : ''
  if (accessToken === '') return undefined
  const expiresAtMs = typeof auth['expiresAt'] === 'number' ? expiryToMs(auth['expiresAt']) : 0
  const refreshExpiresAtMs = typeof auth['refreshExpiresAt'] === 'number' ? expiryToMs(auth['refreshExpiresAt']) : undefined
  const enterpriseId = optionalString(identity['enterpriseId'])
  const nickname = optionalString(identity['nickname'])
  const credential: CodeBuddyCredential = {
    accessToken,
    refreshToken: typeof auth['refreshToken'] === 'string' ? auth['refreshToken'] : '',
    expiresAtMs,
    ...refreshExpiresAtMs === undefined ? {} : { refreshExpiresAtMs },
    domain: optionalString(auth['domain']) ?? '',
    uid: optionalString(identity['uid']) ?? '',
    ...enterpriseId === undefined ? {} : { enterpriseId },
    ...nickname === undefined ? {} : { nickname },
    source: 'cli',
  }
  return credential
}

/** Serialize the plugin-owned copy. */
function ownDocument(credential: CodeBuddyCredential): OwnDocument {
  return { version: OWN_FORMAT_VERSION, credential }
}

/** Parse the plugin-owned copy; other versions and shapes are rejected. */
function parseOwnDocument(text: string): CodeBuddyCredential | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const document = parsed as Record<string, unknown>
  if (document['version'] !== OWN_FORMAT_VERSION) return undefined
  if (typeof document['credential'] !== 'object' || document['credential'] === null) return undefined
  // The owned copy stores the normalized credential itself (camelCase
  // `expiresAtMs`, identity fields at the top level), not the CLI
  // document shape. Round-tripping through parseCodeBuddyAuth reads
  // `expiresAt` and an `account` object, finds neither, zeroes the expiry,
  // and drops uid/enterprise/nickname — so a surviving copy refreshed on
  // every request would lose its identity headers.
  const stored = document['credential'] as Record<string, unknown>
  const accessToken = typeof stored['accessToken'] === 'string' ? stored['accessToken'] : ''
  if (accessToken === '') return undefined
  const refreshExpiresAtMs = typeof stored['refreshExpiresAtMs'] === 'number' ? stored['refreshExpiresAtMs'] : undefined
  const enterpriseId = optionalString(stored['enterpriseId'])
  const nickname = optionalString(stored['nickname'])
  return {
    accessToken,
    refreshToken: typeof stored['refreshToken'] === 'string' ? stored['refreshToken'] : '',
    expiresAtMs: typeof stored['expiresAtMs'] === 'number' ? stored['expiresAtMs'] : 0,
    ...refreshExpiresAtMs === undefined ? {} : { refreshExpiresAtMs },
    domain: optionalString(stored['domain']) ?? '',
    uid: optionalString(stored['uid']) ?? '',
    ...enterpriseId === undefined ? {} : { enterpriseId },
    ...nickname === undefined ? {} : { nickname },
    source: 'dsh',
  }
}

/** Whether a filesystem error reports an absent path. */
function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

/** One parsable `.info` file found in an auth directory, with its rank. */
interface DiscoveredCredential {
  path: string
  credential: CodeBuddyCredential
  /** Higher ranks win; ties break by file mtime, newest first. */
  rank: number
  mtimeMs: number
}

/** Rank bonus for the file the CLI itself maintains. */
const CLI_FILE_RANK = 2
/** Rank bonus for a document whose account carries `lastLogin: true`. */
const LAST_LOGIN_RANK = 1

/**
 * Scan one auth directory for parsable `.info` files and rank them. The
 * CLI's own file (`Tencent-Cloud.coding-copilot.info`) outranks everything;
 * `account.lastLogin === true` outranks the rest; equal ranks break by file
 * mtime, newest first. Unparsable and token-less files are skipped.
 */
async function discoverInDir(dir: string): Promise<DiscoveredCredential[]> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch (error: unknown) {
    if (isENOENT(error)) return []
    throw error
  }
  const found: DiscoveredCredential[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.info')) continue
    const path = join(dir, entry)
    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch (error: unknown) {
      if (isENOENT(error)) continue
      throw error
    }
    const credential = parseCodeBuddyAuth(text)
    if (credential === undefined) continue
    let rank = entry === CLI_AUTH_FILENAME ? CLI_FILE_RANK : 0
    let mtimeMs = 0
    try {
      mtimeMs = (await stat(path)).mtimeMs
    } catch {
      // Unstatable: keep the file with mtime 0 rather than dropping a usable credential.
    }
    // `lastLogin` rides the account object, which the normalized credential
    // does not carry — read the flag from the document itself.
    try {
      const document = JSON.parse(text) as Record<string, unknown>
      const account = typeof document['account'] === 'object' && document['account'] !== null
        ? document['account'] as Record<string, unknown>
        : undefined
      if (account?.['lastLogin'] === true) rank += LAST_LOGIN_RANK
    } catch {
      // The text already parsed once in parseCodeBuddyAuth; treat an
      // unexpected re-parse failure as "no lastLogin flag".
    }
    found.push({ path, credential, rank, mtimeMs })
  }
  return found.sort((a, b) => b.rank - a.rank || b.mtimeMs - a.mtimeMs)
}

/**
 * Read-only credential store with demand-driven refresh.
 *
 * Refresh policy: refresh only when the access token is inside the margin
 * (or already expired), keep the refreshed credential in the plugin-owned
 * copy, and never write the CLI's auth file. A failed refresh still
 * returns a not-yet-expired token so an unreachable refresh endpoint does
 * not take down a working session.
 */
export class CodeBuddyCredentialStore {
  private readonly refresh: CodeBuddyStoreOptions['refresh']
  private readonly refreshMarginMs: number
  private readonly ownPath: string
  private cliPathOverride: string | undefined
  private inflight: Promise<CodeBuddyCredential> | undefined

  constructor(options: CodeBuddyStoreOptions) {
    this.refresh = options.refresh
    this.refreshMarginMs = options.refreshMarginMs ?? 5 * 60 * 1000
    this.ownPath = options.ownPath ?? codebuddyOwnAuthPath()
    this.cliPathOverride = options.cliPath
  }

  /**
   * Configuration precedence for the CLI file: the plugin's configured path,
   * then the environment variable, then the platform defaults. An explicit
   * path is used verbatim; the defaults are a discovery order.
   */
  private resolveCliCandidates(): string[] {
    const fromEnv = process.env[CODEBUDDY_AUTH_FILE_ENV]
    const explicit = this.cliPathOverride
      ?? (fromEnv !== undefined && fromEnv.trim() !== '' ? fromEnv : undefined)
    if (explicit !== undefined) return [explicit]
    return defaultAuthDirCandidates()
  }

  /** The first auth-directory candidate, for diagnostics. */
  cliAuthDir(): string | undefined {
    if (this.cliPathOverride !== undefined) return this.cliPathOverride
    const fromEnv = process.env[CODEBUDDY_AUTH_FILE_ENV]
    if (fromEnv !== undefined && fromEnv.trim() !== '') return fromEnv
    return defaultAuthDir()
  }

  /**
   * Repoint the CLI auth file; a settings change applies on the next read.
   */
  setCliPath(path: string | undefined): void {
    this.cliPathOverride = path
  }

  /** The configured CLI auth-file path, for diagnostics. */
  cliAuthPath(): string | undefined {
    return this.resolveCliCandidates()[0]
  }

  /** The plugin-owned copy path, for diagnostics. */
  ownAuthPath(): string {
    return this.ownPath
  }

  /** Read the freshest stored credential without refreshing anything. */
  async current(): Promise<CodeBuddyCredential | undefined> {
    const [cli, own] = await Promise.all([this.readCli(), this.readOwn()])
    if (cli === undefined) return own
    if (own === undefined) return cli
    return own.expiresAtMs > cli.expiresAtMs ? own : cli
  }

  /**
   * The credential to send upstream: {@link current}, refreshed on demand.
   * Single-flight, so parallel requests share one refresh.
   */
  async resolve(): Promise<CodeBuddyCredential> {
    const credential = await this.current()
    if (credential === undefined) {
      const dirs = defaultAuthDirCandidates()
      const where = dirs.length > 0 ? dirs.join(' or ') : '(no auth directory on this platform)'
      throw new Error(
        `codebuddy-cli: no signed-in CodeBuddy account found; run \`codebuddy\` once and sign in`
        + ` (expected a .info file under ${where}, or set ${CODEBUDDY_AUTH_FILE_ENV}), or refresh an existing session`,
      )
    }
    if (!this.needsRefresh(credential)) return credential
    this.inflight ??= this.refreshNow(credential)
      .finally(() => {
        this.inflight = undefined
      })
    return this.inflight
  }

  /** Read-only sign-in summary; never refreshes and never throws. */
  async status(): Promise<CodeBuddyAuthStatus> {
    try {
      const credential = await this.current()
      if (credential === undefined) return { state: 'signed-out' }
      return {
        state: 'signed-in',
        expiresAtMs: credential.expiresAtMs,
        ...credential.refreshExpiresAtMs === undefined ? {} : { refreshExpiresAtMs: credential.refreshExpiresAtMs },
        ...credential.nickname === undefined ? {} : { nickname: credential.nickname },
        ...credential.domain === '' ? {} : { domain: credential.domain },
        source: credential.source,
      }
    } catch {
      return { state: 'signed-out' }
    }
  }

  /** Remove the plugin-owned copy; the CLI's auth file is untouched. */
  async logout(): Promise<void> {
    await rm(this.ownPath, { force: true })
    await rm(`${this.ownPath}.lock`, { force: true })
  }

  private needsRefresh(credential: CodeBuddyCredential): boolean {
    if (credential.expiresAtMs <= 0) return true
    return Date.now() + this.refreshMarginMs >= credential.expiresAtMs
  }

  private async refreshNow(credential: CodeBuddyCredential): Promise<CodeBuddyCredential> {
    if (credential.refreshToken === '') {
      if (credential.expiresAtMs > Date.now() + 30_000) return credential
      throw new Error('codebuddy-cli: access token expired and no refresh token is stored; sign in again in the CodeBuddy CLI')
    }
    try {
      const outcome = await this.refresh(credential)
      const refreshed: CodeBuddyCredential = {
        ...credential,
        accessToken: outcome.accessToken,
        ...outcome.refreshToken === undefined ? {} : { refreshToken: outcome.refreshToken },
        expiresAtMs: outcome.expiresInSec !== undefined
          ? Date.now() + outcome.expiresInSec * 1000
          : credential.expiresAtMs,
        ...outcome.domain === undefined || outcome.domain === '' ? {} : { domain: outcome.domain },
        source: 'dsh',
      }
      await this.saveOwn(refreshed)
      return refreshed
    } catch (error: unknown) {
      if (credential.expiresAtMs > Date.now() + 30_000) return credential
      throw new Error(
        `codebuddy-cli: token refresh failed and the access token is expired (${String(error)});`
        + ' run the CodeBuddy CLI once to sign in again',
      )
    }
  }

  private async saveOwn(credential: CodeBuddyCredential): Promise<void> {
    await withFileLock(this.ownPath, async () => {
      await writeFileAtomic(this.ownPath, `${JSON.stringify(ownDocument(credential), null, 2)}\n`, {
        mode: 0o600,
        dirMode: 0o700,
      })
    })
  }

  /**
   * Discover the best CLI credential: scan each default directory (or use a
   * single explicit path verbatim) in probe order and take the first
   * directory that yields a ranked candidate. Only an absent candidate
   * (ENOENT) falls through to the next; a present directory with no parsable
   * `.info` file is authoritative for its slot, so a stale older-version
   * location never silently wins over a broken newer one.
   */
  private async readCli(): Promise<CodeBuddyCredential | undefined> {
    for (const candidate of this.resolveCliCandidates()) {
      let statResult
      try {
        statResult = await stat(candidate)
      } catch (error: unknown) {
        if (!isENOENT(error)) throw error
        continue
      }
      // An explicit path points at the auth file itself; a default candidate
      // is the auth directory to scan.
      if (statResult.isFile()) return parseCodeBuddyAuth(await readFile(candidate, 'utf8')) ?? undefined
      const discovered = await discoverInDir(candidate)
      if (discovered.length > 0) return discovered[0]!.credential
      return undefined
    }
    return undefined
  }

  private async readOwn(): Promise<CodeBuddyCredential | undefined> {
    try {
      return parseOwnDocument(await readFile(this.ownPath, 'utf8'))
    } catch (error: unknown) {
      if (isENOENT(error)) return undefined
      return undefined
    }
  }

  /** Whether any auth-directory candidate yields a credential; diagnostics only. */
  async cliFilePresent(): Promise<boolean> {
    for (const candidate of this.resolveCliCandidates()) {
      try {
        if ((await stat(candidate)).isFile()) return true
        if ((await discoverInDir(candidate)).length > 0) return true
      } catch {
        // absent or not readable — try the next candidate
      }
    }
    return false
  }
}
