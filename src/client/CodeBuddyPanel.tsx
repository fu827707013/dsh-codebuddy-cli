/**
 * Sidebar panel page: the CodeBuddy configuration rendered as a full `main`
 * panel rather than a settings dialog.
 *
 * Why this exists (issue #17): the Plugins-page card and the old
 * `settings.plugins.tab` registration both depend on slots whose declaring
 * package can be disabled by a third-party bundle. On a deployment that turns
 * `ui-settings-plugins` off — a real, shipped configuration — neither slot is
 * ever declared, so `slots.inject` never runs its callback and the card is
 * unreachable with no error at all. `sidebar.panellist` is declared by
 * `ui-sidebar`, and `main` by `ui-layout`; both are host modules a bundle has no
 * reason to disable, so this route survives.
 *
 * Clicking the sidebar row is handled by the HOST (`ui-sidebar` calls
 * `layout.selectPanel(id)` itself). Getting back out is NOT: the host's
 * `MainPanel` renders the slot with no chrome at all, so a panel that does not
 * draw its own way back strands the user on a page with no exit. `ui-layout`
 * keeps the conversation at the null panel id, so leaving is
 * `layout.selectPanel(null)`.
 */

import { CodeBuddyConfigBody } from './CodeBuddyPluginCard.tsx'
import type { CodeBuddyPluginCardInjected } from './CodeBuddyPluginCard.tsx'
import css from './CodeBuddyPluginCard.module.css'

/** Injected face of the `main` panel entry registered in `index.tsx`. */
export interface CodeBuddyPanelInjected {
  t: CodeBuddyPluginCardInjected['t']
  /** Return to the conversation view (`layout.selectPanel(null)`). */
  close: () => void
}

/**
 * The panel body.
 *
 * `selectPanel` renders exactly one keyed `main` entry at a time, so this is a
 * page rather than a collapsible card. The masthead carries the title and the
 * way back, because the sidebar row's own label is only visible while the
 * sidebar is wide.
 *
 * The page is the SAME body every other surface renders — accounts / models /
 * credit stats / remaining credit, plus the `入口` switches as a fifth tab of
 * that one strip. It deliberately does not stack a second tab bar on top: the
 * switches are one more page of the same card, not a separate navigation level.
 */
export function CodeBuddyPanel({ t, close }: Partial<CodeBuddyPanelInjected>) {
  if (t === undefined) throw new Error('CodeBuddy panel requires its translation function')
  return (
    <div className={css.panel}>
      <div className={css.panelMasthead}>
        {close === undefined ? null : (
          <button
            type="button"
            className={css.panelBack}
            onClick={close}
            aria-label={t('backToConversation')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
              <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t('backToConversation')}</span>
          </button>
        )}
        <h2 className={css.panelTitle}>{t('title')}</h2>
      </div>
      <CodeBuddyConfigBody t={t} />
    </div>
  )
}

/**
 * The settings-dialog page body.
 *
 * Same content as the sidebar panel minus the masthead: the settings shell draws
 * its own title and close control around a `settings.section` entry, so adding a
 * second back button there would duplicate the host's chrome.
 */
export function CodeBuddySettingsPage({ t }: Partial<CodeBuddyPanelInjected>) {
  if (t === undefined) throw new Error('CodeBuddy settings page requires its translation function')
  return (
    <div className={css.panel}>
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
