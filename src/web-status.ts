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
import type { AccountStore, AccountSummary } from './account-store.ts'
import type { CodeBuddyClientIdentity } from './client-identity.ts'
import { normalizeCredits } from './upstream.ts'
import { filterEnabledModels } from './catalog.ts'
import type { CodeBuddyModelInfo } from './catalog.ts'
import { hostIsLoopback, originIsLoopback } from './loopback.ts'
import { generateAccountId } from './oauth.ts'
import {
  CODEBUDDY_CHECKIN_PATH,
  CODEBUDDY_MODELS_PATH,
  CODEBUDDY_STATUS_PATH,
  CODEBUDDY_LOGIN_START_PATH,
  CODEBUDDY_LOGIN_POLL_PATH,
  CODEBUDDY_SWITCH_ACCOUNT_PATH,
  CODEBUDDY_DELETE_ACCOUNT_PATH,
  CODEBUDDY_CREDIT_STATS_PATH,
} from './status-paths.ts'
import type {
  CodeBuddyCheckInOutcome,
  CodeBuddyCheckInRequest,
  CodeBuddyWebAccount,
  CodeBuddyWebCredits,
  CodeBuddyWebModelBadge,
  CodeBuddyWebModelChoice,
  CodeBuddyWebModelSelection,
  CodeBuddyWebRateMap,
  CodeBuddyWebStatus,
  CodeBuddyLoginStartResult,
  CodeBuddyLoginPollResult,
  CodeBuddyCreditStats,
  CodeBuddyWebUsageAccount,
  CodeBuddyWebUsageDaily,
  CodeBuddyWebUsageRow,
} from './status-paths.ts'

export {
  CODEBUDDY_MODELS_PATH,
  CODEBUDDY_STATUS_PATH,
  CODEBUDDY_CHECKIN_PATH,
  CODEBUDDY_LOGIN_START_PATH,
  CODEBUDDY_LOGIN_POLL_PATH,
  CODEBUDDY_SWITCH_ACCOUNT_PATH,
  CODEBUDDY_DELETE_ACCOUNT_PATH,
  CODEBUDDY_CREDIT_STATS_PATH,
} from './status-paths.ts'
export type {
  CodeBuddyWebStatus,
  CodeBuddyCheckInOutcome,
  CodeBuddyLoginStartResult,
  CodeBuddyLoginPollResult,
  CodeBuddyCreditStats,
} from './status-paths.ts'

