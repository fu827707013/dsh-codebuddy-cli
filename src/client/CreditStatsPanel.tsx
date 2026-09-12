/**
 * Credit statistics panel (workbuddy-switch style).
 *
 * Renders the aggregated official usage for all stored accounts: a summary
 * card (remaining credit / today / 7-day / month), a daily trend chart with
 * per-account filtering and a stacked model chart, a per-model breakdown, and
 * a detail panel with the credit packages and the recent request list.
 *
 * Each of the trend / model / detail cards carries its own account filter
 * (dropdown menu) and the trend + model cards carry their own range switch,
 * mirroring the workbuddy-switch statistics page.
 *
 * Data comes from the plugin's `/plugins/dsh-codebuddy-cli/credit-stats`
 * route. The panel refreshes the official usage on demand (POST with
 * `refresh: true`).
 *
 * @module dsh-codebuddy-cli/client/credit-stats-panel
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { CODEBUDDY_CREDIT_STATS_PATH } from '../status-paths.ts'
import type {
  CodeBuddyCreditStats,
  CodeBuddyWebUsageDaily,
  CodeBuddyWebUsageModel,
  CodeBuddyWebUsageRow,
  CodeBuddyWebAccount,
  CodeBuddyWebCredits,
  CodeBuddyWebUsageAccount,
} from '../status-paths.ts'
import type { CodeBuddySettingsKey } from './locales.ts'
import css from './CodeBuddyPluginCard.module.css'

/** Localized copy injected by the browser-plugin registration. */
export interface CreditStatsPanelInjected {
  t: (key: CodeBuddySettingsKey, params?: Record<string, unknown>) => string
}

function cx(...names: Array<string | undefined>): string {
  return names.filter(name => name !== undefined && name !== '').join(' ')
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
}

function formatChartDate(date: string): string {
  return date.slice(5).replace('-', '/')
}

