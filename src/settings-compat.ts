/**
 * Compatibility helpers for the `dsh-settings` API transition.
 *
 * The settings API moved through three generations:
 *
 * 1. `installSettingsSection(ctx, ns, schema, entry, hooks)` — a module-level
 *    free function exported by `@deepseek-ai/dsh-settings`.
 * 2. `settings.installSection(ctx, ns, schema, entry, hooks)` — the same
 *    helper, moved onto the settings provider service (DSH 0.1.2+).
 * 3. Managed forms (DSH 0.1.7+) — both installers are gone. Forms are derived
 *    from the plugin's own Loader-entry Config schema, and the plugin only
 *    opts out of the auto-generated page via `configure({ auto: false })`.
 *
 * This module detects which generation is installed at runtime, so one build
 * keeps working on every DSH in the plugin's supported peer range. Nothing here
 * throws on an older host: every branch degrades to the previous behaviour.
 *
 * @module dsh-codebuddy-cli/settings-compat
 */

import type { Context } from '@deepseek-ai/cordis'
import * as settingsModule from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace, SettingsSectionHooks } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

/** Shape of the module-level helpers, when the installed generation has them. */
type SettingsModuleCompat = {
  settingsNamespace?: (value: string) => SettingsNamespace
  installSettingsSection?: <T>(
    ctx: Context,
    ns: SettingsNamespace,
    schema: z<T>,
    entry: T,
    hooks: SettingsSectionHooks<T>,
  ) => void
}

/** Shape of the provider service, across generations. */
interface SettingsProviderCompat {
  configure?: (
    presentation: { auto?: boolean },
    owner?: unknown,
  ) => (() => void) | void
  installSection?: <T>(
    owner: Context,
    ns: SettingsNamespace,
    schema: z<T>,
    entry: T,
    hooks: SettingsSectionHooks<T>,
  ) => void
  /**
   * Managed forms only: the read side of the plugin's own section. The
   * `document-updated` event carries just the namespace, so this is how a
   * consumer recovers the new values after an edit.
   */
  describe?: () => readonly {
    ns: SettingsNamespace | string
    value?: unknown
  }[]
}

const compatModule = settingsModule as unknown as SettingsModuleCompat

/**
 * Return an equivalent schema with every `volatile` marker removed.
 *
 * Generations 1 and 2 have no notion of volatile fields: their `describe()`
 * hands the resolved value straight to callers, so a volatile schema surfaces
 * raw reference objects (`{ get, [Symbol(cosmokit.volatile.write)] }`) where a
 * plain string is expected. Dropping the marker before the installer sees the
 * schema keeps those hosts on the exact behaviour they had before this plugin
 * started marking fields, so an upgrade never changes an existing document.
 *
 * `toJSON()` returns a reference graph — `{ uid, refs }`, where each `refs[id]`
 * holds the node body and containers point at children by numeric id — and
 * volatility lives at `refs[id].meta.volatile`. Walking the container fields
 * directly would therefore visit ids, not nodes, and strip nothing. It also
 * means the stripped graph must be re-wrapped by the schema factory (`z(...)`,
 * as `plainSchema` does inside `dsh-settings`); `schema.constructor` resolves
 * to `Object` and the provider rejects it as "schema is not a function".
 */
function plainSettingsSchema<T>(schema: z<T>): z<T> {
  const clone = structuredClone(schema.toJSON()) as unknown as {
    refs?: Record<string, { meta?: Record<string, unknown> }>
  }
  for (const node of Object.values(clone.refs ?? {})) {
    if (node !== null && typeof node === 'object' && node.meta !== undefined) delete node.meta.volatile
  }
  return z(clone as never) as unknown as z<T>
}

/**
 * The Loader entry id of the plugin instance owning `ctx`, when available.
 *
 * The managed-forms provider addresses sections by this id (its namespace is
 * `entry.options.id`), which is the composition entry's id — for this plugin
 * `llm-codebuddy-cli`, not the legacy display id.
 */
function entryNamespaceOf(ctx: Context): SettingsNamespace | undefined {
  const compat = ctx as unknown as {
    fiber?: { entry?: { id?: unknown; options?: { id?: unknown } } }
    loader?: { locate?: (fiber?: unknown) => unknown }
  }
  const entry = compat.fiber?.entry
  const candidates = [
    entry?.options?.id,
    entry?.id,
    compat.loader?.locate?.(compat.fiber),
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate !== '') return candidate as SettingsNamespace
  }
  return undefined
}

