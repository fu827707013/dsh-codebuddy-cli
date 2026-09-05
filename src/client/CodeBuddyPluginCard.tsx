/** CodeBuddy status card contributed to Harness Plugin configuration. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { CODEBUDDY_MODELS_PATH, CODEBUDDY_STATUS_PATH } from '../status-paths.ts'
import type { CodeBuddyWebModelBadge, CodeBuddyWebModelSelection, CodeBuddyWebStatus } from '../status-paths.ts'
import type { CodeBuddySettingsKey } from './locales.ts'
import css from './CodeBuddyPluginCard.module.css'

/** Localized copy injected by the browser-plugin registration. */
export interface CodeBuddyPluginCardInjected {
  t: (key: CodeBuddySettingsKey, params?: Record<string, unknown>) => string
}

/** Props delivered by the Plugin configuration item slot. */
export type CodeBuddyPluginCardProps =
  PropsRuntime<'settings.plugin.item'>
  & Partial<CodeBuddyPluginCardInjected>

const POLL_INTERVAL_MS = 60_000

/**
 * Join CSS-module class names, skipping empties. The css-module declaration
 * types every lookup as `string | undefined` under noUncheckedIndexedAccess
 * (the host package sits behind clsx's tolerant signature; this card avoids
 * the extra dependency with the same two-line helper).
 */
function cx(...names: Array<string | undefined>): string {
  return names.filter(name => name !== undefined && name !== '').join(' ')
}

/**
 * Card chrome comes from `CodeBuddyPluginCard.module.css`, which mirrors the
 * host's own `PluginCard.module.css` rule for rule — same tokens, same
 * radius, same paddings, same stroked chevron — so the card reads as part of
 * the Plugin configuration list. This file holds only state and structure.
 */

const quotaTitleStyle: CSSProperties = { margin: '0 0 8px', fontSize: 13, lineHeight: 1.5, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }

/** Localize an upstream promotional badge label, with an unknown-badge fallback. */
function modelBadgeLabel(badge: string, t: CodeBuddyPluginCardInjected['t']): string {
  if (badge === '限时免费') return t('badgeLimitedFree')
  if (badge === '夜间折扣') return t('badgeNightDiscount')
  return badge
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined).format(value)
}

function formatTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms))
}

function progressFillStyle(percent: number): CSSProperties {
  return { width: `${Math.max(0, Math.min(100, percent))}%` }
}

/**
 * One collapsible body section: a summary line that always shows, and detail
 * that folds away.
 *
 * The card body carries three lists whose length is set by the account, not by
 * the design — 12 credit packages and 15 catalog models on this machine — so an
 * always-expanded body scrolled past everything else in Plugin configuration.
 * The summary stays outside the fold on purpose: the credit total is the one
 * figure worth reading at a glance, and hiding it behind a chevron would trade
 * one problem for a worse one.
 *
 * The disclosure is a real button with `aria-expanded`, and the detail is simply
 * absent while collapsed rather than hidden with CSS, so assistive tech and tab
 * order agree with what is on screen.
 */
function Section({ heading, summary, defaultOpen = false, expandLabel, collapseLabel, children }: {
  heading: string
  /** Always-visible right-hand summary, e.g. the credit total. */
  summary?: React.ReactNode
  defaultOpen?: boolean
  expandLabel: string
  collapseLabel: string
  children: React.ReactNode
}): React.ReactNode {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={css.section}>
      <div className={css.bodyRow}>
        <button
          type="button"
          className={css.sectionToggle}
          aria-expanded={open}
          aria-label={`${open ? collapseLabel : expandLabel}: ${heading}`}
          onClick={() => { setOpen(!open) }}
        >
          <IconChevronDownOutline14
            className={open ? cx(css.sectionChevron, css.sectionChevronOpen) : cx(css.sectionChevron)}
          />
          <span className={css.sectionHeading}>{heading}</span>
        </button>
        {summary === undefined ? null : <span className={css.bodyText}>{summary}</span>}
      </div>
      {open ? children : null}
    </div>
  )
}

function statusDotClass(status: CodeBuddyWebStatus['status']): string {
  if (status === 'signed-in') return cx(css.statusDotSignedIn)
  if (status === 'error') return cx(css.statusDotError)
  return cx(css.statusDotSignedOut)
}

