/**
 * CodeBuddy (CodeBuddy / copilot.tencent.com) upstream client: chat streaming,
 * token refresh, model catalog, and credit balance. The wire behavior is
 * ported from Sliverkiss/codebuddy2api (MIT), whose Go implementation is
 * battle-tested against the real endpoint.
 *
 * @module dsh-codebuddy-cli/upstream
 */

import type { CodeBuddyCredential } from './auth.ts'
import type { CodeBuddyClientIdentity } from './client-identity.ts'
import type { CodeBuddyCheckInOutcome } from './status-paths.ts'
import {
  clientIdentityHeaders,
  CODEBUDDY_IDE_NAME,
  CODEBUDDY_IDE_TYPE,
  CODEBUDDY_UNKNOWN_VERSION,
  resolveClientIdentity,
} from './client-identity.ts'

export type { CodeBuddyCheckInOutcome } from './status-paths.ts'

/** CodeBuddy region selected by the credential's login domain. */
export type CodeBuddyRegion = 'cn' | 'global'

/** Upstream failure classes the shim maps onto distinct HTTP answers. */
export type UpstreamErrorKind =
  | 'hard_credit'
  | 'soft_rate'
  | 'session_dead'
  | 'not_found'
  | 'server'
  | 'client'

/** One CLI-usable model as the upstream catalog describes it. */
export interface CodeBuddyUpstreamModel {
  id: string
  name: string
  contextWindow: number
  maxTokens: number
  /**
   * Upstream-declared image input capability. Missing or false upstream data
   * resolves to false, so an unknown model stays text-only: over-claiming
   * admits an image the provider then rejects after the message is durable.
   */
  supportsImages: boolean
  /**
   * Reasoning metadata the upstream catalog declares per model. The wire
   * effort values (`low`, `medium`, `high`, `xhigh`, `max`) map directly onto
   * pi-ai's thinking levels, and the supported set decides which levels the
   * DSH model selector offers.
   */
  reasoning?: CodeBuddyModelReasoning
  /**
   * Billing convenience metadata: the credits multiplier string the upstream
   * reports (e.g. `"x0.00"` for free) and promotional badges like
   * `badge:限时免费:#FF0000` or `badge:夜间折扣:#1E90FF`.
   *
   * The multiplier reaches the browser through the host LLM seam, which has no
   * locale service, so {@link normalizeCredits} trims it to a
   * language-neutral display form (`x0.79`) that reads the same in every UI
   * language. The raw upstream string (which may spell `x0.79 credits`) stays
   * on {@link CodeBuddyModelBilling.credits} for diagnostics.
   */
  billing?: CodeBuddyModelBilling
}

/** Reasoning metadata the upstream catalog declares for one model. */
export interface CodeBuddyModelReasoning {
  /** Whether the model does any reasoning at all (upstream `supportsReasoning`). */
  supports: boolean
  /** Whether the model can only think (upstream `onlyReasoning`). */
  onlyReasoning: boolean
  /** Selectable effort values; absent means the model has no explicit set. */
  supportedEfforts?: readonly CodeBuddyEffort[]
  /** Default effort the upstream uses when none is chosen. */
  defaultEffort?: CodeBuddyEffort
  /** Whether thinking can be switched off; false means it is always on. */
  canDisableThinking: boolean
}

/** The concrete effort spellings CodeBuddy exposes on the wire. */
export type CodeBuddyEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Billing convenience metadata reported for one model. */
export interface CodeBuddyModelBilling {
  /** Credits multiplier, e.g. `"x0.00"` (free) or `"x0.79"`. */
  credits?: string
  /** Promotional tags, e.g. `"限时免费"`, `"夜间折扣"`. */
  badges?: readonly string[]
  /** Whether the model is currently free (`x0.00` credits). */
  free: boolean
}

/** One billing package and its remaining credit (a full resource package). */
export interface CodeBuddyCreditAccount {
  /** Package code as the upstream reports it (may be absent). */
  packageCode?: string
  packageName: string
  /** Total capacity of this package. */
  total: number
  /** Remaining capacity of this package. */
  remain: number
  /** Used capacity of this package. */
  used: number
  /** Backward-compatible alias for the total (the older card's `size`). */
  size: number
  /** Expiry as epoch milliseconds; absent means no known expiry (long-lived). */
  expireAtMs?: number
  /** Whether the package has already expired. */
  expired: boolean
  /** Whether the package expires within the soon window (7 days). */
  expiringSoon: boolean
}

/** Aggregated credit answer for one credential. */
export interface CodeBuddyCredits {
  total: number
  accounts: readonly CodeBuddyCreditAccount[]
}

/** One official usage row (a single billing request). */
export interface CodeBuddyUsageRow {
  requestId: string
  model: string
  client: string
  credit: number
  /** Local display of the request time (upstream format preserved). */
  requestTime: string
  /** Epoch milliseconds of the request, for sorting. */
  ts: number
  /** Local date key `YYYY-MM-DD`. */
  date: string
}

/** Daily usage aggregation, optionally broken down by model. */
export interface CodeBuddyUsageDaily {
  /** Local date key `YYYY-MM-DD`. */
  date: string
  /** Total credits consumed that day. */
  usage: number
  /** Per-model breakdown for that day, when the upstream row carries a model. */
  models?: { model: string; requestCount: number; credit: number }[]
}

