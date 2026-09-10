import { describe, expect, it } from 'vitest'
import { reasoningFields } from '../src/adapter.ts'
import type { CodeBuddyModelInfo } from '../src/catalog.ts'

/**
 * Reasoning-effort exposure contract.
 *
 * Two upstream row shapes exist and they must be treated differently:
 *
 * - a **declared set** (`reasoning.supportedEfforts`) advertises the exact
 *   ladder the model accepts;
 * - an **old-form** row (`reasoning.effort` + `summary`, no ladder) still
 *   accepts the standard ladder. The official CLI gates only on
 *   `supportsReasoning` before applying its global `reasoningEffort`, and the
 *   live endpoint accepts every standard level for these rows.
 *
 * Treating an absent ladder as "no effort available" is the bug that made
 * DeepSeek-V4.1-Flash show no effort selector while GLM-5.3-Flash did.
 */

/** Build a catalog entry from just the reasoning fields under test. */
function entry(reasoning: CodeBuddyModelInfo['reasoning']): CodeBuddyModelInfo {
  return {
    id: 'probe',
    name: 'Probe',
    contextWindow: 1_000,
    maxTokens: 100,
    supportsImages: false,
    // `exactOptionalPropertyTypes` forbids assigning an explicit undefined to
    // an optional property, so the absent-reasoning case omits the key.
    ...reasoning === undefined ? {} : { reasoning },
  }
}

/** The offered effort ids, sorted, or undefined when no control is offered. */
function offeredEfforts(reasoning: CodeBuddyModelInfo['reasoning']): string[] | undefined {
  const fields = reasoningFields(entry(reasoning))
  if (fields.thinkingLevelMap === undefined) return undefined
  return Object.entries(fields.thinkingLevelMap)
    .filter(([, wire]) => wire !== null)
    .map(([level]) => level)
    .sort()
}

describe('reasoningFields', () => {
  it('offers no thinking control for a non-reasoning model', () => {
    const fields = reasoningFields(entry(undefined))
    expect(fields.reasoning).toBe(false)
    expect(fields.thinkingLevelMap).toBeUndefined()
  })

  it('offers no thinking control when supports is false', () => {
    const fields = reasoningFields(entry({ supports: false, onlyReasoning: false, canDisableThinking: false }))
    expect(fields.reasoning).toBe(false)
  })

  it('offers the standard ladder for an old-form row with no declared set', () => {
    // This is the DeepSeek-V4.1-Flash shape: `{effort, summary}` and nothing
    // else. It must still expose the ladder the upstream accepts.
    expect(offeredEfforts({
      supports: true,
      onlyReasoning: true,
      defaultEffort: 'high',
      canDisableThinking: false,
    })).toEqual(['high', 'low', 'max', 'medium', 'xhigh'])
  })

  it('offers exactly the declared set when the row declares one', () => {
    expect(offeredEfforts({
      supports: true,
      onlyReasoning: true,
      supportedEfforts: ['low', 'high', 'max'],
      defaultEffort: 'high',
      canDisableThinking: true,
    })).toEqual(['high', 'low', 'max', 'off'])
  })

  it('falls back to the standard ladder for an empty declared set', () => {
    expect(offeredEfforts({
      supports: true,
      onlyReasoning: true,
      supportedEfforts: [],
      canDisableThinking: false,
    })).toEqual(['high', 'low', 'max', 'medium', 'xhigh'])
  })

  it('offers off only when the model reports thinking can be disabled', () => {
    expect(offeredEfforts({
      supports: true,
      onlyReasoning: true,
      supportedEfforts: ['high'],
      canDisableThinking: false,
    })).toEqual(['high'])

    expect(offeredEfforts({
      supports: true,
      onlyReasoning: true,
      supportedEfforts: ['high'],
      canDisableThinking: true,
    })).toEqual(['high', 'off'])
  })

  it('never offers minimal, which is outside the upstream vocabulary', () => {
    // `minimal` is not in EFFORT_VALUES, so no declared set can contain it and
    // the fallback ladder must not invent it either — the endpoint rejects
    // values outside its vocabulary with code 11150.
    expect(offeredEfforts({
      supports: true,
      onlyReasoning: true,
      canDisableThinking: true,
    })).not.toContain('minimal')
  })

  it('pins each offered level to its own wire spelling', () => {
    const fields = reasoningFields(entry({
      supports: true,
      onlyReasoning: true,
      supportedEfforts: ['low', 'xhigh'],
      canDisableThinking: false,
    }))
    expect(fields.thinkingLevelMap).toMatchObject({
      low: 'low',
      xhigh: 'xhigh',
      medium: null,
      high: null,
      max: null,
      minimal: null,
      off: null,
    })
  })
})
