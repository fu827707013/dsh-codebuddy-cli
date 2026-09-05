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
import type { CodeBuddyModelInfo } from './catalog.ts'
import { hostIsLoopback, originIsLoopback } from './loopback.ts'
import { CODEBUDDY_STATUS_PATH } from './status-paths.ts'
import type { CodeBuddyWebCredits, CodeBuddyWebModelBadge, CodeBuddyWebRateMap, CodeBuddyWebStatus } from './status-paths.ts'

export { CODEBUDDY_STATUS_PATH } from './status-paths.ts'
export type { CodeBuddyWebStatus } from './status-paths.ts'

/** Constructor dependencies. */
export interface CodeBuddyStatusRouteOptions {
  store: CodeBuddyCredentialStore
  client: Pick<CodeBuddyUpstreamClient, 'fetchCredits'>
  /** Resolve the current model catalog for free/badge display. */
  models: () => readonly CodeBuddyModelInfo[]
}

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
  const statusWithCatalog: CodeBuddyWebStatus = catalog === undefined
    ? statusWithModels
    : { ...statusWithModels, catalog }
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

/** Mount the GET status route on an optional webServer context. */
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
    return () => {
      dispose()
    }
  }, 'dsh-codebuddy-cli: Web status route')
}
