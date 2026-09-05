/** CodeBuddy status card contributed to Harness Plugin configuration. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { CODEBUDDY_STATUS_PATH } from '../status-paths.ts'
import type { CodeBuddyWebModelBadge, CodeBuddyWebStatus } from '../status-paths.ts'
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
                    {status.credits === undefined ? null : (
                      <div className={css.quotaList}>
                        <div className={css.bodyRow}>
                          <h3 style={quotaTitleStyle}>{t('creditsHeading')}</h3>
                          <span className={css.bodyText}>{t('creditsTotal', { total: formatNumber(status.credits.total) })}</span>
                        </div>
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
                    )}
                    {status.creditsError === undefined ? null
                      : <p className={css.bodyError}>{t('creditsError', { message: status.creditsError })}</p>}
                    {status.models === undefined || status.models.length === 0 ? null : (
                      <div className={css.quotaList}>
                        <h3 style={quotaTitleStyle}>{t('modelsHeading')}</h3>
                        {status.models.map(model => <ModelOfferRow key={model.id} model={model} t={t} />)}
                      </div>
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
