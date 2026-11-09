/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest'

/**
 * The client entry degrades a slot-API breaking change (the rc.6→rc.7
 * `id`→`key` rename that caused the red "Failed to load plugins" banner)
 * to a console.error, so the host provider keeps working without a banner.
 *
 * We cannot import the real client entry (it pulls browser-only DSH client
 * packages); instead we replicate the exact try/catch shape from
 * `src/client/index.tsx` and assert it swallows a simulated throw.
 *
 * DRIFT WARNING: the `apply()` below is a manual mirror of the real
 * `apply()` in `src/client/index.tsx` (see the NOTE on that function). It is
 * NOT the product code, so this test only proves the fallback idea works — it
 * cannot detect a regression in the real entry. If you change the real
 * `apply()`'s guarded body or its `console.error` message, update the mirror
 * here too; a mismatch between the two is invisible to this test.
 */
describe('client card fallback', () => {
  it('records a failing slot and still registers the rest', () => {
    const errors: unknown[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { errors.push(args) })

    // Simulate a DSH loader that rejects ONE keyed slot registration.
    // Loose `any` on purpose: we only test the guard shape, not the DSH types.
    const registered: string[] = []
    const fakeCtx: any = {
      effect: () => {},
      locale: { register: () => () => {}, bind: () => () => '' },
      slots: {
        inject: (slot: string) => {
          if (slot === 'plugins.bundle.config') {
            throw new Error('keyed slot "plugins.bundle.config" requires options.key')
          }
          registered.push(slot)
        },
      },
    }

    // Mirror of src/client/index.tsx apply()'s guard. Each surface is guarded
    // on its own, so one rejected slot must not skip the others — the defect
    // #17 reported (one outer try/catch silently dropping every later surface).
    function apply(ctx: any): void {
      const attempt = (label: string, register: () => void): void => {
        try {
          register()
        } catch (error: unknown) {
          console.error(`[dsh-codebuddy-cli] ${label} failed to register (host provider unaffected):`, error)
        }
      }
      const namespace = 'settings.codebuddy-cli'
      ctx.effect(() => ctx.locale.register(namespace, { zh: {}, en: {} }), 'dsh-codebuddy-cli: settings copy')
      const t = ctx.locale.bind(namespace)
      attempt('settings tab', () => ctx.slots.inject('settings.plugins.tab', () => {}))
      attempt('composer dock', () => ctx.slots.inject('conversation.composer.dock', () => {}))
      attempt('bundle configuration page', () => ctx.slots.inject('plugins.bundle.config', () => {}))
      attempt('row configuration page', () => ctx.slots.inject('plugins.row.config', () => {}))
      void t
    }

    // Must not throw — the whole point of the fallback.
    expect(() => apply(fakeCtx)).not.toThrow()

    // The failure is reported once, naming the surface and the cause.
    expect(errors).toHaveLength(1)
    expect(String(errors[0])).toContain('bundle configuration page failed to register')
    expect(String(errors[0])).toContain('requires options.key')

    // Crucially, the surfaces after the failing one still registered.
    expect(registered).toEqual([
      'settings.plugins.tab',
      'conversation.composer.dock',
      'plugins.row.config',
    ])

    spy.mockRestore()
  })
})