import { describe, expect, it } from 'vitest'
import { CODEBUDDY_PROVIDER_ID } from '../src/status-paths.ts'
import {
  buildCreditLine,
  buildDockLine,
  creditRowPercent,
  currentCodeBuddyRate,
  formatCompactCredits,
  isCodeBuddySelection,
  renderDockSegments,
} from '../src/client/credit-line.ts'
import type { CodeBuddyDockLoad, CodeBuddyModelSelectionProjection } from '../src/client/credit-line.ts'
import { en } from '../src/client/locales.ts'
import type { CodeBuddyCreditKey } from '../src/client/locales.ts'

describe('formatCompactCredits', () => {
  it('keeps small counts bare', () => {
    expect(formatCompactCredits(0)).toBe('0')
    expect(formatCompactCredits(352)).toBe('352')
    expect(formatCompactCredits(999)).toBe('999')
  })

  it('compresses thousands like the composer token format', () => {
    expect(formatCompactCredits(1_000)).toBe('1K')
    expect(formatCompactCredits(1_234)).toBe('1.2K')
    expect(formatCompactCredits(12_345)).toBe('12.3K')
    expect(formatCompactCredits(123_456)).toBe('123K')
  })

  it('compresses millions with one decimal under 100', () => {
    expect(formatCompactCredits(1_200_000)).toBe('1.2M')
    expect(formatCompactCredits(45_600_000)).toBe('45.6M')
    expect(formatCompactCredits(123_000_000)).toBe('123M')
  })
})

describe('buildCreditLine', () => {
  it('returns null while credits are absent', () => {
    expect(buildCreditLine(undefined)).toBeNull()
  })

  it('drops empty packages and sorts the rest descending', () => {
    const line = buildCreditLine({
      total: 300,
      accounts: [
        { packageName: '小包', remain: 100, size: 1_000 },
        { packageName: '耗尽包', remain: 0, size: 500 },
        { packageName: '大包', remain: 200, size: 2_000 },
      ],
    })
    expect(line).not.toBeNull()
    expect(line!.total).toBe(300)
    expect(line!.compact).toBe('300')
    expect(line!.rows.map(row => row.packageName)).toEqual(['大包', '小包'])
    expect(line!.empty).toBe(false)
  })

  it('renders the empty flag for a zero answer instead of hiding', () => {
    const line = buildCreditLine({ total: 0, accounts: [{ packageName: '包', remain: 0, size: 100 }] })
    expect(line).not.toBeNull()
    expect(line!.empty).toBe(true)
    expect(line!.compact).toBe('0')
  })

  it('treats an accounts-less document as empty too', () => {
    const line = buildCreditLine({ total: 0, accounts: [] })
    expect(line).not.toBeNull()
    expect(line!.empty).toBe(true)
  })
})

describe('currentCodeBuddyRate', () => {
  const catalog = {
    rates: { 'glm-5.3': 'x0.79', 'glm-5.3-flash': 'x0.06' },
    names: { 'glm-5.3': 'GLM-5.3', 'glm-5.3-flash': 'GLM-5.3-Flash' },
  }

  it('prefers the next selection (the next request\'s model)', () => {
    const selection: CodeBuddyModelSelectionProjection = {
      lastUsed: { provider: CODEBUDDY_PROVIDER_ID, model: 'glm-5.3' },
      next: { provider: CODEBUDDY_PROVIDER_ID, model: 'glm-5.3-flash' },
    }
    expect(currentCodeBuddyRate(selection, catalog)).toEqual({ rate: 'x0.06', name: 'GLM-5.3-Flash' })
  })

  it('falls back to lastUsed when nothing is pending', () => {
    const selection: CodeBuddyModelSelectionProjection = {
      lastUsed: { provider: CODEBUDDY_PROVIDER_ID, model: 'glm-5.3' },
      next: null,
    }
    expect(currentCodeBuddyRate(selection, catalog)).toEqual({ rate: 'x0.79', name: 'GLM-5.3' })
  })

  it('returns null for a foreign provider', () => {
    const selection: CodeBuddyModelSelectionProjection = {
      lastUsed: { provider: 'deepseek', model: 'glm-5.3' },
      next: null,
    }
    expect(currentCodeBuddyRate(selection, catalog)).toBeNull()
  })

  it('returns null when the model carries no rate or the catalog is absent', () => {
    const selection: CodeBuddyModelSelectionProjection = {
      lastUsed: { provider: CODEBUDDY_PROVIDER_ID, model: 'auto' },
      next: null,
    }
    expect(currentCodeBuddyRate(selection, catalog)).toBeNull()
    expect(currentCodeBuddyRate(selection, undefined)).toBeNull()
  })

  it('returns null while the projection has not landed yet', () => {
    expect(currentCodeBuddyRate(undefined, catalog)).toBeNull()
  })
})

