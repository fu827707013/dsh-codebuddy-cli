/**
 * Pure display helpers for the composer credit line, split out of the
 * component so the Node test environment can exercise them without loading
 * the browser-only DSH slot packages.
 *
 * @module dsh-codebuddy-cli/credit-line
 */

import { CODEBUDDY_PROVIDER_ID } from '../status-paths.ts'
import type { CodeBuddyWebRateMap } from '../status-paths.ts'
import type { CodeBuddyCreditKey } from './locales.ts'

/**
 * Display spelling of this plugin's provider.
 *
 * A brand name, not translatable copy: the id (`codebuddy-cli`) is a routing
 * key, so the line shows the product spelling instead. Foreign providers have
 * no such table here — their raw provider id is shown as-is.
 */
export const CODEBUDDY_PROVIDER_LABEL = 'CodeBuddy'

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
 * The selection the composer is about to use: `next` wins over `lastUsed` —
 * it is the selection the next request will use, which is the one the user
 * just picked. An absent projection (no model chosen yet in this session, or
 * the projection has not landed) resolves to null.
 *
 * Every provider/model read ({@link isCodeBuddySelection},
 * {@link currentCodeBuddyRate}, {@link buildDockLine}) goes through this one
 * helper so they cannot drift apart on which selection counts.
 */
export function currentModelSelection(
  selection: CodeBuddyModelSelectionProjection | undefined,
): CodeBuddyModelSelection | null {
  return selection?.next ?? selection?.lastUsed ?? null
}

/**
 * Whether the session's current selection belongs to this plugin's provider.
 *
 * The dock itself is *not* gated on this (the line stays mounted for every
 * provider so the composer never loses a row); this only decides whether the
 * CodeBuddy-specific work happens: fetching/polling the plugin's status route
 * and resolving a credits multiplier. False while the projection is missing or
 * carries no selection at all.
 */
export function isCodeBuddySelection(selection: CodeBuddyModelSelectionProjection | undefined): boolean {
  return currentModelSelection(selection)?.provider === CODEBUDDY_PROVIDER_ID
}

/**
 * Resolve the currently selected CodeBuddy model's billing rate and name.
 *
 * Returns null for a foreign provider, an unknown model, or an absent
 * catalog — the panel then omits the rate row rather than guessing.
 */
export function currentCodeBuddyRate(
  selection: CodeBuddyModelSelectionProjection | undefined,
  catalog: CodeBuddyWebRateMap | undefined,
): { rate: string; name: string | undefined } | null {
  const current = currentModelSelection(selection)
  if (current === null || !isCodeBuddySelection(selection)) return null
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

/** Exact credit figure with thousands separators, e.g. `1,642`. */
export function formatCreditTotal(total: number): string {
  return new Intl.NumberFormat(undefined).format(total)
}

/**
 * The dock's status-read state machine.
 *
 * `idle` is the state for a non-CodeBuddy session: the dock never asks this
 * plugin's status route for a foreign provider, so there is no read in flight
 * and no stale answer to render.
 */
export type CodeBuddyDockLoad =
  | { readonly phase: 'idle' }
  | { readonly phase: 'loading' }
  | { readonly phase: 'ok'; readonly value: CodeBuddyDockStatus }
  | { readonly phase: 'error'; readonly message: string }

/**
 * One piece of the composer line. `copy` pieces go through the host locale
 * (never hard-coded user-facing text); `text` pieces are already-formatted
 * upstream values such as the `x0.79` multiplier.
 */
export type CodeBuddyDockSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'copy'; readonly key: CodeBuddyCreditKey; readonly params?: Readonly<Record<string, string>> }

/** Everything the dock renders for the current session, in one value. */
export interface CodeBuddyDockLine {
  /** Line pieces, joined by the renderer with a `·` separator. Never empty. */
  readonly segments: readonly CodeBuddyDockSegment[]
  /** Whether the current selection is served by this plugin's provider. */
  readonly codeBuddy: boolean
  /** Credit figures for the details panel, or null when none are readable. */
  readonly credits: CodeBuddyCreditLine | null
  /** The selected model's multiplier, or null when it cannot be determined. */
  readonly rate: { readonly rate: string; readonly name: string | undefined } | null
}

/**
 * The credit piece of a CodeBuddy line.
 *
 * Every phase produces copy — loading, signed-out and "billing answer missing"
 * each get their own wording — so the row never collapses to nothing while the
 * status document is unusable.
 */
function creditSegment(load: CodeBuddyDockLoad, credits: CodeBuddyCreditLine | null): CodeBuddyDockSegment {
  if (credits !== null) {
    return { kind: 'copy', key: 'creditTotalCompact', params: { total: formatCreditTotal(credits.total) } }
  }
  if (load.phase === 'idle' || load.phase === 'loading') return { kind: 'copy', key: 'creditLoading' }
  if (load.phase === 'ok' && load.value.status !== 'signed-in') return { kind: 'copy', key: 'creditSignedOut' }
  return { kind: 'copy', key: 'creditUnavailable' }
}

/**
 * Compose the composer line for whatever the session currently has selected.
 *
 * Always returns a renderable line — that is the point: the composer keeps one
 * stable row whether the user is on a CodeBuddy model, on another provider, or
 * has not picked a model yet.
 *
 * - CodeBuddy selection: credit state, then provider, model and (only when the
 *   catalog knows it) the multiplier.
 * - Any other provider: provider and model as the projection spells them. No
 *   credit piece (the figure is CodeBuddy-only) and no multiplier — the generic
 *   DSH ModelCatalog carries no rate field, so inventing one would be a lie.
 * - No selection yet: a single placeholder piece, so the row still has content.
 */
export function buildDockLine(
  selection: CodeBuddyModelSelectionProjection | undefined,
  load: CodeBuddyDockLoad,
): CodeBuddyDockLine {
  const current = currentModelSelection(selection)
  const codeBuddy = isCodeBuddySelection(selection)
  const status = load.phase === 'ok' ? load.value : undefined
  const credits = codeBuddy && status?.status === 'signed-in' ? buildCreditLine(status.credits) : null
  const rate = codeBuddy ? currentCodeBuddyRate(selection, status?.catalog) : null
  const segments: CodeBuddyDockSegment[] = []
  if (codeBuddy) segments.push(creditSegment(load, credits))
  if (current === null) {
    segments.push({ kind: 'copy', key: 'dockNoModel' })
    return { segments, codeBuddy, credits, rate }
  }
  segments.push({
    kind: 'copy',
    key: 'dockProvider',
    params: { provider: codeBuddy ? CODEBUDDY_PROVIDER_LABEL : current.provider },
  })
  segments.push({
    kind: 'copy',
    key: 'dockModel',
    // The catalog's display name reads better than the routing id, but only
    // this plugin's catalog is available here; a foreign model keeps its id.
    params: { model: (codeBuddy ? status?.catalog?.names[current.model] : undefined) ?? current.model },
  })
  if (rate !== null) segments.push({ kind: 'text', text: rate.rate })
  return { segments, codeBuddy, credits, rate }
}

/** Render {@link buildDockLine}'s pieces into the one-line trigger text. */
export function renderDockSegments(
  segments: readonly CodeBuddyDockSegment[],
  t: (key: CodeBuddyCreditKey, params?: Record<string, unknown>) => string,
): string {
  return segments
    .map(segment => segment.kind === 'text' ? segment.text : t(segment.key, segment.params))
    .join(' · ')
}
