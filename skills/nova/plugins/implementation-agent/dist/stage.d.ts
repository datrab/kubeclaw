import type { PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';
import { type ImplementationInput } from './protocol.js';
export declare function execute(input: ImplementationInput, context: PluginInvocationContext): Promise<StageResult>;