/** Constructor dependencies. */
export interface CodeBuddyStatusRouteOptions {
  store: CodeBuddyCredentialStore
  client: Pick<CodeBuddyUpstreamClient, 'fetchCredits'>
  /** Official-usage fetch for credit statistics (optional; absent disables the panel). */
  fetchUsage?: (credential: import('./auth.ts').CodeBuddyCredential) => Promise<import('./upstream.ts').CodeBuddyUsageStats>
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
  /**
   * Forward the daily check-in to the upstream. When absent the check-in
   * route answers 501, which the card renders as unavailable.
   */
  checkIn?: (credential: import('./auth.ts').CodeBuddyCredential) => Promise<CodeBuddyCheckInOutcome>
  /** Refresh a specific account credential (targeted check-in with an expired token). */
  refreshToken?: (credential: import('./auth.ts').CodeBuddyCredential) => Promise<import('./upstream.ts').CodeBuddyRefreshOutcome>
  /** Multi-account store; when present, the card shows the account panel. */
  accountStore?: AccountStore
  /** Start an OAuth login, returning an authUrl and state. */
  loginStart?: (identity: CodeBuddyClientIdentity) => Promise<{ authUrl: string; state: string }>
  /** Poll an OAuth login once; returns the account when done, undefined when pending. */
  loginPoll?: (state: string, identity: CodeBuddyClientIdentity) => Promise<import('./oauth.ts').OAuthLoginResult | undefined>
  /** Resolve the current client identity for OAuth headers. */
  resolveIdentity?: () => Promise<CodeBuddyClientIdentity>
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

/** Local calendar date as `YYYY-MM-DD` (used to decide "checked in today"). */
function localDateKey(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Whether a stored check-in record means "already checked in today". */
function checkedInToday(record: AccountSummary['lastCheckIn'], today: string): boolean {
  return record !== undefined
    && record.date === today
    && (record.result === 'ok' || record.result === 'already')
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

/** Convert an AccountSummary to the web-facing shape. */
function toWebAccount(summary: AccountSummary): CodeBuddyWebAccount {
  const account: CodeBuddyWebAccount = {
    id: summary.id,
    uid: summary.uid,
    domain: summary.domain,
    expiresAtMs: summary.expiresAtMs,
    active: summary.active,
  }
  if (summary.nickname !== undefined) account.nickname = summary.nickname
  if (summary.enterpriseId !== undefined) account.enterpriseId = summary.enterpriseId
  return account
}

/**
 * Inject stored accounts into a status document, whether signed-in or
 * signed-out. Each stored account carries its own credit resources (fetched
 * from the upstream, TTL-cached) and a refresh timestamp, so the card's
 * per-account cards render package bars and expiry without a second round
 * trip. When no account store is attached, the field is omitted entirely.
 */
export async function withAccounts(
  deps: CodeBuddyStatusRouteOptions,
  status: CodeBuddyWebStatus,
): Promise<CodeBuddyWebStatus> {
  if (deps.accountStore === undefined) return status
  // The error branch carries no account fields in its shape; only the
  // signed-in / signed-out document kinds carry the optional `accounts`.
  if (status.status === 'error') return status
  try {
    const summaries = await deps.accountStore.summaries()
    const today = localDateKey()
    const accounts = await Promise.all(summaries.map(async (summary) => {
      const account = toWebAccount(summary)
      const accountWithCheckIn: CodeBuddyWebAccount = summary.lastCheckIn === undefined
        ? account
        : { ...account, checkedInToday: checkedInToday(summary.lastCheckIn, today) }
      const credential = await deps.accountStore!.credentialFor(summary.id)
      if (credential === undefined) return accountWithCheckIn
      const cached = accountCreditsCache.get(summary.id)
      if (cached !== undefined && Date.now() - cached.at < ACCOUNT_CREDIT_TTL_MS) {
        return { ...accountWithCheckIn, ...cached.payload }
      }
      const startedAt = Date.now()
      try {
        const credits = await deps.client.fetchCredits(credential)
        const payload = {
          credits,
          creditUpdatedAtMs: startedAt,
        }
        accountCreditsCache.set(summary.id, { at: startedAt, payload })
        return { ...accountWithCheckIn, ...payload }
      } catch (error: unknown) {
        const payload = { creditError: safeMessage(error) }
        accountCreditsCache.set(summary.id, { at: startedAt, payload })
        return { ...accountWithCheckIn, ...payload }
      }
    }))
    if (status.status === 'signed-in') return { ...status, accounts }
    return { status: 'signed-out', accounts }
  } catch {
    return status
  }
}

/** Per-account credit answers, so concurrent polls share one upstream call. */
const accountCreditsCache = new Map<string, { at: number; payload: Record<string, unknown> }>()
/** TTL for per-account credit answers within one process. */
const ACCOUNT_CREDIT_TTL_MS = 30_000

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
      const status = await codeBuddyWebStatus(deps, creditsCache)
      json(res, 200, await withAccounts(deps, status))
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

/** Parse the check-in body `{id?}`; undefined when the JSON is malformed or not an object. */
async function parseCheckInBody(req: IncomingMessage): Promise<CodeBuddyCheckInRequest | undefined> {
  let body: string
  try {
    body = await readBody(req)
  } catch {
    return undefined
  }
  if (body.trim() === '') return {}
  try {
    const candidate: unknown = JSON.parse(body)
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return undefined
    return candidate as CodeBuddyCheckInRequest
  } catch {
    return undefined
  }
}

/** Refresh a targeted account credential when its token is near/over expiry. */
async function refreshIfNeeded(
  deps: CodeBuddyStatusRouteOptions,
  credential: import('./auth.ts').CodeBuddyCredential,
): Promise<import('./auth.ts').CodeBuddyCredential> {
  const margin = 5 * 60 * 1000
  if (deps.refreshToken === undefined || credential.expiresAtMs > Date.now() + margin) return credential
  const outcome = await deps.refreshToken(credential)
  const refreshed: import('./auth.ts').CodeBuddyCredential = {
    ...credential,
    accessToken: outcome.accessToken,
    ...outcome.refreshToken === undefined ? {} : { refreshToken: outcome.refreshToken },
    expiresAtMs: outcome.expiresInSec !== undefined
      ? Date.now() + outcome.expiresInSec * 1000
      : credential.expiresAtMs,
    ...outcome.domain === undefined || outcome.domain === '' ? {} : { domain: outcome.domain },
  }
  // Persist the refreshed token back into the account slot.
  if (credential.uid !== '' && deps.accountStore !== undefined) {
    const doc = await deps.accountStore.read()
    const id = Object.keys(doc.accounts).find(key => doc.accounts[key]?.uid === credential.uid)
    if (id !== undefined) {
      await deps.accountStore.updateTokens(id, {
        accessToken: refreshed.accessToken,
        ...outcome.refreshToken !== undefined ? { refreshToken: outcome.refreshToken } : {},
        expiresAtMs: refreshed.expiresAtMs,
        ...refreshed.refreshExpiresAtMs !== undefined ? { refreshExpiresAtMs: refreshed.refreshExpiresAtMs } : {},
        ...outcome.domain === undefined || outcome.domain === '' ? {} : { domain: outcome.domain },
      })
    }
  }
  return refreshed
}

/** The currently active account id, or undefined when none is stored/active. */
async function activeAccountId(deps: CodeBuddyStatusRouteOptions): Promise<string | undefined> {
  if (deps.accountStore === undefined) return undefined
  const doc = await deps.accountStore.read()
  return doc.activeId !== undefined && doc.accounts[doc.activeId] !== undefined ? doc.activeId : undefined
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

/**
 * The daily check-in write handler.
 *
 * Same strict gate as the enabled-model write: POST only, loopback Host and a
 * mandatory loopback `Origin`, JSON content type. The upstream answer is a
 * plain outcome document, so the card never sees upstream error text without
 * a status classification. A missing executor answers 501 instead of failing.
 */
export function codeBuddyCheckInHandler(
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
    if (deps.checkIn === undefined) {
      json(res, 501, { error: 'check-in-unavailable' })
      return
    }
    try {
      // An optional `{id}` body targets a specific stored account; otherwise the
      // check-in rides the resolved (active) credential. A malformed body is a
      // client error, not a silent fallback to the active account.
      const parsed = await parseCheckInBody(req)
      if (parsed === undefined) {
        json(res, 400, { error: 'expected {"id"?: string}' })
        return
      }
      const targetId = typeof parsed.id === 'string' && parsed.id !== '' ? parsed.id : undefined
      let credential: import('./auth.ts').CodeBuddyCredential
      if (targetId !== undefined && deps.accountStore !== undefined) {
        const target = await deps.accountStore.credentialFor(targetId)
        if (target === undefined) {
          json(res, 404, { error: 'account-not-found' })
          return
        }
        // The active path (`resolve()`) refreshes on demand; a targeted account
        // does not, so refresh here when the stored token is about to expire.
        credential = await refreshIfNeeded(deps, target)
      } else {
        credential = await deps.store.resolve()
      }
      const outcome = await deps.checkIn(credential)
      // Record the result for the toast and the checked-in badge, for both the
      // targeted and the active path.
      const recordId = targetId ?? (await activeAccountId(deps))
      if (recordId !== undefined) {
        await deps.accountStore?.recordCheckIn(recordId, localDateKey(), outcome.status)
      }
      json(res, 200, outcome)
    } catch (error: unknown) {
      json(res, 500, { error: safeMessage(error) })
    }
  }
}

/** Mount the GET status route, the selection write route, the daily check-in route, and the account management routes. */
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
    const disposeCheckIn = ctx.webServer.register({
      kind: 'exact',
      path: CODEBUDDY_CHECKIN_PATH,
      handler: codeBuddyCheckInHandler(deps),
    })
    const disposeLoginStart = ctx.webServer.register({
      kind: 'exact',
      path: CODEBUDDY_LOGIN_START_PATH,
      handler: codeBuddyLoginStartHandler(deps),
    })
    const disposeLoginPoll = ctx.webServer.register({
      kind: 'exact',
      path: CODEBUDDY_LOGIN_POLL_PATH,
      handler: codeBuddyLoginPollHandler(deps),
    })
    const disposeSwitch = ctx.webServer.register({
      kind: 'exact',
      path: CODEBUDDY_SWITCH_ACCOUNT_PATH,
      handler: codeBuddySwitchAccountHandler(deps),
    })
    const disposeDelete = ctx.webServer.register({
      kind: 'exact',
      path: CODEBUDDY_DELETE_ACCOUNT_PATH,
      handler: codeBuddyDeleteAccountHandler(deps),
    })
    const disposeCreditStats = ctx.webServer.register({
      kind: 'exact',
      path: CODEBUDDY_CREDIT_STATS_PATH,
      handler: codeBuddyCreditStatsHandler(deps),
    })
    return () => {
      dispose()
      disposeModels()
      disposeCheckIn()
      disposeLoginStart()
      disposeLoginPoll()
      disposeSwitch()
      disposeDelete()
      disposeCreditStats()
    }
  }, 'dsh-codebuddy-cli: Web status route')
}

