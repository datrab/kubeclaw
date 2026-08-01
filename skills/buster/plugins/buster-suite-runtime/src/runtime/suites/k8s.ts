import { createSuiteLog } from './support.js';
import type { SuiteVerdict } from '../services/verdict-schema.js';
import type { K8sContext } from './k8s-base.js';
import { prepareK8sPlan } from './k8s-plan.js';
import { executeK8sPlan } from './k8s-execution.js';

export { buildLocalServiceHealthUrl } from './k8s-port-forward.js';
export { normalizeTestCredentialSpecs } from './k8s-credentials.js';
export {
  buildK8sSuiteNamespace,
  kubectlOutputLooksLikeHtml,
  renderManifestForK8sSuite,
  renderManifestForK8sSuiteWithStats,
  resolveK8sLocalRegistry,
  validateK8sServicePort,
} from './k8s-base.js';
export { buildBusterNamespaceLease } from './k8s-base.js';
export { shouldUsePortForwardHealthCheck } from './k8s-runtime.js';

export default async function k8sSuite(context: K8sContext): Promise<SuiteVerdict> {
  const startTime = Date.now();
  const log = createSuiteLog('k8s', 'K8S', (entry) => context.logSink?.('K8S', entry.msg));
  const prepared = prepareK8sPlan(context, startTime, log);
  if (!prepared.ok) return prepared.verdict;
  return executeK8sPlan(prepared.plan);
}
