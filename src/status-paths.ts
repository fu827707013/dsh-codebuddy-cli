/** Node-free constants and types shared by the Host and browser halves. */

/** Plugin-owned status endpoint consumed by its browser half. */
export const CODEBUDDY_STATUS_PATH = '/plugins/dsh-codebuddy-cli/status'

/**
 * Plugin-owned write endpoint for the enabled-model selection.
 *
 * The card writes its selection through this route rather than the host's
 * generic settings form: the choice is a set of checkboxes over the live
 * catalog, which a schema-rendered string-array field cannot express. The
 * handler applies the same loopback gate as the status route and additionally
 * requires a loopback `Origin`, because unlike the GET it mutates state.
 */
export const CODEBUDDY_MODELS_PATH = '/plugins/dsh-codebuddy-cli/enabled-models'

/**
 * Plugin-owned daily check-in endpoint.
 *
 * The card's check-in button POSTs here; the host half forwards the request
 * to the CodeBuddy CN daily check-in upstream with the plugin-resolved
 * credential. Same loopback/Origin gates as the enabled-model write route.
 */
export const CODEBUDDY_CHECKIN_PATH = '/plugins/dsh-codebuddy-cli/check-in'

/**
 * Plugin-owned account management endpoints.
 *
 * The card's account panel uses these routes to start an OAuth login, poll for
 * completion, switch the active account, and remove an account. All routes
 * apply the same loopback/Origin gates as the other write routes.
 */
export const CODEBUDDY_LOGIN_START_PATH = '/plugins/dsh-codebuddy-cli/login/start'
export const CODEBUDDY_LOGIN_POLL_PATH = '/plugins/dsh-codebuddy-cli/login/poll'
export const CODEBUDDY_SWITCH_ACCOUNT_PATH = '/plugins/dsh-codebuddy-cli/accounts/switch'
export const CODEBUDDY_DELETE_ACCOUNT_PATH = '/plugins/dsh-codebuddy-cli/accounts/delete'

/** Optional per-account targeting on the check-in write. */
export interface CodeBuddyCheckInRequest {
  /** Stable account id; absent targets the resolved (active) account. */
  id?: string
}

/** Daily check-in outcome status, already mapped for display. */
export type CodeBuddyCheckInStatus = 'ok' | 'already' | 'failed'

/**
 * The daily check-in answer the card renders. `message` is upstream text
 * (success confirmation, the "already" reason, or a failure detail) and is
 * shown verbatim next to the localized status.
 */
export interface CodeBuddyCheckInOutcome {
  status: CodeBuddyCheckInStatus
  message: string
}

/**
 * The provider id this plugin registers in the Harness LLM seam.
 *
 * Shared with the browser half so the composer dock can match the session's
 * `modelSelection` projection against this provider before reading a rate;
 * the host-side spelling lives in `adapter.ts` (`CODEBUDDY_PROVIDER`) and a
 * test asserts the two stay in sync.
 */
export const CODEBUDDY_PROVIDER_ID = 'codebuddy-cli'

/** One billing package and its remaining credit, as the card renders it. */
export interface CodeBuddyWebCreditAccount {
  /** Package code as the upstream reports it (may be absent). */
  packageCode?: string
  packageName: string
  /** Total capacity of this package. */
  total: number
  /** Remaining capacity of this package. */
  remain: number
  /** Used capacity of this package. */
  used: number
  /** Backward-compatible alias for the total. */
  size: number
  /** Expiry as epoch milliseconds; absent means long-lived. */
  expireAtMs?: number
  /** Whether the package has already expired. */
  expired: boolean
  /** Whether the package expires within the soon window (7 days). */
  expiringSoon: boolean
}

/** Aggregated credit answer rendered by the plugin card. */
export interface CodeBuddyWebCredits {
  total: number
  accounts: readonly CodeBuddyWebCreditAccount[]
}

/** Billing convenience facts for one model, rendered as card badges. */
export interface CodeBuddyWebModelBadge {
  id: string
  name: string
  /** Whether the model is currently free (`x0.00` credits). */
  free?: boolean
  /** Promotional badges, e.g. `限时免费`, `夜间折扣`. */
  badges?: readonly string[]
  /**
   * Credits multiplier in display form, e.g. `x0.79`. Unlike the model
   * picker's copy, the card renders through the browser locale, so this value
   * may be interpolated into a localized sentence rather than shown bare.
   */
  credits?: string
}

/**
 * Whole-catalog rate and display-name maps, keyed by model id.
 *
 * The composer dock needs the multiplier of the *currently selected* model —
 * any model in the catalog, not only the promo rows the card's `models` list
 * carries. Shipping every model's rate as a compact map (instead of only the
 * promo subset) lets the dock resolve any selection without enlarging the
 * per-model badge shape; the map stays small (≈15 ids), so the document's
 * size is unaffected.
 */
export interface CodeBuddyWebRateMap {
  /** Normalized multiplier per model id, e.g. `{ 'glm-5.3': 'x0.79' }`. */
  readonly rates: Readonly<Record<string, string>>
  /** Display name per model id, so the dock can echo the selection's name. */
  readonly names: Readonly<Record<string, string>>
}

/**
 * One selectable model as the card's checkbox list renders it.
 *
 * This is the *whole* catalog, unlike {@link CodeBuddyWebModelBadge}'s promo
 * subset: the user has to be able to check a model that carries no discount.
 * `enabled` is the effective answer the Host computed (an absent or empty
 * selection resolves to every model enabled), so the card never re-derives
 * that rule.
 */