/** One billing package as a labeled progress bar. */
function CreditBar({ label, remain, size, t }: {
  label: string
  remain: number
  size: number
  t: CodeBuddyPluginCardInjected['t']
}): React.ReactNode {
  const detail = size > 0 ? t('exactRemaining', { remain: formatNumber(remain), size: formatNumber(size) }) : t('creditPackageUnknownSize', { remain: formatNumber(remain) })
  const percent = size > 0 ? (remain / size) * 100 : 100
  const display = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(percent)
  return (
    <div>
      <div className={css.quotaLabel}>
        <span>{label}</span>
        <span>{t('percentRemaining', { percent: display })}</span>
      </div>
      <div
        className={css.progressTrack}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className={css.progressFill} style={progressFillStyle(percent)} />
      </div>
      <p className={css.bodyText}>{detail}</p>
    </div>
  )
}

/**
 * One model offer row: name, promotional badges, and the billing rate.
 *
 * The rate sits under the name rather than beside it because the row already
 * spends its horizontal budget on badges; stacking keeps long model names and
 * several badges from squeezing the rate into an ellipsis.
 */
function ModelOfferRow({ model, t }: {
  model: CodeBuddyWebModelBadge
  t: CodeBuddyPluginCardInjected['t']
}): React.ReactNode {
  return (
    <div>
      <div className={css.quotaLabel}>
        <span>{model.name}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {model.badges?.map(badge => (
            <span key={badge} className={css.badge}>{modelBadgeLabel(badge, t)}</span>
          ))}
          {model.free === true ? <span className={css.badge}>{t('freeModel')}</span> : null}
        </span>
      </div>
      {model.credits === undefined ? null : <span className={css.bodyText}>{t('rate', { rate: model.credits })}</span>}
    </div>
  )
}

/**
 * The enabled-model checkbox list.
 *
 * The draft lives here rather than in the parent's status state because the
 * card polls the status route every minute while open: folding the selection
 * into that polled document would overwrite a half-made choice each time a poll
 * landed. The draft seeds from the Host's answer, survives polls, and is
 * re-seeded only when the user saves or the Host's own selection changes.
 */
