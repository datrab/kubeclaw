import type { SuiteVerdict } from '../services/verdict-schema.js';
import type { K8sPlan } from './k8s-plan.js';
export declare function executeK8sPlan(plan: K8sPlan): Promise<SuiteVerdict>;
