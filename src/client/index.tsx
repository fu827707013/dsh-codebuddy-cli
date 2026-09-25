/** Browser half: CodeBuddy account status inside Plugin configuration. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
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
import { CodeBuddyPluginCard } from './CodeBuddyPluginCard.tsx'
import type { CodeBuddyPluginCardInjected } from './CodeBuddyPluginCard.tsx'
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
 * Client services required by the Plugin configuration contribution.
 *
 * DSH 0.1.2 removed `@deepseek-ai/dsh-client-runtime` (the package that used to
 * hold the browser `ClientContext` alias and the `slots` service). The services
 * this card relies on now come from narrower packages: the `slots` registry
 * moved to `@deepseek-ai/dsh-client-ui-renderer`, `locale` stayed in
 * `@deepseek-ai/dsh-client-locale`, and the `settings.plugin.item` slot is
 * declared by `@deepseek-ai/dsh-client-ui-settings-plugins`. All three are
 * named in the package's `dsh.client.inject` list, so cordis has activated
 * them before this plugin's fiber starts.
 */
export const inject = ['slots', 'locale']

/**
 * Register card copy and the CodeBuddy card under Plugin configuration.
 *
 * The entire body is wrapped so that a DSH slot-API breaking change (for
 * example the rc.6→rc.7 `id`→`key` / `order`→`priority` rename) degrades
 * to a `console.error` instead of throwing into the DSH loader and raising
 * the red "Failed to load plugins" banner. The host provider keeps working:
 * the `codebuddy` model channel is unaffected, and `dsh-codebuddy-cli
 * status` reports host health via the heartbeat file.
 *
 * NOTE: the try/catch boundary of this function is mirrored (duplicated) in
 * `tests/client-fallback.spec.ts`, because the real client entry imports
 * browser-only DSH packages that cannot load in the Node test environment.
 * That test therefore does not import this function — it replicates its
 * shape. If you change the guarded body or the `console.error` message here,
 * update the mirrored `apply()` in that spec too, or the fallback test will
 * silently diverge from this real implementation.
 */
export function apply(ctx: ClientContext): void {
  try {
    const namespace = 'settings.codebuddy-cli'
    ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'dsh-codebuddy-cli: settings copy')
    const t = ctx.locale.bind(namespace) as CodeBuddyPluginCardInjected['t']
    // The Plugin configuration page renders `settings.plugins.tab`; DSH 0.1.7
    // renamed the surface from `settings.plugin.item`, and nothing consumes that
    // older name any more — a card registered only there is never rendered. One
    // bundle therefore registers under both: a host that does not know a name
    // simply never renders it, so old and new hosts each pick up exactly one.
    ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
      name: 'settings.plugins.tab',
      id: 'codebuddy-cli',
      order: 30,
      // The slot contract documents `label` as the registrant-localized tab
      // text; without it the tab strip renders an unlabelled blank tab. The tab
      // shares its row with the host's own tabs, so it uses the short product
      // name rather than the full card title.
      label: () => t('tabLabel'),
      locale: namespace,
      inject: (): CodeBuddyPluginCardInjected => ({ t }),
    }, CodeBuddyPluginCard))

    // Legacy alias for pre-0.1.7 hosts. The installed slot types describe the
    // current generation only, so the older name needs the cast below; the call
    // is a no-op on any host that no longer declares the slot.
    const legacySlot = 'settings.plugin.item'
    const legacyInject = ctx.slots.inject.bind(ctx.slots) as unknown as (
      name: string,
      register: () => () => void,
    ) => () => void
    legacyInject(legacySlot, () => ctx.slots.register({
      name: legacySlot,
      id: 'codebuddy-cli',
      order: 30,
      locale: namespace,
      inject: (): CodeBuddyPluginCardInjected => ({ t }),
    } as never, CodeBuddyPluginCard))
    // The composer credit line rides the same locale namespace (its keys are a
    // subset) and the session-scoped `conversation.composer.dock` list slot —
    // the slot the host's own stats strip occupies, so the credit figure sits
    // directly under the input box beside the token statistics. A dock
    // registration failure must not take the settings card down: it degrades
    // through the same catch, and the card stays the last-man-standing surface.
    const creditT = t as unknown as CodeBuddyCreditDockInjected['t']
    ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
      name: 'conversation.composer.dock',
      id: 'codebuddy-credits',
      order: 20,
      locale: namespace,
      inject: (): CodeBuddyCreditDockInjected => ({ t: creditT }),
    }, CodeBuddyCreditDock))
  } catch (error: unknown) {
    // Degrade silently on the page: the host provider still serves models.
    // Developers see the full cause in the browser console; users see no banner.
    console.error('[dsh-codebuddy-cli] client card failed to load (host provider unaffected):', error)
  }
}