function ModelSelection({ selection, onSaved, t }: {
  selection: CodeBuddyWebModelSelection
  /** Ask the card to re-read the status document after a landed write. */
  onSaved?: () => void
  t: CodeBuddyPluginCardInjected['t']
}): React.ReactNode {
  // The Host's selection as a stable key: a poll that reports the same
  // selection must not disturb a draft, while an actual change re-seeds it.
  const hostKey = selection.choices.filter(choice => choice.enabled).map(choice => choice.id).join(',')
  const [draft, setDraft] = useState<readonly string[]>(() =>
    selection.choices.filter(choice => choice.enabled).map(choice => choice.id))
  const [seeded, setSeeded] = useState(hostKey)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // The Host key this card's own last write should produce. Without it, the
  // re-seed below would clear the "saved" note the instant the write landed —
  // the confirmation would flash and vanish on the refresh that proves it
  // worked. A key that arrives without matching this is somebody else's edit.
  const [savedKey, setSavedKey] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  if (seeded !== hostKey) {
    // Re-seed from a genuinely changed Host answer (another surface wrote the
    // section, or our own save landed) during render, so the list never shows a
    // draft that the document already contradicts.
    setSeeded(hostKey)
    setDraft(selection.choices.filter(choice => choice.enabled).map(choice => choice.id))
    setSaved(hostKey === savedKey)
  }

  const checked = new Set(draft)
  // Saving an all-checked list would freeze today's roster into an allowlist,
  // so "everything" is stored as the empty (unrestricted) selection instead —
  // new upstream models then appear on their own.
  const all = selection.choices.length
  const wire: readonly string[] = draft.length === all ? [] : draft
  const stored = selection.choices.filter(choice => choice.enabled).map(choice => choice.id)
  const dirty = selection.restricted
    ? draft.length !== stored.length || draft.some(id => !stored.includes(id))
    : draft.length !== all

  const toggle = (id: string): void => {
    setSaved(false)
    setError(undefined)
    setDraft(current => current.includes(id) ? current.filter(entry => entry !== id) : [...current, id])
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    setError(undefined)
    try {
      const response = await fetch(CODEBUDDY_MODELS_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ enabledModels: wire }),
      })
      if (!response.ok) {
        const detail: unknown = await response.json().catch(() => undefined)
        const message = typeof (detail as { error?: unknown } | undefined)?.error === 'string'
          ? (detail as { error: string }).error
          : `HTTP ${String(response.status)}`
        throw new Error(message)
      }
      // The write route answers with the resulting selection, so the key this
      // save will produce is read from the Host's own answer rather than
      // predicted from the draft.
      const body: unknown = await response.json().catch(() => undefined)
      const landed = (body as { selection?: CodeBuddyWebModelSelection } | undefined)?.selection
      setSavedKey(landed === undefined
        ? undefined
        : landed.choices.filter(choice => choice.enabled).map(choice => choice.id).join(','))
      setSaved(true)
      // Re-read the status document now: the card otherwise polls once a minute,
      // which left the save button live and the confirmation missing until the
      // next tick even though the write had landed.
      onSaved?.()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'))
    } finally {
      setSaving(false)
    }
  }

  const disabled = !selection.writable || saving
  // The heading and the enabled/total count belong to the enclosing Section's
  // always-visible summary line, so this body starts at the hint.
  return (
    <div className={css.quotaList}>
      <p className={css.bodyText} style={{ margin: 0 }}>
        {selection.restricted ? t('optionalModelsHint') : t('optionalModelsAllHint')}
      </p>
      <div className={css.choiceList}>
        {selection.choices.map(choice => (
          <label
            key={choice.id}
            className={disabled ? cx(css.choiceRow, css.choiceRowDisabled) : cx(css.choiceRow)}
          >
            <input
              type="checkbox"
              className={css.choiceBox}
              checked={checked.has(choice.id)}
              disabled={disabled}
              onChange={() => { toggle(choice.id) }}
            />
            <span className={css.choiceName}>{choice.name}</span>
            <span className={css.choiceMeta}>
              {choice.badges?.map(badge => (
                <span key={badge} className={css.badge}>{modelBadgeLabel(badge, t)}</span>
              ))}
              {choice.credits === undefined ? null : <span>{choice.credits}</span>}
            </span>
          </label>
        ))}
      </div>
      <div className={css.choiceActions}>
        <button
          type="button"
          className={css.choiceSave}
          disabled={disabled || !dirty}
          onClick={() => { void save() }}
        >
          {saving ? t('optionalModelsSaving') : t('optionalModelsSave')}
        </button>
        <button
          type="button"
          className={css.refresh}
          disabled={disabled || draft.length === all}
          onClick={() => {
            setSaved(false)
            setDraft(selection.choices.map(choice => choice.id))
          }}
        >
          {t('optionalModelsSelectAll')}
        </button>
        <button
          type="button"
          className={css.refresh}
          disabled={disabled || draft.length === 0}
          onClick={() => {
            setSaved(false)
            setDraft([])
          }}
        >
          {t('optionalModelsClear')}
        </button>
        {saved && !dirty ? <span className={css.bodyText} style={{ margin: 0 }}>{t('optionalModelsSaved')}</span> : null}
      </div>
      {!selection.writable ? <p className={css.bodyText}>{t('optionalModelsReadOnly')}</p> : null}
      {selection.writable && draft.length === 0
        ? <p className={css.bodyText}>{t('optionalModelsEmptyWarning')}</p>
        : null}
      {error === undefined ? null : <p className={css.bodyError}>{t('optionalModelsSaveFailed', { message: error })}</p>}
    </div>
  )
}

