import { describe, expect, it } from 'vitest'
import { CODEBUDDY_PROVIDER_ID } from '../src/status-paths.ts'
import {
  buildCreditLine,
  creditRowPercent,
  currentCodeBuddyRate,
  formatCompactCredits,
  isCodeBuddySelection,
} from '../src/client/credit-line.ts'
import type { CodeBuddyModelSelectionProjection } from '../src/client/credit-line.ts'

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
