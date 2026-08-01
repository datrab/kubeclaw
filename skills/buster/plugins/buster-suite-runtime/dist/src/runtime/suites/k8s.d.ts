import type { SuiteVerdict } from '../services/verdict-schema.js';
import type { K8sContext } from './k8s-base.js';
export { buildLocalServiceHealthUrl } from './k8s-port-forward.js';
export { normalizeTestCredentialSpecs } from './k8s-credentials.js';
export { buildK8sSuiteNamespace, kubectlOutputLooksLikeHtml, renderManifestForK8sSuite, renderManifestForK8sSuiteWithStats, resolveK8sLocalRegistry, validateK8sServicePort, } from './k8s-base.js';
export { buildBusterNamespaceLease } from './k8s-base.js';
export { shouldUsePortForwardHealthCheck } from './k8s-runtime.js';
export default function k8sSuite(context: K8sContext): Promise<SuiteVerdict>;
