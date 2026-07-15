import { collectExistingArtifactRefs } from '../stage-envelope-primitives.ts';
import { getPipelineArtifactBundle } from '../../services/artifact-bundle.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
type AnyRecord = Record<string, any>;

function runSummaryArtifactPath(artifacts: AnyRecord): string | null {
  if (typeof artifacts?.run_summary_path === 'string' && artifacts.run_summary_path.trim()) return artifacts.run_summary_path;
  if (typeof artifacts?.pipeline_summary_path === 'string' && artifacts.pipeline_summary_path.trim()) return artifacts.pipeline_summary_path;
  return null;
}

export function countByStatus(values: unknown[] = []): Record<string, number> {
  return values.reduce((acc: Record<string, number>, value: unknown) => {
    const key = String(selectDefinedValue(() => (value), () => ('UNKNOWN')));
    acc[key] = (selectDefinedValue(() => (acc[key]), () => (0))) + 1;
    return acc;
  }, {});
}

export function buildGeneratorArtifactRefs(config: AnyRecord): AnyRecord[] {
  const artifacts = getPipelineArtifactBundle(config);
  if (!artifacts.pipeline_dir) return [];

  return collectExistingArtifactRefs([
    {
      type: 'pipeline_summary',
      role: 'output',
      label: 'run-summary',
      format: 'json',
      path: runSummaryArtifactPath(artifacts),
    },
    {
      type: 'pipeline_summary',
      role: 'latest',
      label: 'pipeline-summary',
      format: 'json',
      path: artifacts.pipeline_summary_path,
    },
    {
      type: 'pipeline_summary',
      role: 'latest_pointer',
      label: 'latest-pointer',
      format: 'json',
      path: artifacts.latest_json_path,
    },
  ]);
}
