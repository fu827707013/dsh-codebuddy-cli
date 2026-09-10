import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * Dual-host compatibility guard for the `llm-pi-ai` resolved profile.
 *
 * The plugin is a host extension: `@deepseek-ai/dsh-llm-pi-ai` is an external
 * dependency resolved from whichever DSH is installed, while the profile object
 * this plugin hands that adapter is built here. When the two drift, the failure
 * is a runtime TypeError inside the host — not a compile error in this repo —
 * and it surfaces to the user as a model-selector row reading
 *
 *     CodeBuddy CLI 加载失败：Cannot read properties of undefined (reading 'get')
 *
 * That is what happened with DSH 0.1.5, whose `modelOf` dereferences
 * `profile.modelErrors.get(model)`. These tests pin the fields that actually
 * cross the boundary so a future `llm-pi-ai` change cannot silently reintroduce
 * a blank provider row.
 */

const here = dirname(fileURLToPath(import.meta.url))
const adapterSource = await readFile(join(here, '..', 'src', 'adapter.ts'), 'utf8')

/** Extract one balanced `{...}` object literal that follows `anchor`. */
function objectLiteralAfter(anchor: string): string {
  const start = adapterSource.indexOf(anchor)
  if (start < 0) throw new Error(`anchor not found in adapter.ts: ${anchor}`)
  const open = adapterSource.indexOf('{', start)
  let depth = 0
  for (let index = open; index < adapterSource.length; index += 1) {
    const char = adapterSource[index]
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return adapterSource.slice(open, index + 1)
    }
  }
  throw new Error(`unbalanced object literal after: ${anchor}`)
}

describe('resolved profile carries every field both supported hosts read', () => {
  const literal = objectLiteralAfter('const profileFields =')

  it('declares modelErrors, which DSH 0.1.5+ dereferences on every model lookup', () => {
    // DSH >= 0.1.5 runs `profile.modelErrors.get(model)` in `modelOf`, reached
    // from resolveModel -> modelInfo, which is exactly the path
    // buildModelCatalog walks for the model selector. An absent map there is
    // the reported TypeError, so this field is the fix.
    expect(literal).toContain('modelErrors')
  })

  it('declares the fields DSH 0.1.2 reads, so the older host keeps working', () => {
    for (const field of [
      'provider',
      'displayName',
      'streamIdleTimeoutMs',
      'retryPolicy',
      'configuredMaxTokens',
      'piProvider',
    ]) {
      expect(literal, `missing ${field}`).toContain(field)
    }
  })

  it('supplies an empty failure map rather than a populated one', () => {
    // This adapter performs no per-model validation of its own: its catalog is
    // fetched from the shim, so reporting no failures is the honest answer and
    // leaves every model routable instead of marking them INVALID_CONFIG.
    expect(literal).toMatch(/modelErrors:\s*new Map<[^>]*>\(\)/u)
  })

  it('binds the superset through a compatibility cast, not a bare literal', () => {
    // The installed host typings declare only one profile variant, so naming
    // the other variant's field directly in a typed literal fails to compile.
    // The cast is what lets one source support both versions.
    expect(adapterSource).toContain(
      'const profile = profileFields as unknown as ResolvedPiAiProviderProfile',
    )
  })
})

describe('pi-ai host contract', () => {
  it('keeps llm-pi-ai external, so the profile must match the installed host', async () => {
    // If this package were bundled, the profile above would target the
    // vendored copy and the dual-version reasoning would not apply.
    const manifest = JSON.parse(await readFile(join(here, '..', 'package.json'), 'utf8')) as {
      peerDependencies?: Record<string, string>
    }
    expect(manifest.peerDependencies?.['@deepseek-ai/dsh-llm-pi-ai']).toBeDefined()
    expect(adapterSource).toContain("from '@deepseek-ai/dsh-llm-pi-ai'")
  })

  it('documents the failure the modelErrors field prevents', () => {
    expect(adapterSource).toContain("reading 'get'")
  })
})
