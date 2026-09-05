/**
 * Same-origin status route for the CodeBuddy plugin card: sign-in state,
 * token expiry, and remaining credit, fetched by the browser half. The route
 * answers loopback browser requests only and never carries token material.
 *
 * @module dsh-codebuddy-cli/web-status
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { CodeBuddyCredentialStore } from './auth.ts'
import type { CodeBuddyUpstreamClient } from './upstream.ts'
import { normalizeCredits } from './upstream.ts'
import { filterEnabledModels } from './catalog.ts'
import type { CodeBuddyModelInfo } from './catalog.ts'
import { hostIsLoopback, originIsLoopback } from './loopback.ts'
import { CODEBUDDY_MODELS_PATH, CODEBUDDY_STATUS_PATH } from './status-paths.ts'
import type {
  CodeBuddyWebCredits,
  CodeBuddyWebModelBadge,
  CodeBuddyWebModelChoice,
  CodeBuddyWebModelSelection,
  CodeBuddyWebRateMap,
  CodeBuddyWebStatus,
} from './status-paths.ts'

export { CODEBUDDY_MODELS_PATH, CODEBUDDY_STATUS_PATH } from './status-paths.ts'
export type { CodeBuddyWebStatus } from './status-paths.ts'

/** Constructor dependencies. */
export interface CodeBuddyStatusRouteOptions {
  store: CodeBuddyCredentialStore
  client: Pick<CodeBuddyUpstreamClient, 'fetchCredits'>
  /** Resolve the current model catalog for free/badge display. */
  models: () => readonly CodeBuddyModelInfo[]
  /** Read the stored enabled-model allowlist; undefined means no restriction. */
  enabledModels?: () => readonly string[] | undefined
  /**
   * Persist a new allowlist. Resolves false when no settings provider is
   * attached, which the card renders as a read-only selection.
   */
  setEnabledModels?: (ids: readonly string[]) => Promise<boolean>
  /** Whether a settings provider is attached and could accept a write. */
  settingsWritable?: () => boolean
}

/** Largest enabled-model write the route accepts (bounds an untrusted body). */
const MODELS_BODY_LIMIT = 64 * 1024

/** Redact token-like content before it crosses to the browser. */
function safeMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, '[redacted token]')
    .replace(/(\b(?:code|token|refresh_token|access_token)=)[^&\s]+/giu, '$1[redacted]')
    .slice(0, 500)
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) })
  res.end(payload)
}

/**
 * The request must be addressed to the loopback interface, and a
 * browser-attached Origin must be loopback too. The Host check drops
 * DNS-rebinding pages (their Host is the attacker's domain, not loopback);
 * the card's same-origin fetches carry no Origin and pass on Host alone.
 */
function loopbackRequest(req: IncomingMessage): boolean {
  return hostIsLoopback(req.headers.host) && originIsLoopback(req.headers.origin)
}

/**
 * The composer dock polls the status route alongside the card's own polling,
 * and a live billing upstream call per poll would multiply the CodeBuddy
 * billing endpoint's traffic for no user-visible gain (credit figures move
 * only when the user spends). A short TTL collapses concurrent and
 * back-to-back document builds into one upstream call.
 */
const CREDITS_CACHE_TTL_MS = 30_000

/** Max-age memo of one billing answer, keyed by nothing (one credential per process). */
export interface CreditsCacheEntry {
  at: number
  credits: CodeBuddyWebCredits
}

/**
 * Build the whole-catalog rate/name maps for the composer dock, or undefined
 * when the catalog is empty. Every served model appears (not only promo rows):
 * the dock resolves the multiplier of whatever model the session currently
 * has selected.
 */
function rateMapOf(models: readonly CodeBuddyModelInfo[]): CodeBuddyWebRateMap | undefined {
  if (models.length === 0) return undefined
  const rates: Record<string, string> = {}
  const names: Record<string, string> = {}
  for (const model of models) {
    names[model.id] = model.name
    const rate = normalizeCredits(model.billing?.credits)
    if (rate !== undefined) rates[model.id] = rate
  }
  return { rates, names }
}

