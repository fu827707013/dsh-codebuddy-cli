/**
 * Account card (workbuddy-switch style) and the OAuth sign-in entry point.
 *
 * Each stored CodeBuddy account renders as one card: an avatar block, the
 * display name with a masked identity, status chips (checked-in, token
 * expired, suggested priority), the aggregated credit total with the number
 * of packages and a refresh time, the soon-to-expire resource bars with
 * expiry dates and progress, and a footer with "set as current" (or the
 * active pill). The card also opens an "all packages" dialog and a small
 * action menu (refresh token / manual check-in / delete).
 *
 * The account grid header carries the "OAuth sign in to add account" button,
 * which starts the polling login and opens the auth URL in a new tab.
 *
 * @module dsh-codebuddy-cli/client/account-card
 */

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  CODEBUDDY_CHECKIN_PATH,
  CODEBUDDY_DELETE_ACCOUNT_PATH,
  CODEBUDDY_LOGIN_POLL_PATH,
  CODEBUDDY_LOGIN_START_PATH,
  CODEBUDDY_SWITCH_ACCOUNT_PATH,
} from '../status-paths.ts'
import type {
  CodeBuddyCheckInOutcome,
  CodeBuddyLoginPollResult,
  CodeBuddyLoginStartResult,
  CodeBuddyWebAccount,
  CodeBuddyWebCredits,
} from '../status-paths.ts'
import type { CodeBuddySettingsKey } from './locales.ts'
import css from './CodeBuddyPluginCard.module.css'

/** Localized copy injected by the browser-plugin registration. */
export interface AccountCardInjected {
  t: (key: CodeBuddySettingsKey, params?: Record<string, unknown>) => string
}

/** Avatar color tones (deterministic from the display name). */
const AVATAR_TONES = [
  'rgba(16, 185, 129, 0.14)',
  'rgba(139, 92, 246, 0.14)',
  'rgba(14, 165, 233, 0.14)',
  'rgba(245, 158, 11, 0.14)',
  'rgba(244, 63, 94, 0.14)',
  'rgba(13, 148, 136, 0.14)',
]

function avatarTone(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_TONES[hash % AVATAR_TONES.length] as string
}

function cx(...names: Array<string | undefined>): string {
  return names.filter(name => name !== undefined && name !== '').join(' ')
}

/** Format a number with thousands separators. */
function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined).format(value)
}