function formatDateTime(ts: number | null | undefined): string {
  if (ts === null || ts === undefined) return '—'
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return '—'
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** Range options for the trend chart. */
type RangeKey = '30d' | 'today' | '7d' | 'month'
const RANGES: { key: RangeKey; labelKey: 'statsTrendRange30d' | 'statsTrendRangeToday' | 'statsTrendRange7d' | 'statsTrendRangeMonth' }[] = [
  { key: '30d', labelKey: 'statsTrendRange30d' },
  { key: 'today', labelKey: 'statsTrendRangeToday' },
  { key: '7d', labelKey: 'statsTrendRange7d' },
  { key: 'month', labelKey: 'statsTrendRangeMonth' },
]

function dateKey(date: Date): string {
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
function daysAgo(days: number): string {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() - days)
  return dateKey(date)
}

/** Filter a daily series to the selected range. */
function chartPoints(daily: readonly CodeBuddyWebUsageDaily[], range: RangeKey): readonly CodeBuddyWebUsageDaily[] {
  const today = dateKey(new Date())
  const first = range === 'today' ? today : range === '7d' ? daysAgo(6) : daysAgo(29)
  return daily.filter(point => {
    if (range === 'month') return point.date.startsWith(`${today.slice(0, 7)}-`)
    return point.date >= first && point.date <= today
  })
}

/** Sum usage across a daily series. */
function sumUsage(daily: readonly CodeBuddyWebUsageDaily[]): number {
  return daily.reduce((sum, point) => sum + point.usage, 0)
}

/** Inline Users icon (no external icon dependency). */
function UsersIcon(): React.ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

/**
 * Account filter dropdown (workbuddy-switch style). Each statistics card owns
 * its own filter state; `allowAll: false` hides the "all accounts" option so
 * the detail card forces a single-account view. Exported so the remaining-
 * credit tab can reuse the same control.
 */
export function AccountFilterMenu({ accounts, accountFilter, onAccountFilterChange, t, allowAll = true, ariaLabel }: {
  accounts: readonly { accountId: string; accountName?: string | null }[]
  accountFilter: string | null
  onAccountFilterChange: (accountId: string | null) => void
  t: CreditStatsPanelInjected['t']
  ariaLabel: string
  allowAll?: boolean
}): React.ReactNode {
  const [open, setOpen] = useState(false)
  const active = accountFilter !== null && accounts.some(a => a.accountId === accountFilter)
    ? accounts.find(a => a.accountId === accountFilter)
    : undefined
  const effective = active !== undefined ? active.accountId : null
  const label = active !== undefined
    ? (active.accountName ?? active.accountId)
    : allowAll
      ? t('statsTrendAllAccounts')
      : accounts[0] !== undefined
        ? (accounts[0].accountName ?? accounts[0].accountId)
        : t('statsTrendAllAccounts')
  return (
    <div style={{ position: 'relative', flex: 'none' }}>
      <button type="button" className={css.statsFilterButton} onClick={() => { setOpen(!open) }} aria-label={ariaLabel} aria-haspopup="menu" aria-expanded={open}>
        <UsersIcon />
        <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </button>
      {open ? (
        <div className={css.statsFilterMenu} role="menu">
          {allowAll ? (
            <button
              type="button"
              role="menuitem"
              className={css.statsFilterItem}
              onClick={() => { onAccountFilterChange(null); setOpen(false) }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('statsTrendAllAccounts')}</span>
              {effective === null ? <span className={css.statsFilterCheck}>✓</span> : null}
            </button>
          ) : null}
          {accounts.map(account => (
            <button
              key={account.accountId}
              type="button"
              role="menuitem"
              className={css.statsFilterItem}
              onClick={() => { onAccountFilterChange(account.accountId); setOpen(false) }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.accountName ?? account.accountId}</span>
              {effective === account.accountId ? <span className={css.statsFilterCheck}>✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Model color palette (theme tokens so dark mode stays readable). */
const MODEL_COLORS = [
  'var(--stats-color-1, #10b981)',
  'var(--stats-color-2, #0d9488)',
  'var(--stats-color-3, #8b5cf6)',
  'var(--stats-color-4, #f59e0b)',
  'var(--stats-color-5, #f43f5e)',
  'var(--stats-color-6, #6366f1)',
  'var(--stats-color-7, #0ea5e9)',
  'var(--stats-color-8, #84cc16)',
]
const MAX_MODELS = 5
const OTHER_MODEL = '其他'

interface ModelChartPoint {
  date: string
  total: number
  [model: string]: number | string
}

/** Build stacked chart data: top models by consumption, the rest folded into「其他」. */
function buildStackedChart(daily: readonly CodeBuddyWebUsageDaily[]): { models: string[]; points: ModelChartPoint[] } {
  const totals = new Map<string, number>()
  for (const point of daily) {
    for (const model of point.models ?? []) {
      totals.set(model.model, (totals.get(model.model) ?? 0) + model.credit)
    }
  }
  const top = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_MODELS)
    .map(([model]) => model)
  const points: ModelChartPoint[] = daily.map(point => {
    const entry: ModelChartPoint = { date: point.date, total: point.usage }
    for (const model of point.models ?? []) {
      const key = top.includes(model.model) ? model.model : OTHER_MODEL
      entry[key] = (typeof entry[key] === 'number' ? entry[key] as number : 0) + model.credit
    }
    return entry
  })
  const models = [...top]
  if (points.some(point => point[OTHER_MODEL] !== undefined)) models.push(OTHER_MODEL)
  return { models, points }
}

/** A stacked bar chart drawn as inline SVG (no chart library in the plugin). */
function StackedTrendChart({ points, models, t }: {
  points: readonly ModelChartPoint[]
  models: readonly string[]
  t: CreditStatsPanelInjected['t']
}): React.ReactNode {
  const [hover, setHover] = useState<number | null>(null)
  if (points.length === 0) {
    return <div style={{ padding: '14px 0', textAlign: 'center', fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>{t('statsTrendNoData')}</div>
  }
  // When the caller has no per-model detail (single model or aggregated-only),
  // fall back to a single `total` segment so the chart never renders blank.
  const series = models.length > 0 ? models : ['total']
  const segmentLabel = (model: string): string => model === 'total' ? t('statsTrendTotalLabel') : model
  const width = 680
  const height = 200
  const axisH = 22
  const padTop = 8
  const chartBottom = height - axisH
  const max = Math.max(...points.map(p => p.total), 1)
  const barGap = 3
  const barWidth = Math.min(28, Math.max(2, (width - points.length * barGap) / points.length))
  const gridLines = [0.25, 0.5, 0.75, 1]
  const bars = points.map((point, index) => {
    const x = index * (barWidth + barGap)
    const stackTop = chartBottom
    const visible = series.map((model, mi) => ({
      model,
      mi,
      value: typeof point[model] === 'number' ? point[model] as number : 0,
    })).filter(segment => segment.value > 0)
    return visible.map((segment, si) => {
      const h = (segment.value / max) * (chartBottom - padTop)
      const isTop = si === visible.length - 1
      const y = stackTop - (visible.slice(0, si).reduce((sum, s) => sum + (s.value / max) * (chartBottom - padTop), 0)) - h
      return (
        <rect
          key={`${point.date}-${segment.model}`}
          x={x}
          y={y}
          width={barWidth}
          height={Math.max(1, h)}
          fill={MODEL_COLORS[segment.mi % MODEL_COLORS.length] ?? MODEL_COLORS[0]}
          rx={isTop ? 3 : 0}
        >
          <title>{`${point.date} · ${segmentLabel(segment.model)} ${formatNumber(segment.value)}`}</title>
        </rect>
      )
    })
  })
  const hovered = hover !== null ? points[hover] : undefined
  const hoveredModels = hovered !== undefined
    ? series
        .map((model, mi) => ({
          model,
          color: MODEL_COLORS[mi % MODEL_COLORS.length] ?? MODEL_COLORS[0],
          value: typeof hovered[model] === 'number' ? hovered[model] as number : 0,
        }))
        .filter(segment => segment.value > 0)
    : []
  const hoveredTotal = hoveredModels.reduce((sum, segment) => sum + segment.value, 0)
  const labelIndices = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])]

  const renderTooltip = (): React.ReactNode => {
    if (hovered === undefined) return null
    return (
      <div className={css.statsChartTooltip} role="status">
        <div className={css.statsChartTooltipTitle}>
          {t('statsTrendTooltipTitle', { date: formatChartDate(hovered.date) })}
        </div>
        <div className={css.statsChartTooltipTotal}>
          {t('statsTrendTooltipTotal', { usage: formatNumber(hoveredTotal) })}
        </div>
        {hoveredModels.length === 0 ? (
          <div className={css.statsChartTooltipRow} style={{ color: 'var(--dsw-alias-label-tertiary)' }}>
            {t('statsTrendTooltipNone')}
          </div>
        ) : (
          hoveredModels.map(segment => (
            <div key={segment.model} className={css.statsChartTooltipRow}>
              <span className={css.statsChartLegendSwatch} style={{ backgroundColor: segment.color }} aria-hidden="true" />
              <span className={css.statsChartTooltipName}>{segmentLabel(segment.model)}</span>
              <span className={css.statsChartTooltipValue}>{formatNumber(segment.value)}</span>
            </div>
          ))
        )}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="credit trend chart">
        {gridLines.map(fraction => {
          const gy = chartBottom - fraction * (chartBottom - padTop)
          return (
            <line key={fraction} x1={0} x2={width} y1={gy} y2={gy} stroke="var(--dsw-alias-border-l2)" strokeWidth={1} strokeDasharray="3 3" />
          )
        })}
        {bars}
        {/* Invisible hover capture: one full-plot-width strip per column so the
            tooltip can follow the mouse across the whole column, not just the bar. */}
        {points.map((point, index) => {
          const x = index * (barWidth + barGap)
          const w = barWidth + barGap
          return (
            <rect
              key={`hit-${point.date}`}
              x={x}
              y={0}
              width={w}
              height={height}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => { setHover(index) }}
              onMouseLeave={() => { setHover(null) }}
            />
          )
        })}
      </svg>
      {renderTooltip()}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        {labelIndices.map((pointIndex, labelIndex) => {
          const point = points[pointIndex]
          if (point === undefined) return null
          return (
            <span key={`label-${labelIndex}`} style={{ fontSize: 10, color: 'var(--dsw-alias-label-tertiary)', whiteSpace: 'nowrap' }}>
              {formatChartDate(point.date)}
            </span>
          )
        })}
      </div>
      {series.length > 1 ? (
        <div className={css.statsChartLegend}>
          {series.map((model, index) => (
            <span key={model} className={css.statsChartLegendItem}>
              <span className={css.statsChartLegendSwatch} style={{ backgroundColor: MODEL_COLORS[index % MODEL_COLORS.length] ?? MODEL_COLORS[0] }} aria-hidden="true" />
              {segmentLabel(model)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** One model row with a ratio bar. */
function ModelRow({ model, totalCredit, totalRequests, t }: {
  model: CodeBuddyWebUsageModel
  totalCredit: number
  totalRequests: number
  t: CreditStatsPanelInjected['t']
}): React.ReactNode {
  const ratio = totalCredit > 0 ? model.credit / totalCredit : totalRequests > 0 ? model.requestCount / totalRequests : 0
  const percent = ratio * 100
  const label = model.model === '—' ? t('statsModelUnknown') : model.model
  return (
    <div className={css.statsModelRow}>
      <div className={css.statsModelRowHead}>
        <span className={css.statsModelRowName} title={label}>{label}</span>
        <span className={css.statsModelRowMeta}>
          {t('statsModelLine', { credit: formatNumber(model.credit), count: formatNumber(model.requestCount) })}
          <strong style={{ marginLeft: 4 }}>{percent < 0.05 ? '<0.1%' : `${percent.toFixed(1)}%`}</strong>
        </span>
      </div>
      <div className={css.progressTrack} style={{ marginTop: 5 }}>
        <div className={css.progressFill} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
    </div>
  )
}

/** The recent-requests table. */
function UsageTable({ requests, showAccount, t }: {
  requests: readonly CodeBuddyWebUsageRow[]
  showAccount: boolean
  t: CreditStatsPanelInjected['t']
}): React.ReactNode {
  if (requests.length === 0) {
    return <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 13, color: 'var(--dsw-alias-label-secondary)' }}>{t('statsDetailNoOfficial')}</div>
  }
  return (
    <div className={css.statsTableWrap}>
      <table className={css.statsTable}>
        <thead>
          <tr>
            <th>{t('statsUsageRequestTime')}</th>
            {showAccount ? <th>{t('statsUsageAccount')}</th> : null}
            <th style={{ textAlign: 'right' }}>{t('statsUsageConsumed')}</th>
            <th>{t('statsUsageModel')}</th>
            <th>{t('statsUsageClient')}</th>
            <th>{t('statsUsageRequestId')}</th>
          </tr>
        </thead>
        <tbody>
          {requests.map(request => (
            <tr key={`${request.requestId}-${request.requestTime}`}>
              <td style={{ whiteSpace: 'nowrap', color: 'var(--dsw-alias-label-tertiary)' }}>{request.requestTime}</td>
              {showAccount ? <td style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={request.accountName}>{request.accountName ?? request.accountId}</td> : null}
              <td style={{ textAlign: 'right', fontWeight: 500, color: 'var(--dsw-alias-brand-primary)' }}>{formatNumber(request.credit)}</td>
              <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={request.model}>{request.model}</td>
              <td style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={request.client}>{request.client}</td>
              <td style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--dsw-alias-label-tertiary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={request.requestId}>{request.requestId}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Credit packages of one (or all) accounts as progress rows. */
function CreditResources({ accounts, selectedId, t }: {
  accounts: readonly CodeBuddyWebAccount[]
  selectedId: string | null
  t: CreditStatsPanelInjected['t']
}): React.ReactNode {
  const visible = selectedId === null ? accounts : accounts.filter(a => a.id === selectedId)
  if (visible.length === 0) {
    return <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 13, color: 'var(--dsw-alias-label-secondary)' }}>{t('statsDetailNoStats')}</div>
  }
  return (
    <div>
      {visible.map(account => {
        const name = account.nickname ?? account.uid ?? account.id
        return (
          <div key={account.id}>
            {selectedId === null ? (
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--dsw-alias-label-primary)', padding: '8px 0 4px' }}>{name}</div>
            ) : null}
            <CreditResourcesInner credits={account.credits} t={t} />
          </div>
        )
      })}
    </div>
  )
}

function CreditResourcesInner({ credits, t }: {
  credits: CodeBuddyWebCredits | undefined
  t: CreditStatsPanelInjected['t']
}): React.ReactNode {
  if (credits === undefined) {
    return <div style={{ padding: '12px 0', fontSize: 13, color: 'var(--dsw-alias-label-secondary)' }}>{t('statsDetailNoPackages')}</div>
  }
  const resources = credits.accounts.filter(account => account.remain > 0)
  if (resources.length === 0) {
    return <div style={{ padding: '12px 0', fontSize: 13, color: 'var(--dsw-alias-label-secondary)' }}>{t('accountCardNoCredit')}</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
      {resources.map((resource, index) => {
        const percent = resource.total > 0 ? Math.max(0, Math.min(100, (resource.remain / resource.total) * 100)) : 0
        const expiryText = resource.expired
          ? t('accountCardExpired')
          : resource.expiringSoon
            ? t('accountCardExpiresIn7d')
            : resource.expireAtMs !== undefined
              ? t('statsResourceExpires', { date: `${String(new Date(resource.expireAtMs).getMonth() + 1).padStart(2, '0')}/${String(new Date(resource.expireAtMs).getDate()).padStart(2, '0')}` })
              : t('accountCardLongLived')
        return (
          <div key={`${resource.packageName}-${String(index)}`}>
            <div className={css.statsModelRowHead}>
              <span className={css.statsModelRowName} title={resource.packageName}>{resource.packageName}</span>
              <span className={css.statsModelRowMeta}>
                <strong>{formatNumber(resource.remain)} / {formatNumber(resource.total)}</strong>
                <span style={{ marginLeft: 4 }}>{expiryText}</span>
              </span>
            </div>
            <div className={css.progressTrack} style={{ marginTop: 5 }}>
              <div className={css.progressFill} style={{ width: `${percent}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Find the usage account backing a filter selection (for per-account series). */
function usageAccountFor(status: CodeBuddyCreditStats, accountId: string | null): CodeBuddyWebUsageAccount | undefined {
  if (accountId === null) return undefined
  return status.accounts.find(account => account.accountId === accountId)
}

/** Load state of the statistics document. */
type Load =
  | { phase: 'loading' }
  | { phase: 'ok'; value: CodeBuddyCreditStats }
  | { phase: 'error'; message: string }

/**
 * The credit-statistics panel. Fetches the aggregated document on mount,
 * exposes a manual refresh (POST refresh:true), and renders the summary,
 * trend chart, model breakdown and detail tabs — each with its own account
 * filter like the workbuddy-switch statistics page.
 */
export function CreditStatsPanel({ accounts, onChanged, t }: {
  /** Stored accounts (from the status document) for the detail account filter. */
  accounts: readonly CodeBuddyWebAccount[]
  /** Ask the parent to refresh the status document (updates account credits). */
  onChanged: () => void
  t: CreditStatsPanelInjected['t']
}): React.ReactNode {
  const [load, setLoad] = useState<Load>({ phase: 'loading' })
  const [trendRange, setTrendRange] = useState<RangeKey>('30d')
  const [trendAccount, setTrendAccount] = useState<string | null>(null)
  const [modelRange, setModelRange] = useState<RangeKey>('30d')
  const [modelAccount, setModelAccount] = useState<string | null>(null)
  const [detailAccount, setDetailAccount] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<'credits' | 'requests'>('credits')
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const fetchStats = useCallback(async (refresh: boolean): Promise<void> => {
    setLoad({ phase: 'loading' })
    try {
      const response = await fetch(CODEBUDDY_CREDIT_STATS_PATH, {
        method: refresh ? 'POST' : 'GET',
        headers: refresh ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
        credentials: 'same-origin',
        ...refresh ? { body: JSON.stringify({ refresh: true }) } : {},
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const value = await response.json() as CodeBuddyCreditStats
      if (mounted.current) setLoad({ phase: 'ok', value })
      if (refresh) onChanged()
    } catch (error: unknown) {
      if (mounted.current) {
        setLoad({ phase: 'error', message: error instanceof Error ? error.message : t('requestFailed') })
      }
    }
  }, [onChanged, t])

  useEffect(() => {
    void fetchStats(false)
  }, [fetchStats])

  const status = load.phase === 'ok' ? load.value : undefined

  // —— Trend chart: per-account daily series when a specific account is picked.
  const filterAccounts = status !== undefined && status.accounts.length > 0
    ? status.accounts.map(account => ({ accountId: account.accountId, accountName: account.accountName }))
    : accounts.map(account => ({ accountId: account.id, accountName: account.nickname ?? account.uid ?? account.id }))
  const effectiveTrendAccount = trendAccount !== null && status !== undefined && status.accounts.some(a => a.accountId === trendAccount)
    ? trendAccount
    : null
  const trendUsageAccount = status !== undefined ? usageAccountFor(status, effectiveTrendAccount) : undefined
  const trendDaily = status !== undefined
    ? (effectiveTrendAccount !== null
        ? (trendUsageAccount?.ok === true ? (trendUsageAccount.daily ?? []) : [])
        : status.daily)
    : []
  const trendPoints = chartPoints(trendDaily, trendRange)
  const stacked = buildStackedChart(trendPoints)
  const hasModelDetail = trendPoints.some(point => (point.models?.length ?? 0) > 0)
  const chartModels = stacked.models.length > 1 && hasModelDetail ? stacked.models : ['total']
  const chartData: ModelChartPoint[] = chartModels.length > 1
    ? stacked.points
    : trendPoints.map(point => ({ date: point.date, total: point.usage }))

  // —— Model breakdown: per-account aggregation when a specific account is picked.
  const effectiveModelAccount = modelAccount !== null && status !== undefined && status.accounts.some(a => a.accountId === modelAccount)
    ? modelAccount
    : null
  const modelUsageAccount = status !== undefined ? usageAccountFor(status, effectiveModelAccount) : undefined
  const modelBasePoints = status !== undefined
    ? chartPoints(
        effectiveModelAccount !== null
          ? (modelUsageAccount?.ok === true ? (modelUsageAccount.daily ?? []) : [])
          : status.daily,
        modelRange,
      )
    : []
  const modelMap = new Map<string, { requestCount: number; credit: number }>()
  for (const point of modelBasePoints) {
    for (const item of point.models ?? []) {
      const entry = modelMap.get(item.model) ?? { requestCount: 0, credit: 0 }
      entry.requestCount += item.requestCount
      entry.credit += item.credit
      modelMap.set(item.model, entry)
    }
  }
  const modelRows: CodeBuddyWebUsageModel[] = [...modelMap.entries()]
    .map(([model, value]) => ({ model, requestCount: value.requestCount, credit: value.credit }))
    .sort((a, b) => b.credit - a.credit || b.requestCount - a.requestCount || a.model.localeCompare(b.model))
  const modelTotalCredit = modelRows.reduce((sum, m) => sum + m.credit, 0)
  const modelTotalRequests = modelRows.reduce((sum, m) => sum + m.requestCount, 0)

  // —— Detail: single-account filter (defaults to the first account).
  const effectiveDetailAccount = detailAccount !== null && accounts.some(a => a.id === detailAccount)
    ? detailAccount
    : (accounts[0]?.id ?? null)
  const detailShowAccount = accounts.length > 1
  const detailRequests = status !== undefined
    ? (effectiveDetailAccount !== null
        ? status.requests.filter(r => r.accountId === effectiveDetailAccount)
        : status.requests)
    : []

  const summaryCards = status === undefined ? null : (
    <div className={css.statsSummaryGrid}>
      <SummaryMetric label={t('statsRemaining')} value={formatNumber(accounts.reduce((sum, a) => sum + (a.credits?.total ?? 0), 0))} />
      <SummaryMetric label={t('statsTodayUsage')} value={formatNumber(status.summary.usageToday)} />
      <SummaryMetric label={t('stats7dUsage')} value={formatNumber(status.summary.usage7Days)} />
      <SummaryMetric label={t('statsMonthUsage')} value={formatNumber(status.summary.usageThisMonth)} />
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <p className={css.bodyText} style={{ margin: 0 }}>{t('statsHeading')}</p>
        <button type="button" className={css.choiceSave} disabled={load.phase === 'loading'} onClick={() => { void fetchStats(true) }}>
          {load.phase === 'loading' ? t('statsRefreshing') : t('statsRefresh')}
        </button>
      </div>

      {load.phase === 'error' ? (
        <div className={cx(css.statsAlert, css.statsAlertError)}>
          <span>{t('statsLoadFailed')}: {load.message}</span>
          <button type="button" className={css.refresh} style={{ padding: '2px 8px' }} onClick={() => { void fetchStats(true) }}>{t('statsRetry')}</button>
        </div>
      ) : null}

      {load.phase === 'loading' && status === undefined ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 0', fontSize: 13, color: 'var(--dsw-alias-label-secondary)' }}>
          {t('statsLoading')}
        </div>
      ) : status !== undefined ? (
        <>
          {accounts.length === 0 ? (
            <div className={css.statsAlert}>{t('statsNoAccounts')}</div>
          ) : null}
          {status.status !== 'complete' ? (
            <div className={cx(css.statsAlert, css.statsAlertWarning)}>
              {status.status === 'partial'
                ? `${t('statsOfficialPartial')} — ${t('statsOfficialPartialDetail', { ok: String(status.accounts.filter(a => a.ok).length), total: String(status.accounts.length) })}`
                : t('statsOfficialUnavailable')}
            </div>
          ) : null}
          {summaryCards}

          {/* Trend chart card */}
          <div className={css.statsPanelCard}>
            <div className={css.statsPanelHeader}>
              <span className={css.statsPanelTitle}>{t('statsTrendTitle')}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <AccountFilterMenu
                  accounts={filterAccounts}
                  accountFilter={effectiveTrendAccount}
                  onAccountFilterChange={setTrendAccount}
                  t={t}
                  ariaLabel={t('statsFilterTrend')}
                />
                <div className={css.statsRangeTabs}>
                  {RANGES.map(option => (
                    <button
                      key={option.key}
                      type="button"
                      className={cx(css.statsRangeTab, trendRange === option.key ? css.statsRangeTabActive : undefined)}
                      onClick={() => { setTrendRange(option.key) }}
                      aria-pressed={trendRange === option.key}
                    >
                      {t(option.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', marginBottom: 8 }}>
              {t('statsTrendFromOfficial', { start: status.rangeStart, end: status.rangeEnd })}
            </div>
            {effectiveTrendAccount !== null && (trendUsageAccount === undefined || trendUsageAccount.ok !== true) ? (
              <div style={{ padding: '14px 0', textAlign: 'center', fontSize: 13, color: 'var(--dsw-alias-label-secondary)' }}>
                {t('statsTrendAccountUnavailable')}
              </div>
            ) : chartData.length === 0 ? (
              <div style={{ padding: '14px 0', textAlign: 'center', fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>{t('statsTrendNoData')}</div>
            ) : (
              <>
                <StackedTrendChart points={chartData} models={chartModels} t={t} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
                  <span>{t('statsTrendTotal', { usage: formatNumber(sumUsage(trendPoints)) })}</span>
                  <span>{t('statsDataUpdatedAt', { time: formatDateTime(status.collectedAt) })}</span>
                </div>
              </>
            )}
          </div>

          {/* Model breakdown card */}
          {status.models.length > 0 ? (
            <div className={css.statsPanelCard}>
              <div className={css.statsPanelHeader}>
                <span className={css.statsPanelTitle}>{t('statsModelHeading')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>{t('statsModelCount', { count: String(modelRows.length) })}</span>
                  <AccountFilterMenu
                    accounts={filterAccounts}
                    accountFilter={effectiveModelAccount}
                    onAccountFilterChange={setModelAccount}
                    t={t}
                    ariaLabel={t('statsFilterModel')}
                  />
                  <div className={css.statsRangeTabs}>
                    {RANGES.map(option => (
                      <button
                        key={option.key}
                        type="button"
                        className={cx(css.statsRangeTab, modelRange === option.key ? css.statsRangeTabActive : undefined)}
                        onClick={() => { setModelRange(option.key) }}
                        aria-pressed={modelRange === option.key}
                      >
                        {t(option.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {effectiveModelAccount !== null && (modelUsageAccount === undefined || modelUsageAccount.ok !== true) ? (
                <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 13, color: 'var(--dsw-alias-label-secondary)' }}>
                  {t('statsTrendAccountUnavailable')}
                </div>
              ) : modelRows.length === 0 ? (
                <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 13, color: 'var(--dsw-alias-label-secondary)' }}>
                  {t('statsModelEmpty')}
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 8 }}>
                    <span>{t('statsModelTotal', { requests: formatNumber(modelTotalRequests), credit: formatNumber(modelTotalCredit) })}</span>
                  </div>
                  <div className={css.statsModelRows}>
                    {modelRows.slice(0, 8).map(model => (
                      <ModelRow key={model.model} model={model} totalCredit={modelTotalCredit} totalRequests={modelTotalRequests} t={t} />
                    ))}
                  </div>
                  {modelRows.length > 8 ? (
                    <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>
                      {t('statsModelMore', { limit: '8' })}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {/* Detail card */}
          <div className={css.statsPanelCard}>
            <div className={css.statsPanelHeader}>
              <span className={css.statsPanelTitle}>{t('statsDetailHeading')}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <AccountFilterMenu
                  accounts={filterAccounts}
                  accountFilter={effectiveDetailAccount}
                  onAccountFilterChange={setDetailAccount}
                  t={t}
                  ariaLabel={t('statsFilterDetail')}
                  allowAll={false}
                />
                <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>
                  {t('statsDetailRecentCollected', { time: formatDateTime(status.collectedAt) })}
                </span>
              </div>
            </div>
            <div className={css.statsDetailTabs}>
              <button type="button" className={cx(css.statsDetailTab, detailTab === 'credits' ? css.statsDetailTabActive : undefined)} onClick={() => { setDetailTab('credits') }}>
                {t('statsDetailCredits')}
              </button>
              <button type="button" className={cx(css.statsDetailTab, detailTab === 'requests' ? css.statsDetailTabActive : undefined)} onClick={() => { setDetailTab('requests') }}>
                {t('statsDetailRequests')}
              </button>
            </div>
            {detailTab === 'credits' ? (
              <CreditResources accounts={accounts} selectedId={effectiveDetailAccount} t={t} />
            ) : (
              <UsageTable requests={detailRequests} showAccount={detailShowAccount} t={t} />
            )}
          </div>
        </>
      ) : (
        <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>{t('statsNone')}</div>
      )}
    </div>
  )
}

function SummaryMetric({ label, value }: { label: string; value: string }): React.ReactNode {
  return (
    <div className={css.statsMetric}>
      <div className={css.statsMetricLabel}>{label}</div>
      <div className={css.statsMetricValue}>{value}</div>
    </div>
  )
}