/** Aggregate usage stats for one credential over a 31-day window. */
export interface CodeBuddyUsageStats {
  /** `complete` when the window was fetched in full; `partial` / `unavailable` degrade. */
  status: 'complete' | 'partial' | 'unavailable'
  /** Inclusive window start date `YYYY-MM-DD`. */
  rangeStart: string
  /** Inclusive window end date `YYYY-MM-DD`. */
  rangeEnd: string
  /** When the window was collected (epoch ms). */
  collectedAt: number
  summary: {
    usageToday: number
    usage7Days: number
    usageThisMonth: number
  }
  /** One entry per day in the window (zero-filled). */
  daily: readonly CodeBuddyUsageDaily[]
  /** Per-model aggregation across the whole window. */
  models: readonly { model: string; requestCount: number; credit: number }[]
  /** Most recent requests, newest first. */
  requests: readonly CodeBuddyUsageRow[]
  /** Max per-account detail rows kept in `requests`. */
  detailLimit: number
}

/** Token refresh answer; fields the upstream omits stay absent. */
export interface CodeBuddyRefreshOutcome {
  accessToken: string
  refreshToken?: string
  expiresInSec?: number
  domain?: string
}

/** Chat answer: either a live SSE response or a classified failure. */
export type CodeBuddyChatResult =
  | { ok: true; response: Response }
  | { ok: false; status: number; kind: UpstreamErrorKind; message: string }

const CN_CHAT_BASE = 'https://copilot.tencent.com'
const CN_BILLING_BASE = 'https://www.codebuddy.cn'
const GLOBAL_BASE = 'https://www.workbuddy.ai'

const JSON_TIMEOUT_MS = 30_000
const ERROR_BODY_LIMIT = 4096

/**
 * Client identity carried on every upstream request.
 *
 * The backend attributes a request to a client only when the `X-IDE-*` family
 * is present; without it the request shows up as an unattributed client. The
 * identity is cached after the first successful resolution because reading the
 * installed CLI's version touches the filesystem and the value is stable for
 * the lifetime of the process.
 */
let cachedIdentity: CodeBuddyClientIdentity | undefined

/**
 * Identity resolution in flight, so concurrent first requests share one
 * filesystem probe instead of racing to read the same file.
 */
let pendingIdentity: Promise<CodeBuddyClientIdentity> | undefined

/** Identity used before (or instead of) a successful filesystem resolution. */
const FALLBACK_IDENTITY: CodeBuddyClientIdentity = {
  ideType: CODEBUDDY_IDE_TYPE,
  ideName: CODEBUDDY_IDE_NAME,
  ideVersion: CODEBUDDY_UNKNOWN_VERSION,
  productVersion: CODEBUDDY_UNKNOWN_VERSION,
}

/**
 * Resolve and cache the CLI client identity, tolerating any failure: identity
 * metadata must never be able to break a chat request.
 *
 * @param packageJsonPath - optional explicit CLI `package.json` path.
 * @returns the resolved identity.
 */
export async function ensureClientIdentity(packageJsonPath?: string): Promise<CodeBuddyClientIdentity> {
  return await startClientIdentityResolution(packageJsonPath)
}

/**
 * Drop the cached identity. Exposed for tests, which must be able to exercise
 * the resolved and unresolved paths independently within one process.
 */
export function resetClientIdentity(): void {
  cachedIdentity = undefined
  pendingIdentity = undefined
}

/**
 * Identity for the next request, starting resolution if it has not run yet.
 *
 * Request headers are built synchronously while version resolution is async,
 * so the first request cannot wait for the real version. Rather than send a
 * versionless request and rely on the caller to have warmed the cache, this
 * kicks off resolution on first use: `startClientIdentityResolution` is called
 * from the client constructor, and the version headers appear as soon as the
 * probe settles.
 */
export function startClientIdentityResolution(packageJsonPath?: string): Promise<CodeBuddyClientIdentity> {
  if (cachedIdentity !== undefined) return Promise.resolve(cachedIdentity)
  pendingIdentity ??= (async () => {
    try {
      cachedIdentity = await resolveClientIdentity(packageJsonPath)
    } catch {
      cachedIdentity = FALLBACK_IDENTITY
    }
    return cachedIdentity
  })()
  return pendingIdentity
}

/** Identity headers for the current request, resolving identity on first use. */
function identityHeaders(): Record<string, string> {
  return clientIdentityHeaders(cachedIdentity ?? FALLBACK_IDENTITY)
}

/** Daily check-in endpoint on the CN side. */
const CN_CHECKIN_PATH = '/v2/billing/meter/daily-checkin'

/** Upstream messages that mean "already checked in today". */
const CHECKIN_ALREADY_MARKERS: readonly string[] = [
  'already', 'checked in today', 'already signed', 'already checked',
  '已签到', '已签', '今日已', '签过',
]

/** Insufficient-credit markers, ASCII lowercase plus the original Chinese. */
const HARD_CREDIT_MARKERS: readonly string[] = [
  'insufficient credit', 'no credit', 'credit exhausted', 'out of credit',
  'quota exceeded', 'quota exhaust', 'payment required', 'credit not enough',
  'not enough credit',
  '积分不足', '额度不足', '余额不足', '积分用完', '额度用尽', '没有积分',
]

/** The concrete effort spellings CodeBuddy exposes on the wire. */
const EFFORT_VALUES: readonly CodeBuddyEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']

/** Promotional badge keys the upstream tags carry, minus their color suffix. */
const BADGE_PREFIX = 'badge:'

