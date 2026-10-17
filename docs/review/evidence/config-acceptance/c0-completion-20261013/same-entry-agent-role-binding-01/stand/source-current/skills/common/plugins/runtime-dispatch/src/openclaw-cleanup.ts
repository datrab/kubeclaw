import type { AdapterActivationContext } from '@kubeclaw/plugin-sdk';
import type { OpenClawTarget } from './openclaw.ts';
import { cancelSession, gateway, readSessionState, registeredSessionIdentity,
  type OpenClawGatewayContext, type OpenClawSessionIdentity } from './openclaw-session.ts';

/** This wrapper only narrows the normal Core-owned dependency signal. */
export function scopedOpenClawContext(context: AdapterActivationContext, signal: AbortSignal): AdapterActivationContext {
  return { ...context,
    invoke: (capability, request, options) => context.invoke(capability, request,
      { signal: options?.signal ? AbortSignal.any([signal, options.signal]) : signal }),
    invokeConfidential: (capability, request, options) => context.invokeConfidential(capability, request,
      { signal: options?.signal ? AbortSignal.any([signal, options.signal]) : signal }),
  };
}

async function pause(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 25);
    signal.addEventListener('abort', abort, { once: true });
  });
}

interface PendingSession {
  readonly identity: OpenClawSessionIdentity | undefined;
  readonly label: string;
  readonly spawning: Promise<OpenClawSessionIdentity>;
}
async function resolveIdentity(context: OpenClawGatewayContext, target: OpenClawTarget, token: string,
  pending: PendingSession, signal: AbortSignal): Promise<OpenClawSessionIdentity> {
  let identity = pending.identity;
  // Observe a late accepted response, but never detach a cancellation or spawn again.
  void pending.spawning.then(value => { identity = value; }, () => undefined);
  while (!identity) {
    signal.throwIfAborted();
    if (target.runtime === 'subagent') {
      const raw = await gateway(context, target, token, 'subagents', {
        action: 'list', recentMinutes: Math.max(10, Math.ceil(target.sessionTimeoutMs / 60_000) + 5),
      });
      identity = registeredSessionIdentity(raw, pending.label, target.model);
    }
    // ACP has no existing label registry transport here; missing identity stays unknown.
    if (!identity) await pause(signal);
  }
  return identity;
}

export async function reconcileOpenClawFailure(context: AdapterActivationContext, target: OpenClawTarget,
  token: string, pending: PendingSession, failure: unknown): Promise<never> {
  const original = failure instanceof Error ? failure.message : String(failure);
  let identity = pending.identity;
  try {
    if (!context.withCleanup) throw new Error('ADAPTER_CLEANUP_SCOPE_UNAVAILABLE');
    await context.withCleanup(async cleanup => {
      identity = await resolveIdentity(cleanup, target, token, pending, cleanup.signal);
      await cancelSession(cleanup, target, token, identity);
      for (;;) {
        cleanup.signal.throwIfAborted();
        // Collector acknowledgment and ACP stop messages do not prove terminal state.
        const state = await readSessionState(cleanup, { ...target, collectorMode: false }, token, identity, true);
        if (state.terminal) return;
        await pause(cleanup.signal);
      }
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${original}; OPENCLAW_SESSION_CLEANUP_UNRESOLVED:${pending.label}:${identity?.runId ?? 'spawn-identity-unknown'}:${reason}`,
      { cause: new AggregateError([failure, error], 'OpenClaw execution and cleanup failed') });
  }
  throw new Error(`${original}; OPENCLAW_SESSION_TERMINAL_CONFIRMED:${identity!.runId}`, { cause: failure });
}