/** Brand namespaces where the installed settings package still exposes it. */
export function settingsNamespaceCompat(value: string): SettingsNamespace {
  return compatModule.settingsNamespace?.(value) ?? value as SettingsNamespace
}

/**
 * Resolve the namespace the settings bridge must read and write.
 *
 * Generations 1 and 2 register whatever namespace the caller passes, so the
 * plugin's own constant stays correct. The managed-forms provider derives
 * sections from the profile entry instead, so its namespace is the entry id.
 * Callers that only care about a stable public wire contract should keep using
 * their own constant and translate at this boundary.
 */
export function resolveSettingsNamespaceCompat(
  ctx: Context,
  provider: unknown,
  fallback: SettingsNamespace,
): SettingsNamespace {
  if (compatModule.installSettingsSection !== undefined) return fallback
  const candidate = provider as SettingsProviderCompat
  if (candidate.installSection !== undefined) return fallback
  if (candidate.configure !== undefined) return entryNamespaceOf(ctx) ?? fallback
  return fallback
}

/**
 * Register the plugin's settings section across all three API generations.
 *
 * On generations 1 and 2 the schema is handed to an installer, which owns the
 * form and calls back through `hooks`. On generation 3 there is no installer:
 * the provider builds the form from the plugin's volatile Config, and the
 * plugin only needs to declare its custom-page policy and re-run the hook when
 * its own document entry changes.
 */
export function installSettingsSectionCompat<T>(
  ctx: Context,
  ns: SettingsNamespace,
  schema: z<T>,
  entry: T,
  hooks: SettingsSectionHooks<T>,
): void {
  const legacyInstaller = compatModule.installSettingsSection
  if (legacyInstaller !== undefined) {
    legacyInstaller(ctx, ns, plainSettingsSchema(schema), entry, hooks)
    return
  }

  ctx.inject(['settings'], (sctx) => {
    const provider = sctx.get('settings') as unknown as SettingsProviderCompat | undefined
    if (provider === undefined) return

    if (provider.installSection !== undefined) {
      provider.installSection(ctx, ns, plainSettingsSchema(schema), entry, hooks)
      return
    }

    if (provider.configure === undefined) {
      throw new TypeError('dsh-settings exposes neither installSection nor configure')
    }

    // Managed forms: the provider derives editable forms from the plugin's
    // volatile Config. This plugin ships its own richer card, so the
    // auto-generated page is disabled here; `current` keeps tracking the
    // composition entry, so no `setSource` hand-off is needed.
    sctx.effect(() => {
      const dispose = provider.configure?.({ auto: false }, ctx.fiber)
      return typeof dispose === 'function' ? dispose : () => {}
    })

    // Generation 3 does not call `hooks.onChange` for us: a live edit lands in
    // the settings document, so watch the entry's own update event.
    //
    // The event carries only the namespace, never the new values, and the
    // managed provider does not call `hooks.setSource` either — so a consumer
    // that keeps its own `current` thunk (this plugin reads `authFile` and
    // `enabledModels` through one) would keep serving the values it saw at
    // startup. Re-read the section here and hand it back through `setSource`,
    // which makes generation 3 behave like the generations that push values.
    const namespace = entryNamespaceOf(ctx)
    if (namespace !== undefined) {
      const refresh = (): void => {
        const descriptor = provider.describe?.().find(entry => String(entry.ns) === namespace)
        if (descriptor?.value !== undefined) {
          // `describe` reports the section as plain JSON, which is exactly the
          // shape `setSource` consumers unwrap; the plugin validates it through
          // its own schema on read rather than trusting this cast.
          const value = descriptor.value as T
          hooks.setSource?.(() => value)
        }
        hooks.onChange()
      }
      const settingsEvents = sctx as unknown as {
        on(event: 'settings/document-updated', listener: (updated: unknown) => void): () => void
      }
      sctx.effect(() => settingsEvents.on('settings/document-updated', (updated) => {
        if (String(updated) === namespace) refresh()
      }))
    }
  })
}