describe('isCodeBuddySelection', () => {
  it('shows for a CodeBuddy next selection', () => {
    const selection: CodeBuddyModelSelectionProjection = {
      lastUsed: { provider: 'deepseek', model: 'deepseek-chat' },
      next: { provider: CODEBUDDY_PROVIDER_ID, model: 'glm-5.3' },
    }
    expect(isCodeBuddySelection(selection)).toBe(true)
  })

  it('hides when next points at another provider, even if lastUsed was CodeBuddy', () => {
    const selection: CodeBuddyModelSelectionProjection = {
      lastUsed: { provider: CODEBUDDY_PROVIDER_ID, model: 'glm-5.3' },
      next: { provider: 'deepseek', model: 'deepseek-chat' },
    }
    expect(isCodeBuddySelection(selection)).toBe(false)
  })

  it('falls back to lastUsed when next is empty', () => {
    expect(isCodeBuddySelection({
      lastUsed: { provider: CODEBUDDY_PROVIDER_ID, model: 'glm-5.3' },
      next: null,
    })).toBe(true)
    expect(isCodeBuddySelection({
      lastUsed: { provider: 'deepseek', model: 'deepseek-chat' },
      next: null,
    })).toBe(false)
  })

  it('hides while the projection is absent or carries no selection', () => {
    expect(isCodeBuddySelection(undefined)).toBe(false)
    expect(isCodeBuddySelection({ lastUsed: null, next: null })).toBe(false)
  })
})

describe('creditRowPercent', () => {
  it('computes and clamps the percent', () => {
    expect(creditRowPercent(500, 1_000)).toBe(50)
    expect(creditRowPercent(2_000, 1_000)).toBe(100)
    expect(creditRowPercent(0, 1_000)).toBe(0)
  })

  it('returns null for an unknown size', () => {
    expect(creditRowPercent(500, 0)).toBeNull()
  })
})

describe('provider id sync', () => {
  it('CODEBUDDY_PROVIDER_ID matches the adapter route', async () => {
    const adapter = await import('../src/adapter.ts')
    expect(CODEBUDDY_PROVIDER_ID).toBe(adapter.CODEBUDDY_PROVIDER)
  })
})

