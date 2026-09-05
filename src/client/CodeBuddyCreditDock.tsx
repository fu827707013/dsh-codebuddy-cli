/**
 * The composer credit line: one compact row mounted on
 * `conversation.composer.dock` — the same slot the host's session-stats strip
 * occupies, so the credit figure sits directly under the input box beside the
 * token statistics, styled to read as one family (tertiary 13px text,
 * tabular numbers, same variable palette).
 *
 * The trigger line shows the total remaining credit; clicking opens a small
 * menu-surface panel (same surface vocabulary as the composer's
 * context-occupancy panel) with per-package progress rows, the selected
 * model's billing rate, and a manual refresh.
 */

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
import { CODEBUDDY_STATUS_PATH } from '../status-paths.ts'
import type { CodeBuddyWebStatus } from '../status-paths.ts'
import { buildCreditLine, currentCodeBuddyRate, isCodeBuddySelection } from './credit-line.ts'
import type { CodeBuddyModelSelectionProjection } from './credit-line.ts'
import type { CodeBuddyCreditKey } from './locales.ts'

/** Localized copy injected by the browser-plugin registration. */
export interface CodeBuddyCreditDockInjected {
  t: (key: CodeBuddyCreditKey, params?: Record<string, unknown>) => string
}

/** Component props: session standard kit + the injected copy. */
export type CodeBuddyCreditDockProps = {
  useProjection: UseProjection
  /**
   * Session snapshot selector from the standard kit. The dock only watches
   * `running` — typed narrowly here so the component stays testable without
   * the full SessionSnapshot import.
   */
  useSession: <S>(selector: (snapshot: { running: boolean }) => S) => S
} & Partial<CodeBuddyCreditDockInjected>

const REFRESH_INTERVAL_MS = 60_000

const rootStyle: CSSProperties = {
  position: 'relative',
  display: 'block',
  textAlign: 'center',
  maxWidth: 'var(--dsh-chat-content-width, 48rem)',
  width: '100%',
  margin: '0 auto',
  boxSizing: 'border-box',
  padding: '2px calc(var(--dsh-composer-side-clearance, 0px) + 16px) 0px',
  fontSize: 'var(--dsh-content-font-size-secondary, 13px)',
  lineHeight: '18px',
  color: 'var(--dsw-alias-label-tertiary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}
const triggerStyle: CSSProperties = {
  all: 'unset',
  cursor: 'pointer',
  font: 'inherit',
  color: 'inherit',
}
const panelStyle: CSSProperties = {
  position: 'absolute',
  bottom: 'calc(100% + 8px)',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 100,
  boxSizing: 'border-box',
  width: 264,
  padding: 12,
  borderRadius: 12,
  background: 'var(--dsw-specific-menu, var(--dsw-alias-bg-layer-1, #fff))',
  boxShadow: 'var(--dsw-elevation-prominent, 0 8px 24px rgba(0, 0, 0, 0.16)), 0 0 0 1px var(--dsw-alias-border-l1, rgba(0,0,0,0.06))',
  fontSize: 12,
  lineHeight: '20px',
  color: 'var(--dsw-alias-label-secondary)',
  textAlign: 'left',
  whiteSpace: 'normal',
  cursor: 'default',
}
const panelHeadingStyle: CSSProperties = {
  margin: 0,
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 6,
  fontSize: 12,
  color: 'var(--dsw-alias-label-primary)',
  fontWeight: 500,
}
const panelBigStyle: CSSProperties = {
  fontSize: 20,
  lineHeight: '26px',
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--dsw-alias-label-primary)',
}
const modelRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  marginTop: 2,
  color: 'var(--dsw-alias-label-secondary)',
}
const rowStyle: CSSProperties = {
  marginTop: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  // Accounts can be numerous (the upstream reports every promo package); a
  // scrollable body keeps the panel at the context panel's visual scale.
  maxHeight: 180,
  overflowY: 'auto',
}
const rowHeadStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
}
const trackStyle: CSSProperties = {
  height: 4,
  borderRadius: 999,
  background: 'var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.08))',
  overflow: 'hidden',
}
const emptyNoteStyle: CSSProperties = {
  margin: '8px 0 0',
  color: 'var(--dsw-alias-label-tertiary)',
}
const errorStyle: CSSProperties = {
  ...emptyNoteStyle,
  color: 'var(--dsw-alias-state-error-primary, #d92d20)',
}
const footerStyle: CSSProperties = {
  margin: '10px 0 0',
  display: 'flex',
  justifyContent: 'flex-end',
}
const linkStyle: CSSProperties = {
  all: 'unset',
  cursor: 'pointer',
  color: 'var(--dsw-alias-brand-primary, #1677ff)',
  fontSize: 12,
}

/** Status read states. */
type Load =
  | { phase: 'loading' }
  | { phase: 'ok'; value: CodeBuddyWebStatus }
  | { phase: 'error'; message: string }

/** Compact per-package progress row. */
function PackageRow({ account, t }: {
  account: { packageName: string; remain: number; size: number }
  t: CodeBuddyCreditDockInjected['t']
}): React.ReactNode {
  const percent = account.size > 0 ? Math.max(0, Math.min(100, (account.remain / account.size) * 100)) : null
  return (
    <div>
      <div style={rowHeadStyle}>
        <span>{account.packageName}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {t('creditPackageRemain', {
            remain: new Intl.NumberFormat(undefined).format(account.remain),
            ...account.size > 0 ? { size: new Intl.NumberFormat(undefined).format(account.size) } : {},
          })}
        </span>
      </div>
      {percent === null ? null : (
        <div style={{ ...trackStyle, marginTop: 4 }} role="progressbar" aria-label={account.packageName}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div style={{ width: `${percent}%`, height: '100%', background: 'var(--dsw-alias-brand-primary, #1677ff)' }} />
        </div>
      )}
    </div>
  )
}