/** Check loopback Host + Origin + JSON content type for a mutating POST. */
function checkLoopbackPost(req: IncomingMessage, res: ServerResponse): boolean {
  if (!hostIsLoopback(req.headers.host) || !originIsLoopback(req.headers.origin)) {
    json(res, 403, { error: 'request-not-trusted' })
    return false
  }
  if (typeof req.headers.origin !== 'string') {
    json(res, 403, { error: 'origin-required' })
    return false
  }
  const type = req.headers['content-type']
  if (typeof type !== 'string' || !type.trim().toLowerCase().startsWith('application/json')) {
    json(res, 415, { error: 'content-type must be application/json' })
    return false
  }
  return true
}

/**
 * The login-start handler. POSTs to the upstream state endpoint and returns
 * the authUrl + state. The card opens the authUrl in a new tab and then polls
 * the poll endpoint.
 */
export function codeBuddyLoginStartHandler(
  deps: CodeBuddyStatusRouteOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (req.method !== 'POST') {
      json(res, 405, { error: 'method not allowed' })
      return
    }
    if (!checkLoopbackPost(req, res)) return
    if (deps.loginStart === undefined || deps.resolveIdentity === undefined) {
      json(res, 501, { error: 'login-unavailable' })
      return
    }
    try {
      const identity = await deps.resolveIdentity()
      const { authUrl, state } = await deps.loginStart(identity)
      json(res, 200, { ok: true, authUrl, state } satisfies CodeBuddyLoginStartResult)
    } catch (error: unknown) {
      json(res, 200, { ok: false, error: safeMessage(error) } satisfies CodeBuddyLoginStartResult)
    }
  }
}

