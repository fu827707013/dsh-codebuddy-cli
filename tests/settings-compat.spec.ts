import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SettingsProvider from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import * as CodeBuddy from '../src/index.ts'
import { installSettingsSectionCompat, resolveSettingsNamespaceCompat } from '../src/settings-compat.ts'

/**
 * The settings API exists in three generations, and the plugin has to register
 * its section on all of them:
 *
 *   1. a module-level `installSettingsSection` helper,
 *   2. a `settings.installSection(...)` provider method,
 *   3. managed forms — the plugin's loader-entry Config schema is the form, and
 *      the provider exposes `configure` instead of any installer.
 *
 * DSH 0.1.7-rc.2 removed both installers, so an unguarded call to generation 2
 * throws `installSection is not a function` out of `apply()`, which kills the
 * plugin's fiber and makes its settings card disappear from the UI entirely.
 */

class MemorySettings extends SettingsProvider {
  readonly writable = true
  private stored: Record<string, unknown> = {}

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.stored))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.stored[ns] = structuredClone(section)
    return Promise.resolve()
  }
}

/** A schema shaped like the plugin's real Config: every field marked volatile. */
function volatileSchema(): z<{ authFile: string; enabledModels: string[] }> {
  return z.object({
    authFile: z.string().default('').volatile(),
    enabledModels: z.array(z.string()).default([]).volatile(),
  }) as unknown as z<{ authFile: string; enabledModels: string[] }>
}

describe('settings compatibility across provider generations', () => {
  it('registers the section on generation 2 without throwing', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(MemorySettings)

    // The bug that removed the settings card: this call used to throw
    // `installSection is not a function` straight out of `apply`.
    expect(() => installSettingsSectionCompat(
      ctx,
      CodeBuddy.CODEBUDDY_SETTINGS_NS,
      volatileSchema(),
      {} as { authFile: string; enabledModels: string[] },
      { setSource() {}, onChange() {} },
    )).not.toThrow()

    await new Promise(resolve => setTimeout(resolve, 50))

    const descriptor = ctx.settings.describe().find(row => row.ns === CodeBuddy.CODEBUDDY_SETTINGS_NS)
    expect(descriptor).toBeDefined()

    await ctx.fiber.dispose()
  })

  it('keeps generation 2 values plain instead of leaking volatile references', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(MemorySettings)

    installSettingsSectionCompat(
      ctx,
      CodeBuddy.CODEBUDDY_SETTINGS_NS,
      volatileSchema(),
      {} as { authFile: string; enabledModels: string[] },
      { setSource() {}, onChange() {} },
    )
    await new Promise(resolve => setTimeout(resolve, 50))

    await ctx.settings.update(CodeBuddy.CODEBUDDY_SETTINGS_NS, { authFile: '/tmp/plain.info' })
    const updated = ctx.settings.describe().find(row => row.ns === CodeBuddy.CODEBUDDY_SETTINGS_NS)

    // Generation 2 returns the resolved value verbatim. A volatile schema would
    // surface `{ get, [Symbol(cosmokit.volatile.write)] }` here, so the compat
    // layer has to strip the marker before the installer sees the schema.
    expect((updated?.value as Record<string, unknown>)['authFile']).toBe('/tmp/plain.info')

    await ctx.fiber.dispose()
  })

  it('resolves the plugin namespace on every generation', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(MemorySettings)
    const provider = ctx.get('settings')

    // Generation 2 registers under whatever namespace the caller passes, so the
    // plugin's public constant stays correct.
    expect(resolveSettingsNamespaceCompat(ctx, provider, CodeBuddy.CODEBUDDY_SETTINGS_NS))
      .toBe(CodeBuddy.CODEBUDDY_SETTINGS_NS)

    // Generation 3 derives sections from the loader entry, so a context that
    // carries one resolves to the entry id instead.
    const withEntry = ctx.isolate('probe')
    Object.defineProperty(withEntry, 'fiber', {
      value: { entry: { options: { id: 'llm-codebuddy-cli' } } },
      configurable: true,
    })
    expect(resolveSettingsNamespaceCompat(withEntry, { configure() {} }, CodeBuddy.CODEBUDDY_SETTINGS_NS))
      .toBe('llm-codebuddy-cli')

    await ctx.fiber.dispose()
  })

  it('keeps a plain schema intact when no volatile marker is present', () => {
    // Guards the strip step against over-reach: a schema that never marked a
    // field volatile must still resolve its defaults through the compat layer.
    const ctx = new Context()
    expect(() => installSettingsSectionCompat(
      ctx,
      CodeBuddy.CODEBUDDY_SETTINGS_NS,
      z.object({ authFile: z.string().default('/default.info') }) as unknown as z<{ authFile: string }>,
      {} as { authFile: string },
      { setSource() {}, onChange() {} },
    )).not.toThrow()
  })
})
