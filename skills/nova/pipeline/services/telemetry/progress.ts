import { emitEventNonBlocking } from './dispatch.ts';

/**
 * Emit agent.transcript for a live transcript line or batch.
 * @param {object} ctx
 * @param {object} data - { agent_type, label, module_id, line_kind, text, transcript_offset, line_count }
 */
export function emitTranscriptLine(ctx, data = {}) {
  emitEventNonBlocking(ctx, 'agent.transcript', {
    agent_type: data.agent_type || null,
    label: data.label || null,
    module_id: data.module_id || null,
    gate_id: data.gate_id || null,
    gate_type: data.gate_id != null ? (data.gate_type ?? null) : undefined,
    session_key: data.session_key || null,
    dispatch_id: data.dispatch_id ?? null,
    line_kind: data.line_kind || 'info',
    text: data.text || '',
    transcript_offset: data.transcript_offset ?? null,
    line_count: data.line_count ?? null,
  });
}

/**
 * Emit agent.progress summary during a long-running session.
 * @param {object} ctx
 * @param {object} data - { agent_type, label, module_id, elapsed_seconds, transcript_events, files_touched, last_activity, status }
 */
export function emitAgentProgress(ctx, data = {}) {
  emitEventNonBlocking(ctx, 'agent.progress', {
    agent_type: data.agent_type || null,
    label: data.label || null,
    module_id: data.module_id || null,
    gate_id: data.gate_id || null,
    gate_type: data.gate_id != null ? (data.gate_type ?? null) : undefined,
    session_key: data.session_key || null,
    dispatch_id: data.dispatch_id ?? null,
    elapsed_seconds: data.elapsed_seconds ?? null,
    transcript_events: data.transcript_events ?? null,
    files_touched: data.files_touched || null,
    last_activity: data.last_activity || null,
    status: data.status || 'active',
  });
}

