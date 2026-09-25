/**
 * CodeBuddy models for DeepSeek Harness, reusing the CodeBuddy CLI's
 * sign-in. Registers the `codebuddy-cli` provider; streaming, tool calls,
 * compaction, and permissions stay Harness-owned.
 * @module dsh-codebuddy-cli
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-attachment'
import { CodeBuddyCredentialStore } from './auth.ts'
import { CodeBuddyCatalog } from './catalog.ts'
import { createCodeBuddyAdapter, CODEBUDDY_PROVIDER } from './adapter.ts'
import { createCodeBuddyShim } from './shim.ts'
import { CodeBuddyUpstreamClient } from './upstream.ts'
import { registerCodeBuddyStatusRoute } from './web-status.ts'
import { clearHostHeartbeat, writeHostHeartbeat } from './host-heartbeat.ts'
import { AccountStore } from './account-store.ts'
import { startOAuthLogin, pollOAuthLogin } from './oauth.ts'
import { ensureClientIdentity } from './upstream.ts'
import { installSettingsSectionCompat, resolveSettingsNamespaceCompat } from './settings-compat.ts'

export { CODEBUDDY_PROVIDER, CODEBUDDY_STREAM_IDLE_TIMEOUT_MS, createCodeBuddyAdapter, type CodeBuddyAdapter } from './adapter.ts'
export { createCodeBuddyShim, type CodeBuddyShim } from './shim.ts'
export {
  FALLBACK_CODEBUDDY_MODELS,
  CodeBuddyCatalog,
  filterEnabledModels,
  type CodeBuddyModelInfo,
} from './catalog.ts'
export {
  defaultAuthDirCandidates,
  defaultAuthDir,
  parseCodeBuddyAuth,
  CODEBUDDY_AUTH_FILE_ENV,
  CODEBUDDY_AUTH_FILENAME,
  CodeBuddyCredentialStore,
  codebuddyOwnAuthPath,
  type CodeBuddyAuthStatus,
  type CodeBuddyCredential,
} from './auth.ts'
export {
  classifyUpstreamError,
  normalizeCredits,
  prepareChatBody,
  regionOf,
  CodeBuddyUpstreamClient,
  type UpstreamErrorKind,
  type CodeBuddyChatResult,
  type CodeBuddyCredits,
  type CodeBuddyEffort,
  type CodeBuddyModelBilling,
  type CodeBuddyModelReasoning,
  type CodeBuddyRefreshOutcome,
  type CodeBuddyUpstreamModel,
  type CodeBuddyCreditAccount,
  type CodeBuddyUsageRow,
  type CodeBuddyUsageDaily,
  type CodeBuddyUsageStats,
} from './upstream.ts'
export {
  clientIdentityHeaders,
  resolveClientIdentity,
  resolveCodeBuddyCliVersion,
  userAgentFor,
  CODEBUDDY_IDE_NAME,
  CODEBUDDY_IDE_TYPE,
  CODEBUDDY_UNKNOWN_VERSION,
  type CodeBuddyClientIdentity,
} from './client-identity.ts'
export {
  CODEBUDDY_HOST_HEARTBEAT_FILENAME,
  clearHostHeartbeat,
  isHeartbeatProcessAlive,
  processStartTimeMs,
  readHostHeartbeat,
  codebuddyHostHeartbeatPath,
  type CodeBuddyHostHeartbeat,
} from './host-heartbeat.ts'

/** Stable Cordis plugin name. */
export const name = 'llm-codebuddy-cli'

/** The model registry required before the provider can register. */
export const inject = ['llm']

/**
 * Settings namespace owning the configuration card.
 *
 * DSH 0.1.2 dropped the `settingsNamespace()` branding function: a namespace is
 * now a nominal string, validated by the type system where it is used rather
 * than at runtime by a function call. The brand is compile-time only, so this
 * stays the plain string it always was — every comparison, descriptor lookup,
 * and `dsh` config file still sees `'codebuddy-cli'`. It is cast once here so the
 * public constant carries the seam's type without pulling the brand helper
 * into this package (upstream DSH plugins, `dsh-llm-pi-ai` included, pass
 * their namespaces as plain string literals).
 *
 * On DSH 0.1.7+ the settings provider addresses sections by Loader entry id
 * instead, so reads and writes go through the namespace resolved by
 * `settingsCompatNamespace()` below rather than this constant directly.
 */
export const CODEBUDDY_SETTINGS_NS = 'codebuddy-cli' as SettingsNamespace

