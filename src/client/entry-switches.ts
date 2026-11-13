/**
 * Which built-in entry points the host says to render.
 *
 * The client entry registers its slots inside `apply()`, before any component
 * mounts, so this has to be resolved there and not in a hook. Three surfaces are
 * switchable (settings row, sidebar row + panel, Plugins-page configuration) and
 * each defaults to on, so a host that never stored a preference — or a route
 * that answers with an error — keeps the behaviour of an untouched install.
 *
 * The read is a plain `fetch` against the same-origin route the rest of this
 * plugin already uses. It is deliberately best-effort: if the host is a headless
 * profile with no web server, or the request fails, the client must still
 * register everything rather than disappear. A plugin that vanishes because one
 * GET failed is worse than one showing an entry the operator meant to hide.
 *
 * @module dsh-codebuddy-cli/client/entry-switches
 */

/** The host-side route that reads and writes these switches. */
export const CODEBUDDY_ENTRY_SWITCHES_PATH = '/plugins/dsh-codebuddy-cli/entry-switches'

/** One switch per built-in surface. */
export interface EntrySwitches {
  /** The row in the settings dialog's own navigation. */
  settingsSection: boolean
  /** The main sidebar row and the `main` panel behind it. */
  sidebarPanel: boolean
  /** The configuration block on the Plugins page. */
  pluginsConfig: boolean
}

/** Every surface on — what an install without a stored preference gets. */
export const ALL_ENTRIES_ON: EntrySwitches = {
  settingsSection: true,
  sidebarPanel: true,
  pluginsConfig: true,
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * Read the switches from the host.
 *
 * Always resolves: a transport error, a non-JSON body, or a host that answers
 * 501 (no settings provider) all fall back to "everything on". The caller can
 * therefore await this without a try/catch.
 */
export async function readEntrySwitches(): Promise<EntrySwitches> {
  try {
    const response = await fetch(CODEBUDDY_ENTRY_SWITCHES_PATH, {
      headers: { 'Accept': 'application/json' },
    })
    if (!response.ok) return { ...ALL_ENTRIES_ON }
    const body: unknown = await response.json()
    if (typeof body !== 'object' || body === null) return { ...ALL_ENTRIES_ON }
    const record = body as Record<string, unknown>
    return {
      settingsSection: asBoolean(record['settingsSection'], true),
      sidebarPanel: asBoolean(record['sidebarPanel'], true),
      pluginsConfig: asBoolean(record['pluginsConfig'], true),
    }
  } catch {
    // Same-origin fetch failing means the host is unreachable or headless; show
    // the full plugin rather than a bare provider with no way to configure it.
    return { ...ALL_ENTRIES_ON }
  }
}

/**
 * Write one switch back to the host.
 *
 * Resolves the host's authoritative state on success — the tab renders that
 * rather than its own guess, because the host may refuse a field (it rejects
 * `settingsSection: false`) and the toggle must snap back to reality. On
 * failure it resolves the reason, which the tab shows next to the row.
 */
export async function writeEntrySwitch(
  patch: Partial<EntrySwitches>,
): Promise<{ ok: true; next: EntrySwitches } | { ok: false; message: string }> {
  try {
    const response = await fetch(CODEBUDDY_ENTRY_SWITCHES_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(patch),
    })
    const body: unknown = await response.json().catch(() => undefined)
    if (!response.ok) {
      const message = typeof body === 'object' && body !== null && typeof (body as Record<string, unknown>)['error'] === 'string'
        ? String((body as Record<string, unknown>)['error'])
        : `HTTP ${response.status}`
      return { ok: false, message }
    }
    if (typeof body !== 'object' || body === null) {
      return { ok: true, next: { ...ALL_ENTRIES_ON, ...patch } }
    }
    const record = body as Record<string, unknown>
    return {
      ok: true,
      next: {
        settingsSection: asBoolean(record['settingsSection'], patch.settingsSection ?? true),
        sidebarPanel: asBoolean(record['sidebarPanel'], patch.sidebarPanel ?? true),
        pluginsConfig: asBoolean(record['pluginsConfig'], patch.pluginsConfig ?? true),
      },
    }
  } catch (error) {
    return { ok: false, message: String(error) }
  }
}
