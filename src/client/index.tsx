/**
 * dsh-genui browser half: the ```dsh-ui fence renderer and the keyed toolview
 * for the `render_ui` tool.
 *
 * Fence rendering is dual-mode, chosen at boot:
 * - **Registry channel** (contract hosts): the host's MarkdownText resolves
 *   ```dsh-ui fences through the fence-registry extension point; this package
 *   registers `renderGenuiFence`. Action callbacks ride the host-installed
 *   GenuiActionContext.
 * - **DOM channel** (pristine hosts): no extension point exists, so
 *   `dom-fence.ts` observes the conversation DOM, finds settled stock code
 *   blocks labelled `dsh-ui`, and mounts the same render pipeline in its own
 *   React roots — wrapped in the plugin-owned GenuiActionContext that relays
 *   `[genui-action]` through the scoped conversation send. Either way the
 *   deployment is the STOCK DSH snapshot plus this plugin.
 *
 * The renderer parses the fence body with the partial parser: while the reply
 * streams, every FINISHED component appears the moment its JSON object
 * closes, so the UI assembles top-down before the fence (or reply) completes.
 * A body with no finished component yet falls back to a plain code block.
 * @module @omdsh-dev/dsh-genui/client
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { Key, ReactNode } from 'react'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import { installDomFenceRenderer } from './dom-fence.tsx'
import { renderGenuiFence, type GenuiFenceContext } from './fence-render.tsx'
import { GenuiToolView } from './toolview.tsx'
import { assetUrl } from './asset-loader.ts'

/** Host extension surface the registry channel needs (absent on pristine). */
type HostFenceExt = {
  registerFenceRenderer?: (lang: string, renderer: (raw: string, key: Key, context?: GenuiFenceContext) => ReactNode) => () => void
}

/** Add low-priority prefetch links for the lazy engine assets (mermaid/three).
 * Browser-dependent: some engines ignore `<link rel=prefetch>`; harmless
 * either way — the on-demand loader still covers a cache miss. Exported for
 * tests. */
export function prefetchGenuiAssets(): void {
  if (typeof document === 'undefined') return
  for (const file of ['mermaid.js', 'three.js']) {
    if (document.head.querySelector(`link[rel="prefetch"][href="${assetUrl(file)}"]`) !== null) continue
    const link = document.createElement('link')
    link.rel = 'prefetch'
    link.as = 'script'
    link.href = assetUrl(file)
    document.head.appendChild(link)
  }
}

/**
 * Inline-fence action relay (DOM channel): the same message template the
 * contract host's sendGenuiAction uses, so the model sees one identical
 * [genui-action] contract on both channels.
 */
function sendInlineGenuiAction(ctx: Context, sessionId: SessionId, action: string, payload: Record<string, unknown>): void {
  const scoped = ctx.sessions.scope(sessionId)
  const conversation = scoped?.get('conversation') as IConversation | undefined
  if (conversation === undefined) return
  const payloadText = Object.keys(payload).length === 0
    ? ''
    : ` 组件数据: ${JSON.stringify(payload)}`
  void conversation.send(`[genui-action] ${action}。用户刚刚在界面中触发了动作 "${action}"，请根据组件数据执行相应操作，并用 dsh-ui 输出更新后的界面。${payloadText}`).catch(() => {
    // A failed prompt (session gone, agent busy) drops the action;
    // the UI stays interactive — the component is not disabled.
  })
}

/** Cordis client entry: register the fence renderer on boot and the keyed
 * toolview for the render_ui tool; returning the disposers lets cordis tear
 * all registrations down on plugin unload. */
export function apply(ctx: Context): () => void {
  // Fence channel selection: the registry extension point when the host
  // ships it (contract line), the DOM observer otherwise (pristine line).
  // One plugin build serves both deployments.
  const registerFn = (primitives as unknown as HostFenceExt).registerFenceRenderer
  const disposers: Array<() => void> = typeof registerFn === 'function'
    ? [registerFn('dsh-ui', renderGenuiFence)]
    : (console.info('[genui] fence-registry 扩展点不存在（原版 DSH）——启用 DOM 渲染通道'),
      [installDomFenceRenderer(ctx, (sessionId, action, payload) => sendInlineGenuiAction(ctx, sessionId, action, payload))])
  // Idle prefetch of the lazy engine assets: the browser downloads them at
  // LOW priority whenever the page is idle, so the first mermaid/3D node in
  // a session usually hits a warm cache instead of paying the fetch on first
  // use. Never blocks first paint; the loader still handles a miss.
  prefetchGenuiAssets()
  // Keyed toolview: the harness dispatches 'tool.call.toolview' by wire tool
  // name; registering under 'render_ui' gives the tool's result card the
  // GenUI renderer (reading the repaired spec from result meta).
  disposers.push(ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'render_ui',
  }, GenuiToolView)))
  return () => {
    for (const dispose of disposers) dispose()
  }
}

// Browser services the client entry needs: the slots registry (toolview) and
// sessions (scoped conversation send behind actions). This declaration is what
// the host's fiber inject waiting uses — without it apply() runs before the
// services bind and the whole plugin tree fails the boot sweep.
export const inject = ['slots', 'sessions']

// Re-export the registry renderer for the test suite (setup.ts registers it
// exactly like apply() does on contract hosts).
export { renderGenuiFence }
export type { GenuiFenceContext } from './fence-render.tsx'