/**
 * The namespace the installed settings provider actually uses.
 *
 * Generations 1 and 2 accept the caller's namespace, so this is the plugin's
 * own constant. Managed forms (0.1.7+) derive the section from the profile
 * entry and use its id (`llm-codebuddy-cli`) — writing to the constant there
 * would target a section that does not exist.
 */
function settingsCompatNamespace(ctx: Context): SettingsNamespace {
  return resolveSettingsNamespaceCompat(ctx, ctx.get('settings'), CODEBUDDY_SETTINGS_NS)
}

/** Plugin configuration. */
export interface Config {
  /** Explicit CodeBuddy CLI auth-file path, overriding env and platform defaults. */
  authFile?: string
  /**
   * Allowlist of CodeBuddy model ids the model pickers offer.
   *
   * The CodeBuddy roster is long (15 rows and growing), and the composer's
   * model seat lists every served model at once. This narrows what the pickers
   * show without touching dispatch: an absent or empty list means the whole
   * catalog, so an untouched install behaves exactly as before, and a session
   * already pinned to a de-selected model keeps working.
   */
  enabledModels?: string[]
}

/**
 * One live config field exposed by schemastery's volatile resolver.
 *
 * When any field of a Config schema is marked `volatile`, the loader hands the
 * plugin its values as references rather than plain data: parsing such a schema
 * yields an object carrying `Symbol.for('cosmokit.volatile.write')` whose
 * `get()` returns an immutable snapshot (`isVolatile` in `@deepseek-ai/cosmokit`).
 */
interface VolatileValue<T> {
  get: () => T
}

/** Read a value that may be a volatile config reference. */
function unwrapVolatileValue<T>(value: unknown): T {
  if (typeof value === 'object' && value !== null && typeof (value as { get?: unknown }).get === 'function') {
    return (value as VolatileValue<T>).get()
  }
  return value as T
}

/** Detach the plain Config view from the loader's volatile fields. */
function unwrapConfig(value: unknown): Config {
  if (typeof value !== 'object' || value === null) return {}
  const out: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(value)) out[key] = unwrapVolatileValue(field)
  return out as Config
}

/**
 * The plugin's configuration schema.
 *
 * Every field is marked `volatile` because DSH 0.1.7+ builds its settings
 * forms from volatile fields only (`volatileForm` in `dsh-settings` skips an
 * entry outright when nothing in its schema is volatile). Older providers have
 * no concept of volatility, and the compat layer strips the marker before
 * handing the schema to them, so this stays inert on every host generation.
 *
 * The public type stays the plain `Config` shape for plugin consumers; the
 * loader resolves these top-level fields to volatile references, which
 * `unwrapConfig` collapses back at every read.
 */
export const Config: z<Config> = z.object({
  authFile: z.string().description('CodeBuddy CLI auth file (defaults to the CLI\'s own location)').volatile(),
  enabledModels: z.array(z.string()).description('Model ids offered in the model pickers (empty means every model)').volatile(),
}) as unknown as z<Config>

/**
 * Start the loopback endpoint, register the `codebuddy` provider, and
 * refresh the model catalog from the upstream once credentials allow it.
 * The static fallback catalog serves from the first moment, so an offline
 * upstream never leaves the provider empty.
 */
