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

  it('defaults to credit only, never provider/model/rate (#14)', () => {
    // Model and rate already appear in the composer's own model picker, so
    // repeating them squeezes the session-stats segments into ellipsis. Provider
    // is the opposite case: the picker never shows where the model came from.
    expect([...HOST_DEFAULT]).toEqual(['credit'])
    expect(HOST_DEFAULT).not.toContain('model')
    expect(HOST_DEFAULT).not.toContain('rate')
  })

  it('only ever names segments the wire contract knows', () => {
    const known = new Set<string>(CODEBUDDY_DOCK_SEGMENTS)
    for (const segment of [...HOST_DEFAULT, ...CLIENT_DEFAULT]) {
      expect(known.has(segment)).toBe(true)
    }
  })

  it('renders only credit from the default document (#14)', () => {
    const signedIn = buildDockLine(
      { lastUsed: null, next: { provider: 'codebuddy-cli', model: 'glm-5.3' } },
      { phase: 'ok', value: { status: 'signed-in', credits: { total: 1_642, accounts: [{ packageName: '主包', remain: 1_642, size: 2_000 }] } } },
    )
    const keys = signedIn.segments
      .filter(segment => segment.kind === 'copy')
      .map(segment => (segment as { key: string }).key)
    // Credit is the row's reason to exist; provider and model are both visible
    // elsewhere in the composer, and repeating them spends the width this plugin
    // shares with the host's session-stats strip.
    // The credit segment carries its own keys (creditTotalCompact / creditSignedOut
    // / …), not a `dockCredits` one — assert the absence of the copy segments that
    // the default no longer enables.
    expect(keys.some(k => k.startsWith('credit'))).toBe(true)
    expect(keys).not.toContain('dockProvider')
    expect(keys).not.toContain('dockModel')

    // Signed out there is no figure to show, so the row renders nothing at all
    // rather than falling back to a segment the default no longer includes.
    const signedOut = buildDockLine(
      { lastUsed: null, next: { provider: 'codebuddy-cli', model: 'glm-5.3' } },
      { phase: 'ok', value: { status: 'signed-out' } },
    )
    const outKeys = signedOut.segments
      .filter(segment => segment.kind === 'copy')
      .map(segment => (segment as { key: string }).key)
    expect(outKeys).not.toContain('dockProvider')
    expect(outKeys).not.toContain('dockModel')
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
