import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Contract test over the client entry's cordis service list.
 *
 * This exists because of a real defect that no other test could catch: the
 * sidebar panel's Back button called `ctx.layout.selectPanel(null)`, `layout`
 * was missing from `inject`, so `ctx.layout` was `undefined`. Every click threw
 * `Cannot read properties of undefined (reading 'selectPanel')` — and React's
 * production build swallowed it. The button rendered, looked wired, and did
 * nothing, with nothing in the console.
 *
 * The trap is that two different lists look alike:
 *
 * - `package.json` → `dsh.client.inject`: which PACKAGES to load, and in what
 *   order. Adding `dsh-client-ui-layout` here makes its slots available.
 * - `src/client/index.tsx` → `export const inject`: which SERVICES cordis puts
 *   on `ctx`. Omitting `layout` here leaves `ctx.layout` undefined no matter
 *   what the package list says.
 *
 * `dsh-mnemon` implements the same sidebar-panel pattern and injects `layout`,
 * which is what proved the difference.
 */
const entryPath = fileURLToPath(new URL('../src/client/index.tsx', import.meta.url))
const entry = readFileSync(entryPath, 'utf8')

describe('client entry service injection', () => {
  it('injects layout, which ctx.layout depends on', () => {
    // `selectPanel` lives on the layout service. Without it the panel's Back
    // control throws on every click.
    const match = entry.match(/export const inject\s*=\s*\[([^\]]*)\]/)
    expect(match, 'client entry must export a service inject list').not.toBeNull()
    const services = (match?.[1] ?? '')
      .split(',')
      .map(part => part.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
    expect(services).toContain('layout')
  })

  it('keeps the services the registrations actually read', () => {
    const match = entry.match(/export const inject\s*=\s*\[([^\]]*)\]/)
    const services = (match?.[1] ?? '')
      .split(',')
      .map(part => part.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
    expect(services).toContain('slots')
    expect(services).toContain('locale')
  })
})
