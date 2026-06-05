import { selectDeps } from '../core/deps.ts';
import {
  loadStatus,
  readBusterGateCompletion,
  readGateOutput,
  readGateStatusJson,
} from '../services/status-store.ts';
import { injectNeedsNova } from '../services/failures/presentation.ts';
import { discord } from '../integrations/discord.ts';
import { output } from '../core/runtime.ts';
import { runModule } from './module-runner.ts';
import { runGate } from './gate-runner.ts';
import { releaseGateFiles, syncControlFiles } from '../services/blueprint.ts';
import {
  writeSummary,
  generateProjectSummary,
  generatePipelineReview,
  generateCaseStudy,
} from '../services/summary.ts';

export const DEFAULT_PIPELINE_RUNNER_DEPS = {
  loadStatus,
  injectNeedsNova,
  discord,
  output,
  runModule,
  runGate,
  readBusterGateCompletion,
  readGateOutput,
  readGateStatusJson,
  releaseGateFiles,
  syncControlFiles,
  writeSummary,
  generateProjectSummary,
  generatePipelineReview,
  generateCaseStudy,
};

export function getPipelineRunnerDeps(config, overrides = {}) {
  return {
    ...DEFAULT_PIPELINE_RUNNER_DEPS,
    ...selectDeps(overrides, 'pipelineRunner'),
  };
}
