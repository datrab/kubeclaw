import fs from 'node:fs';
import path from 'node:path';
import {
  artifactPaths,
  canonicalFingerprint,
  writeCanonicalJson,
} from '../portable-artifacts.ts';
import { readNovaEnvironment } from '../core/runtime-environment.ts';
import { appendEvaluationFact } from './evidence-evaluation.ts';
import {
  configuredRecords,
  evidenceConfig,
  git,
  safeConfig,
  text,
  versionedSource,
} from './evidence-utils.ts';

function workItem(type: string, id: string, value: any, owner: string) {
  return {
    work_type: type,
    work_id: id,
    depends_on: value?.depends_on ?? [],
    owner,
    configuration: value,
  };
}

function buildWorkItems(progress: any) {
  const modules = Object.entries(progress?.modules ?? {}).map(([id, value]) =>
    workItem('module', id, value, 'nova')
  );
  const gates = Object.entries(progress?.gates ?? {}).map(([id, value]: any) =>
    workItem('gate', id, value, value?.owner ?? 'nova')
  );
  const known = new Set([...modules, ...gates].map((item) => item.work_id));
  const steps = (progress?.execution_order ?? [])
    .filter((id: string) =>
      !known.has(String(id).replace(/^(gate|validator|generator|step):/, ''))
    )
    .map((id: string) => {
      const [prefix = '', ...rest] = String(id).split(':');
      return {
        work_type: ['validator', 'generator'].includes(prefix)
          ? prefix
          : 'pipeline_step',
        work_id: rest.length ? rest.join(':') : id,
        depends_on: [],
        owner: 'nova',
        configuration: { execution_order_entry: id },
      };
    });
  return [...modules, ...gates, ...steps];
}

function sourceInventories(repo: string | null, progress: any, config: any) {
  const prompts = [
    'forge',
    'buster-module',
    'buster-gate',
    'review',
    'gate-fix',
  ].map((id) =>
    versionedSource(
      repo,
      `nova-prompt-${id}`,
      `skills/nova/pipeline/prompts/${id}.ts`
    )
  ).filter((item) => item.sha256);
  const skills = ['skills/common', 'skills/nova', 'skills/buster']
    .filter((relative) => repo && fs.existsSync(path.join(repo, relative)))
    .map((relative) => versionedSource(repo, path.basename(relative), relative));
  const observerPath = 'plugins/openclaw-agent-observer';
  const observer = repo && fs.existsSync(path.join(repo, observerPath))
    ? [versionedSource(repo, 'openclaw-agent-observer', observerPath)]
    : [];
  return {
    prompts,
    tools: [
      { id: 'node', version: process.version, source: 'runtime' },
      ...configuredRecords(progress?.test_config?.tools ?? {}, 'configured-tool'),
    ],
    skills,
    plugins: [
      ...observer,
      ...configuredRecords(config?.plugins?.modules ?? {}, 'configured-plugin'),
    ],
  };
}

function gitIdentity(repo: string | null) {
  return {
    repository: repo
      ? git(repo, ['config', '--get', 'remote.origin.url'])
      : null,
    branch: repo ? git(repo, ['branch', '--show-current']) : null,
    commit: repo ? git(repo, ['rev-parse', 'HEAD']) : null,
    starting_commit: repo ? git(repo, ['rev-parse', 'HEAD']) : null,
    dirty: repo ? Boolean(git(repo, ['status', '--porcelain'])) : null,
  };
}

function buildManifestInputs(config: any, progress: any) {
  const repo = text(config?.repo_root);
  const workItems = buildWorkItems(progress);
  const inventories = sourceInventories(repo, progress, config);
  return {
    schema_versions: {
      telemetry: 'telemetry_envelope.v1',
      lifecycle: 'pipeline_lifecycle.v1',
      manifest: 'run_manifest.v1',
      contract_manifest: 'telemetry_contract_manifest.v1',
    },
    project: config.project,
    run_id: config._runId ?? config.run_id,
    work_items: workItems,
    execution_order: progress?.execution_order ?? [],
    dependency_edges: workItems.flatMap((item) =>
      (item.depends_on ?? []).map((dependency: string) => ({
        from: dependency,
        to: item.work_id,
      }))
    ),
    runtime_policies: safeConfig(config),
    models: Object.entries(progress?.defaults?.models ?? {})
      .map(([role, value]) => ({
        role,
        ...(typeof value === 'object' ? value : { model: value }),
      })),
    ...inventories,
    git: gitIdentity(repo),
    deployment: {
      image_digest: readNovaEnvironment('KUBECLAW_IMAGE_DIGEST') ?? null,
      pod_uid: readNovaEnvironment('POD_UID') ?? null,
      namespace: readNovaEnvironment('POD_NAMESPACE') ?? null,
    },
    versions: {
      node: process.version,
      pipeline: git(repo ?? process.cwd(), ['rev-parse', 'HEAD']),
    },
  };
}

function recordManifestFacts(config: any, inputs: any, fingerprint: string) {
  const facts = [
    {
      dimension: 'manifest.configuration',
      fingerprint,
      value: {
        manifest_fingerprint: fingerprint,
        configuration_fingerprint: canonicalFingerprint(
          inputs.runtime_policies
        ),
      },
    },
    { dimension: 'pipeline.runtime', value: inputs.versions },
    { dimension: 'model.policy', value: { models: inputs.models } },
    { dimension: 'prompt.templates', value: { prompts: inputs.prompts } },
    { dimension: 'tool.versions', value: { tools: inputs.tools } },
    { dimension: 'skill.versions', value: { skills: inputs.skills } },
    { dimension: 'plugin.versions', value: { plugins: inputs.plugins } },
  ];
  for (const fact of facts) appendEvaluationFact(config, fact);
}

export function buildRunManifest(config: any, progress: any = {}) {
  const paths = artifactPaths(evidenceConfig(config));
  const inputs = buildManifestInputs(config, progress);
  const fingerprint = canonicalFingerprint(inputs);
  const manifest = {
    schema_version: 'run_manifest.v1',
    created_at: new Date().toISOString(),
    fingerprint,
    ...inputs,
  };
  writeCanonicalJson(paths.manifest, manifest);
  recordManifestFacts(config, inputs, fingerprint);
  return manifest;
}