/**
 * The login-poll handler. Polls the upstream token endpoint once; on success
 * stores the account and returns it. The card polls this every few seconds.
 */
export function codeBuddyLoginPollHandler(
  deps: CodeBuddyStatusRouteOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (req.method !== 'POST') {
      json(res, 405, { error: 'method not allowed' })
      return
    }
    if (!checkLoopbackPost(req, res)) return
    if (deps.loginPoll === undefined || deps.resolveIdentity === undefined || deps.accountStore === undefined) {
      json(res, 501, { error: 'login-unavailable' })
      return
    }
    try {
      const body = await readBody(req)
      let parsed: { state?: unknown }
      try {
        parsed = JSON.parse(body)
      } catch {
        json(res, 400, { error: 'expected {"state": string}' })
        return
      }
      const state = typeof parsed.state === 'string' ? parsed.state : ''
      if (state === '') {
        json(res, 400, { error: 'expected {"state": string}' })
        return
      }
      const identity = await deps.resolveIdentity()
      const result = await deps.loginPoll(state, identity)
      if (result === undefined) {
        json(res, 200, { done: false } satisfies CodeBuddyLoginPollResult)
        return
      }
      // Store the new account and set it active.
      const id = generateAccountId()
      const stored = await deps.accountStore.add({
        id,
        uid: result.uid,
        ...result.nickname !== undefined ? { nickname: result.nickname } : {},
        domain: result.domain,
        ...result.enterpriseId !== undefined ? { enterpriseId: result.enterpriseId } : {},
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAtMs: result.expiresAtMs,
        ...result.refreshExpiresAtMs !== undefined ? { refreshExpiresAtMs: result.refreshExpiresAtMs } : {},
      })
      await deps.accountStore.setActive(id)
      json(res, 200, {
        done: true,
        account: toWebAccount({ ...stored, active: true }),
      } satisfies CodeBuddyLoginPollResult)
    } catch (error: unknown) {
      json(res, 200, { done: true, error: safeMessage(error) } satisfies CodeBuddyLoginPollResult)
    }
  }
}

/**
 * The switch-account handler. Sets the active account by id.
 */
