import type { PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';
import { type GateInput } from './protocol.js';
export declare function execute(input: GateInput, context: PluginInvocationContext): Promise<StageResult>;