/**
 * Build the card's checkbox list: every served model with the offered state the
 * Host actually applies.
 *
 * `restricted` reports whether the stored selection narrows anything, computed
 * the same way the adapter's filter decides it (absent, empty, or fully stale
 * selections restrict nothing) so the card and the picker can never disagree
 * about what is offered.
 *
 * @param models - the full catalog.
 * @param enabled - the stored allowlist, or undefined when none is stored.
 * @param writable - whether a settings provider could accept a write.
 * @returns the selection block, or undefined for an empty catalog.
 */
function selectionOf(
  models: readonly CodeBuddyModelInfo[],
  enabled: readonly string[] | undefined,
  writable: boolean,
): CodeBuddyWebModelSelection | undefined {
  if (models.length === 0) return undefined
  const offered = new Set(filterEnabledModels(models, enabled).map(model => model.id))
  const choices: readonly CodeBuddyWebModelChoice[] = models.map(model => {
    const rate = normalizeCredits(model.billing?.credits)
    return {
      id: model.id,
      name: model.name,
      enabled: offered.has(model.id),
      ...model.billing?.free === true ? { free: true as const } : {},
      ...model.billing?.badges !== undefined && model.billing.badges.length > 0 ? { badges: model.billing.badges } : {},
      ...rate === undefined ? {} : { credits: rate },
    }
  })
  return { choices, restricted: offered.size < models.length, writable }
}

/**
 * Assemble the card's status document. Sign-in state is read-only; credit is
 * a live billing answer whose failure degrades to `creditsError` rather than
 * failing the whole document, memoized briefly so the card and the composer
 * dock's polling share one upstream call per TTL window.
 */
export async function codeBuddyWebStatus(
  deps: CodeBuddyStatusRouteOptions,
  creditsCache?: { entry?: CreditsCacheEntry },
): Promise<CodeBuddyWebStatus> {
  const authStatus = await deps.store.status()
  if (authStatus.state !== 'signed-in') return { status: 'signed-out' }
  const status: CodeBuddyWebStatus = {
    status: 'signed-in',
    ...authStatus.nickname === undefined ? {} : { nickname: authStatus.nickname },
    ...authStatus.domain === undefined || authStatus.domain === '' ? {} : { domain: authStatus.domain },
    ...authStatus.source === undefined ? {} : { source: authStatus.source },
    ...authStatus.expiresAtMs === undefined ? {} : { expiresAt: authStatus.expiresAtMs },
  }
  // Model billing facts ride the signed-in document so the card can show which
  // models are free or on a promo, without touching the Models picker. The
  // rate is normalized here (not in the card) so both halves agree on one
  // display form; the card additionally localizes it.
  const models = deps.models()
  const modelsField: readonly CodeBuddyWebModelBadge[] = models
    .filter(model => model.billing?.free === true || (model.billing?.badges?.length ?? 0) > 0)
    .map(model => {
      const rate = normalizeCredits(model.billing?.credits)
      return {
        id: model.id,
        name: model.name,
        ...model.billing?.free === true ? { free: true as const } : {},
        ...model.billing?.badges !== undefined && model.billing.badges.length > 0 ? { badges: model.billing.badges } : {},
        ...rate === undefined ? {} : { credits: rate },
      }
    })
  const statusWithModels: CodeBuddyWebStatus = modelsField.length > 0
    ? { ...status, models: modelsField }
    : status
  // The dock's catalog map rides the signed-in document too; an empty catalog
  // omits it rather than shipping two empty objects.
  const catalog = rateMapOf(models)
  const statusWithRates: CodeBuddyWebStatus = catalog === undefined
    ? statusWithModels
    : { ...statusWithModels, catalog }
  // The checkbox list rides the same document, so opening the card needs one
  // round trip for account, credit, and the model selection together.
  const selection = selectionOf(models, deps.enabledModels?.(), deps.settingsWritable?.() ?? false)
  const statusWithCatalog: CodeBuddyWebStatus = selection === undefined
    ? statusWithRates
    : { ...statusWithRates, selection }
  try {
    const credential = await deps.store.current()
    if (credential !== undefined) {
      const cached = creditsCache?.entry
      if (cached !== undefined && Date.now() - cached.at < CREDITS_CACHE_TTL_MS) {
        return { ...statusWithCatalog, credits: cached.credits }
      }
      const credits = await deps.client.fetchCredits(credential)
      if (creditsCache !== undefined) creditsCache.entry = { at: Date.now(), credits }
      return { ...statusWithCatalog, credits }
    }
  } catch (error: unknown) {
    return { ...statusWithCatalog, creditsError: safeMessage(error) }
  }
  return statusWithCatalog
}

