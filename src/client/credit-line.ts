/**
 * Pure display helpers for the composer credit line, split out of the
 * component so the Node test environment can exercise them without loading
 * the browser-only DSH slot packages.
 *
 * @module dsh-codebuddy-cli/credit-line
 */

import { CODEBUDDY_PROVIDER_ID } from '../status-paths.ts'
import type { CodeBuddyWebRateMap } from '../status-paths.ts'

/** The `modelSelection` projection's shape (see dsh-api-session-controller/types). */
export interface CodeBuddyModelSelection {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

/**
 * The client-facing `modelSelection` projection (see
 * dsh-api-session-controller/types `ModelSelectionProjection`): `next` is the
 * selection the next request will use, falling back to `lastUsed`.
 */
export interface CodeBuddyModelSelectionProjection {
  readonly lastUsed: CodeBuddyModelSelection | null
  readonly next: CodeBuddyModelSelection | null
}

/** The status document's credit section, narrowed to the fields the dock reads. */
export interface CodeBuddyDockCredits {
  readonly total: number
  readonly accounts: readonly { readonly packageName: string; readonly remain: number; readonly size: number }[]
}

/** Narrow status document slice the dock needs. */
export interface CodeBuddyDockStatus {
  readonly status: string
  readonly credits?: CodeBuddyDockCredits
  readonly creditsError?: string
  readonly catalog?: CodeBuddyWebRateMap
}

/** The composer dock's credit line, or null when nothing displayable exists. */
export interface CodeBuddyCreditLine {
  /** Compact total, e.g. `1.2K` / `352` — the token-count style users know. */
  readonly compact: string
  /** Whole number, shown in the details panel. */
  readonly total: number
  /** Per-package rows for the details panel (remain>0 only), largest first. */
  readonly rows: readonly { readonly packageName: string; readonly remain: number }[]
  /** True when the upstream answer reports no credit at all. */
  readonly empty: boolean
}

/** Trim fractional noise: one decimal under 100, integers from there on. */
function scaleText(candidate: number): string {
  return candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10)
}

/**
 * Compact a credit count the way the composer formats tokens (`1.2K`).
 * Mirrors ui-conversation's ContextMeter `formatTokens` thresholds so the two
 * meters read as one family.
 */
export function formatCompactCredits(value: number): string {
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${scaleText(value / 1_000)}K`
  return `${scaleText(value / 1_000_000)}M`
}

/**
 * Build the credit line from the status document's credit section.
 *
 * Packages with no remaining credit drop out (the card already filters the
 * same way); a signed-in document whose billing answer lists nothing renders
 * as empty rather than hiding the meter, so "0" stays visible and the user
 * can tell "exhausted" apart from "not signed in".
 */
export function buildCreditLine(credits: CodeBuddyDockCredits | undefined): CodeBuddyCreditLine | null {
  if (credits === undefined) return null
  const rows = credits.accounts
    .filter(account => account.remain > 0)
    .map(account => ({ packageName: account.packageName, remain: account.remain }))
    .sort((a, b) => b.remain - a.remain)
  const total = credits.total
  return {
    compact: formatCompactCredits(total),
    total,
    rows,
    empty: rows.length === 0 && total === 0,
  }
}

/**
 * Resolve the currently selected CodeBuddy model's billing rate and name.
 *
 * The dock renders nothing for a foreign provider: the line advertises
 * CodeBuddy spending, and a WorkBuddy / DeepSeek session has no CodeBuddy
 * credits to show. `next` wins over `lastUsed` — it is the selection the next
 * request will use, which is the one the user just picked. An absent
 * projection (no model chosen yet in this session) resolves to null.
 */
export function currentCodeBuddyRate(
  selection: CodeBuddyModelSelectionProjection | undefined,
  catalog: CodeBuddyWebRateMap | undefined,
): { rate: string; name: string | undefined } | null {
  const current = selection?.next ?? selection?.lastUsed ?? null
  if (current === null || current.provider !== CODEBUDDY_PROVIDER_ID) return null
  const rate = catalog?.rates[current.model]
  if (rate === undefined) return null
  return { rate, name: catalog?.names[current.model] }
}

/**
 * One per-package detail row's percent, or null when the package size is
 * unknown (the renderer omits the bar).
 */
export function creditRowPercent(remain: number, size: number): number | null {
  if (size <= 0) return null
  return Math.max(0, Math.min(100, (remain / size) * 100))
}
