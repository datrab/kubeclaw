// OpenClaw diagnostic subscription bridge for plugin-owned runtime events.
// Keep this self-contained: OpenClaw provides the plugin SDK at runtime.
// @ts-expect-error kubeclaw plugin builds intentionally avoid a repo-wide @types/node dependency.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url) as (id: string) => unknown;

type DiagnosticHandler = (event: unknown) => void;
type DiagnosticSubscription = void | (() => void) | { unsubscribe?: () => void; dispose?: () => void; off?: () => void };
type PluginSdkModule = {
  onDiagnosticEvent?: (handler: DiagnosticHandler) => DiagnosticSubscription;
};

function unsubscribe(subscription: DiagnosticSubscription): void {
  if (typeof subscription === 'function') {
    subscription();
    return;
  }
  if (!subscription || typeof subscription !== 'object') return;
  const fn = subscription.unsubscribe ?? subscription.dispose ?? subscription.off;
  if (typeof fn === 'function') fn.call(subscription);
}

export function subscribeModelUsageDiagnostics(handler: DiagnosticHandler): () => void {
  const sdk = require('openclaw/plugin-sdk') as PluginSdkModule;
  if (typeof sdk.onDiagnosticEvent !== 'function') {
    throw new Error('openclaw/plugin-sdk onDiagnosticEvent is unavailable');
  }
  const subscription = sdk.onDiagnosticEvent((event: unknown) => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return;
    if ((event as { type?: unknown }).type !== 'model.usage') return;
    handler(event);
  });
  return () => unsubscribe(subscription);
}
