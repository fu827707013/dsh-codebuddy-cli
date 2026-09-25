/** CodeBuddy status card contributed to Harness Plugin configuration. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
// DSH 0.1.7 renamed the icon exports: the old `…Outline14` size suffix is gone
// and icons now come in `…OutlineRegular` (1px stroke) / `…OutlineMedium`
// (1.3px stroke) variants. Importing the retired name yields `undefined`, which
// React rejects as an invalid element type (error #130) and the whole card
// renders as an empty tab. `Regular` is the current 14px-weight default and is
// what the host's own plugins use.
import { IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import {
  CODEBUDDY_MODELS_PATH,
  CODEBUDDY_STATUS_PATH,
} from '../status-paths.ts'
import type {
  CodeBuddyWebModelBadge,
  CodeBuddyWebModelSelection,
  CodeBuddyWebStatus,
} from '../status-paths.ts'
import type { CodeBuddySettingsKey } from './locales.ts'
import css from './CodeBuddyPluginCard.module.css'
import { AccountCards } from './AccountCard.tsx'
import { CreditStatsPanel, AccountFilterMenu } from './CreditStatsPanel.tsx'

/** Localized copy injected by the browser-plugin registration. */
export interface CodeBuddyPluginCardInjected {
  t: (key: CodeBuddySettingsKey, params?: Record<string, unknown>) => string
}

/**
 * Props delivered by the plugin-configuration tab.
 *
 * The slot is a keyed list whose owner contributes nothing, and DSH renamed it
 * from `settings.plugin.item` to `settings.plugins.tab` in 0.1.7 while declaring
 * no shared props for either name. Typing against the root slot therefore keeps
 * one bundle building against both generations; the injected locale copy stays
 * optional so a host that omits it still renders its own defaults.
 */
export type CodeBuddyPluginCardProps =
  PropsRuntime<'root'>
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

function progressFillStyle(percent: number): CSSProperties {
  return { width: `${Math.max(0, Math.min(100, percent))}%` }
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
  const hostKey = selection.choices.filter(choice => choice.enabled).map(choice => choice.id).join(',')
  const [draft, setDraft] = useState<readonly string[]>(() =>
    selection.choices.filter(choice => choice.enabled).map(choice => choice.id))
  const [seeded, setSeeded] = useState(hostKey)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedKey, setSavedKey] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  if (seeded !== hostKey) {
    setSeeded(hostKey)
    setDraft(selection.choices.filter(choice => choice.enabled).map(choice => choice.id))
    setSaved(hostKey === savedKey)
  }

  const checked = new Set(draft)
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
      const body: unknown = await response.json().catch(() => undefined)
      const landed = (body as { selection?: CodeBuddyWebModelSelection } | undefined)?.selection
      setSavedKey(landed === undefined
        ? undefined
        : landed.choices.filter(choice => choice.enabled).map(choice => choice.id).join(','))
      setSaved(true)
      onSaved?.()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'))
    } finally {
      setSaving(false)
    }
  }

  const disabled = !selection.writable || saving
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

/** The horizontal tab names rendered in the card body. */
type CardTab = 'accounts' | 'models' | 'stats' | 'remaining'