/** Render CodeBuddy sign-in state and credit as one expandable card. */
export function CodeBuddyPluginCard({ t }: CodeBuddyPluginCardProps) {
  if (t === undefined) throw new Error('CodeBuddy plugin card requires its translation function')
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<CodeBuddyWebStatus>({ status: 'signed-out' })
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const refresh = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const response = await fetch(CODEBUDDY_STATUS_PATH, {
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
        ...signal === undefined ? {} : { signal },
      })
      const value: unknown = await response.json().catch(() => undefined)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (mounted.current && signal?.aborted !== true) setStatus(value as CodeBuddyWebStatus)
    } catch (error: unknown) {
      if (mounted.current && signal?.aborted !== true) {
        setStatus({ status: 'error', message: error instanceof Error ? error.message : t('requestFailed') })
      }
    }
  }, [t])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => { controller.abort() }
  }, [open, refresh])

  useEffect(() => {
    if (!open || status.status !== 'signed-in') return
    const controller = new AbortController()
    const timer = window.setInterval(() => { void refresh(controller.signal) }, POLL_INTERVAL_MS)
    return () => {
      window.clearInterval(timer)
      controller.abort()
    }
  }, [open, refresh, status.status])

  const manualRefresh = async (): Promise<void> => {
    setBusy(true)
    try {
      await refresh()
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const title = t('title')
  const label = status.status === 'signed-in'
    ? status.nickname === undefined ? t('signedInAs', { nickname: '' }).replace(/[:：]\s*$/, '') : t('signedInAs', { nickname: status.nickname })
    : status.status === 'error'
      ? t('requestFailed')
      : t('signedOut')

  return (
    <li className={open ? cx(css.card, css.cardOpen) : cx(css.card)}>
      <button
        type="button"
        className={css.header}
        aria-expanded={open}
        aria-label={`${t(open ? 'collapse' : 'expand')}: ${title}`}
        onClick={() => { setOpen(!open) }}
      >
        <span className={css.headText}>
          <span className={css.name}>{title}</span>
          <span className={css.description}>{t('intro')}</span>
        </span>
        <IconChevronDownOutline14 className={open ? cx(css.chevron, css.chevronOpen) : cx(css.chevron)} />
      </button>
      {open
        ? <div className={css.body}>
            <div className={css.bodyBlock}>
              <h3 style={quotaTitleStyle}>{t('accountHeading')}</h3>
              <div className={css.bodyRow}>
                <span className={css.statusLine} role="status">
                  <span aria-hidden="true" className={cx(css.statusDot, statusDotClass(status.status))} />
                  <span>{label}</span>
                </span>
                <button type="button" className={css.refresh} disabled={busy} onClick={() => { void manualRefresh() }}>
                  {busy ? t('refreshing') : t('refresh')}
                </button>
              </div>
              {status.status === 'signed-in'
                ? <>
                    {status.expiresAt === undefined ? null
                      : <p className={css.bodyText}>{t('accessTokenExpires', { time: formatTime(status.expiresAt) })}</p>}
                    {/* Model selection leads the body: it is the only block
                        here the user acts on, so it sits above the read-only
                        credit and promo reports rather than below them. */}
                    {status.selection === undefined ? null : (
                      <Section
                        heading={t('optionalModelsHeading')}
                        summary={t('optionalModelsCount', {
                          enabled: String(status.selection.choices.filter(choice => choice.enabled).length),
                          total: String(status.selection.choices.length),
                        })}
                        expandLabel={t('expand')}
                        collapseLabel={t('collapse')}
                      >
                        <ModelSelection
                          selection={status.selection}
                          onSaved={() => { void refresh() }}
                          t={t}
                        />
                      </Section>
                    )}
                    {status.credits === undefined ? null : (
                      <Section
                        heading={t('creditsHeading')}
                        // The total rides the summary line, so it stays readable
                        // while the twelve package bars behind it stay folded.
                        summary={t('creditsTotal', { total: formatNumber(status.credits.total) })}
                        expandLabel={t('expand')}
                        collapseLabel={t('collapse')}
                      >
                        <div className={css.quotaList}>
                          {status.credits.accounts
                            .filter(account => account.remain > 0)
                            .map((account, index) => (
                            <CreditBar
                              key={`${account.packageName}-${String(index)}`}
                              label={account.packageName}
                              remain={account.remain}
                              size={account.size}
                              t={t}
                            />
                          ))}
                        </div>
                      </Section>
                    )}
                    {status.creditsError === undefined ? null
                      : <p className={css.bodyError}>{t('creditsError', { message: status.creditsError })}</p>}
                    {status.models === undefined || status.models.length === 0 ? null : (
                      <Section
                        heading={t('modelsHeading')}
                        summary={t('modelsOnPromo', { count: String(status.models.length) })}
                        expandLabel={t('expand')}
                        collapseLabel={t('collapse')}
                      >
                        <div className={css.quotaList}>
                          {status.models.map(model => <ModelOfferRow key={model.id} model={model} t={t} />)}
                        </div>
                      </Section>
                    )}
                  </>
                : null}
              {status.status === 'signed-out' ? <p className={css.bodyText}>{t('signedOutHint')}</p> : null}
              {status.status === 'error' ? <p className={css.bodyError}>{status.message}</p> : null}
            </div>
          </div>
        : null}
    </li>
  )
}
