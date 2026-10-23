import { fileURLToPath } from 'node:url';
import type { BusterSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { captureSwarmSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { declaredPipelineServices } from '../../../scripts/updates/pipeline-generation.mjs';

// Explicit source fixture selection, never an admitted native startup receipt.
const authorRoot=fileURLToPath(new URL('../../../config',import.meta.url));
const [selection]=declaredPipelineServices(authorRoot,{role:'buster',namespace:'kubeclaw',releaseName:'agent-buster'});
if (!selection) throw new Error('TEST_BUSTER_SELECTION_REQUIRED');
const component=captureSwarmSettings(`${authorRoot}/pipeline.config.json`,selection).components['buster-engine'];
if (!component) throw new Error('TEST_BUSTER_COMPONENT_REQUIRED');
export const runnerBusterSettings=component.settings as unknown as BusterSettings;
export const runnerExecutionPolicy=runnerBusterSettings.execution;
