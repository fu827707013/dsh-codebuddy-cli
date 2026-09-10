/**
 * CodeBuddy client identity: the headers the upstream uses to attribute a
 * request to a client product and version.
 *
 * The CodeBuddy backend does not read `User-Agent` to decide which client a
 * request came from. It reads a dedicated header family — `X-IDE-Type`,
 * `X-IDE-Name`, `X-IDE-Version` and `X-Product-Version` — which the official
 * CLI sets on every call. A request that omits them is attributed to no client
 * at all, which is what makes the plugin's traffic indistinguishable from an
 * unattributed client in the backend console.
 *
 * The official CLI derives those values the same way every time:
 *
 * - `ideType` is `cli` (its host detection resolves a plain `codebuddy`
 *   process to `cli`; `--acp` maps to `vscode-acp` and `--serve` to `web-ui`).
 * - the version fields come from the installed CLI build, so they track the
 *   CLI the user actually has rather than a compile-time constant.
 *
 * This module reproduces that identity for the plugin's own upstream calls:
 * `X-IDE-Type` is the constant `cli`, while the version fields are resolved
 * from the installed `@tencent-ai/codebuddy-code` package so they can never
 * drift from the CLI the credential came from. Resolution is best-effort — a
 * missing or unreadable install falls back to a neutral placeholder instead of
 * failing the request, because identity metadata must never break chat.
 *
 * @module dsh-codebuddy-cli/client-identity
 */

import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'

/**
 * The IDE type the official CLI reports for a plain (non-ACP, non-serve)
 * process. Kept as an exact constant: it is what the backend matches on to
 * classify traffic as CLI traffic.
 */
export const CODEBUDDY_IDE_TYPE = 'cli'

/** IDE name the CLI reports; mirrors its product name for the terminal. */
export const CODEBUDDY_IDE_NAME = 'cli'

/** npm package name of the CodeBuddy CLI. */
export const CODEBUDDY_CLI_PACKAGE = '@tencent-ai/codebuddy-code'

/**
 * Version reported when the installed CLI cannot be resolved. Deliberately a
 * value that reads as "unknown" rather than a stale real version number: a
 * plausible-but-wrong version is worse evidence than an honest placeholder.
 */
export const CODEBUDDY_UNKNOWN_VERSION = 'unknown'

/**
 * How many ancestor directories to probe above each module search root when
 * looking for a global install. Version managers nest their global prefix a
 * couple of levels deep (fnm exposes `<prefix>/lib/node`), so a small bound
 * covers them without walking to the filesystem root on every probe.
 */
const MAX_ANCESTOR_PROBE_DEPTH = 4

/** Resolved client identity carried on every upstream request. */
export interface CodeBuddyClientIdentity {
  /** IDE type, always `cli` — see {@link CODEBUDDY_IDE_TYPE}. */
  ideType: string
  /** IDE name, always `cli`. */
  ideName: string
  /** Installed CLI version, or {@link CODEBUDDY_UNKNOWN_VERSION}. */
  ideVersion: string
  /** Product version; tracks {@link ideVersion}. */
  productVersion: string
}

/**
 * Decorated `User-Agent` the upstream sees. Kept in the CLI's own
 * `CLI/<version> CodeBuddy/<version>` shape and now derived from the real
 * installed version instead of a hardcoded constant.
 */
export function userAgentFor(version: string): string {
  return `CLI/${version} CodeBuddy/${version}`
}

/**
 * Read the version of an installed CodeBuddy CLI package.
 *
 * Resolution order mirrors how the CLI itself would be located, most specific
 * first:
 *
 * 1. an explicit `package.json` path, for tests and unusual installs;
 * 2. the package resolved from the plugin's own module graph (works when the
 *    CLI is co-installed with, or hoisted next to, the plugin);
 * 3. every directory on this Node process's module search path, which covers
 *    global installs under npm, pnpm, fnm, nvm and Volta without needing to
 *    know any of their layouts;
 * 4. the conventional global npm roots for the running platform.
 *
 * Every step is best-effort: any failure moves to the next candidate, and the
 * final fallback is {@link CODEBUDDY_UNKNOWN_VERSION}.
 *
 * @param explicitPath - optional absolute path to a CLI `package.json`.
 * @returns the installed version, or the unknown placeholder.
 */
export async function resolveCodeBuddyCliVersion(explicitPath?: string): Promise<string> {
  const candidates: string[] = []
  if (explicitPath !== undefined && explicitPath !== '') candidates.push(explicitPath)
  const resolved = resolveFromModuleGraph()
  if (resolved !== undefined) candidates.push(resolved)
  candidates.push(...moduleSearchPathCandidates())
  candidates.push(...globalPackageJsonCandidates())

  for (const candidate of candidates) {
    const version = await readVersionFrom(candidate)
    if (version !== undefined) return version
  }
  return CODEBUDDY_UNKNOWN_VERSION
}