describe('buildDockLine', () => {
  const catalog = {
    rates: { 'glm-5.3': 'x0.79', 'glm-5.3-flash': 'x0.06' },
    names: { 'glm-5.3': 'GLM-5.3', 'glm-5.3-flash': 'GLM-5.3-Flash' },
  }
  const signedIn = (credits?: { total: number, accounts: { packageName: string, remain: number, size: number }[] }): CodeBuddyDockLoad => ({
    phase: 'ok',
    value: { status: 'signed-in', ...credits === undefined ? {} : { credits }, catalog },
  })
  const withCredit = signedIn({ total: 1_642, accounts: [{ packageName: '主包', remain: 1_642, size: 2_000 }] })

  /** Render through the English table so the assertions read like the UI. */
  const render = (segments: readonly { kind: string }[]): string => renderDockSegments(
    segments as Parameters<typeof renderDockSegments>[0],
    (key: CodeBuddyCreditKey, params?: Record<string, unknown>) => Object.entries(params ?? {})
      .reduce<string>((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), en[key]),
  )

  it('shows credit, provider, model and rate for a CodeBuddy selection', () => {
    const line = buildDockLine({
      lastUsed: { provider: CODEBUDDY_PROVIDER_ID, model: 'glm-5.3' },
      next: null,
    }, withCredit)
    expect(line.codeBuddy).toBe(true)
    expect(line.credits?.total).toBe(1_642)
    expect(line.rate).toEqual({ rate: 'x0.79', name: 'GLM-5.3' })
    expect(render(line.segments)).toBe('Credits 1,642 · Provider CodeBuddy · Model GLM-5.3 · x0.79')
  })

  it('follows the next selection over lastUsed', () => {
    const line = buildDockLine({
      lastUsed: { provider: CODEBUDDY_PROVIDER_ID, model: 'glm-5.3' },
      next: { provider: CODEBUDDY_PROVIDER_ID, model: 'glm-5.3-flash' },
    }, withCredit)
    expect(line.rate).toEqual({ rate: 'x0.06', name: 'GLM-5.3-Flash' })
    expect(render(line.segments)).toContain('Model GLM-5.3-Flash')
  })

  it('omits the rate for a CodeBuddy model the catalog does not price', () => {
    const line = buildDockLine({
      lastUsed: { provider: CODEBUDDY_PROVIDER_ID, model: 'auto' },
      next: null,
    }, withCredit)
    expect(line.rate).toBeNull()
    // Unknown to the catalog, so the routing id is echoed as the model name.
    expect(render(line.segments)).toBe('Credits 1,642 · Provider CodeBuddy · Model auto')
  })

  it('shows provider and model for a foreign provider, with no credit and no rate', () => {
    const line = buildDockLine({
      lastUsed: null,
      next: { provider: 'llm-pi-ai', model: 'gpt-4o' },
    }, { phase: 'idle' })
    expect(line.codeBuddy).toBe(false)
    expect(line.credits).toBeNull()
    expect(line.rate).toBeNull()
    expect(render(line.segments)).toBe('Provider llm-pi-ai · Model gpt-4o')
  })

  it('never leaks a CodeBuddy rate onto a foreign model that shares an id', () => {
    const line = buildDockLine({
      lastUsed: null,
      // Same model id as the CodeBuddy catalog's, but another provider serves it.
      next: { provider: 'llm-pi-ai', model: 'glm-5.3' },
    }, withCredit)
    expect(line.rate).toBeNull()
    expect(render(line.segments)).toBe('Provider llm-pi-ai · Model glm-5.3')
  })

  it('keeps a placeholder row while no model is selected', () => {
    expect(render(buildDockLine(undefined, { phase: 'idle' }).segments)).toBe('No model selected')
    expect(render(buildDockLine({ lastUsed: null, next: null }, { phase: 'idle' }).segments))
      .toBe('No model selected')
  })

  it('keeps the row while the CodeBuddy status is still loading', () => {
    const line = buildDockLine({
      lastUsed: { provider: CODEBUDDY_PROVIDER_ID, model: 'glm-5.3' },
      next: null,
    }, { phase: 'loading' })
    expect(line.credits).toBeNull()
    expect(render(line.segments)).toBe('Credits … · Provider CodeBuddy · Model glm-5.3')
  })

  it('says not signed in rather than dropping the row', () => {
    const line = buildDockLine({
      lastUsed: { provider: CODEBUDDY_PROVIDER_ID, model: 'glm-5.3' },
      next: null,
    }, { phase: 'ok', value: { status: 'signed-out' } })
    expect(line.credits).toBeNull()
    expect(render(line.segments)).toBe('Credits — not signed in · Provider CodeBuddy · Model glm-5.3')
  })

  it('says unavailable for a failed read or a signed-in document with no billing answer', () => {
    const selection: CodeBuddyModelSelectionProjection = {
      lastUsed: { provider: CODEBUDDY_PROVIDER_ID, model: 'glm-5.3' },
      next: null,
    }
    expect(render(buildDockLine(selection, { phase: 'error', message: 'HTTP 500' }).segments))
      .toBe('Credits unavailable · Provider CodeBuddy · Model glm-5.3')
    // Signed in, but the upstream billing call failed: still a readable row.
    expect(render(buildDockLine(selection, signedIn()).segments))
      .toBe('Credits unavailable · Provider CodeBuddy · Model GLM-5.3 · x0.79')
  })

  it('shows a zero total instead of hiding an exhausted account', () => {
    const line = buildDockLine({
      lastUsed: { provider: CODEBUDDY_PROVIDER_ID, model: 'glm-5.3' },
      next: null,
    }, signedIn({ total: 0, accounts: [] }))
    expect(line.credits?.empty).toBe(true)
    expect(render(line.segments)).toBe('Credits 0 · Provider CodeBuddy · Model GLM-5.3 · x0.79')
  })
})
