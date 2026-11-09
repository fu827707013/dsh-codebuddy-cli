import { describe, expect, it } from 'vitest'
import { DEFAULT_DOCK_SEGMENTS as HOST_DEFAULT, DOCK_SEGMENTS } from '../src/index.ts'
import {
  DEFAULT_DOCK_SEGMENTS as CLIENT_DEFAULT,
  buildDockLine,
} from '../src/client/credit-line.ts'
import { CODEBUDDY_DOCK_SEGMENTS } from '../src/status-paths.ts'

/**
 * The composer dock's segment vocabulary exists in three places by necessity:
 * the wire contract (`status-paths`), the Host schema default (`index`, which
 * cannot be imported by the browser bundle because it pulls the provider in),
 * and the browser's own default (`credit-line`).
 *
 * `credit-line` documents that this spec keeps them in step. Without it the two
 * defaults can drift silently: the card would render one thing while the Host
 * schema validated another, and a fresh document would show a different row than
 * an existing one with the default written out explicitly.
 */
describe('dock segment vocabulary', () => {
  it('publishes exactly the four renderable segments', () => {
    expect([...CODEBUDDY_DOCK_SEGMENTS]).toEqual(['credit', 'provider', 'model', 'rate'])
  })

  it('re-exports the same list from the host half', () => {
    expect([...DOCK_SEGMENTS]).toEqual([...CODEBUDDY_DOCK_SEGMENTS])
  })

  it('keeps the host and browser defaults identical', () => {
    expect([...CLIENT_DEFAULT]).toEqual([...HOST_DEFAULT])
  })

  it('defaults to credit + provider, never model or rate', () => {
    // Model and rate already appear in the composer's own model picker, so
    // repeating them squeezes the session-stats segments into ellipsis. Provider
    // is the opposite case: the picker never shows where the model came from.
    expect([...HOST_DEFAULT]).toEqual(['credit', 'provider'])
    expect(HOST_DEFAULT).not.toContain('model')
    expect(HOST_DEFAULT).not.toContain('rate')
  })

  it('only ever names segments the wire contract knows', () => {
    const known = new Set<string>(CODEBUDDY_DOCK_SEGMENTS)
    for (const segment of [...HOST_DEFAULT, ...CLIENT_DEFAULT]) {
      expect(known.has(segment)).toBe(true)
    }
  })

  it('builds the default line from credit then provider, in that order', () => {
    const line = buildDockLine(
      { lastUsed: null, next: { provider: 'codebuddy-cli', model: 'glm-5.3' } },
      { phase: 'ok', value: { status: 'signed-out' } },
    )
    // `credit` drops out on its own when there is no signed-in credit figure, so
    // the default document renders the provider piece alone here — the point is
    // that nothing about model/rate leaks in.
    const keys = line.segments
      .filter(segment => segment.kind === 'copy')
      .map(segment => (segment as { key: string }).key)
    expect(keys).toContain('dockProvider')
    expect(keys).not.toContain('dockModel')
  })

  it('honours an explicit empty selection instead of falling back to the default', () => {
    // "", the deliberate "show nothing" choice, must not be confused with "unset".
    const line = buildDockLine(
      { lastUsed: null, next: { provider: 'codebuddy-cli', model: 'glm-5.3' } },
      { phase: 'ok', value: { status: 'signed-out' } },
      [],
    )
    expect(line.segments).toEqual([])
  })
})