/**
 * The composer dock entry: a pure provider gate around {@link CreditDockBody}.
 *
 * The gate holds no state and starts no work — it only reads the session's
 * `modelSelection` projection. The body (which fetches, polls and binds
 * document listeners) is mounted only for a CodeBuddy selection, so switching
 * the session to another provider unmounts it and its effects clean up: no
 * further status requests, no interval, no leftover panel.
 */
export function CodeBuddyCreditDock({ useProjection, useSession, t }: CodeBuddyCreditDockProps) {
  if (t === undefined) throw new Error('CodeBuddy credit dock requires its translation function')
  const selection = useProjection('modelSelection') as CodeBuddyModelSelectionProjection | undefined
  if (!isCodeBuddySelection(selection)) return null
  return <CreditDockBody selection={selection} useSession={useSession} t={t} />
}

/** The dock's stateful half, mounted only while a CodeBuddy model is selected. */
function CreditDockBody({ selection, useSession, t }: {
  selection: CodeBuddyModelSelectionProjection | undefined
  useSession: CodeBuddyCreditDockProps['useSession']
  t: CodeBuddyCreditDockInjected['t']
}): React.ReactNode {
  const running = useSession(snapshot => snapshot.running)
  const [load, setLoad] = useState<Load>({ phase: 'loading' })
  const [open, setOpen] = useState(false)
  const mounted = useRef(true)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const refresh = async (): Promise<void> => {
    try {
      const response = await fetch(CODEBUDDY_STATUS_PATH, {
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
      })
      const value: unknown = await response.json().catch(() => undefined)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (mounted.current) setLoad({ phase: 'ok', value: value as CodeBuddyWebStatus })
    } catch (error: unknown) {
      if (mounted.current) {
        setLoad({ phase: 'error', message: error instanceof Error ? error.message : t('requestFailed') })
      }
    }
  }

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, REFRESH_INTERVAL_MS)
    return () => { window.clearInterval(timer) }
  }, [])

  // Credit is billed server-side when a model request completes, so the
  // moment a turn settles (running → idle) is exactly when the upstream
  // figure moves. Refresh immediately instead of waiting out the polling
  // interval; a short delay lets the provider finish its own accounting.
  const wasRunning = useRef(false)
  useEffect(() => {
    if (wasRunning.current && !running) {
      const timer = window.setTimeout(() => { void refresh() }, 2_000)
      wasRunning.current = running
      return () => { window.clearTimeout(timer) }
    }
    wasRunning.current = running
  }, [running])

  // Outside click / Escape close while the panel is up (ContextMeter's pattern).
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target) === true) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // A signed-out / error document keeps the dock quiet: the settings card is
  // the sign-in surface, and an error here should never spam the composer.
  if (load.phase !== 'ok' || load.value.status !== 'signed-in') return null
  const status = load.value
  const line = buildCreditLine(status.credits)
  if (line === null) return null

  const rate = currentCodeBuddyRate(selection, status.catalog)
  // The trigger shows the exact figure with thousands separators (1,651) —
  // the compact 1.2K form lives in the details panel's history no more. The
  // rate template already carries its own `·` separator.
  const headline = t('creditTotalCompact', { total: new Intl.NumberFormat(undefined).format(line.total) })
  const triggerText = rate === null
    ? headline
    : `${headline} ${t('creditRate', { rate: rate.rate })}`

  return (
    <div ref={rootRef} style={rootStyle}>
      <button type="button" style={triggerStyle} aria-haspopup="dialog" aria-expanded={open}
        aria-label={t('creditPanelAria')} onClick={() => { setOpen(!open) }}>
        {triggerText}
      </button>
      {open
        ? (
            <div style={panelStyle} role="dialog" aria-label={t('creditPanelAria')}>
              <div style={panelHeadingStyle}>
                <span>{t('creditsHeading')}</span>
                <span style={panelBigStyle}>{new Intl.NumberFormat(undefined).format(line.total)}</span>
              </div>
              {rate === null ? null : (
                <div style={modelRowStyle}>
                  <span>{rate.name ?? t('creditModelFallback')}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{t('creditRate', { rate: rate.rate })}</span>
                </div>
              )}
              {line.rows.length > 0
                ? (
                    <div style={rowStyle}>
                      {status.credits?.accounts
                        .filter(account => account.remain > 0)
                        .map((account, index) => (
                          <PackageRow
                            key={`${account.packageName}-${String(index)}`}
                            account={account}
                            t={t}
                          />
                        ))}
                    </div>
                  )
                : <p style={emptyNoteStyle}>{t('creditEmpty')}</p>}
              {status.creditsError === undefined ? null : <p style={errorStyle}>{t('creditsError', { message: status.creditsError })}</p>}
              <div style={footerStyle}>
                <button type="button" style={linkStyle} onClick={() => { void refresh() }}>{t('refresh')}</button>
              </div>
            </div>
          )
        : null}
    </div>
  )
}