export function codeBuddySwitchAccountHandler(
  deps: CodeBuddyStatusRouteOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (req.method !== 'POST') {
      json(res, 405, { error: 'method not allowed' })
      return
    }
    if (!checkLoopbackPost(req, res)) return
    if (deps.accountStore === undefined) {
      json(res, 501, { error: 'accounts-unavailable' })
      return
    }
    try {
      const body = await readBody(req)
      let parsed: { id?: unknown }
      try {
        parsed = JSON.parse(body)
      } catch {
        json(res, 400, { error: 'expected {"id": string}' })
        return
      }
      const id = typeof parsed.id === 'string' ? parsed.id : ''
      if (id === '') {
        json(res, 400, { error: 'expected {"id": string}' })
        return
      }
      const ok = await deps.accountStore.setActive(id)
      if (!ok) {
        json(res, 404, { error: 'account not found' })
        return
      }
      json(res, 200, { ok: true })
    } catch (error: unknown) {
      json(res, 500, { error: safeMessage(error) })
    }
  }
}

/**
 * The delete-account handler. Removes an account by id.
 */
export function codeBuddyDeleteAccountHandler(
  deps: CodeBuddyStatusRouteOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (req.method !== 'POST') {
      json(res, 405, { error: 'method not allowed' })
      return
    }
    if (!checkLoopbackPost(req, res)) return
    if (deps.accountStore === undefined) {
      json(res, 501, { error: 'accounts-unavailable' })
      return
    }
    try {
      const body = await readBody(req)
      let parsed: { id?: unknown }
      try {
        parsed = JSON.parse(body)
      } catch {
        json(res, 400, { error: 'expected {"id": string}' })
        return
      }
      const id = typeof parsed.id === 'string' ? parsed.id : ''
      if (id === '') {
        json(res, 400, { error: 'expected {"id": string}' })
        return
      }
      const ok = await deps.accountStore.remove(id)
      if (!ok) {
        json(res, 404, { error: 'account not found' })
        return
      }
      json(res, 200, { ok: true })
    } catch (error: unknown) {
      json(res, 500, { error: safeMessage(error) })
    }
  }
}

/** Per-account usage answers, so repeated panel visits share one fetch. */
const usageCache = new Map<string, { at: number; stats: import('./upstream.ts').CodeBuddyUsageStats }>()
/** TTL for per-account usage answers within one process. */
const USAGE_CACHE_TTL_MS = 5 * 60 * 1000

/**
 * Build the aggregated credit-statistics document by fetching each stored
 * account's official usage (cached per account) and merging the results.
 */
