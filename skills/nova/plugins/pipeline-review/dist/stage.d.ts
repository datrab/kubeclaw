import type { PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';
import { type ReviewInput } from './protocol.js';
export declare function execute(input: ReviewInput, context: PluginInvocationContext): Promise<StageResult>;