/** The status route's request handler, extracted so tests can mount it on a bare server. */
export function codeBuddyStatusHandler(
  deps: CodeBuddyStatusRouteOptions,
  creditsCache?: { entry?: CreditsCacheEntry },
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (req.method !== 'GET') {
      json(res, 405, { error: 'method not allowed' })
      return
    }
    if (!loopbackRequest(req)) {
      json(res, 403, { error: 'request-not-trusted' })
      return
    }
    try {
      json(res, 200, await codeBuddyWebStatus(deps, creditsCache))
    } catch (error: unknown) {
      json(res, 500, { error: safeMessage(error) })
    }
  }
}

/** Read a bounded request body; an over-limit body fails the request. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MODELS_BODY_LIMIT) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/**
 * Parse the write body into a clean allowlist, or undefined when the body is
 * not one.
 *
 * Only ids the catalog currently serves survive: the body is untrusted input,
 * and an id the plugin does not serve could never be offered anyway. Duplicates
 * collapse, and order follows the catalog so the stored document reads the same
 * way the card lists it.
 */
function parseEnabledModels(raw: string, models: readonly CodeBuddyModelInfo[]): readonly string[] | undefined {
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof body !== 'object' || body === null) return undefined
  const field = (body as { enabledModels?: unknown }).enabledModels
  if (!Array.isArray(field)) return undefined
  if (!field.every((id): id is string => typeof id === 'string')) return undefined
  const requested = new Set(field)
  return models.filter(model => requested.has(model.id)).map(model => model.id)
}

/**
 * The enabled-model write handler.
 *
 * A state-changing route, so the loopback gate is stricter than the status
 * GET's: the browser attaches an `Origin` to this POST, and a request without
 * one is refused rather than trusted on Host alone. Content type must be JSON,
 * which drops HTML-form simple requests as well.
 */
export function codeBuddyEnabledModelsHandler(
  deps: CodeBuddyStatusRouteOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (req.method !== 'POST') {
      json(res, 405, { error: 'method not allowed' })
      return
    }
    if (!hostIsLoopback(req.headers.host) || !originIsLoopback(req.headers.origin)) {
      json(res, 403, { error: 'request-not-trusted' })
      return
    }
    if (typeof req.headers.origin !== 'string') {
      json(res, 403, { error: 'origin-required' })
      return
    }
    const type = req.headers['content-type']
    if (typeof type !== 'string' || !type.trim().toLowerCase().startsWith('application/json')) {
      json(res, 415, { error: 'content-type must be application/json' })
      return
    }
    const write = deps.setEnabledModels
    if (write === undefined) {
      json(res, 501, { error: 'settings-not-writable' })
      return
    }
    try {
      const models = deps.models()
      const ids = parseEnabledModels(await readBody(req), models)
      if (ids === undefined) {
        json(res, 400, { error: 'expected {"enabledModels": string[]}' })
        return
      }
      const stored = await write(ids)
      if (!stored) {
        json(res, 501, { error: 'settings-not-writable' })
        return
      }
      // Answer with the resulting selection so the card re-seeds from the Host
      // rather than assuming its own optimistic state landed.
      json(res, 200, { selection: selectionOf(models, ids, true) })
    } catch (error: unknown) {
      json(res, 500, { error: safeMessage(error) })
    }
  }
}

/** Mount the GET status route and the selection write route on an optional webServer context. */
export function registerCodeBuddyStatusRoute(ctx: Context, deps: CodeBuddyStatusRouteOptions): void {
  ctx.effect(() => {
    // One memo per route: the card and the dock both poll this handler, and
    // the cache collapses their overlapping TTL windows into upstream calls.
    const creditsCache: { entry?: CreditsCacheEntry } = {}
    const dispose = ctx.webServer.register({
      kind: 'exact',
      path: CODEBUDDY_STATUS_PATH,
      handler: codeBuddyStatusHandler(deps, creditsCache),
    })
    const disposeModels = ctx.webServer.register({
      kind: 'exact',
      path: CODEBUDDY_MODELS_PATH,
      handler: codeBuddyEnabledModelsHandler(deps),
    })
    return () => {
      dispose()
      disposeModels()
    }
  }, 'dsh-codebuddy-cli: Web status route')
}
