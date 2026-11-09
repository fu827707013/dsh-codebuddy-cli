/**
 * Sidebar panel page: the CodeBuddy configuration rendered as a full `main`
 * panel rather than a settings dialog.
 *
 * Why this exists as a third entry point (issue #17): the Plugins-page card and
 * the `settings.plugins.tab` registration both depend on slots whose declaring
 * package can be disabled by a third-party bundle. On a deployment that turns
 * `ui-settings-plugins` off — a real, shipped configuration — neither slot is
 * ever declared, so `slots.inject` never runs its callback and the card is
 * unreachable with no error at all. `sidebar.panellist` is declared by
 * `ui-sidebar`, and `main` by `ui-layout`; both are host modules a bundle has no
 * reason to disable, so this route survives.
 *
 * Clicking the sidebar row is handled by the HOST (`ui-sidebar` calls
 * `layout.selectPanel(id)` itself), so this file only has to render the panel.
 */

import { CodeBuddyConfigBody } from './CodeBuddyPluginCard.tsx'
import type { CodeBuddyPluginCardInjected } from './CodeBuddyPluginCard.tsx'

/** Injected face of the `main` panel entry registered in `index.tsx`. */
export interface CodeBuddyPanelInjected {
  t: CodeBuddyPluginCardInjected['t']
}

/**
 * The panel body.
 *
 * `selectPanel` renders exactly one keyed `main` entry at a time, so this is a
 * page rather than a collapsible card: the body mounts expanded and the page
 * supplies its own heading, because the sidebar row's label is only visible
 * while the sidebar is wide.
 */
export function CodeBuddyPanel({ t }: Partial<CodeBuddyPanelInjected>) {
  if (t === undefined) throw new Error('CodeBuddy panel requires its translation function')
  return (
    <div className="dsh-codebuddy-panel">
      <h2 className="dsh-codebuddy-panel-title">{t('title')}</h2>
      <CodeBuddyConfigBody t={t} />
    </div>
  )
}

/**
 * The sidebar row's glyph.
 *
 * The host renders this inside an `aria-hidden` span and gives the button its
 * accessible name from the row's `label`, so the mark is decorative: no title,
 * no text. `size` is supplied by the sidebar and differs between the wide (16)
 * and collapsed (18) states, which is why it is forwarded rather than fixed.
 *
 * Drawn inline instead of importing an icon: the plugin already ships no icon
 * dependency, and one glyph does not justify adding one. The shape is a terminal
 * prompt (`>_`), which reads as "CLI" at both sizes.
 */
export function CodeBuddyPanelGlyph(props: { size?: number }) {
  const size = props.size ?? 16
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" focusable="false">
      <path d="M3.5 4.5 6.5 8l-3 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 11.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