/** Locate the CLI's `package.json` through the plugin's module resolution. */
function resolveFromModuleGraph(): string | undefined {
  try {
    return createRequire(import.meta.url).resolve(`${CODEBUDDY_CLI_PACKAGE}/package.json`)
  } catch {
    // Not co-installed, or the package hides package.json from exports.
    return undefined
  }
}

/**
 * Candidate paths derived from the module resolution search path — the exact
 * set of directories Node itself would consult for a global module. This is
 * the portable answer to "where is a globally installed package": version
 * managers such as fnm, nvm and Volta install into per-session or per-version
 * roots that no fixed path can predict, but those roots appear on this list
 * while the process runs.
 *
 * `require.resolve.paths` is the ESM-safe equivalent of `module.paths`, which
 * does not exist under ES modules.
 */
function moduleSearchPathCandidates(): string[] {
  const parts = CODEBUDDY_CLI_PACKAGE.split('/')
  let roots: readonly string[] | null = null
  try {
    roots = createRequire(import.meta.url).resolve.paths(CODEBUDDY_CLI_PACKAGE)
  } catch {
    roots = null
  }
  if (roots === null) return []
  const candidates: string[] = []
  for (const root of roots) {
    // The search root itself, then each ancestor's `node_modules`. Version
    // managers expose a global root at a manager-specific depth — fnm reports
    // `<prefix>/lib/node` while packages live in `<prefix>/node_modules` — and
    // walking up finds the real install without hardcoding any one layout.
    candidates.push(join(root, ...parts, 'package.json'))
    let current = root
    for (let depth = 0; depth < MAX_ANCESTOR_PROBE_DEPTH; depth += 1) {
      const parent = dirname(current)
      if (parent === current) break
      candidates.push(join(parent, 'node_modules', ...parts, 'package.json'))
      current = parent
    }
  }
  return candidates
}

/**
 * Conventional global install locations for the current platform, used as a
 * last resort when the module search path does not cover the install.
 */
function globalPackageJsonCandidates(): string[] {
  const parts = CODEBUDDY_CLI_PACKAGE.split('/')
  const home = process.env['USERPROFILE'] ?? process.env['HOME']
  const localAppData = process.env['LOCALAPPDATA']
  const appData = process.env['APPDATA']
  const roots: string[] = []
  if (process.platform === 'win32') {
    // npm's default global prefix on Windows is %APPDATA%\npm; fnm and
    // nvm-windows place theirs under %LOCALAPPDATA%.
    if (appData !== undefined && appData !== '') roots.push(join(appData, 'npm', 'node_modules'))
    if (localAppData !== undefined && localAppData !== '') roots.push(join(localAppData, 'npm', 'node_modules'))
  } else if (home !== undefined && home !== '') {
    roots.push(join(home, '.npm-global', 'lib', 'node_modules'))
  }
  roots.push('/usr/local/lib/node_modules')
  roots.push('/usr/lib/node_modules')
  return roots.map(root => join(root, ...parts, 'package.json'))
}

/** Read and parse a `version` field from one `package.json`, if usable. */
async function readVersionFrom(packageJsonPath: string): Promise<string | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(packageJsonPath, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const version = (parsed as Record<string, unknown>)['version']
    return typeof version === 'string' && version.trim() !== '' ? version.trim() : undefined
  } catch {
    return undefined
  }
}

/**
 * Headers that carry the client identity to the upstream. These are the same
 * header names the official CLI uses, which is what makes the backend
 * attribute plugin traffic to a `cli` client instead of leaving it blank.
 *
 * @param identity - resolved identity from {@link resolveClientIdentity}.
 * @returns the identity header block.
 */
export function clientIdentityHeaders(identity: CodeBuddyClientIdentity): Record<string, string> {
  const headers: Record<string, string> = {
    'X-IDE-Type': identity.ideType,
    'X-IDE-Name': identity.ideName,
    'User-Agent': userAgentFor(identity.ideVersion),
  }
  // Version headers are omitted rather than sent as `unknown`: an absent
  // version is honest, a fabricated one is a false claim on the wire.
  if (identity.ideVersion !== CODEBUDDY_UNKNOWN_VERSION) {
    headers['X-IDE-Version'] = identity.ideVersion
    headers['X-Product-Version'] = identity.productVersion
  }
  return headers
}

/**
 * Resolve the full client identity once, ready to splat into request headers.
 *
 * @param explicitPath - optional absolute CLI `package.json` path.
 * @returns the resolved identity.
 */
export async function resolveClientIdentity(explicitPath?: string): Promise<CodeBuddyClientIdentity> {
  const version = await resolveCodeBuddyCliVersion(explicitPath)
  return {
    ideType: CODEBUDDY_IDE_TYPE,
    ideName: CODEBUDDY_IDE_NAME,
    ideVersion: version,
    productVersion: version,
  }
}