/** Parse the upstream `reasoning` object into {@link CodeBuddyModelReasoning}. */
function resolveUpstreamReasoning(wrapped: Record<string, unknown>): { reasoning: CodeBuddyModelReasoning } {
  const supports = wrapped['supportsReasoning'] === true
  const onlyReasoning = wrapped['onlyReasoning'] === true
  const rawReasoning = wrapped['reasoning']
  let supportedEfforts: CodeBuddyEffort[] | undefined
  let defaultEffort: CodeBuddyEffort | undefined
  let canDisableThinking = true
  if (typeof rawReasoning === 'object' && rawReasoning !== null && !Array.isArray(rawReasoning)) {
    const reasoning = rawReasoning as Record<string, unknown>
    const rawEfforts = reasoning['supportedEfforts']
    if (Array.isArray(rawEfforts)) {
      const efforts = rawEfforts.filter((value): value is CodeBuddyEffort =>
        typeof value === 'string' && (EFFORT_VALUES as readonly string[]).includes(value))
      if (efforts.length > 0) supportedEfforts = efforts
    }
    if (typeof reasoning['defaultEffort'] === 'string'
      && (EFFORT_VALUES as readonly string[]).includes(reasoning['defaultEffort'] as string)) {
      defaultEffort = reasoning['defaultEffort'] as CodeBuddyEffort
    } else if (typeof reasoning['effort'] === 'string'
      && (EFFORT_VALUES as readonly string[]).includes(reasoning['effort'] as string)) {
      defaultEffort = reasoning['effort'] as CodeBuddyEffort
    }
    // Only an explicit `canDisableThinking: true` offers "thinking off"; older
    // rows omit the field and several of them reject `off` on the wire, so the
    // conservative default is "cannot be disabled".
    canDisableThinking = reasoning['canDisableThinking'] === true
  }
  return {
    reasoning: {
      supports,
      onlyReasoning,
      ...supportedEfforts === undefined ? {} : { supportedEfforts },
      ...defaultEffort === undefined ? {} : { defaultEffort },
      canDisableThinking,
    },
  }
}

/**
 * Reduce an upstream credits string to its language-neutral display form.
 *
 * The host LLM seam carries this text to the browser, and the host has no
 * locale service — whatever string is produced here is shown verbatim in every
 * UI language. The upstream is inconsistent in a way that matters: some catalog
 * rows report a bare multiplier (`x0.79`) and others append a unit word
 * (`x0.79 credits`), and the unit word would pin the display to English.
 * Dropping a trailing `credits` (case-insensitive, singular or plural) yields
 * the one spelling that reads identically in every language.
 *
 * @param credits - raw upstream credits string, e.g. `"x0.79 credits"`.
 * @returns the bare multiplier, or undefined when nothing displayable remains.
 */
export function normalizeCredits(credits: string | undefined): string | undefined {
  if (credits === undefined) return undefined
  const trimmed = credits.trim()
  if (trimmed === '') return undefined
  // A string that is only the unit word (`credits`) carries no multiplier.
  if (/^credits?$/iu.test(trimmed)) return undefined
  const bare = trimmed.replace(/\s+credits?$/iu, '').trim()
  return bare === '' ? undefined : bare
}

/**
 * Parse a usage row's request time into a local date key and epoch ms.
 * Accepts numeric epoch (seconds or ms) and common `YYYY-MM-DD HH:MM:SS`
 * spellings. Returns undefined when the value is unusable.
 */
function parseUsageTime(value: unknown, now: Date): { date: Date; ts: number } | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value
    const date = new Date(ms)
    if (Number.isNaN(date.getTime())) return undefined
    return { date, ts: ms }
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const text = value.trim()
    const numeric = Number(text)
    if (Number.isFinite(numeric)) {
      const ms = numeric < 1e12 ? numeric * 1000 : numeric
      const date = new Date(ms)
      if (Number.isNaN(date.getTime())) return undefined
      return { date, ts: ms }
    }
    // Accept `YYYY-MM-DD HH:MM:SS` and `YYYY-MM-DD` (both interpreted as local).
    const withTime = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/u.exec(text)
    if (withTime !== null) {
      const date = new Date(
        Number(withTime[1]), Number(withTime[2]) - 1, Number(withTime[3]),
        Number(withTime[4]), Number(withTime[5]), Number(withTime[6] ?? 0),
      )
      if (Number.isNaN(date.getTime())) return undefined
      return { date, ts: date.getTime() }
    }
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text)
    if (dateOnly !== null) {
      const date = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12, 0, 0)
      if (Number.isNaN(date.getTime())) return undefined
      return { date, ts: date.getTime() }
    }
  }
  void now
  return undefined
}

/** Whole days from `fromKey` to `toKey` (positive when to is later). */
function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  const from = Date.UTC(fy!, (fm ?? 1) - 1, fd ?? 1)
  const to = Date.UTC(ty!, (tm ?? 1) - 1, td ?? 1)
  return Math.round((to - from) / 86_400_000)
}

/** Parse the upstream `tags` / `credits` fields into billing metadata. */
function resolveUpstreamBilling(wrapped: Record<string, unknown>): { billing: CodeBuddyModelBilling } {
  const rawCredits = wrapped['credits']
  const credits = typeof rawCredits === 'string' && rawCredits.trim() !== '' ? rawCredits.trim() : undefined
  const badges: string[] = []
  const rawTags = wrapped['tags']
  if (Array.isArray(rawTags)) {
    for (const tag of rawTags) {
      if (typeof tag !== 'string') continue
      const lowered = tag.toLowerCase()
      if (!lowered.startsWith(BADGE_PREFIX)) continue
      const label = tag.slice(BADGE_PREFIX.length).split(':')[0] ?? tag.slice(BADGE_PREFIX.length)
      if (label !== '') badges.push(label)
    }
  }
  // A `x0.00` multiplier means the model is currently free.
  const free = credits !== undefined && /^x?0\.0+$/u.test(credits)
  return {
    billing: {
      ...credits === undefined ? {} : { credits },
      ...badges.length === 0 ? {} : { badges },
      free,
    },
  }
}

/** Session-invalidation markers that mean "sign in again in the CodeBuddy app". */
const SESSION_DEAD_MARKERS: readonly string[] = ['Offline user session not found', '12153']

