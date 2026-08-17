/**
 * The `render_ui` tool's card in the tool row. The host projected the
 * repaired spec into the result's `meta` (the tool's `presentationMeta`);
 * this keyed toolview reads it and renders through GenuiBlock — the same
 * renderer the ```dsh-ui fence uses. Falls back to a compact summary row
 * when the meta is missing or invalid (e.g. a replay of a log recorded
 * before the projection existed).
 */
import { useMemo } from 'react'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/src/client/contract/slots'
import { GenuiBlock } from './GenuiBlock.tsx'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import { repairGenuiSpec } from './guard.ts'
import { toolStateKey } from './interaction-store.ts'
import css from './GenuiBlock.module.css'

/**
 * Keyed toolview for the `render_ui` tool. `block` is the settled result
 * node once the call completes; while it runs (or on replay without meta)
 * the summary fallback is shown.
 */
export function GenuiToolView({ toolName, block, sessionId }: ToolCallViewProps) {
  // `meta` exists only on the settled result node; running calls (and
  // replayed logs without the projection) fall back to the summary row.
  const meta = 'meta' in block ? block.meta : undefined
  const spec = useMemo(() => (meta === undefined ? null : repairGenuiSpec(meta)), [meta])
  if (spec === null || spec.items.length === 0) {
    return (
      <div className={css.toolFallback} data-genui-tool>
        <span className={css.toolFallbackTitle}>{toolName}</span>
        <span className={css.toolFallbackMeta}>{block.callId}</span>
      </div>
    )
  }
  return (
    <div className={css.tool} data-genui-tool>
      <ErrorBoundary label="工具卡片">
        {/* callId is stable across replay → tool-card interaction state is durable */}
        <GenuiBlock spec={spec} stateKey={toolStateKey(sessionId, block.callId)} />
      </ErrorBoundary>
    </div>
  )
}
