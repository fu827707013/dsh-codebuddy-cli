/** Plugins-page configuration host: renders the shared body in the `page` view. */

import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { CodeBuddyConfigBody } from './CodeBuddyPluginCard.tsx'
import type { CodeBuddyPluginCardInjected } from './CodeBuddyPluginCard.tsx'

/**
 * Injected face of the keyed Plugins-page configuration entries registered in
 * `index.tsx` (`plugins.bundle.config` and `plugins.row.config`).
 */
export interface CodeBuddyConfigPageInjected {
  t: CodeBuddyPluginCardInjected['t']
}

/**
 * The bundle/row configuration DSH renders on the Plugins page.
 *
 * DSH only ever asks keyed configuration entries for `view: 'page'` (the
 * bundle configuration renders between the description and the components;
 * the row configuration opens from the list row's configure control), but the
 * slot contract still types `view` as the full union, so the `summary` branch
 * stays an explicit null rather than an unreachable render of the whole body.
 */
export function CodeBuddyConfigPage({ view, t }: PluginConfigViewProps & Partial<CodeBuddyConfigPageInjected>) {
  if (view !== 'page') return null
  if (t === undefined) throw new Error('CodeBuddy config page requires its translation function')
  return <CodeBuddyConfigBody t={t} />
}
