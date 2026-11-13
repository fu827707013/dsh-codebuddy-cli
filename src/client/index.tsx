/** Browser half: CodeBuddy account status on the DSH Plugins page. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the settings shell declares `settings.section` in its own SlotMap
// merge (ui-settings/src/client/contract/slots.ts) precisely so section
// contributors can type against it without depending on one another. Without
// this import the name is not part of the slot union and `register` rejects it.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the conversation composer.dock slot and the session
// standard kit (useProjection) the credit dock reads.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: installs the Session standard props merge (useProjection seat).
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: merges the modelSelection key into SessionProjectionMap.
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: the Plugins-page configuration slots (`plugins.bundle.config`,
// `plugins.row.config`) are declared by the plugin-manager's SlotMap merge, so
// contributors can type their registrations without importing the package.
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
// Type-only: declares `sidebar.panellist` (the row) — the route that survives a
// deployment disabling `ui-settings-plugins` (issue #17).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: declares `main`, the keyed panel slot the sidebar row selects.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { CodeBuddyPluginCardInjected } from './CodeBuddyPluginCard.tsx'
import { CodeBuddyConfigPage } from './CodeBuddyConfigPage.tsx'
import type { CodeBuddyConfigPageInjected } from './CodeBuddyConfigPage.tsx'
import { CodeBuddyPanel, CodeBuddyPanelGlyph, CodeBuddySettingsPage } from './CodeBuddyPanel.tsx'
import type { CodeBuddyPanelInjected } from './CodeBuddyPanel.tsx'
import { CodeBuddyCreditDock } from './CodeBuddyCreditDock.tsx'
import type { CodeBuddyCreditDockInjected } from './CodeBuddyCreditDock.tsx'
import { readEntrySwitches } from './entry-switches.ts'
import { en, zh } from './locales.ts'
import type { CodeBuddySettingsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** CodeBuddy plugin card copy. */
    'settings.codebuddy-cli': CodeBuddySettingsKey
  }
}

/** Stable browser-plugin name. */
export const name = 'dsh-codebuddy-cli-client'

/**
 * The sidebar row id and its `main` panel key.
 *
 * One value for both: `ui-sidebar` calls `layout.selectPanel(id)` with the row's
 * `id`, and the layout renders the `main` entry whose `key` matches it. Keeping
 * them as a single constant is what stops the pair drifting into a dead row.
 */
const SIDEBAR_PANEL_ID = 'dsh-codebuddy-cli'
/**
 * Client services required by these contributions.
 *
 * DSH 0.1.2 removed `@deepseek-ai/dsh-client-runtime` (the package that used to
 * hold the browser `ClientContext` alias and the `slots` service). The services
 * relied on here now come from narrower packages: the `slots` registry moved to
 * `@deepseek-ai/dsh-client-ui-renderer` and `locale` stayed in
 * `@deepseek-ai/dsh-client-locale`. Both are named in the package's
 * `dsh.client.inject` list, so cordis has activated them before this plugin's
 * fiber starts.
 *
 * `dsh.client.inject` additionally lists the packages that DECLARE the slots
 * registered below, because a slot registration is only typed and resolved when
 * its declaring package is part of the client graph. Adding a registration
 * without adding its declarer there makes the whole client entry fail to
 * resolve — the symptom is a bare `client ✗` from a package reload while the
 * host provider keeps working. `plugins.bundle.config` / `plugins.row.config`
 * are declared by `@deepseek-ai/dsh-client-ui-plugin-manager`.
 *
 * `layout` is a SERVICE, not a slot declarer, and the two lists are independent:
 * `dsh.client.inject` orders package loading, while this list decides which
 * services cordis injects into `ctx`. Without `layout` here `ctx.layout` is
 * `undefined`, so the panel's Back control threw on every click while React's
 * production build swallowed the error — a button that looked wired and did
 * nothing. `dsh-mnemon`, which implements the same sidebar-panel pattern,
 * injects `layout` for exactly this reason.
 */
export const inject = ['slots', 'locale', 'layout']

/**
 * Register card copy and every browser surface this plugin contributes.
 *
 * Each surface registers inside its own guard. They are independent — a Settings
 * tab, a composer row, and two Plugins-page views — so one host rejecting a slot
 * must not take the others down. That is what #17 exposed: with a single outer
 * try/catch, a slot whose declaring package was disabled left no trace beyond one
 * console line, and every later registration in the same body silently never ran.
 *
 * A failure here degrades to a `console.error` instead of throwing into the DSH
 * loader (which would raise the red "Failed to load plugins" banner). The host
 * provider keeps working regardless: the `codebuddy` model channel is untouched,
 * and `dsh-codebuddy-cli status` reports host health via the heartbeat file.
 *
 * NOTE: the guard shape is mirrored in `tests/client-fallback.spec.ts`, because the
 * real client entry imports browser-only DSH packages that cannot load in the Node
 * test environment. That test replicates this structure rather than importing it.
 * If you change the guarded body or the `console.error` text, update the mirrored
 * `apply()` there too, or the fallback test silently diverges.
 */
