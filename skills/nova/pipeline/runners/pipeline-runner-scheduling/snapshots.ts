import { collectExistingArtifactRefs } from '../stage-envelope-primitives.ts';
import { getPipelineArtifactBundle } from '../../services/artifact-bundle.ts';

type AnyRecord = Record<string, any>;

export function countByStatus(values: unknown[] = []): Record<string, number> {
  return values.reduce((acc: Record<string, number>, value: unknown) => {
    const key = String(value || 'UNKNOWN');
    acc[key] = (acc[key] || 0) + 1;
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
      path: artifacts.run_summary_path || artifacts.pipeline_summary_path,
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
