import { canonicalSwarmEntry } from '../config/swarm-bundle.mjs';
import { loadSwarmSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';

/** Explicit test input read from the actual required component owner. Never fills omitted options. */
export const runnerExecutionPolicy = loadSwarmSettings({ SWARM_CONFIG: canonicalSwarmEntry }).buster.execution;