async function buildCreditStats(deps: CodeBuddyStatusRouteOptions): Promise<CodeBuddyCreditStats> {
  if (deps.accountStore === undefined) {
    throw new Error('account store unavailable')
  }
  if (deps.fetchUsage === undefined) {
    throw new Error('official-usage fetch unavailable')
  }
  const fetchUsage = deps.fetchUsage
  const accountList = await deps.accountStore.summaries()
  const collectedAt = Date.now()
  const accountStats: CodeBuddyWebUsageAccount[] = []
  const dailyMap = new Map<string, CodeBuddyWebUsageDaily>()
  const modelMap = new Map<string, { requestCount: number; credit: number }>()
  let allRequests: { ts: number; row: CodeBuddyWebUsageRow }[] = []
  let successCount = 0
  let today = 0
  let week = 0
  let month = 0
  const monthPrefix = new Date().getFullYear().toString() + '-' + (new Date().getMonth() + 1).toString().padStart(2, '0')

  await Promise.all(accountList.map(async (account) => {
    const credential = await deps.accountStore!.credentialFor(account.id)
    if (credential === undefined) return
    const cacheHit = usageCache.get(account.id)
    let stats: import('./upstream.ts').CodeBuddyUsageStats
    if (cacheHit !== undefined && Date.now() - cacheHit.at < USAGE_CACHE_TTL_MS) {
      stats = cacheHit.stats
    } else {
      try {
        stats = await fetchUsage(credential)
        usageCache.set(account.id, { at: Date.now(), stats })
      } catch (error: unknown) {
        accountStats.push({
          accountId: account.id,
          accountName: account.nickname ?? account.uid ?? account.id,
          ok: false,
          usageToday: null,
          usage7Days: null,
          usageThisMonth: null,
          error: safeMessage(error),
        })
        return
      }
    }
    if (stats.status === 'unavailable') {
      accountStats.push({
        accountId: account.id,
        accountName: account.nickname ?? account.uid ?? account.id,
        ok: false,
        usageToday: null,
        usage7Days: null,
        usageThisMonth: null,
      })
      return
    }
    successCount += 1
    accountStats.push({
      accountId: account.id,
      accountName: account.nickname ?? account.uid ?? account.id,
      ok: true,
      usageToday: stats.summary.usageToday,
      usage7Days: stats.summary.usage7Days,
      usageThisMonth: stats.summary.usageThisMonth,
      daily: stats.daily,
      models: stats.models,
    })
    today += stats.summary.usageToday
    week += stats.summary.usage7Days
    month += stats.summary.usageThisMonth
    for (const daily of stats.daily) {
      const existing = dailyMap.get(daily.date) ?? { date: daily.date, usage: 0 }
      existing.usage += daily.usage
      if (daily.models !== undefined) {
        const models = existing.models === undefined ? [] : [...existing.models]
        for (const model of daily.models) {
          const idx = models.findIndex(m => m.model === model.model)
          const current = idx !== -1 ? models[idx] : undefined
          if (current !== undefined) {
            models[idx] = {
              ...current,
              requestCount: current.requestCount + model.requestCount,
              credit: current.credit + model.credit,
            }
          } else {
            models.push({ ...model })
          }
        }
        existing.models = models
      }
      dailyMap.set(daily.date, existing)
    }
    for (const model of stats.models) {
      const existing = modelMap.get(model.model) ?? { requestCount: 0, credit: 0 }
      existing.requestCount += model.requestCount
      existing.credit += model.credit
      modelMap.set(model.model, existing)
    }
    allRequests.push(...stats.requests.map((row, index) => ({
      ts: row.ts - index / 1e6,
      row: {
        requestId: row.requestId,
        model: row.model,
        client: row.client,
        credit: row.credit,
        requestTime: row.requestTime,
        date: row.date,
        accountId: account.id,
        accountName: account.nickname ?? account.uid ?? account.id,
      },
    })))
  }))

  const status: CodeBuddyCreditStats['status'] = accountList.length === 0
    ? 'unavailable'
    : successCount === accountList.length
      ? 'complete'
      : successCount > 0
        ? 'partial'
        : 'unavailable'
  const daily = [...dailyMap.values()]
    .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
  const sortedRequests = allRequests.sort((a, b) => b.ts - a.ts).map(entry => entry.row)
  const detailLimit = 100
  return {
    status,
    rangeStart: daily.length > 0 ? daily[0]!.date : '',
    rangeEnd: daily.length > 0 ? daily[daily.length - 1]!.date : '',
    collectedAt,
    summary: { usageToday: today, usage7Days: week, usageThisMonth: month },
    daily,
    models: [...modelMap.entries()]
      .map(([model, { requestCount, credit }]) => ({ model, requestCount, credit }))
      .sort((a, b) => b.credit - a.credit || b.requestCount - a.requestCount || a.model.localeCompare(b.model)),
    requests: sortedRequests.slice(0, detailLimit),
    accounts: accountStats,
    detailLimit,
  }
}

/**
 * The credit-statistics handler. GET returns the cached-or-fresh aggregated
 * statistics; POST with `{refresh: true}` forces a re-fetch of every account's
 * official usage. The panel uses this to show today / 7-day / month totals,
 * a daily trend chart, per-model breakdown and the recent request list.
 */
export function codeBuddyCreditStatsHandler(
  deps: CodeBuddyStatusRouteOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (!loopbackRequest(req)) {
      json(res, 403, { error: 'request-not-trusted' })
      return
    }
    let refresh = false
    if (req.method === 'POST') {
      if (!checkLoopbackPost(req, res)) return
      try {
        const body = await readBody(req)
        const parsed: unknown = JSON.parse(body)
        refresh = (parsed as { refresh?: unknown } | null | undefined)?.refresh === true
      } catch {
        json(res, 400, { error: 'expected {"refresh": boolean}' })
        return
      }
    } else if (req.method !== 'GET') {
      json(res, 405, { error: 'method not allowed' })
      return
    }
    try {
      if (refresh) usageCache.clear()
      const stats = await buildCreditStats(deps)
      json(res, 200, stats satisfies CodeBuddyCreditStats)
    } catch (error: unknown) {
      json(res, 500, { error: safeMessage(error) })
    }
  }
}
