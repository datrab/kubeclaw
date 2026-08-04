import { createSuiteLog } from './support.ts';
import type { SuiteVerdict } from '../services/verdict-schema.ts';
import type { K8sContext } from './k8s-base.ts';
import { prepareK8sPlan } from './k8s-plan.ts';
import { executeK8sPlan } from './k8s-execution.ts';

export default async function k8sSuite(context: K8sContext): Promise<SuiteVerdict> {
  const startTime = Date.now();
  const log = createSuiteLog('k8s', 'K8S', (entry) => context.logSink?.('K8S', entry.msg));
  const prepared = prepareK8sPlan(context, startTime, log);
  if (!prepared.ok) return prepared.verdict;
  return executeK8sPlan(prepared.plan);
}
