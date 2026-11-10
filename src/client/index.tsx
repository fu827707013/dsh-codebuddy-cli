/** Browser half: CodeBuddy account status on the DSH Plugins page. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
// Type-only: the settings shell declares the `settings.plugins.tab` slot in its
// own SlotMap merge (ui-settings/src/client/contract/slots.ts) precisely so tab
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
import { CodeBuddyPluginCard } from './CodeBuddyPluginCard.tsx'
import type { CodeBuddyPluginCardInjected } from './CodeBuddyPluginCard.tsx'
import { CodeBuddyConfigPage } from './CodeBuddyConfigPage.tsx'
import type { CodeBuddyConfigPageInjected } from './CodeBuddyConfigPage.tsx'
import { CodeBuddyPanel, CodeBuddyPanelGlyph } from './CodeBuddyPanel.tsx'
import type { CodeBuddyPanelInjected } from './CodeBuddyPanel.tsx'
import { CodeBuddyCreditDock } from './CodeBuddyCreditDock.tsx'
import type { CodeBuddyCreditDockInjected } from './CodeBuddyCreditDock.tsx'
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

  // Settings → Plugins tab. `dsh-client-ui-settings-plugins` declares and renders
  // `settings.plugins.tab` on every host this release supports, so this is a live
  // surface wherever that section is mounted. A registrant whose slot is never
  // declared is simply never rendered, so it costs nothing where the section is
  // absent — but it must NOT be deleted as cleanup: on such a host it is the only
  // reachable configuration card.
  attempt('settings tab', () => {
    ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
      name: 'settings.plugins.tab',
      id: 'codebuddy-cli',
      order: 30,
      // The slot contract documents `label` as the registrant-localized tab text;
      // without it the strip renders an unlabelled blank tab. The tab shares its
      // row with the host's own tabs, so it uses the short product name.
      label: () => t('tabLabel'),
      locale: namespace,
      inject: (): CodeBuddyPluginCardInjected => ({ t }),
    }, CodeBuddyPluginCard))
  })

  // Settings → <first-level nav row>. A `{ kind: 'list', scope: 'root' }` slot
  // declared by `dsh-client-ui-settings-general` — the same host package that
  // draws the settings shell, so unlike `settings.plugins.tab` (declared by
  // `ui-settings-plugins`, which a third-party bundle can disable) this surface
  // exists on every host that has settings at all. That difference is the whole
  // reason this registration exists: on a deployment where `ui-settings-plugins`
  // is off, the plugins tab is never declared and its callback never runs.
  //
  // `order: 50` sits after the host's own sections (account/general/models/
  // plugins) and after `dsh-market` at 40; the list is sorted, so a collision
  // would only affect ordering, never reachability.
  attempt('settings section', () => {
    ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section',
      id: 'codebuddy-cli',
      order: 50,
      label: () => t('tabLabel'),
      locale: namespace,
      inject: (): CodeBuddyPluginCardInjected => ({ t }),
    }, CodeBuddyPluginCard))
  })

  // The composer credit line rides the same locale namespace (its keys are a
  // subset) and the session-scoped `conversation.composer.dock` list slot — the
  // slot the host's own stats strip occupies, so the credit figure sits directly
  // under the input box beside the token statistics.
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

  // The DSH-standard configuration surfaces on the Plugins page. Both slots are
  // keyed: the bundle key is the package name, the row key is
  // `<package>#<row id>` with the row id as cordis.patch.yml declares it. DSH
  // renders the bundle configuration on the bundle's detail page between its
  // description and its components, and the row configuration on the row page the
  // list's configure control opens. The same body the settings card expands renders
  // in both views; `view: 'summary'` renders nothing because DSH only asks keyed
  // configuration entries for the full `page` view.
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

  // Sidebar row + its `main` panel (#17). This pair is the route that survives a
  // deployment disabling `ui-settings-plugins`: `sidebar.panellist` is declared by
  // `ui-sidebar` and `main` by `ui-layout`, both host modules. The two are
  // registered together because a sidebar row with no panel behind it would be a
  // dead control, and a panel with no row would be unreachable — the host matches
  // them by id (`selectPanel(SIDEBAR_PANEL_ID)` reads the `main` entry whose
  // `key` equals it).
  attempt('sidebar panel', () => {
    ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main',
      key: SIDEBAR_PANEL_ID,
      locale: namespace,
      inject: (): CodeBuddyPanelInjected => ({
        t,
        // The host's `MainPanel` renders this slot with no chrome, so the panel
        // has to draw its own way back. `ui-layout` keeps the conversation on the
        // null panel id, which is what `ui-sidebar` itself uses to deselect.
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
      // The glyph slot receives `{ size, active }`; the row renders this inside an
      // aria-hidden span and supplies its own accessible name from `label`.
    }, CodeBuddyPanelGlyph))
  })
}