/** Classify an upstream failure from its HTTP status and body excerpt. */
export function classifyUpstreamError(status: number, body: string): UpstreamErrorKind {
  if (status === 402) return 'hard_credit'
  const lower = body.toLowerCase()
  for (const marker of HARD_CREDIT_MARKERS) {
    if (lower.includes(marker.toLowerCase()) || body.includes(marker)) return 'hard_credit'
  }
  for (const marker of SESSION_DEAD_MARKERS) {
    if (body.includes(marker)) return 'session_dead'
  }
  if (status === 429) return 'soft_rate'
  if (status === 404) return 'not_found'
  if (status >= 500) return 'server'
  if (status >= 400) return 'client'
  return 'client'
}

/** Region for a login domain; an empty domain means CN (matching upstream tooling). */
export function regionOf(domain: string): CodeBuddyRegion {
  const lowered = domain.trim().toLowerCase()
  if (lowered === 'workbuddy.ai' || lowered.endsWith('.workbuddy.ai')) return 'global'
  return 'cn'
}

function chatBase(credential: CodeBuddyCredential): string {
  return regionOf(credential.domain) === 'global' ? GLOBAL_BASE : CN_CHAT_BASE
}

function billingBase(credential: CodeBuddyCredential): string {
  return regionOf(credential.domain) === 'global' ? GLOBAL_BASE : CN_BILLING_BASE
}

function originReferer(credential: CodeBuddyCredential): string {
  return regionOf(credential.domain) === 'global' ? GLOBAL_BASE : CN_BILLING_BASE
}

/** Headers every upstream request shares. */
function commonHeaders(credential: CodeBuddyCredential): Record<string, string> {
  return {
    'Accept': 'application/json, text/plain, */*',
    'X-Requested-With': 'XMLHttpRequest',
    'Origin': originReferer(credential),
    'Referer': `${originReferer(credential)}/`,
    ...identityHeaders(),
  }
}

/** Chat request headers, including the X-No-* conventions the official CLI uses. */
function chatHeaders(credential: CodeBuddyCredential): Record<string, string> {
  const headers: Record<string, string> = {
    ...commonHeaders(credential),
    'Content-Type': 'application/json',
    // 安全红线：chat 请求绝不携带 refresh token。
    ...credential.uid === '' ? { 'X-No-User-Id': '1' } : { 'X-User-Id': credential.uid },
    ...credential.enterpriseId === undefined || credential.enterpriseId === ''
      ? { 'X-No-Enterprise-Id': '1' }
      : { 'X-Enterprise-Id': credential.enterpriseId },
    ...credential.domain === '' ? { 'X-No-Department-Info': '1' } : { 'X-Domain': credential.domain },
    'X-Product': 'SaaS',
  }
  return headers
}

/** Refresh-endpoint headers; X-Refresh-Token appears here and nowhere else. */
function refreshHeaders(credential: CodeBuddyCredential): Record<string, string> {
  const headers: Record<string, string> = {
    ...commonHeaders(credential),
    'X-Refresh-Token': credential.refreshToken,
    'X-Auth-Refresh-Source': 'workbuddy',
  }
  if (credential.enterpriseId !== undefined && credential.enterpriseId !== '') {
    headers['X-Enterprise-Id'] = credential.enterpriseId
  }
  return headers
}

/** Billing request headers. */
function billingHeaders(credential: CodeBuddyCredential): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${credential.accessToken}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...identityHeaders(),
  }
  if (credential.uid !== '') headers['X-User-Id'] = credential.uid
  if (credential.enterpriseId !== undefined && credential.enterpriseId !== '') {
    headers['X-Enterprise-Id'] = credential.enterpriseId
    headers['X-Tenant-Id'] = credential.enterpriseId
  }
  if (credential.domain !== '') headers['X-Domain'] = credential.domain
  return headers
}

/**
 * Daily check-in request headers. The billing headers already carry the
 * authorization and identity fields; the check-in endpoint additionally wants
 * an explicit domain header, so an empty credential domain falls back to the
 * CN web domain rather than omitting the field.
 */
function checkInHeaders(credential: CodeBuddyCredential): Record<string, string> {
  return {
    ...billingHeaders(credential),
    'X-Domain': credential.domain.trim() === '' ? 'www.codebuddy.cn' : credential.domain,
  }
}

/**
 * Normalize an OpenAI chat-completions body for the CodeBuddy upstream:
 * force `stream: true` (the upstream rejects non-streaming), flatten
 * `tool_choice` (the upstream's field is a string; object forms return 400),
 * and rewrite `developer` messages as `system`.
 *
 * The `developer` rewrite is load-bearing: pi-ai emits the system prompt as
 * `role: "developer"` (the OpenAI convention it adopted), but the CodeBuddy
 * upstream rejects that role with HTTP 400 code 11128 ("Illegal API
 * invocation from an unapproved channel"). Rewriting to `system` is the
 * compatible spelling the upstream accepts.
 */
