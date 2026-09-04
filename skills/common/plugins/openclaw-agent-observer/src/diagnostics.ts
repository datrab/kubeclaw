// OpenClaw diagnostic subscription bridge for plugin-owned runtime events.
// Keep this self-contained: OpenClaw provides the plugin SDK at runtime.
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
  if (typeof subscription.unsubscribe === 'function') {
    subscription.unsubscribe();
    return;
  }
  if (typeof subscription.dispose === 'function') {
    subscription.dispose();
    return;
  }
  if (typeof subscription.off === 'function') subscription.off();
}

export function subscribeModelUsageDiagnostics(handler: DiagnosticHandler): () => void {
  const sdk = require('openclaw/plugin-sdk/diagnostic-runtime') as PluginSdkModule;
  if (typeof sdk.onDiagnosticEvent !== 'function') {
    throw new Error('openclaw/plugin-sdk/diagnostic-runtime onDiagnosticEvent is unavailable');
  }
  const subscription = sdk.onDiagnosticEvent((event: unknown) => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return;
    if ((event as { type?: unknown }).type !== 'model.usage') return;
    handler(event);
  });
  return () => unsubscribe(subscription);
}
