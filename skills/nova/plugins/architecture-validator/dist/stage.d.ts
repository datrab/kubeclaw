import type { PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';
import { type ArchitectureInput } from './protocol.js';
export declare function execute(input: ArchitectureInput, context: PluginInvocationContext): Promise<StageResult>;