export function prepareChatBody(source: string): string {
  let body: unknown
  try {
    body = JSON.parse(source)
  } catch {
    return source
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return source
  const obj = body as Record<string, unknown>
  obj['stream'] = true
  normalizeDeveloperRole(obj)
  normalizeToolChoice(obj)
  return JSON.stringify(obj)
}

/** Rewrite `role: "developer"` messages to `role: "system"` (upstream rejects developer). */
function normalizeDeveloperRole(obj: Record<string, unknown>): void {
  const messages = obj['messages']
  if (!Array.isArray(messages)) return
  for (const message of messages) {
    if (typeof message !== 'object' || message === null || Array.isArray(message)) continue
    const wrapped = message as Record<string, unknown>
    if (wrapped['role'] === 'developer') wrapped['role'] = 'system'
  }
}

/** Rewrite OpenAI `tool_choice` spellings into the upstream's string form. */
function normalizeToolChoice(obj: Record<string, unknown>): void {
  const suppress = (): void => {
    delete obj['tools']
    delete obj['functions']
  }
  const present = 'tool_choice' in obj
  if (!present) return
  const choice: unknown = obj['tool_choice']
  if (typeof choice === 'string') {
    if (choice.trim().toLowerCase() === 'none') {
      delete obj['tool_choice']
      suppress()
    }
    return
  }
  if (typeof choice === 'object' && choice !== null && !Array.isArray(choice)) {
    const wrapped = choice as Record<string, unknown>
    const type = typeof wrapped['type'] === 'string' ? wrapped['type'].trim().toLowerCase() : ''
    if (type === 'none') {
      delete obj['tool_choice']
      suppress()
    } else if (type === 'auto' || type === 'required') {
      obj['tool_choice'] = type
    } else if (type === 'function') {
      const fn = typeof wrapped['function'] === 'object' && wrapped['function'] !== null
        ? (wrapped['function'] as Record<string, unknown>)
        : undefined
      let name = typeof fn?.['name'] === 'string' ? fn['name'] : ''
      if (name === '' && typeof wrapped['name'] === 'string') name = wrapped['name']
      name = name.trim()
      obj['tool_choice'] = name !== '' ? name : 'auto'
    } else {
      delete obj['tool_choice']
    }
    return
  }
  delete obj['tool_choice']
}

/** One JSON-envelope response from the upstream, already unwrapped. */
interface Envelope {
  code: number
  msg: string
  data: unknown
}

async function readEnvelope(response: Response): Promise<Envelope> {
  const text = await response.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`codebuddy upstream returned non-JSON (http ${response.status}): ${text.slice(0, 160)}`)
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`codebuddy upstream returned an unexpected document (http ${response.status})`)
  }
  const document = parsed as Record<string, unknown>
  const envelope: Envelope = {
    code: typeof document['code'] === 'number' ? document['code'] : 0,
    msg: typeof document['msg'] === 'string' ? document['msg'] : '',
    data: 'data' in document ? document['data'] : undefined,
  }
  return envelope
}

/** Fail an envelope whose business code is non-zero, classified like HTTP errors. */
function envelopeError(status: number, envelope: Envelope): Error {
  const kind = classifyUpstreamError(status, envelope.msg)
  return new Error(`codebuddy upstream ${kind} (http ${status}): ${envelope.msg.slice(0, 160)}`)
}

/**
 * Upstream HTTP client. One instance serves the whole plugin; requests take
 * the credential explicitly so token refreshes apply on the next call.
 */
export class CodeBuddyUpstreamClient {
  /**
   * Begin resolving the client identity as soon as a client exists.
   *
   * Request headers are assembled synchronously, so the version headers can
   * only appear once resolution has settled. Warming it here means the first
   * request already carries them in practice, and a request issued before the
   * probe finishes still carries `X-IDE-Type`/`X-IDE-Name` in the meantime.
   */
  constructor() {
    void startClientIdentityResolution().catch(() => {})
  }

  /** POST the chat endpoint; a successful answer is the raw SSE response. */
  async chatStream(
    credential: CodeBuddyCredential,
    bodyJson: string,
    signal?: AbortSignal,
  ): Promise<CodeBuddyChatResult> {
    let response: Response
    try {
      response = await fetch(`${chatBase(credential)}/v2/chat/completions`, {
        method: 'POST',
        headers: { ...chatHeaders(credential), 'Authorization': `Bearer ${credential.accessToken}` },
        body: bodyJson,
        ...signal === undefined ? {} : { signal },
      })
    } catch (error: unknown) {
      return { ok: false, status: 0, kind: 'server', message: `transport error: ${String(error)}` }
    }
    if (response.ok) return { ok: true, response }
    const text = (await response.text()).slice(0, ERROR_BODY_LIMIT)
    return {
      ok: false,
      status: response.status,
      kind: classifyUpstreamError(response.status, text),
      message: text,
    }
  }

  /** POST the token-refresh endpoint; the caller merges the outcome. */
  async refreshToken(credential: CodeBuddyCredential): Promise<CodeBuddyRefreshOutcome> {
    const response = await fetch(`${chatBase(credential)}/v2/plugin/auth/token/refresh`, {
      method: 'POST',
      headers: refreshHeaders(credential),
      signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
    })
    const envelope = await readEnvelope(response)
    if (!response.ok || envelope.code !== 0) throw envelopeError(response.status, envelope)
    const data = typeof envelope.data === 'object' && envelope.data !== null
      ? envelope.data as Record<string, unknown>
      : {}
    const accessToken = typeof data['accessToken'] === 'string' ? data['accessToken'] : ''
    if (accessToken === '') throw new Error('codebuddy token refresh returned no accessToken; sign in again in the CodeBuddy app')
    const outcome: CodeBuddyRefreshOutcome = { accessToken }
    if (typeof data['refreshToken'] === 'string' && data['refreshToken'] !== '') outcome.refreshToken = data['refreshToken']
    if (typeof data['expiresIn'] === 'number' && data['expiresIn'] > 0) outcome.expiresInSec = data['expiresIn']
    if (typeof data['domain'] === 'string' && data['domain'] !== '') outcome.domain = data['domain']
    return outcome
  }

