/**
 * Live end-to-end check (NOT part of the offline test suite):
 * adapter -> pi-ai -> loopback shim -> real CodeBuddy upstream, using the
 * CodeBuddy desktop app's credential. Run from the package root:
 *
 *   node scripts/live-e2e.mjs
 */

import {
  createCodeBuddyAdapter,
  createCodeBuddyShim,
  CodeBuddyCatalog,
  CodeBuddyCredentialStore,
  CodeBuddyUpstreamClient,
} from '../lib/index.js'

const client = new CodeBuddyUpstreamClient()
const store = new CodeBuddyCredentialStore({
  refresh: credential => client.refreshToken(credential),
})
const catalog = new CodeBuddyCatalog()
const shim = createCodeBuddyShim({ store, client, catalog })
await shim.ready
console.log('shim listening:', shim.baseUrl())

const { adapter, invalidate } = createCodeBuddyAdapter({ shim, store, catalog })

const staticList = await adapter.listModels('codebuddy')
console.log('static catalog:', staticList.map(model => model.id).join(', '))

const credential = await store.current()
if (credential === undefined) {
  console.error('not signed in: open the CodeBuddy desktop app once')
  process.exit(1)
}
const refreshed = await client.fetchModels(credential)
catalog.set([...refreshed])
invalidate()
const liveList = await adapter.listModels('codebuddy')
console.log('upstream catalog:', liveList.map(model => model.id).join(', '))

const resolved = await adapter.resolveModel('codebuddy', 'auto')
console.log('resolved auto:', JSON.stringify(resolved))

console.log('streaming one reply …')
let text = ''
let usage
for await (const chunk of adapter.stream({
  provider: 'codebuddy',
  model: 'auto',
  system: '你是简洁的中文助手。',
  messages: [{
    id: 'e2e-1',
    role: 'user',
    content: [{ type: 'text', text: '只回复八个字以内：链路验证成功' }],
    source: { kind: 'user' },
  }],
})) {
  if (chunk.type === 'text-delta' || chunk.type === 'text') {
    text += chunk.text ?? chunk.delta ?? ''
  } else if (chunk.type === 'usage' || chunk.usage !== undefined) {
    usage = chunk.usage ?? chunk
  }
}
console.log('reply:', JSON.stringify(text))
console.log('usage:', usage !== undefined ? JSON.stringify(usage) : '(none reported)')

const credits = await client.fetchCredits(await store.current())
console.log('remaining credit:', credits.total)
await shim.close()
console.log('E2E OK')