export function apply(ctx: Context, rawConfig: Config): void {
  const config = unwrapConfig(rawConfig)
  const client = new CodeBuddyUpstreamClient()
  const accountStore = new AccountStore()
  const store = new CodeBuddyCredentialStore({
    ...config.authFile === undefined ? {} : { cliPath: config.authFile },
    refresh: credential => client.refreshToken(credential),
    accountStore,
  })
  const catalog = new CodeBuddyCatalog()
  const shim = createCodeBuddyShim({ store, client, catalog, logger: ctx.logger })

  // The authoritative configuration read. Reassigned below whenever the
  // settings document changes, so every consumer that reads through this thunk
  // sees live edits without re-registering anything.
  let current = (): Config => config
  const enabledModels = (): readonly string[] | undefined => current().enabledModels

  /**
   * Persist a model selection into this plugin's settings section.
   *
   * The settings service is resolved per call rather than captured, matching
   * how the adapter resolves `attachments`: a headless profile has no settings
   * provider at all, and the card must be told the selection is not writable
   * rather than silently dropping it.
   */
  const setEnabledModels = async (ids: readonly string[]): Promise<boolean> => {
    const settings = ctx.get('settings')
    if (settings === undefined) return false
    await settings.update(settingsCompatNamespace(ctx), { enabledModels: [...ids] })
    return true
  }

  // Same-origin status route backing the Plugin-configuration card; the
  // webServer service is optional (a headless profile serves no browser).
  ctx.inject(['webServer'], webCtx => registerCodeBuddyStatusRoute(webCtx, {
    store,
    client,
    models: () => catalog.current(),
    enabledModels,
    setEnabledModels,
    settingsWritable: () => ctx.get('settings') !== undefined,
    checkIn: credential => client.checkIn(credential),
    refreshToken: credential => client.refreshToken(credential),
    fetchUsage: credential => client.fetchUsage(credential),
    accountStore,
    loginStart: identity => startOAuthLogin(identity),
    loginPoll: (state, identity) => pollOAuthLogin(state, identity),
    resolveIdentity: () => ensureClientIdentity(),
  }))

  // The settings section keeps the configured auth-file path live across edits
  // and, on hosts with an installer, contributes the section itself. DSH 0.1.7
  // replaced both installers with managed forms derived from the volatile
  // Config above, so `installSettingsSectionCompat` picks whichever generation
  // is present instead of assuming one. Without a settings service the plugin
  // still serves its models; it simply has no user-editable section.
  installSettingsSectionCompat(ctx, CODEBUDDY_SETTINGS_NS, Config, config, {
    setSource(source) {
      // A source thunk may hand back volatile references, so normalize on every
      // read rather than trusting the shape it returns.
      current = () => unwrapConfig(source())
    },
    onChange() {
      const next = current().authFile
      store.setCliPath(next)
    },
  })

  let stopped = false
  ctx.effect(() => () => {
    stopped = true
    void shim.close()
    void clearHostHeartbeat()
  })

  void shim.ready
    .then(() => {
      if (stopped) return

      let invalidate: (() => void) | undefined
      try {
        // Constructed only once the listener holds a port: the provider's
        // models read the shim origin at construction time.
        const codebuddy = createCodeBuddyAdapter({
          shim,
          store,
          catalog,
          enabledModels,
          resolveAttachments: () => ctx.get('attachments'),
        })
        invalidate = codebuddy.invalidate

        let releaseAdapter: (() => void) | undefined
        let releaseDirectory: (() => void) | undefined
        try {
          releaseAdapter = ctx.llm.registerAdapter([CODEBUDDY_PROVIDER], codebuddy.adapter)
          releaseDirectory = ctx.llm.registerConfigurableProviders([{
            provider: CODEBUDDY_PROVIDER,
            displayName: 'CodeBuddy',
            // Must be the resolved namespace, not the constant: on 0.1.7+ the
            // provider stores this family's config under the Loader entry id
            // (`llm-codebuddy-cli`). Declaring the legacy constant here pointed
            // the Models page at a section the writes never touch, so a saved
            // selection read back as unset.
            settingsNs: settingsCompatNamespace(ctx),
            settingsPath: [],
            declared: false,
          }])
        } finally {
          if (releaseAdapter === undefined || releaseDirectory === undefined) {
            // Registration threw; release whichever half landed.
            releaseAdapter?.()
            releaseDirectory?.()
          }
        }
        try {
          ctx.effect(() => () => {
            releaseAdapter?.()
            releaseDirectory?.()
          })
        } catch {
          // The plugin was disposed during registration; release immediately —
          // the plugin-level disposer already closed the shim.
          releaseAdapter?.()
          releaseDirectory?.()
        }

        // The host bundle is live: write a heartbeat so the status CLI can
        // report host health without a browser. Cleared on disposal; a stale
        // heartbeat after a crash is detected by PID in the reader.
        void writeHostHeartbeat()
      } catch (error: unknown) {
        ctx.logger.error('dsh-codebuddy-cli: provider registration failed', error)
        return
      }

      void (async () => {
        try {
          const credential = await store.current()
          if (credential === undefined || stopped) return
          const models = await client.fetchModels(credential)
          if (stopped) return
          catalog.set([...models])
          invalidate?.()
        } catch (error: unknown) {
          ctx.logger.warn(
            'dsh-codebuddy-cli: dynamic model catalog unavailable; serving the static fallback list',
            error,
          )
        }
      })()
    })
    .catch((error: unknown) => {
      ctx.logger.error('dsh-codebuddy-cli: loopback endpoint failed to start; provider not registered', error)
    })
}