  /** GET the personal model catalog and keep the `cli` agent's models only. */
  async fetchModels(credential: CodeBuddyCredential): Promise<readonly CodeBuddyUpstreamModel[]> {
    const response = await fetch(`${chatBase(credential)}/console/enterprises/personal/models`, {
      headers: {
        'Authorization': `Bearer ${credential.accessToken}`,
        'Accept': 'application/json',
        'Origin': originReferer(credential),
        'Referer': `${originReferer(credential)}/`,
        ...identityHeaders(),
      },
      signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
    })
    const envelope = await readEnvelope(response)
    if (!response.ok || envelope.code !== 0) throw envelopeError(response.status, envelope)
    const data = typeof envelope.data === 'object' && envelope.data !== null
      ? envelope.data as Record<string, unknown>
      : {}
    const rawModels = Array.isArray(data['models']) ? data['models'] : []
    const agents = Array.isArray(data['agents']) ? data['agents'] : []
    let cliIds: readonly string[] | undefined
    for (const agent of agents) {
      if (typeof agent === 'object' && agent !== null) {
        const wrapped = agent as Record<string, unknown>
        if (wrapped['name'] === 'cli' && Array.isArray(wrapped['models'])) {
          cliIds = wrapped['models'].filter((id): id is string => typeof id === 'string')
          break
        }
      }
    }
    if (cliIds === undefined || cliIds.length === 0) {
      throw new Error('codebuddy model catalog lists no cli agent models')
    }
    const byId = new Map<string, CodeBuddyUpstreamModel>()
    for (const model of rawModels) {
      if (typeof model !== 'object' || model === null) continue
      const wrapped = model as Record<string, unknown>
      const id = typeof wrapped['id'] === 'string' ? wrapped['id'] : ''
      if (id === '' || wrapped['disabled'] === true) continue
      const input = typeof wrapped['maxInputTokens'] === 'number' ? wrapped['maxInputTokens'] : 0
      const output = typeof wrapped['maxOutputTokens'] === 'number' ? wrapped['maxOutputTokens'] : 0
      if (input <= 0 || output <= 0) continue
      byId.set(id, {
        id,
        name: typeof wrapped['name'] === 'string' && wrapped['name'] !== '' ? wrapped['name'] : id,
        contextWindow: input,
        maxTokens: output,
        supportsImages: wrapped['supportsImages'] === true && wrapped['disabledMultimodal'] !== true,
        ...resolveUpstreamReasoning(wrapped),
        ...resolveUpstreamBilling(wrapped),
      })
    }
    const models = cliIds
      .map(id => byId.get(id))
      .filter((model): model is CodeBuddyUpstreamModel => model !== undefined)
    if (models.length === 0) throw new Error('codebuddy model catalog resolved to an empty list')
    return models
  }

  /** POST the billing endpoint for the aggregated remaining credit. */
  async fetchCredits(credential: CodeBuddyCredential): Promise<CodeBuddyCredits> {
    const now = new Date()
    const format = (date: Date): string => [
      date.getFullYear().toString().padStart(4, '0'),
      (date.getMonth() + 1).toString().padStart(2, '0'),
      date.getDate().toString().padStart(2, '0'),
    ].join('-') + ' ' + [
      date.getHours().toString().padStart(2, '0'),
      date.getMinutes().toString().padStart(2, '0'),
      date.getSeconds().toString().padStart(2, '0'),
    ].join(':')
    const response = await fetch(`${billingBase(credential)}/v2/billing/meter/get-user-resource`, {
      method: 'POST',
      headers: billingHeaders(credential),
      body: JSON.stringify({
        PageNumber: 1,
        PageSize: 100,
        ProductCode: 'p_tcaca',
        Status: [0, 3],
        PackageEndTimeRangeBegin: format(now),
        PackageEndTimeRangeEnd: format(new Date(now.getTime() + 365 * 101 * 24 * 3600 * 1000)),
      }),
      signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
    })
    const envelope = await readEnvelope(response)
    if (!response.ok || envelope.code !== 0) throw envelopeError(response.status, envelope)
    const responseWrapper = typeof envelope.data === 'object' && envelope.data !== null
      ? envelope.data as Record<string, unknown>
      : {}
    const data = typeof responseWrapper['Response'] === 'object' && responseWrapper['Response'] !== null
      ? responseWrapper['Response'] as Record<string, unknown>
      : {}
    const inner = typeof data['Data'] === 'object' && data['Data'] !== null
      ? data['Data'] as Record<string, unknown>
      : {}
    const rawAccounts = Array.isArray(inner['Accounts']) ? inner['Accounts'] : []
    const accounts: CodeBuddyCreditAccount[] = []
    let total = 0
    const nowMs = Date.now()
    const struct = (raw: unknown): Record<string, unknown> | undefined => {
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
      return raw as Record<string, unknown>
    }
    const num = (account: Record<string, unknown>, ...keys: string[]): number => {
      for (const key of keys) {
        const value = account[key]
        const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
        if (Number.isFinite(parsed)) return parsed
      }
      return 0
    }
    const tsMs = (value: unknown): number | undefined => {
      const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
      if (!Number.isFinite(parsed)) return undefined
      // seconds vs milliseconds (epoch heuristics: < 1e12 is seconds)
      const ms = parsed < 1e12 ? parsed * 1000 : parsed
      return ms > 0 ? ms : undefined
    }
    for (const rawItem of rawAccounts) {
      const account = struct(rawItem)
      if (account === undefined) continue
      const cycleSize = num(account, 'CycleCapacitySize', 'CycleCapacitySizePrecise')
      const cycleRemain = num(account, 'CycleCapacityRemain', 'CycleCapacityRemainPrecise', 'CycleRemainCapacity')
      const cycleUsed = num(account, 'CycleCapacityUsed', 'CycleCapacityUsedPrecise')
      const capacitySize = num(account, 'CapacitySize', 'CapacitySizePrecise')
      const capacityRemain = num(account, 'CapacityRemain', 'CapacityRemainPrecise')
      const capacityUsed = num(account, 'CapacityUsed', 'CapacityUsedPrecise')
      let size: number
      let remain: number
      let used: number
      if (cycleSize > 0) {
        size = cycleSize
        remain = cycleRemain
        used = cycleUsed
      } else if (cycleRemain > 0 || cycleUsed > 0) {
        size = cycleSize
        remain = cycleRemain
        used = cycleUsed
      } else {
        size = capacitySize
        remain = capacityRemain
        used = capacityUsed
      }
      if (size <= 0 && cycleSize > 0) size = cycleSize
      // A package with no capacity at all is treated as long-lived (no size bar).
      if (remain < 0) remain = 0
      if (used < 0) used = 0
      const expireAtMs = tsMs(account['DeductionEndTime'] ?? account['deductionEndTime'] ?? account['ExpiredTime'] ?? account['expiredTime'] ?? account['CycleEndTime'] ?? account['cycleEndTime'])
      const expired = expireAtMs !== undefined && expireAtMs <= nowMs
      const expiringSoon = expireAtMs !== undefined && !expired && expireAtMs - nowMs <= 7 * 24 * 3600 * 1000
      total += remain
      accounts.push({
        ...typeof account['PackageCode'] === 'string' && account['PackageCode'] !== '' ? { packageCode: account['PackageCode'] } : {},
        packageName: typeof account['PackageName'] === 'string' && account['PackageName'] !== '' ? account['PackageName'] : '(unnamed)',
        total: size,
        remain,
        used,
        size,
        ...expireAtMs !== undefined ? { expireAtMs } : {},
        expired,
        expiringSoon,
      } satisfies CodeBuddyCreditAccount)
    }
    return { total, accounts }
  }