export interface CodeBuddyWebModelChoice {
  id: string
  name: string
  /** Whether this model is currently offered in the model pickers. */
  enabled: boolean
  /** Whether the model is currently free (`x0.00` credits). */
  free?: boolean
  /** Promotional badges, e.g. `限时免费`, `夜间折扣`. */
  badges?: readonly string[]
  /** Normalized credits multiplier in display form, e.g. `x0.79`. */
  credits?: string
}

/** The enabled-model selection as the card reads and writes it. */
export interface CodeBuddyWebModelSelection {
  /** Every served model with its effective offered state, in catalog order. */
  readonly choices: readonly CodeBuddyWebModelChoice[]
  /**
   * Whether the stored selection restricts anything. False means the section
   * carries no selection (or an empty one), so every model is offered and the
   * card can say so rather than showing 15 checked boxes as a deliberate choice.
   */
  readonly restricted: boolean
  /**
   * Whether the Host can persist a selection. A profile with no settings
   * provider serves models but stores nothing, so the card disables its
   * controls instead of failing the write.
   */
  readonly writable: boolean
}

/** Request body of the enabled-model write route. */
export interface CodeBuddyEnabledModelsRequest {
  /** Model ids to offer. An empty array clears the restriction. */
  readonly enabledModels: readonly string[]
}

/** One stored account as the card's account panel renders it. */
export interface CodeBuddyWebAccount {
  /** Stable client-side id. */
  id: string
  /** Upstream user id. */
  uid: string
  nickname?: string
  domain: string
  enterpriseId?: string
  /** Access token expiry, epoch milliseconds. */
  expiresAtMs: number
  /** Whether this is the currently active account. */
  active: boolean
  /** Full credit resources for this account (rendered as package bars). */
  credits?: CodeBuddyWebCredits
  /** Whether the account checked in today (undefined = unknown). */
  checkedInToday?: boolean
  /** When the credit answer was last fetched (epoch ms). */
  creditUpdatedAtMs?: number
  /** Whether a credit fetch failed for this account (message retained). */
  creditError?: string
}

/** The login start response the card renders. */
export interface CodeBuddyLoginStartResult {
  /** Whether the login URL was generated successfully. */
  ok: boolean
  /** The URL the user should open in their browser. */
  authUrl?: string
  /** Internal state id used for polling. */
  state?: string
  /** Error message when ok is false. */
  error?: string
}

/** The login poll response the card renders. */
export interface CodeBuddyLoginPollResult {
  /** Whether the login has completed (success or failure). */
  done: boolean
  /** The new account summary when login succeeded. */
  account?: CodeBuddyWebAccount
  /** Error message when login failed. */
  error?: string
}

/** Plugin-owned credit-statistics endpoint (aggregates usage across accounts). */
export const CODEBUDDY_CREDIT_STATS_PATH = '/plugins/dsh-codebuddy-cli/credit-stats'

/** One per-request usage row, as the statistics panel renders it. */
export interface CodeBuddyWebUsageRow {
  requestId: string
  model: string
  client: string
  credit: number
  requestTime: string
  date: string
  /** Owning account id (filled on per-account aggregation). */
  accountId?: string
  /** Owning account display name. */
  accountName?: string
}

/** Per-model aggregation for one day or the whole window. */
export interface CodeBuddyWebUsageModel {
  model: string
  requestCount: number
  credit: number
}

/** Daily usage point for the trend chart. */
export interface CodeBuddyWebUsageDaily {
  date: string
  usage: number
  models?: readonly CodeBuddyWebUsageModel[]
}

/** Per-account usage summary. */
export interface CodeBuddyWebUsageAccount {
  accountId: string
  accountName: string
  ok: boolean
  usageToday: number | null
  usage7Days: number | null
  usageThisMonth: number | null
  error?: string
  /** This account's own daily series, for per-account trend filtering. */
  daily?: readonly CodeBuddyWebUsageDaily[]
  /** This account's own per-model aggregation. */
  models?: readonly CodeBuddyWebUsageModel[]
}

/** Aggregated credit statistics document for the panel. */
export interface CodeBuddyCreditStats {
  status: 'complete' | 'partial' | 'unavailable'
  rangeStart: string
  rangeEnd: string
  collectedAt: number
  summary: {
    usageToday: number
    usage7Days: number
    usageThisMonth: number
  }
  daily: readonly CodeBuddyWebUsageDaily[]
  models: readonly CodeBuddyWebUsageModel[]
  requests: readonly CodeBuddyWebUsageRow[]
  accounts: readonly CodeBuddyWebUsageAccount[]
  detailLimit: number
}

/** The JSON document the plugin card renders. */
export type CodeBuddyWebStatus =
  | {
    status: 'signed-out'
    /** Stored accounts for the account management panel (may be empty). */
    accounts?: readonly CodeBuddyWebAccount[]
  }
  | {
    status: 'signed-in'
    nickname?: string
    domain?: string
    source?: 'cli' | 'dsh'
    expiresAt?: number
    credits?: CodeBuddyWebCredits
    creditsError?: string
    /** Billing convenience facts for the models the plugin serves. */
    models?: readonly CodeBuddyWebModelBadge[]
    /** Whole-catalog rate/name maps for the composer dock's current-model read. */
    catalog?: CodeBuddyWebRateMap
    /** Every served model with its offered state, backing the card's checkbox list. */
    selection?: CodeBuddyWebModelSelection
    /** Stored accounts for the account management panel. */
    accounts?: readonly CodeBuddyWebAccount[]
    }
  | { status: 'error'; message: string }