/** Render CodeBuddy sign-in state and the tabbed panel as one expandable card. */
export function CodeBuddyPluginCard({ t }: CodeBuddyPluginCardProps) {
  if (t === undefined) throw new Error('CodeBuddy plugin card requires its translation function')
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<CardTab>('accounts')
  const [status, setStatus] = useState<CodeBuddyWebStatus>({ status: 'signed-out' })
  const [busy, setBusy] = useState(false)
  const [remainingAccount, setRemainingAccount] = useState<string | null>(null)
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

  // Stable callback for child panels (AccountCards / CreditStatsPanel). Without
  // this, every parent render rebuilds the inline arrow, which re-triggers the
  // children's fetch/effect cycles (stats panel re-loads, login poll restarts).
  const handleChanged = useCallback((): void => { void refresh() }, [refresh])

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
  const accounts = 'accounts' in status && status.accounts !== undefined ? status.accounts : []
  const signedIn = status.status === 'signed-in'
  // Remaining-credit tab: pick one account to inspect (defaults to the first).
  const remainingOptions = accounts.map(account => ({ accountId: account.id, accountName: account.nickname ?? account.uid ?? account.id }))
  const effectiveRemainingAccount = remainingAccount !== null && accounts.some(a => a.id === remainingAccount)
    ? remainingAccount
    : (accounts[0]?.id ?? null)
  const remainingCredits = effectiveRemainingAccount !== null
    ? accounts.find(a => a.id === effectiveRemainingAccount)?.credits
    : undefined

  const tabs: { key: CardTab; label: string }[] = [
    { key: 'accounts', label: t('tabAccounts') },
    { key: 'models', label: t('tabModels') },
    { key: 'stats', label: t('tabCreditStats') },
    { key: 'remaining', label: t('tabRemaining') },
  ]

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
        <IconChevronDownOutlineRegular className={open ? cx(css.chevron, css.chevronOpen) : cx(css.chevron)} />
      </button>
      {open
        ? <div className={css.body}>
            <div className={css.bodyBlock}>
              <div className={css.bodyRow}>
                <span className={css.statusLine} role="status">
                  <span aria-hidden="true" className={cx(css.statusDot,
                    status.status === 'signed-in' ? css.statusDotSignedIn
                      : status.status === 'error' ? css.statusDotError
                        : css.statusDotSignedOut)} />
                  <span>
                    {signedIn
                      ? (status.nickname === undefined ? t('signedInAs', { nickname: '' }).replace(/[:：]\s*$/, '') : t('signedInAs', { nickname: status.nickname }))
                      : status.status === 'error'
                        ? t('requestFailed')
                        : t('signedOut')}
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button type="button" className={css.refresh} disabled={busy} onClick={() => { void manualRefresh() }}>
                    {busy ? t('refreshing') : t('refresh')}
                  </button>
                </span>
              </div>
              {signedIn && status.expiresAt !== undefined
                ? <p className={css.bodyText}>
                    {t('accessTokenExpires', { time: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(status.expiresAt)) })}
                  </p>
                : null}

              {/* Horizontal tab bar */}
              <div className={css.tabBar} role="tablist" aria-label={t('accountPanelHeading')}>
                {tabs.map(item => (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === item.key}
                    className={cx(css.tab, tab === item.key ? css.tabActive : undefined)}
                    onClick={() => { setTab(item.key) }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {tab === 'accounts' ? (
                <div role="tabpanel">
                  <AccountCards
                    accounts={accounts}
                    onChanged={handleChanged}
                    t={t as unknown as import('./AccountCard.tsx').AccountCardInjected['t']}
                  />
                </div>
              ) : null}

              {tab === 'models' ? (
                <div role="tabpanel">
                  <h3 style={quotaTitleStyle}>{t('modelsHeading')}</h3>
                  {signedIn && status.selection !== undefined ? (
                    <ModelSelection selection={status.selection} onSaved={() => { void refresh() }} t={t} />
                  ) : null}
                  {signedIn && status.models !== undefined && status.models.length > 0 ? (
                    <div className={css.quotaList}>
                      {status.models.map(model => <ModelOfferRow key={model.id} model={model} t={t} />)}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {tab === 'stats' ? (
                <div role="tabpanel">
                  <CreditStatsPanel
                    accounts={accounts}
                    onChanged={handleChanged}
                    t={t as unknown as import('./CreditStatsPanel.tsx').CreditStatsPanelInjected['t']}
                  />
                </div>
              ) : null}

              {tab === 'remaining' ? (
                <div role="tabpanel">
                  <h3 style={quotaTitleStyle}>{t('creditsHeading')}</h3>
                  {signedIn && accounts.length > 1 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px' }}>
                      <AccountFilterMenu
                        accounts={remainingOptions}
                        accountFilter={effectiveRemainingAccount}
                        onAccountFilterChange={setRemainingAccount}
                        t={t as unknown as import('./CreditStatsPanel.tsx').CreditStatsPanelInjected['t']}
                        ariaLabel={t('creditsFilterAccount')}
                        allowAll={false}
                      />
                    </div>
                  ) : null}
                  {signedIn && remainingCredits !== undefined ? (
                    <div className={css.quotaList}>
                      {remainingCredits.accounts
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
                  ) : null}
                  {signedIn && effectiveRemainingAccount !== null && remainingCredits === undefined ? (
                    <p className={css.bodyText}>{t('creditLoading')}</p>
                  ) : null}
                  {signedIn && effectiveRemainingAccount !== null && remainingCredits !== undefined && remainingCredits.accounts.length === 0
                    ? <p className={css.bodyText}>{t('creditEmpty')}</p>
                    : null}
                </div>
              ) : null}
            </div>
          </div>
        : null}
    </li>
  )
}
