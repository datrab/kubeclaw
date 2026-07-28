import type { PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';
import { type CaseStudyInput } from './protocol.js';
export declare function execute(input: CaseStudyInput, context: PluginInvocationContext): Promise<StageResult>;
