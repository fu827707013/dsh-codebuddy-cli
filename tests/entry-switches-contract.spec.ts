import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Contract test over the entry-switch route and the client's switch tab.
 *
 * The constraint these lock is a user decision: all three built-in entries are
 * switchable EXCEPT the settings row. That row is the recovery path — with it
 * off and the sidebar row off, nothing would be left that could turn either back
 * on, and the plugin would be unreachable short of a reinstall. Enforcing it in
 * one place only (say, a disabled checkbox) would not be enough: the host route
 * is reachable by any same-origin caller, so the refusal has to live there.
 */
const routePath = fileURLToPath(new URL('../src/web-status.ts', import.meta.url))
const hostPath = fileURLToPath(new URL('../src/index.ts', import.meta.url))
const tabPath = fileURLToPath(new URL('../src/client/CodeBuddyEntriesTab.tsx', import.meta.url))
const pathsPath = fileURLToPath(new URL('../src/status-paths.ts', import.meta.url))

const route = readFileSync(routePath, 'utf8')
const host = readFileSync(hostPath, 'utf8')
const tab = readFileSync(tabPath, 'utf8')
const paths = readFileSync(pathsPath, 'utf8')

describe('entry switches', () => {
  it('rejects an attempt to switch the settings row off', () => {
    // The refusal must be explicit: silently dropping the field would report
    // success while leaving the operator's intent unrecorded.
    expect(route).toMatch(/record\['settingsSection'\] === false/)
    expect(route).toContain('cannot be turned off')
  })

  it('does not offer the settings row as a writable field', () => {
    // The supported write surface is exactly these two; a third entry here would
    // mean the route accepts a field the host refuses to store.
    expect(route).toMatch(/for \(const key of \['sidebarPanel', 'pluginsConfig'\] as const\)/)
    expect(route).not.toMatch(/for \(const key of \[[^\]]*'settingsSection'[^\]]*\] as const\)/)
  })

  it('reports the settings row as always on', () => {
    // Read path: it is not stored, so it is resolved to `true` rather than read
    // off the settings document.
    expect(host).toMatch(/settingsSection:\s*true/)
    // And nothing may write it into the settings document any more.
    expect(host).not.toMatch(/update\['showSettingsSection'\]/)
  })

  it('renders the settings row as a locked, always-on switch', () => {
    expect(tab).toMatch(/key: 'settingsSection'[^}]*locked: true/)
    expect(tab).toMatch(/disabled=\{[^}]*row\.locked === true/)
    // A locked row must still show checked, whatever the host reported.
    expect(tab).toMatch(/row\.locked === true \? true : checked/)
  })

  it('renders the switches as a fifth tab of the existing strip, not a second bar', () => {
    // The card already had one tab strip (accounts / models / stats / remaining).
    // Adding a second strip above it made the page read as two navigation levels
    // and hid the real tabs behind a redundant one. The switches belong to the
    // SAME strip, so the body must own the tab and no outer tab bar may exist.
    const card = readFileSync(
      fileURLToPath(new URL('../src/client/CodeBuddyPluginCard.tsx', import.meta.url)),
      'utf8',
    )
    expect(card).toMatch(/type CardTab =[^\n]*'entries'/)
    expect(card).toMatch(/key: 'entries', label: t\('tabEntries'\)/)
    expect(card).toMatch(/tab === 'entries'/)
    // The panel must delegate to the shared body instead of re-drawing tabs.
    expect(tab).toBeDefined()
  })

  it('documents the recovery-path reason where the shape is declared', () => {
    // Whoever changes the shape next needs the reason next to it, not only in a
    // test they may never open.
    expect(paths).toMatch(/recovery path/i)
  })
})
