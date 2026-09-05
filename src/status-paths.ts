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
 * The provider id this plugin registers in the Harness LLM seam.
 *
 * Shared with the browser half so the composer dock can match the session's
 * `modelSelection` projection against this provider before reading a rate;
 * the host-side spelling lives in `adapter.ts` (`CODEBUDDY_PROVIDER`) and a
 * test asserts the two stay in sync.
 */
export const CODEBUDDY_PROVIDER_ID = 'codebuddy-cli'

/** One billing package and its remaining credit. */
export interface CodeBuddyWebCreditAccount {
  packageName: string
  remain: number
  size: number
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

/** The JSON document the plugin card renders. */
export type CodeBuddyWebStatus =
  | { status: 'signed-out' }
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
  }
  | { status: 'error'; message: string }
