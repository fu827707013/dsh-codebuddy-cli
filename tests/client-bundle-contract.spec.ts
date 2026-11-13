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
  it('no longer registers the retired settings.plugins.tab (#14)', () => {
    // Two configuration UIs competed for the same job. The tab also only ever
    // rendered where `ui-settings-plugins` was enabled, which is exactly the
    // deployment that already had the Plugins-page card.
    // Assert on the registration CALL, not on the raw string: the entry's
    // comment explains why the tab was dropped and legitimately names it.
    expect(bundle).not.toMatch(/name:\s*"settings\.plugins\.tab"/)
    expect(bundle).not.toMatch(/inject\(\s*"settings\.plugins\.tab"/)
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
    // The panel must also draw its own way back: the host renders a `main`
    // entry with no chrome, so a panel without this strands the user.
    expect(bundle).toContain('selectPanel(null)')
    expect(bundle).toMatch(/backToConversation/)
  })

  it('registers a first-level settings section, not only the plugins tab (#14)', () => {
    // `settings.plugins.tab` is declared by `ui-settings-plugins`, which a
    // third-party bundle can disable — on that deployment the callback never
    // runs and the card is unreachable with nothing logged. `settings.section`
    // is declared by the settings SHELL itself, so it survives.
    expect(bundle).toContain('settings.section')
    expect(bundle).toMatch(/SIDEBAR_PANEL_ID/)
  })

  it('sizes the dock row to its content so segments off actually free width (#14)', () => {
    // The dock shares `conversation.composer.dock` with the host's stats strip.
    // As a `width: 100%` block it ate the row regardless of how little it showed,
    // so disabling segments reclaimed nothing and the stats stayed ellipsised.
    //
    // Assert on the dock's own style object, not on the whole bundle: the card
    // and the panel legitimately use `width: '100%'` for their own layout, so a
    // bundle-wide negative would fail for the wrong reason.
    const dock = bundle.slice(
      bundle.indexOf('const rootStyle'),
      bundle.indexOf('const triggerStyle'),
    )
    expect(dock.length).toBeGreaterThan(0)
    expect(dock).toContain('fit-content')
    expect(dock).not.toContain(`width: "100%"`)
    // `maxWidth` is a different property and legitimately stays as the cap.
    expect(dock).toContain('maxWidth')
  })

  it('keeps the dock root unclipped so the credit panel can escape upward', () => {
    // The credit panel is `position: absolute` with `bottom: calc(100% + 8px)` —
    // it renders ABOVE the row, inside the root as its containing block. Any
    // `overflow: hidden` on that root removes the whole panel: it is laid out
    // fully outside the clip box and paints nowhere, so clicking the credit line
    // looked like a dead control. Measured before the fix with a probe element:
    // child.bottom 631 < host.top 639, i.e. entirely outside the clip.
    //
    // The one-line ellipsis therefore has to live on the text node, not on the
    // padding box that also anchors the panel.
    const dock = bundle.slice(
      bundle.indexOf('const rootStyle'),
      bundle.indexOf('const lineStyle'),
    )
    expect(dock.length).toBeGreaterThan(0)
    expect(dock).not.toContain('overflow: "hidden"')
    // The panel must still be anchored to this root, so `position: relative` stays.
    expect(dock).toContain('position: "relative"')
  })

  it('applies the ellipsis to the credit text itself', () => {
    const line = bundle.slice(
      bundle.indexOf('const lineStyle'),
      bundle.indexOf('const triggerStyle'),
    )
    expect(line).toContain('overflow: "hidden"')
    expect(line).toContain('textOverflow: "ellipsis"')
    expect(line).toContain('minWidth: 0')
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

  it('never imports the retired size-suffixed icon names', () => {
    // The collapsible card shell that used to own the chevron is no longer
    // registered (the settings tab it lived in was removed in favour of the
    // panel + section rows), so the surviving assertion is the negative one:
    // none of the retired names may creep back in.
    expect(bundle).not.toMatch(/IconChevronDownOutline\d+/)
    expect(bundle).not.toMatch(/IconChevronDownOutlineRegular\d+/)
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
    // Bound the region by the NEXT top-level function rather than by a named
    // one: the collapsible shell that used to follow the body is no longer
    // registered, and slicing to a missing marker silently yielded an empty
    // region — a test that passes for the wrong reason is worse than none.
    const start = source.indexOf('function CodeBuddyConfigBody')
    expect(start).toBeGreaterThan(-1)
    const after = source.slice(start + 'function CodeBuddyConfigBody'.length)
    const nextFn = after.indexOf('function ')
    const region = nextFn === -1 ? after : after.slice(0, nextFn)
    expect(region.length).toBeGreaterThan(0)
    expect(region).not.toMatch(/if \(!open\)/)
    expect(region).not.toMatch(/\[open,/)
    // The initial signed-out placeholder must be replaced by a real read: the
    // mount effect calls refresh with a fresh AbortController, ungated.
    expect(region).toMatch(/new AbortController\(\)/)
  })

  it('renders the config body from both surviving entries', () => {
    // The collapsible card shell that used to wrap the body is gone: the
    // settings tab it lived in was removed, and the panel/section pages render
    // the body directly. Both must still reach it, or the plugin would have a
    // configuration UI with nothing in it.
    const source = bundle ?? ''
    expect(source).toMatch(/CodeBuddyConfigBody/)
    expect(source).toContain('CodeBuddyPanel')
    expect(source).toContain('CodeBuddySettingsPage')
  })
})
