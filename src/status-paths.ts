/** Node-free constants and types shared by the Host and browser halves. */

/** Plugin-owned status endpoint consumed by its browser half. */
export const CODEBUDDY_STATUS_PATH = '/plugins/dsh-codebuddy-cli/status'

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
  }
  | { status: 'error'; message: string }
