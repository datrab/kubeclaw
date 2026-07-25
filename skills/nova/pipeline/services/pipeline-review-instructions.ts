import fs from 'fs';
import path from 'path';
import { relPath } from '../core/paths.ts';
import { getRunId } from '../core/runtime.ts';
import { sanitizeMarkdownText } from '../egress.ts';
import { getPipelineArtifactBundle } from './artifact-bundle.ts';
import {
  pipelineReviewInstructionsPath,
  pipelineReviewJsonPath,
  pipelineReviewOutputPath,
  requireReviewText,
} from './pipeline-review-values.ts';

function requireArtifactPath(bundle: any, key: string) {
  return requireReviewText(bundle?.[key], `pipeline artifact bundle.${key}`);
}

function pipelineReviewInstructionsContent(input: any) {
  return `You are reviewing a completed pipeline run for project: ${input.config.project}

## Run Data Available
- Pipeline log: ${input.pipelineLogPath}
- Summary JSON: ${input.summaryJsonPath}
- Lifecycle read models: check logs/pipeline/runs/${input.runId}/lifecycle/read-models.json
- Saved prompt artifacts: check module log dirs for forge-prompt-*.md and buster-prompt-*.md

## What to analyze

### 1. Architecture observations
Were there patterns in how Forge/Buster/Echo behaved that suggest architectural improvements?

### 2. Agent performance patterns
Which modules had multiple retries? What were the common failure modes?
Did any modules have consistent patterns (e.g., always failing pre-check, always needing Nova)?

### 3. Prompt effectiveness signals
Did agents frequently miss sections of the prompt? Were certain instructions ignored repeatedly?
Suggest specific prompt improvements.

### 4. Test quality signals
Did Buster tests catch real issues? Were there false positives? Tests that never failed?
Suggest test improvements for modules that passed too easily.
Before marking this run healthy, actively look for weak module-owned assertions, ownership leaks, unverified assumptions, and missing expected artifacts.
Do not treat a passing shared build or generic health check as enough when a module owns a specific route, asset, manifest, or integration contract.

### 5. Pipeline configuration recommendations
Based on this run: suggested changes to timeout_minutes, max_fails, auto_retry_threshold per module.

### 6. Specific improvements for next run
Concrete list of changes ranked by expected impact.

## Output

Write two files:
1. ${input.reviewMdPath} — Human-readable markdown review
2. ${input.reviewJsonPath} — Structured JSON:
{
  "status": "REVIEWED",
  "project": "${input.config.project}",
  "run_id": "${input.runId}",
  "architecture_observations": [],
  "agent_performance": { "modules_with_retries": [], "common_failure_modes": [] },
  "prompt_effectiveness": [],
  "test_quality": [],
  "config_recommendations": [],
  "improvements_next_run": []
}
`;
}

export function writePipelineReviewInstructions(
  config: any,
  review: any = {}
) {
  const instructionsPath = pipelineReviewInstructionsPath(config, review);
  fs.mkdirSync(path.dirname(instructionsPath), { recursive: true });
  const artifacts = getPipelineArtifactBundle(config);
  const content = pipelineReviewInstructionsContent({
    config,
    pipelineLogPath: requireArtifactPath(
      artifacts,
      'run_pipeline_jsonl_path'
    ),
    summaryJsonPath: requireArtifactPath(artifacts, 'run_summary_path'),
    reviewMdPath: relPath(
      config,
      pipelineReviewOutputPath(config, review)
    ),
    reviewJsonPath: relPath(
      config,
      pipelineReviewJsonPath(config, review)
    ),
    runId: requireReviewText(getRunId(config), 'run_id'),
  });
  fs.writeFileSync(instructionsPath, sanitizeMarkdownText(content));
  return instructionsPath;
}
