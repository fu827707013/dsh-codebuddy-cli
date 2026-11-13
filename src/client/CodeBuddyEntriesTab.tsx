/**
 * The `入口` (entries) tab: which built-in surfaces this plugin renders.
 *
 * It lives inside the plugin's own configuration page because the switches have
 * to be reachable from somewhere that cannot itself be switched off. The sidebar
 * panel is that place: `sidebar.panellist` is declared by `ui-sidebar`, a host
 * module no bundle disables, so the panel survives the deployment shape that
 * motivated #17. Turning the sidebar row off therefore still leaves the settings
 * dialog row (equally host-declared) able to bring it back.
 *
 * The write is a plain POST to the host route; the switches only take effect the
 * next time the client entry runs (`apply()` decides registrations), so the tab
 * says so instead of pretending the change is instant.
 */

import { useCallback, useEffect, useState } from 'react'
import type { CodeBuddyPluginCardInjected } from './CodeBuddyPluginCard.tsx'
import type { CodeBuddySettingsKey } from './locales.ts'
import { readEntrySwitches, writeEntrySwitch } from './entry-switches.ts'
import type { EntrySwitches } from './entry-switches.ts'
import css from './CodeBuddyPluginCard.module.css'

/** One row in the switches tab. */
interface SwitchRow {
  key: keyof EntrySwitches
  /** Locale key for the row title. */
  title: CodeBuddySettingsKey
  /** Locale key for the one-line explanation under the title. */
  hint: CodeBuddySettingsKey
  /** Rendered as a locked, always-on row. */
  locked?: boolean
}

const ROWS: readonly SwitchRow[] = [
  { key: 'sidebarPanel', title: 'entriesSidebar', hint: 'entriesSidebarHint' },
  // Locked on: with this off *and* the sidebar row off there would be no surface
  // left that could turn either back on. The host rejects the write too, so a
  // disabled checkbox here matches what the route would actually do.
  { key: 'settingsSection', title: 'entriesSettings', hint: 'entriesSettingsHint', locked: true },
  { key: 'pluginsConfig', title: 'entriesPlugins', hint: 'entriesPluginsHint' },
]

/**
 * The switches tab body.
 *
 * Reads the host state on mount rather than trusting the value that decided this
 * render: the entry may have been registered from a stale read, and showing the
 * real stored state is what makes the toggle honest.
 */
export function CodeBuddyEntriesTab({ t }: { t: CodeBuddyPluginCardInjected['t'] }) {
  const [state, setState] = useState<EntrySwitches | undefined>(undefined)
  const [busy, setBusy] = useState<keyof EntrySwitches | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let live = true
    void readEntrySwitches().then((next) => {
      if (live) setState(next)
    })
    return () => { live = false }
  }, [])

  const toggle = useCallback(async (key: keyof EntrySwitches, value: boolean) => {
    setBusy(key)
    setError(undefined)
    setSaved(false)
    const result = await writeEntrySwitch({ [key]: value })
    if (result.ok) {
      setState(result.next)
      setSaved(true)
    } else {
      setError(result.message)
      // Re-read so the toggle snaps back to what the host actually holds.
      setState(await readEntrySwitches())
    }
    setBusy(undefined)
  }, [])

  if (state === undefined) {
    return <p className={css.entriesLoading}>{t('entriesLoading')}</p>
  }

  return (
    <div className={css.entries}>
      <p className={css.entriesIntro}>{t('entriesIntro')}</p>
      <ul className={css.entriesList}>
        {ROWS.map((row) => {
          const checked = state[row.key]
          return (
            <li key={row.key} className={css.entriesRow}>
              <label className={css.entriesLabel}>
                <input
                  type="checkbox"
                  className={css.entriesCheckbox}
                  checked={row.locked === true ? true : checked}
                  disabled={busy !== undefined || row.locked === true}
                  onChange={(event) => { void toggle(row.key, event.currentTarget.checked) }}
                />
                <span className={css.entriesText}>
                  <span className={css.entriesTitle}>
                    {t(row.title)}
                    {row.locked === true ? <span className={css.entriesLocked}>{t('entriesLocked')}</span> : null}
                  </span>
                  <span className={css.entriesHint}>{t(row.hint)}</span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      {error === undefined ? null : <p className={css.entriesError}>{t('entriesFailed')}{error}</p>}
      {saved ? <p className={css.entriesSaved}>{t('entriesSaved')}</p> : null}
      <p className={css.entriesNote}>{t('entriesReloadNote')}</p>
    </div>
  )
}