  /**
   * Fetch official per-request usage over a window and aggregate it.
   *
   * The upstream billing endpoint (`get-user-request-usage`) returns paginated
   * rows of individual billing requests (credit consumed, model, client,
   * request time). The rows are aggregated in-process into today / 7-day /
   * month totals, a zero-filled daily series, and a per-model breakdown,
   * which back the plugin's credit-statistics panel.
   *
   * Pagination follows the upstream page contract; a capped page count guards
   * against runaway loops. Window days default to 31 (the upstream's range).
   */
  async fetchUsage(credential: CodeBuddyCredential, windowDays = 31): Promise<CodeBuddyUsageStats> {
    const now = new Date()
    const dateKey = (date: Date): string => [
      date.getFullYear().toString().padStart(4, '0'),
      (date.getMonth() + 1).toString().padStart(2, '0'),
      date.getDate().toString().padStart(2, '0'),
    ].join('-')
    const timeParts = (date: Date): string => [
      date.getFullYear().toString().padStart(4, '0'),
      (date.getMonth() + 1).toString().padStart(2, '0'),
      date.getDate().toString().padStart(2, '0'),
    ].join('-') + ' ' + [
      date.getHours().toString().padStart(2, '0'),
      date.getMinutes().toString().padStart(2, '0'),
      date.getSeconds().toString().padStart(2, '0'),
    ].join(':')
    const rangeStart = new Date(now)
    rangeStart.setDate(rangeStart.getDate() - (windowDays - 1))
    rangeStart.setHours(0, 0, 0, 0)
    const rangeEnd = new Date(now)
    rangeEnd.setHours(23, 59, 59, 999)
    const rangeStartKey = dateKey(rangeStart)
    const rangeEndKey = dateKey(rangeEnd)

    const url = `${billingBase(credential)}/billing/meter/get-user-request-usage`
    const pageSize = 3000
    const maxPages = 100
    const rows: CodeBuddyUsageRow[] = []
    let reportedTotal = 0
    let fetchedRaw = 0
    let pages = 0
    let lastError: string | undefined

    for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
      let response: Response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: billingHeaders(credential),
          body: JSON.stringify({
            startTime: timeParts(rangeStart),
            endTime: timeParts(rangeEnd),
            pageNum,
            pageSize,
          }),
          signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
        })
      } catch (error: unknown) {
        lastError = `transport error: ${String(error)}`
        break
      }
      let envelope: Envelope
      try {
        envelope = await readEnvelope(response)
      } catch (error: unknown) {
        lastError = error instanceof Error ? error.message : String(error)
        break
      }
      if (!response.ok || (envelope.code !== 0 && envelope.code !== 200)) {
        lastError = envelope.msg.trim() === '' ? `http ${response.status}` : envelope.msg
        break
      }
      const data = typeof envelope.data === 'object' && envelope.data !== null
        ? envelope.data as Record<string, unknown>
        : {}
      const rawRows = Array.isArray(data['data']) ? data['data'] : []
      const total = typeof data['total'] === 'number' ? data['total']
        : (typeof data['total'] === 'string' ? Number(data['total']) : rawRows.length)
      if (Number.isFinite(total) && total > reportedTotal) reportedTotal = Math.round(total)
      fetchedRaw += rawRows.length
      for (const raw of rawRows) {
        if (typeof raw !== 'object' || raw === null) continue
        const row = raw as Record<string, unknown>
        const credit = typeof row['credit'] === 'number' ? row['credit']
          : (typeof row['credit'] === 'string' ? Number(row['credit']) : Number.NaN)
        if (!Number.isFinite(credit) || credit < 0) continue
        const rawTime = row['requestTime'] ?? row['request_time'] ?? row['requesttime']
        const parsed = parseUsageTime(rawTime, now)
        if (parsed === undefined) continue
        const date = dateKey(parsed.date)
        if (date < rangeStartKey || date > rangeEndKey) continue
        rows.push({
          requestId: typeof row['requestId'] === 'string' ? row['requestId']
            : (typeof row['request_id'] === 'string' ? row['request_id'] : 'unknown'),
          model: typeof row['model'] === 'string' && row['model'] !== '' ? row['model'] : '—',
          client: typeof row['client'] === 'string' && row['client'] !== '' ? row['client'] : '—',
          credit,
          requestTime: typeof rawTime === 'string' ? rawTime : String(rawTime ?? date),
          ts: parsed.ts,
          date,
        })
      }
      pages += 1
      const hasMore = (rawRows.length > 0 && fetchedRaw < reportedTotal && pageNum < maxPages)
      if (!hasMore) break
    }

    // When the window exceeds maxPages the upstream may have more pages than we
    // fetched; the totals are then a lower bound and the stats must not present
    // themselves as complete.
    const truncated = reportedTotal > 0 && fetchedRaw < reportedTotal

    // Aggregate into today / week / month + daily + per-model counts.
    const todayKey = dateKey(now)
    const monthPrefix = now.getFullYear().toString() + '-' + (now.getMonth() + 1).toString().padStart(2, '0')
    let usageToday = 0
    let usage7Days = 0
    let usageThisMonth = 0
    const daily = new Map<string, number>()
    const dailyModels = new Map<string, Map<string, { requestCount: number; credit: number }>>()
    const modelTotals = new Map<string, { requestCount: number; credit: number }>()
    const sorted = [...rows].sort((a, b) => b.ts - a.ts)
    for (const row of sorted) {
      const distance = daysBetween(row.date, todayKey)
      if (distance === 0) usageToday += row.credit
      if (distance >= 0 && distance < 7) usage7Days += row.credit
      if (row.date.startsWith(monthPrefix)) usageThisMonth += row.credit
      daily.set(row.date, (daily.get(row.date) ?? 0) + row.credit)
      const modelKey = row.model === '—' ? '未知模型' : row.model
      const entry = modelTotals.get(modelKey) ?? { requestCount: 0, credit: 0 }
      entry.requestCount += 1
      entry.credit += row.credit
      modelTotals.set(modelKey, entry)
      const perDay = dailyModels.get(row.date)
      if (perDay !== undefined) {
        const modelDay = perDay.get(modelKey) ?? { requestCount: 0, credit: 0 }
        modelDay.requestCount += 1
        modelDay.credit += row.credit
        perDay.set(modelKey, modelDay)
      } else {
        dailyModels.set(row.date, new Map([[modelKey, { requestCount: 1, credit: row.credit }]]))
      }
    }

    // Zero-filled daily series across the window.
    const dailySeries: CodeBuddyUsageDaily[] = []
    const walk = new Date(rangeStart)
    while (walk <= rangeEnd) {
      const key = dateKey(walk)
      const dayTotal = daily.get(key) ?? 0
      const dayModels = dailyModels.get(key)
      dailySeries.push({
        date: key,
        usage: dayTotal,
        ...dayModels !== undefined && dayModels.size > 0
          ? { models: [...dayModels.entries()].map(([model, { requestCount, credit }]) => ({ model, requestCount, credit })) }
          : {},
      })
      walk.setDate(walk.getDate() + 1)
    }

    const models = [...modelTotals.entries()]
      .map(([model, { requestCount, credit }]) => ({ model, requestCount, credit }))
      .sort((a, b) => b.credit - a.credit || b.requestCount - a.requestCount || a.model.localeCompare(b.model))

    const status: CodeBuddyUsageStats['status'] = lastError !== undefined || truncated
      ? (reportedTotal > 0 ? 'partial' : 'unavailable')
      : 'complete'

    // Deduplicate identical request ids close in time (upstream may repeat).
    const uniqueRows = new Map<string, CodeBuddyUsageRow>()
    for (const row of sorted) uniqueRows.set(`${row.requestId}@${row.ts}`, row)
    const detailLimit = 100

    return {
      status,
      rangeStart: rangeStartKey,
      rangeEnd: rangeEndKey,
      collectedAt: Date.now(),
      summary: { usageToday, usage7Days, usageThisMonth },
      daily: dailySeries,
      models,
      requests: [...uniqueRows.values()].slice(0, detailLimit),
      detailLimit,
    }
  }

  /**
   * POST the CN daily check-in endpoint. The answer is classified for the
   * card rather than thrown: a transport or envelope failure, and an upstream
   * "already checked in" business code, all come back as plain outcomes so
   * the browser half never has to interpret upstream error text.
   */
  async checkIn(credential: CodeBuddyCredential): Promise<CodeBuddyCheckInOutcome> {
    if (regionOf(credential.domain) !== 'cn') {
      return { status: 'failed', message: 'daily check-in is only available for the CodeBuddy CN account' }
    }
    let response: Response
    try {
      response = await fetch(`${CN_CHAT_BASE}${CN_CHECKIN_PATH}`, {
        method: 'POST',
        headers: checkInHeaders(credential),
        body: '{}',
        signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
      })
    } catch (error: unknown) {
      return { status: 'failed', message: `transport error: ${String(error)}` }
    }
    let envelope: Envelope
    try {
      envelope = await readEnvelope(response)
    } catch (error: unknown) {
      return { status: 'failed', message: error instanceof Error ? error.message : String(error) }
    }
    if (response.ok && envelope.code === 0) {
      return { status: 'ok', message: envelope.msg.trim() === '' ? 'checked in' : envelope.msg }
    }
    const message = envelope.msg.trim() === '' ? `http ${response.status}` : envelope.msg
    const lowered = message.toLowerCase()
    for (const marker of CHECKIN_ALREADY_MARKERS) {
      if (lowered.includes(marker.toLowerCase())) return { status: 'already', message }
    }
    return { status: 'failed', message }
  }
}
