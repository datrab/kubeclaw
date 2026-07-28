import type { PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';
import { type TestInput } from './protocol.js';
export declare function execute(input: TestInput, context: PluginInvocationContext): Promise<StageResult>;
