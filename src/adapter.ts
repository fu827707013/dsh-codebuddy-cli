/**
 * The `codebuddy` pi-ai provider: one loopback-backed adapter registered
 * into the Harness LLM seam, assembled from public `dsh-llm-pi-ai`
 * extension points the way `dsh-codex-connect` assembles its Codex route.
 *
 * @module dsh-codebuddy-cli/adapter
 */

import { createProvider } from '@earendil-works/pi-ai'
import type { Api, AuthContext, CredentialStore, Model, ModelThinkingLevel, Provider, ThinkingLevelMap } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { LlmModelInfo, LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type { CodeBuddyCredentialStore } from './auth.ts'
import { filterEnabledModels } from './catalog.ts'
import type { CodeBuddyCatalog, CodeBuddyModelInfo } from './catalog.ts'
import type { CodeBuddyShim } from './shim.ts'
import { normalizeCredits } from './upstream.ts'

/** Provider route this bundle owns. */
export const CODEBUDDY_PROVIDER = 'codebuddy-cli'

/** Provider idle ceiling while one stream read is outstanding. */
export const CODEBUDDY_STREAM_IDLE_TIMEOUT_MS = 300_000

/**
 * Image-request budgets at the dsh-llm-pi-ai defaults; the profile type made
 * them required in 0.1.1-rc.2. They bound requests to models whose catalog
 * entry declares `supportsImages`; text-only models never receive images.
 */
const REQUEST_IMAGE_BUDGETS = {
  maxRequestImageBytes: 20_971_520,
  requestImagePixelBudget: 4_194_304,
  requestImageMaxBytes: 1_048_576,
} as const

/**
 * Inert pi-ai auth plane. The codebuddy route authenticates only through the
 * shim shared secret resolved per request by `resolveApiKey`, so pi-ai's own
 * credential lifecycle and ambient discovery must never manufacture a
 * credential for it. `PiAiAdapterOptions.auth` is required since 0.1.1-rc.2;
 * every ambient question here answers "nothing stored, nothing set".
 */
const INERT_AUTH: { credentials: CredentialStore; authContext: AuthContext } = {
  credentials: {
    async read() { return undefined },
    async list() { return [] },
    async modify() {
      throw new Error('dsh-codebuddy-cli: the codebuddy route has no pi-ai credential lifecycle')
    },
    async delete() {},
  },
  authContext: {
    async env() { return undefined },
    async fileExists() { return false },
  },
}

/** No per-token pricing is knowable for a subscription quota; report zero. */
const NO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const

/**
 * The suffix appended to a model's display name so its billing rate is visible
 * wherever the name is shown.
 *
 * The separator is a middle dot rather than a hyphen or colon: model names
 * already contain hyphens (`GLM-5.3-Flash`, `Deepseek-V4-Flash`), so a hyphen
 * separator would be ambiguous about where the name ends and the rate begins.
 */
const RATE_SEPARATOR = ' · '

/**
 * Append the billing rate to one model's display name.
 *
 * The rate AND the declared promo badges ride the *name* alone: since DSH
 * 0.1.2 the composer's model seat (`ModelSelect`) renders `model.name` only —
 * `description` is no longer read there at all (the 0.1.1-era client rendered
 * it, which is why the badges used to be visible in the seat). The `/model`
 * popup renders the name too, so a separate `description` copy would either
 * duplicate (rate) or vanish (badges) depending on client generation.
 *
 * This is display-only and cannot affect routing: the wire request is built
 * from `model.id` (pi-ai's completions API sets `model: model.id`), the
 * selection a picker submits is `{provider, model: id, reasoningEffort}`, and
 * `dsh-llm` validates `name` as a non-empty string without comparing its
 * contents. Nothing in the host resolves a model *by* name.
 */

/**
 * The catalog display suffix: the billing rate followed by the declared promo
 * badges (`限时免费`, `夜间折扣`), or undefined when the row carries neither.
 * The badge labels are the upstream's own spellings and the host seam has no
 * locale service, so non-Chinese UIs see them verbatim — accepted until the
 * picker grows a localized badge slot.
 */
function displaySuffix(info: CodeBuddyModelInfo): string | undefined {
  const parts = [
    normalizeCredits(info.billing?.credits),
    ...(info.billing?.badges ?? []),
  ].filter((part): part is string => part !== undefined && part !== '')
  return parts.length === 0 ? undefined : parts.join(' · ')
}

/** Append the catalog display suffix to one model's display name. */
function withCatalogDisplay(name: string, info: CodeBuddyModelInfo): string {
  const suffix = displaySuffix(info)
  return suffix === undefined ? name : `${name}${RATE_SEPARATOR}${suffix}`
}
function withRate(name: string, info: CodeBuddyModelInfo): string {
  const rate = normalizeCredits(info.billing?.credits)
  return rate === undefined ? name : `${name}${RATE_SEPARATOR}${rate}`
}

/** Constructor dependencies. */
export interface CodeBuddyAdapterOptions {
  shim: CodeBuddyShim
  store: CodeBuddyCredentialStore
  catalog: CodeBuddyCatalog
  /**
   * Read the user's enabled-model allowlist at call time. Undefined (or an
   * empty answer) offers the whole catalog; see {@link filterEnabledModels}.
   * Read live rather than captured so a settings edit applies to the next
   * picker read without re-registering the provider.
   */
  enabledModels?: () => readonly string[] | undefined
  /** Resolve the durable attachment service at request time, when present. */
  resolveAttachments?: () => AttachmentStore | undefined
}

/** What {@link createCodeBuddyAdapter} hands back. */
export interface CodeBuddyAdapter {
  adapter: PiAiAdapter
  /** Rebuild the adapter's provider snapshot; call after a catalog update. */
  invalidate: () => void
}

/**
 * Resolve a CodeBuddy model's reasoning capability into pi-ai's
 * `thinkingLevelMap` (every level pinned to its wire spelling or `null` for
 * unsupported), mirroring `dsh-llm-pi-ai`'s own `resolveModelReasoning`.
 *
 * Declared sets only: a thinking control is offered exactly when the upstream
 * catalog declares a `supportedEfforts` list, and it offers exactly the
 * declared values. Rows without a list (the older `{effort, summary}` shape)
 * get no control at all — their selectable set is client-side knowledge the
 * catalog does not carry (the desktop app differs per model there: GLM-5.2
 * gets a thinking control while MiniMax-M3 and Kimi-K2.6 do not, though their
 * catalog rows are identical), and another implementation against the same
 * upstream (codebuddy2api) gates on the declared set and downgrades
 * out-of-set values rather than passing them through, so sending an
 * undeclared value risks a 400. Such models never carry `reasoning_effort`
 * on the wire; the upstream applies its own default.
 * `off` is offered only when the model explicitly reports thinking can be
 * disabled (`canDisableThinking === true`).
 */
function reasoningFields(info: CodeBuddyModelInfo): { reasoning: boolean; thinkingLevelMap?: ThinkingLevelMap } {
  const reasoning = info.reasoning
  if (reasoning === undefined || reasoning.supports !== true) {
    // Not a reasoning model: pi-ai reads a falsy `reasoning` as "off only".
    return { reasoning: false }
  }
  const efforts = reasoning.supportedEfforts
  if (efforts === undefined || efforts.length === 0) {
    // No declared set: no thinking control, no `reasoning_effort` on the wire
    // — identical to the pre-#9 behavior for these rows.
    return { reasoning: false }
  }
  const map: Record<ModelThinkingLevel, string | null> = {
    off: reasoning.canDisableThinking === true ? 'off' : null,
    // `minimal` is not in the upstream effort vocabulary (EFFORT_VALUES), so
    // no declared set can ever contain it.
    minimal: null,
    low: efforts.includes('low') ? 'low' : null,
    medium: efforts.includes('medium') ? 'medium' : null,
    high: efforts.includes('high') ? 'high' : null,
    xhigh: efforts.includes('xhigh') ? 'xhigh' : null,
    max: efforts.includes('max') ? 'max' : null,
  }
  return { reasoning: true, thinkingLevelMap: map as ThinkingLevelMap }
}

/** Build one pi-ai model descriptor pointing at the loopback shim. */
function toPiModel(info: CodeBuddyModelInfo, baseUrl: string): Model<Api> {
  return {
    id: info.id,
    name: info.name,
    api: 'openai-completions',
    provider: CODEBUDDY_PROVIDER,
    baseUrl,
    input: info.supportsImages === true ? ['text', 'image'] : ['text'],
    ...reasoningFields(info),
    cost: NO_COST,
    contextWindow: info.contextWindow,
    maxTokens: info.maxTokens,
  } as unknown as Model<Api>
}

/**
 * Assemble the adapter. The provider's `getModels` reads the live catalog,
 * and every model's `baseUrl` is re-resolved per read so the shim's
 * ephemeral port applies from the first snapshot after startup.
 */
export function createCodeBuddyAdapter(options: CodeBuddyAdapterOptions): CodeBuddyAdapter {
  const { shim, store, catalog, enabledModels, resolveAttachments } = options

  const buildModels = (): Model<Api>[] => {
    // The OpenAI SDK pi-ai drives appends `/chat/completions` to baseURL,
    // so the shim's routes line up with the `/v1` prefix in place.
    const baseUrl = `${shim.baseUrl()}/v1`
    return catalog.current().map(info => toPiModel(info, baseUrl))
  }

  const base = createProvider({
    id: CODEBUDDY_PROVIDER,
    name: 'CodeBuddy CLI',
    auth: {
      apiKey: {
        name: 'CodeBuddy OAuth bearer token',
        async resolve({ credential }) {
          const apiKey = credential?.key
          return apiKey === undefined || apiKey.length === 0
            ? undefined
            : { auth: { apiKey }, source: 'CodeBuddy' }
        },
      },
    },
    models: buildModels(),
    api: openAICompletionsApi(),
  })

  // `getModels` is delegated to a live read (the reuse-catalog pattern from
  // dsh-llm-pi-ai): stream dispatch still runs through the constructed
  // provider, while the catalog answer tracks the upstream refresh.
  const provider: Provider = { ...base, getModels: () => buildModels() }

  const profile: ResolvedPiAiProviderProfile = {
    provider: CODEBUDDY_PROVIDER,
    displayName: 'CodeBuddy CLI',
    streamIdleTimeoutMs: CODEBUDDY_STREAM_IDLE_TIMEOUT_MS,
    retryPolicy: resolveRetryPolicy(undefined, 'dsh-codebuddy-cli retryPolicy'),
    configuredMaxTokens: new Map(),
    ...REQUEST_IMAGE_BUDGETS,
    piProvider: provider,
  }

  let profiles = new Map<string, ResolvedPiAiProviderProfile>([[CODEBUDDY_PROVIDER, profile]])

  const adapter = new CodeBuddyPiAiAdapter(catalog, enabledModels, {
    profiles: () => profiles,
    auth: INERT_AUTH,
    // Resolve the shim's per-process shared secret as the OpenAI apiKey so
    // pi-ai sends it as `Authorization: Bearer <shared-secret>`. The shim
    // validates this before forwarding and resolves the real CodeBuddy token
    // itself via the store, so the secret never reaches upstream.
    resolveApiKey: async () => shim.token(),
    ...resolveAttachments === undefined ? {} : { resolveAttachments },
  })

  return {
    adapter,
    invalidate: () => {
      profiles = new Map<string, ResolvedPiAiProviderProfile>([[CODEBUDDY_PROVIDER, profile]])
    },
  }
}

/**
 * The CodeBuddy route's adapter: `PiAiAdapter` with the billing rate folded
 * into the catalog answers it returns to the DSH model pickers.
 *
 * `PiAiAdapter.listModels()` and `.resolveModel()` build their answers straight
 * from the pi-ai descriptors, which carry no billing fact, so the rate is
 * layered on here by looking the model up in the live catalog. Both overrides
 * delegate to `super` and then rewrite only the display fields, so streaming,
 * capability resolution, and effort mapping stay exactly as `dsh-llm-pi-ai`
 * implements them.
 *
 * A model missing from the catalog (an id the shim would serve but the last
 * upstream refresh did not list) falls through with its name untouched rather
 * than being dropped: catalog membership is advisory, and the seam tolerates
 * serving an unlisted id.
 */
class CodeBuddyPiAiAdapter extends PiAiAdapter {
  constructor(
    private readonly catalog: CodeBuddyCatalog,
    private readonly enabledModels: (() => readonly string[] | undefined) | undefined,
    options: ConstructorParameters<typeof PiAiAdapter>[0],
  ) {
    super(options)
  }

  /** Catalog entry for one model id, or undefined when the catalog omits it. */
  private infoFor(model: string): CodeBuddyModelInfo | undefined {
    return this.catalog.current().find(entry => entry.id === model)
  }

  /**
   * The enabled-model allowlist narrows this answer only — the *offer* surface.
   *
   * Dispatch deliberately stays whole: `resolveModel` below, the pi-ai
   * provider's own `getModels`, and the shim's `/v1/models` all keep serving
   * the complete catalog. A session already pinned to a model the user later
   * unchecked therefore keeps streaming instead of failing to resolve, and an
   * agent preset naming that id stays valid; the model simply stops being
   * offered in the pickers, which is exactly what the setting asks for.
   */
  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const models = await super.listModels(provider)
    const allowed = filterEnabledModels(this.catalog.current(), this.enabledModels?.())
    // An id absent from the catalog is never filtered out: catalog membership
    // is advisory here, and the selection can only speak about ids it listed.
    const catalogIds = new Set(this.catalog.current().map(entry => entry.id))
    const allowedIds = new Set(allowed.map(entry => entry.id))
    return models
      .filter(model => !catalogIds.has(model.id) || allowedIds.has(model.id))
      .map(model => {
        const info = this.infoFor(model.id)
        if (info === undefined) return model
        return { ...model, name: withCatalogDisplay(model.name, info) }
      })
  }

  override async resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    const resolved = await super.resolveModel(provider, model, signal)
    const info = this.infoFor(model)
    if (info === undefined) return resolved
    return { ...resolved, name: withCatalogDisplay(resolved.name, info) }
  }
}
