import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Contract tests over the BUILT client bundle.
 *
 * Two DSH 0.1.7 renames broke the settings card silently — the host served a
 * bundle whose slot nothing renders, and whose icon import resolved to
 * `undefined` (React error #130), so the card appeared as a blank tab with no
 * error dialog. Neither failure is reachable from the source-level tests, so
 * these assertions read `lib/client.js` itself: it is the artifact the browser
 * actually loads.
 *
 * Skip (rather than fail) when the bundle is absent: `npm test` runs before
 * `npm run build` in a clean checkout.
 */
const bundlePath = fileURLToPath(new URL('../lib/client.js', import.meta.url))

let bundle: string | undefined
try {
  bundle = readFileSync(bundlePath, 'utf8')
} catch {
  bundle = undefined
}

const maybe = bundle === undefined ? describe.skip : describe

maybe('built client bundle slot + icon contract', () => {
  it('registers the current plugin-configuration slot name', () => {
    // `settings.plugins.tab` is the Settings → Plugins tab this release supports.
    expect(bundle).toContain('settings.plugins.tab')
  })

  it('does not register the retired pre-0.1.7 slot name', () => {
    // `settings.plugin.item` is not declared by any host in the supported range
    // (`engines.dsh >= 0.2.1-rc.2`), so registering it would only add a dead
    // entry. Users below that range are told to install the older release.
    expect(bundle).not.toContain('settings.plugin.item')
  })

  it('registers the sidebar row and its main panel (#17)', () => {
    // The Plugins-page and settings-tab routes both hang off slots whose
    // declaring package a third-party bundle can disable — on such a deployment
    // the card is unreachable and nothing reports why. `sidebar.panellist` and
    // `main` are declared by host modules, so this pair is the route that holds.
    expect(bundle).toContain('sidebar.panellist')
    expect(bundle).toContain('dsh-codebuddy-panel')
  })

  it('labels the tab, so the strip never shows an unlabelled blank tab', () => {
    // The slot contract documents `label` as the registrant-localized tab text.
    // It resolves the short `tabLabel` key (the tab shares a row with the
    // host's own tabs), not the full card title.
    expect(bundle).toMatch(/label:\s*\(\)\s*=>\s*t\("tabLabel"\)/)
  })

  it('does not import the retired size-suffixed icon name', () => {
    // `IconChevronDownOutline14` is gone in 0.1.7; importing it yields
    // `undefined` and React rejects the element type (error #130).
    expect(bundle).not.toContain('IconChevronDownOutline14')
  })

  it('imports the current primitive icon name that the host actually exports', () => {
    expect(bundle).toContain('IconChevronDownOutlineRegular')
  })

  it('gates the dock row on the setting instead of hiding it unconditionally', () => {
    // The dock shares a flex line with the host's session-stats strip, so an
    // extra row on a foreign provider can squeeze the rounds/token segments into
    // ellipsis (#6). The row must stay visible by default and bail out only when
    // the operator turned it off — a hardcoded `!codeBuddy` return would silently
    // remove the provider name the reporter asked to keep.
    expect(bundle).toMatch(/if \(!codeBuddy && !showOnOtherProviders\)/)
    expect(bundle).not.toMatch(/if \(!codeBuddy\)\s*return null/)
  })

  it('loads the status on mount without gating it on a collapse flag', () => {
    // `CodeBuddyConfigBody` is mounted directly on the Plugins page, where there
    // is no collapsible shell to flip any flag. When it still carried the card's
    // `open` state — default false and never set true on that surface — the
    // status read never fired and the page showed a permanent "not signed in"
    // while the host answered `signed-in`. The body must fetch on mount.
    //
    // The check is scoped to the body's own source region: other components
    // legitimately use `open` (the dock's dismiss-on-outside-click effect), so a
    // whole-bundle search would fail for the wrong reason.
    const source = bundle ?? ''
    expect(source).toContain('CodeBuddyConfigBody')
    const body = source.slice(source.indexOf('function CodeBuddyConfigBody'))
    const region = body.slice(0, body.indexOf('function CodeBuddyPluginCard'))
    expect(region.length).toBeGreaterThan(0)
    expect(region).not.toMatch(/if \(!open\)/)
    expect(region).not.toMatch(/\[open,/)
    // The initial signed-out placeholder must be replaced by a real read: the
    // mount effect calls refresh with a fresh AbortController, ungated.
    expect(region).toMatch(/new AbortController\(\)/)
  })

  it('keeps the collapsible card as a thin shell around the body', () => {
    // The card owns `open` and the header; the body owns the data. Sharing one
    // state between the two is what produced the regression above.
    expect(bundle).toMatch(/open \? .*CodeBuddyConfigBody/)
  })
})