export function apply(ctx: ClientContext): void {
  const attempt = (label: string, register: () => void): void => {
    try {
      register()
    } catch (error: unknown) {
      console.error(`[dsh-codebuddy-cli] ${label} failed to register (host provider unaffected):`, error)
    }
  }

  const namespace = 'settings.codebuddy-cli'
  ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'dsh-codebuddy-cli: settings copy')
  const t = ctx.locale.bind(namespace) as CodeBuddyPluginCardInjected['t']

  /**
   * Register the switchable surfaces once the host has answered.
   *
   * `apply()` cannot await, so the entries a switch controls are registered from
   * a resolved promise. Two things make that safe:
   *
   * - The read is wrapped in `ctx.effect`, so if the fiber unloads while the
   *   fetch is still in flight the callback never touches a disposed context
   *   (`slots.inject` throws `INACTIVE_EFFECT` there) and the registrations are
   *   torn down with everything else belonging to this plugin.
   * - `inject` waits for its declaring package regardless of when it is called,
   *   so a slot registered a tick late still lands in the ledger long before a
   *   user can open a panel.
   *
   * The alternative — register everything and hide the markup — is NOT
   * equivalent: a hidden sidebar row still occupies a line in the host's own
   * list, which is exactly what the switch exists to remove.
   *
   * A read failure yields `ALL_ENTRIES_ON`, so a headless or unreachable host
   * shows the full plugin rather than nothing.
   */
  ctx.effect(() => {
    let live = true
    void readEntrySwitches().then((entries) => {
      if (!live) return
      // The DSH-standard configuration surfaces on the Plugins page. Both slots are
      // keyed: the bundle key is the package name, the row key is
      // `<package>#<row id>` with the row id as cordis.patch.yml declares it.
      if (entries.pluginsConfig) {
        attempt('bundle configuration page', () => {
          ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
            name: 'plugins.bundle.config',
            key: 'dsh-codebuddy-cli',
            locale: namespace,
            inject: (): CodeBuddyConfigPageInjected => ({ t }),
          }, CodeBuddyConfigPage))
        })

        attempt('row configuration page', () => {
          ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
            name: 'plugins.row.config',
            key: 'dsh-codebuddy-cli#llm-codebuddy-cli',
            locale: namespace,
            inject: (): CodeBuddyConfigPageInjected => ({ t }),
          }, CodeBuddyConfigPage))
        })
      }

      // Settings → <first-level nav row>. A `{ kind: 'list', scope: 'root' }` slot
      // declared by `dsh-client-ui-settings-general` — the same host package that
      // draws the settings shell, so this surface exists on every host that has
      // settings at all. That is why it is the reachable configuration path on a
      // deployment where `ui-settings-plugins` is off.
      //
      // `settings.plugins.tab` is deliberately NOT registered any more: two
      // configuration UIs competed for the same job, and on the deployment shape
      // that motivated #17 the declaring package was disabled anyway, so the tab
      // never rendered there.
      if (entries.settingsSection) {
        attempt('settings section', () => {
          ctx.slots.inject('settings.section', () => ctx.slots.register({
            name: 'settings.section',
            id: SIDEBAR_PANEL_ID,
            order: 50,
            label: () => t('tabLabel'),
            locale: namespace,
            // `SettingsSectionOwnerProps` supplies `close`; this page deliberately
            // does not draw a back control because the shell already renders its own
            // title and close button around every section.
            inject: (): CodeBuddyPluginCardInjected => ({ t }),
          }, CodeBuddySettingsPage))
        })
      }

      // Sidebar row + its `main` panel (#17). This pair is the route that survives
      // a deployment disabling `ui-settings-plugins`: `sidebar.panellist` is
      // declared by `ui-sidebar` and `main` by `ui-layout`, both host modules. They
      // register together because a row with no panel behind it is a dead control,
      // and a panel with no row is unreachable — the host matches them by id.
      if (entries.sidebarPanel) {
        attempt('sidebar panel', () => {
          ctx.slots.inject('main', () => ctx.slots.register({
            name: 'main',
            key: SIDEBAR_PANEL_ID,
            locale: namespace,
            inject: (): CodeBuddyPanelInjected => ({
              t,
              // The host's `MainPanel` renders this slot with no chrome, so the
              // panel draws its own way back. `ui-layout` keeps the conversation on
              // the null panel id, which is what `ui-sidebar` itself uses.
              close: () => { ctx.layout.selectPanel(null) },
            }),
          }, CodeBuddyPanel))

          ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist',
            id: SIDEBAR_PANEL_ID,
            // After the host's own rows, before the "more" launcher's neighbours.
            order: 10,
            label: () => t('tabLabel'),
            locale: namespace,
            // The glyph slot receives `{ size, active }`; the row renders this
            // inside an aria-hidden span and supplies its own name from `label`.
          }, CodeBuddyPanelGlyph))
        })
      }
    })
    // The registrations themselves are owned by `slots`, which disposes them with
    // the fiber; this disposer only stops an in-flight read from writing into a
    // context that is already going away.
    return () => { live = false }
  }, 'dsh-codebuddy-cli: entry switches')

  // The composer credit line rides the same locale namespace (its keys are a
  // subset) and the session-scoped `conversation.composer.dock` list slot — the
  // slot the host's own stats strip occupies, so the figure sits directly under
  // the input box beside the token statistics. Not switchable: it is a status
  // readout rather than a configuration entry.
  attempt('composer dock', () => {
    const creditT = t as unknown as CodeBuddyCreditDockInjected['t']
    ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
      name: 'conversation.composer.dock',
      id: 'codebuddy-credits',
      order: 20,
      locale: namespace,
      inject: (): CodeBuddyCreditDockInjected => ({ t: creditT }),
    }, CodeBuddyCreditDock))
  })
}
