import { createSuiteLog } from './support.ts';
import type { SuiteVerdict } from '../services/verdict-schema.ts';
import type { K8sContext } from './k8s-base.ts';
import { prepareK8sPlan } from './k8s-plan.ts';
import { executeK8sPlan } from './k8s-execution.ts';

export { buildLocalServiceHealthUrl } from './k8s-port-forward.ts';
export { normalizeTestCredentialSpecs } from './k8s-credentials.ts';
export {
  buildK8sSuiteNamespace,
  kubectlOutputLooksLikeHtml,
  renderManifestForK8sSuite,
  renderManifestForK8sSuiteWithStats,
  resolveK8sLocalRegistry,
  validateK8sServicePort,
} from './k8s-base.ts';
export { buildBusterNamespaceLease } from './k8s-base.ts';
export { shouldUsePortForwardHealthCheck } from './k8s-runtime.ts';

export default async function k8sSuite(context: K8sContext): Promise<SuiteVerdict> {
  const startTime = Date.now();
  const log = createSuiteLog('k8s', 'K8S', (entry) => context.logSink?.('K8S', entry.msg));
  const prepared = prepareK8sPlan(context, startTime, log);
  if (!prepared.ok) return prepared.verdict;
  return executeK8sPlan(prepared.plan);
}
