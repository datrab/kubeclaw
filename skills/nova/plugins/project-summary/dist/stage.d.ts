import type { PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';
import { type SummaryInput } from './summary.js';
export declare function execute(input: SummaryInput, context: PluginInvocationContext): Promise<StageResult>;