/** Format an epoch-ms date as `MM/DD 到期` or `长期有效`. */
function formatExpiry(expireAtMs: number | undefined): string {
  if (expireAtMs === undefined) return ''
  const date = new Date(expireAtMs)
  if (Number.isNaN(date.getTime())) return ''
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${mm}/${dd}`
}

/** Format a full date for the packages dialog. */
function formatFullDate(expireAtMs: number | undefined): string {
  if (expireAtMs === undefined) return ''
  const date = new Date(expireAtMs)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
}

/** Resource packages with remaining > 0, sorted by expiry (earliest first). */
function usableResources(credits: CodeBuddyWebCredits | undefined) {
  if (credits === undefined) return []
  return credits.accounts
    .filter(account => account.remain > 0)
    .map((account, index) => ({ account, index }))
    .sort((left, right) => {
      const le = left.account.expireAtMs ?? Number.POSITIVE_INFINITY
      const re = right.account.expireAtMs ?? Number.POSITIVE_INFINITY
      return le === re ? left.index - right.index : le - re
    })
    .map(entry => entry.account)
}

/** One resource bar row: remaining chip, name, expiry, progress. */
function ResourceBar({ resource, t }: {
  resource: { packageName: string; remain: number; total: number; size: number; expireAtMs?: number; expired: boolean; expiringSoon: boolean }
  t: AccountCardInjected['t']
}): React.ReactNode {
  const percent = resource.total > 0 ? Math.max(0, Math.min(100, (resource.remain / resource.total) * 100)) : 0
  const expiryClass = resource.expired
    ? css.accountCardResourceExpiryExpired
    : resource.expiringSoon
      ? css.accountCardResourceExpirySoon
      : undefined
  const expiryText = resource.expired
    ? t('accountCardExpired')
    : resource.expiringSoon
      ? t('accountCardExpiresIn7d')
      : resource.expireAtMs !== undefined
        ? t('accountCardExpiresAt', { date: formatExpiry(resource.expireAtMs) })
        : t('accountCardLongLived')
  return (
    <div className={css.accountCardResource}>
      <div className={css.accountCardResourceRow}>
        <span className={css.accountCardResourceRemain}>{formatNumber(resource.remain)}</span>
        <span className={css.accountCardResourceName} title={resource.packageName}>{resource.packageName}</span>
        <span className={cx(css.accountCardResourceExpiry, expiryClass)}>{expiryText}</span>
      </div>
      <div className={css.progressTrack} style={{ marginTop: 4 }} role="progressbar" aria-label={resource.packageName}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className={css.progressFill} style={{ width: `${percent}%`, ...(resource.expiringSoon || resource.expired ? { background: 'var(--dsw-alias-state-warning-primary, #d97706)' } : {}) }} />
      </div>
    </div>
  )
}

/** Small status chip (badge). */
function Chip({ tone, children }: { tone: 'neutral' | 'success' | 'warning' | 'danger'; children: React.ReactNode }): React.ReactNode {
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    padding: '1px 8px',
    borderRadius: 999,
    fontSize: 11,
    lineHeight: '17px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  }
  if (tone === 'success') {
    style.background = 'color-mix(in srgb, var(--dsw-alias-state-success-primary, #22a06b) 12%, transparent)'
    style.color = 'var(--dsw-alias-state-success-primary, #22a06b)'
  } else if (tone === 'warning') {
    style.background = 'color-mix(in srgb, var(--dsw-alias-state-warning-primary, #d97706) 12%, transparent)'
    style.color = 'var(--dsw-alias-state-warning-primary, #d97706)'
  } else if (tone === 'danger') {
    style.background = 'color-mix(in srgb, var(--dsw-alias-label-error) 12%, transparent)'
    style.color = 'var(--dsw-alias-label-error)'
  } else {
    style.background = 'var(--dsw-alias-bg-layer-3)'
    style.color = 'var(--dsw-alias-label-secondary)'
  }
  return <span style={style}>{children}</span>
}

/** Account card component. */
function AccountCard({ account, onChanged, t }: {
  account: CodeBuddyWebAccount
  onChanged: () => void
  t: AccountCardInjected['t']
}): React.ReactNode {
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuError, setMenuError] = useState<string | undefined>(undefined)
  const [checkInNote, setCheckInNote] = useState<CodeBuddyCheckInOutcome | undefined>(undefined)
  const mounted = useRef(true)
  const name = account.nickname ?? account.uid ?? t('accountCardUnnamed')
  const expired = account.expiresAtMs > 0 && account.expiresAtMs < Date.now()
  const resources = usableResources(account.credits)
  const visible = resources.slice(0, 2)
  const all = resources
  const avatarStyle: CSSProperties = { background: avatarTone(name), color: 'var(--dsw-alias-label-primary)' }

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const run = async (path: string, body: unknown): Promise<void> => {
    setBusy(true)
    setMenuError(undefined)
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const detail: unknown = await response.json().catch(() => undefined)
        const message = typeof (detail as { error?: unknown } | undefined)?.error === 'string'
          ? (detail as { error: string }).error
          : `HTTP ${String(response.status)}`
        throw new Error(message)
      }
      onChanged()
    } catch (cause: unknown) {
      if (mounted.current) setMenuError(cause instanceof Error ? cause.message : t('requestFailed'))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const runCheckIn = async (): Promise<void> => {
    setBusy(true)
    setMenuError(undefined)
    setCheckInNote(undefined)
    try {
      const response = await fetch(CODEBUDDY_CHECKIN_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id: account.id }),
      })
      const body: unknown = await response.json().catch(() => undefined)
      if (!response.ok) {
        const detail = typeof (body as { error?: unknown } | undefined)?.error === 'string'
          ? (body as { error: string }).error
          : `HTTP ${String(response.status)}`
        throw new Error(detail)
      }
      if (mounted.current) setCheckInNote(body as CodeBuddyCheckInOutcome)
      onChanged()
    } catch (cause: unknown) {
      if (mounted.current) setMenuError(cause instanceof Error ? cause.message : t('requestFailed'))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const checkInFeedback = (): React.ReactNode => {
    if (checkInNote === undefined) return null
    if (checkInNote.status === 'ok' || checkInNote.status === 'already') {
      return <span className={css.accountCardCheckInOk}>{t(checkInNote.status === 'ok' ? 'checkInSuccess' : 'checkInAlready')}</span>
    }
    return <span className={css.accountCardCheckInFail}>{t('checkInFailed', { message: checkInNote.message })}</span>
  }

  return (
    <article className={css.accountCard}>
      <header className={cx(css.accountCardHeader, account.active ? css.accountCardActiveHeader : undefined)}>
        <div className={css.accountAvatar} style={avatarStyle}>{name.charAt(0).toUpperCase()}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 className={css.accountCardName} title={name}>{name}</h3>
          <div className={css.accountCardChips}>
            {account.checkedInToday === true ? (
              <Chip tone="success">{t('accountCardCheckedIn')}</Chip>
            ) : account.checkedInToday === false ? (
              <Chip tone="neutral">{t('accountCardNotCheckedIn')}</Chip>
            ) : null}
            {expired ? <Chip tone="danger">{t('accountCardTokenExpired')}</Chip> : null}
          </div>
        </div>
        <div style={{ position: 'relative', flex: 'none' }}>
          <button
            type="button"
            className={css.refresh}
            aria-label={t('accountCardMore')}
            title={t('accountCardMore')}
            onClick={() => { setMenuOpen(!menuOpen) }}
            style={{ padding: '4px 8px' }}
          >
            ⋯
          </button>
          {menuOpen ? (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 50,
              minWidth: 150, padding: 4, borderRadius: 10,
              background: 'var(--dsw-specific-menu, var(--dsw-alias-bg-layer-1, #fff))',
              boxShadow: 'var(--dsw-elevation-prominent, 0 8px 24px rgba(0,0,0,0.16)), 0 0 0 1px var(--dsw-alias-border-l1, rgba(0,0,0,0.06))',
              fontSize: 12, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)',
            }}>
              <button type="button" disabled={busy} onClick={() => { setMenuOpen(false); void run(CODEBUDDY_SWITCH_ACCOUNT_PATH, { id: account.id }) }} style={{ ...menuItemStyle }}>
                {t('accountCardSetActive')}
              </button>
              {account.checkedInToday !== true ? (
                <button type="button" disabled={busy} onClick={() => { setMenuOpen(false); void runCheckIn() }} style={{ ...menuItemStyle }}>
                  {t('accountCardCheckIn')}
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setMenuOpen(false)
                  if (window.confirm(t('accountConfirmDelete'))) {
                    void run(CODEBUDDY_DELETE_ACCOUNT_PATH, { id: account.id })
                  }
                }}
                style={{ ...menuItemStyle, color: 'var(--dsw-alias-label-error)' }}
              >
                {t('accountCardDelete')}
              </button>
              {menuError !== undefined ? <div style={{ padding: '4px 8px', color: 'var(--dsw-alias-label-error)' }}>{menuError}</div> : null}
            </div>
          ) : null}
        </div>
      </header>

      <section className={css.accountCardBody}>
        {account.creditError !== undefined ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--dsw-alias-label-error)' }}>
            {t('accountCardCreditError')}: {account.creditError}
          </div>
        ) : account.credits === undefined ? (
          <div style={{ fontSize: 13, color: 'var(--dsw-alias-label-secondary)' }}>{t('accountCardCreditWaiting')}</div>
        ) : (
          <>
            <div className={css.accountCardCreditRow}>
              <span className={css.accountCardCreditTotal}>{formatNumber(account.credits.total)}</span>
              <span className={css.accountCardCreditMeta}>
                {t('accountCardPackageCount', { count: String(account.credits.accounts.length) })}
              </span>
              {account.creditUpdatedAtMs !== undefined ? (
                <span className={css.accountCardCreditUpdated}>
                  {t('accountCardUpdatedAt', { time: formatTime(account.creditUpdatedAtMs) })}
                </span>
              ) : null}
            </div>
            <div>
              <div className={css.accountCardSectionLabel}>{t('accountCardExpiringSoon')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                {visible.length > 0 ? visible.map((resource, index) => (
                  <ResourceBar
                    key={`${resource.packageName}-${String(index)}`}
                    resource={resource}
                    t={t}
                  />
                )) : <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>{t('accountCardNoCredit')}</div>}
              </div>
            </div>
            {all.length > 2 ? (
              <button type="button" className={css.accountCardViewAll} onClick={() => { setResourcesOpen(true) }}>
                {t('accountCardViewAll')} →
              </button>
            ) : null}
          </>
        )}
      </section>

      <footer className={css.accountCardFooter}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          {checkInFeedback()}
          {account.checkedInToday !== true ? (
            <button
              type="button"
              className={css.refresh}
              disabled={busy}
              onClick={() => { void runCheckIn() }}
            >
              {busy ? t('checkingIn') : t('accountCardCheckIn')}
            </button>
          ) : null}
        </div>
        {account.active ? (
          <span className={css.accountCardActivePill}>{t('accountCardActive')}</span>
        ) : (
          <button
            type="button"
            className={css.refresh}
            disabled={busy}
            onClick={() => { void run(CODEBUDDY_SWITCH_ACCOUNT_PATH, { id: account.id }) }}
          >
            {t('accountCardSetActive')}
          </button>
        )}
      </footer>

      {resourcesOpen ? (
        <div style={dialogBackdropStyle} onClick={() => { setResourcesOpen(false) }}>
          <div style={dialogStyle} role="dialog" aria-label={t('accountCardAllPackages')} onClick={event => event.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }}>
              {t('accountCardAllPackages')}
            </h3>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
              {t('accountCardPackagesOf', { name, count: String(all.length) })}
            </p>
            {all.length === 0 ? (
              <div style={{ padding: '12px 0', textAlign: 'center', fontSize: 13, color: 'var(--dsw-alias-label-secondary)' }}>
                {t('accountCardNoCredit')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '60vh', overflowY: 'auto' }}>
                {all.map((resource, index) => {
                  const percent = resource.total > 0 ? Math.max(0, Math.min(100, (resource.remain / resource.total) * 100)) : 0
                  const expiryText = resource.expired
                    ? t('accountCardExpired')
                    : resource.expiringSoon
                      ? t('accountCardExpiresIn7d')
                      : resource.expireAtMs !== undefined
                        ? t('accountCardExpiresAt', { date: formatFullDate(resource.expireAtMs) })
                        : t('accountCardLongLived')
                  return (
                    <div key={`${resource.packageName}-${String(index)}`}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resource.packageName}</div>
                          <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginTop: 2 }}>{expiryText}</div>
                        </div>
                        <div style={{ flex: 'none', textAlign: 'right', fontSize: 12 }}>
                          <div style={{ fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }}>{formatNumber(resource.remain)} / {formatNumber(resource.total)}</div>
                          <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginTop: 2 }}>{t('accountCardUsed', { used: formatNumber(resource.used) })}</div>
                        </div>
                      </div>
                      <div className={css.progressTrack} style={{ marginTop: 6 }}>
                        <div className={css.progressFill} style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <button type="button" className={css.choiceSave} style={{ marginTop: 14 }} onClick={() => { setResourcesOpen(false) }}>
              {t('collapse')}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  )
}

const menuItemStyle: CSSProperties = {
  appearance: 'none', border: 0, background: 'none', font: 'inherit', cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '5px 8px',
  borderRadius: 6, fontSize: 12, color: 'var(--dsw-alias-label-secondary)', textAlign: 'left',
}
const dialogBackdropStyle: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
}
const dialogStyle: CSSProperties = {
  boxSizing: 'border-box', width: 'min(440px, 100%)', padding: 18, borderRadius: 14,
  background: 'var(--dsw-specific-menu, var(--dsw-alias-bg-layer-1, #fff))',
  boxShadow: 'var(--dsw-elevation-prominent, 0 8px 24px rgba(0,0,0,0.16))',
  fontSize: 12, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)',
}

/** Format an epoch-ms time as `HH:MM`. */
function formatTime(ms: number): string {
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return '—'
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** The account grid: a "sign in" button plus one card per stored account. */
export function AccountCards({ accounts, onChanged, t }: {
  accounts: readonly CodeBuddyWebAccount[]
  onChanged: () => void
  t: AccountCardInjected['t']
}): React.ReactNode {
  const [loginState, setLoginState] = useState<{ phase: 'idle' } | { phase: 'starting' } | { phase: 'polling'; authUrl: string; state: string } | { phase: 'done'; error?: string }>({ phase: 'idle' })
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  // Polling loop: when a login is in flight, poll every 5 seconds.
  useEffect(() => {
    if (loginState.phase !== 'polling') return
    const controller = new AbortController()
    const startTime = Date.now()
    const poll = async (): Promise<void> => {
      if (Date.now() - startTime > 5 * 60 * 1000) {
        if (mounted.current) setLoginState({ phase: 'done', error: t('accountLoginTimeout') })
        return
      }
      try {
        const response = await fetch(CODEBUDDY_LOGIN_POLL_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ state: loginState.state }),
          ...controller.signal.aborted ? {} : { signal: controller.signal },
        })
        const body = await response.json().catch(() => undefined) as CodeBuddyLoginPollResult | undefined
        if (body === undefined) return
        if (body.done) {
          if (body.error !== undefined) {
            if (mounted.current) setLoginState({ phase: 'done', error: t('accountLoginFailed', { message: body.error }) })
          } else {
            if (mounted.current) setLoginState({ phase: 'idle' })
            onChanged()
          }
          return
        }
      } catch {
        // Network error — keep polling.
      }
      await new Promise(resolve => setTimeout(resolve, 5000))
      if (!controller.signal.aborted && mounted.current) void poll()
    }
    void poll()
    return () => { controller.abort() }
  }, [loginState, onChanged, t])

  const startLogin = async (): Promise<void> => {
    setLoginState({ phase: 'starting' })
    try {
      const response = await fetch(CODEBUDDY_LOGIN_START_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: '{}',
      })
      const body = await response.json().catch(() => undefined) as CodeBuddyLoginStartResult | undefined
      if (body === undefined || !body.ok || body.authUrl === undefined || body.state === undefined) {
        const error = body?.error ?? `HTTP ${response.status}`
        setLoginState({ phase: 'done', error: t('accountLoginFailed', { message: error }) })
        return
      }
      window.open(body.authUrl, '_blank', 'noopener')
      setLoginState({ phase: 'polling', authUrl: body.authUrl, state: body.state })
    } catch (cause: unknown) {
      setLoginState({ phase: 'done', error: t('accountLoginFailed', { message: cause instanceof Error ? cause.message : t('requestFailed') }) })
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <p className={css.bodyText} style={{ margin: 0 }}>{t('accountPanelHint')}</p>
        <button
          type="button"
          className={css.choiceSave}
          disabled={loginState.phase === 'starting' || loginState.phase === 'polling'}
          onClick={() => { void startLogin() }}
        >
          {loginState.phase === 'starting'
            ? t('accountLoginStarting')
            : loginState.phase === 'polling'
              ? t('accountLoginPolling')
              : t('accountCardAdd')}
        </button>
      </div>
      {loginState.phase === 'polling' ? (
        <p className={css.bodyText} style={{ marginTop: 6 }}>
          {t('accountLoginPolling')}{' '}
          <button type="button" className={css.refresh} style={{ padding: '2px 8px' }} onClick={() => { window.open(loginState.authUrl, '_blank', 'noopener') }}>
            {t('accountLoginOpen')}
          </button>
        </p>
      ) : null}
      {loginState.phase === 'done' && loginState.error !== undefined ? (
        <p className={css.bodyError} style={{ marginTop: 6 }}>{loginState.error}</p>
      ) : null}
      {accounts.length === 0 ? (
        <div style={{ marginTop: 12, padding: '20px 12px', textAlign: 'center', borderRadius: 12, border: '0.5px dashed var(--dsw-alias-border-l3)', fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>
          {t('accountCardNoAccounts')}
        </div>
      ) : (
        <div className={css.accountGrid}>
          {accounts.map(account => (
            <AccountCard key={account.id} account={account} onChanged={onChanged} t={t} />
          ))}
        </div>
      )}
    </div>
  )
}
