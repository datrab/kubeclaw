#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadPlatformConfig,
  runPipelineV2,
} from '../../../skills/common/plugin-runtime/core/src/index.ts';
import { parseCapabilityProviders, resolveProviderCapability } from './provider-catalog.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-buildkit-preflight-'));
const fixture = path.join(temporary, 'fixture');
const state = path.join(temporary, 'state');
const platformPath = path.join(temporary, 'platform.json');
const runId = `run:buildkit-preflight:${crypto.randomUUID()}`;

function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function git(...args: string[]): void {
  execFileSync('git', args, { cwd: fixture, stdio: 'pipe' });
}

try {
  const route = resolveProviderCapability(
    parseCapabilityProviders(),
    'buster',
    'test.suite.execute',
  );
  if (route.adapter !== 'buster-suite-v2') {
    throw new Error(`BUILDKIT_PREFLIGHT_PROVIDER_UNSUPPORTED:${route.adapter}`);
  }
  if (!process.env.BUSTER_V2_TOKEN) throw new Error('BUILDKIT_PREFLIGHT_TOKEN_MISSING');
  const registryAuthority = String(process.env.KUBECLAW_LOCAL_REGISTRY ?? '').trim();
  if (!registryAuthority) throw new Error('BUILDKIT_PREFLIGHT_REGISTRY_MISSING');
  const registryOrigin = new URL(
    registryAuthority.startsWith('http') ? registryAuthority : `http://${registryAuthority}`,
  ).origin;
  fs.mkdirSync(fixture, { recursive: true });
  fs.writeFileSync(path.join(fixture, 'Dockerfile'), [
    'FROM docker.io/library/nginx:1.27-alpine',
    'COPY index.html /usr/share/nginx/html/index.html',
    '',
  ].join('\n'));
  fs.writeFileSync(
    path.join(fixture, 'index.html'),
    `<!doctype html><title>KubeClaw BuildKit proof</title><p>${runId}</p>\n`,
  );
  git('init', '-q', '--initial-branch=main');
  git('config', 'user.name', 'KubeClaw Nova Preflight');
  git('config', 'user.email', 'nova-preflight@kubeclaw.invalid');
  git('add', '.');
  git('commit', '-qm', 'Create BuildKit preflight fixture');
  const gitExecutable = fs.realpathSync(
    execFileSync('sh', ['-lc', 'command -v git'], { encoding: 'utf8' }).trim(),
  );
  const pluginRoots = [
    path.join(repositoryRoot, 'skills/common/plugins'),
    path.join(repositoryRoot, 'skills/nova/plugins'),
    path.join(repositoryRoot, 'skills/buster/plugins'),
  ];
  writeJson(platformPath, {
    schemaVersion: 'pipeline-platform.v2',
    installationRoots: pluginRoots,
    trustedBuiltinRoots: pluginRoots,
    externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} },
    providers: {
      'test.suite.execute': 'kubeclaw.buster-suite-runtime:suite',
      'network.http': 'kubeclaw.network-http:http',
      'secrets.read': 'kubeclaw.secret-resolver:secrets',
    },
    grants: {
      'kubeclaw.preflight-contract:buildkit': {
        'test.suite.execute': { allowedSuites: ['build'], allowedRoots: [fixture] },
        'network.http': { allowedOrigins: [registryOrigin] },
      },
      'kubeclaw.buster-suite-runtime:suite': {
        'network.http': { allowedOrigins: [route.endpoint] },
        'secrets.read': { allowedNames: ['buster.worker'] },
      },
    },
    adapters: {
      'kubeclaw.buster-suite-runtime:suite': {
        endpoint: route.endpoint,
        tokenSecret: 'buster.worker',
        allowedRepositoryRoots: [fixture],
        allowedSuites: ['build'],
        suiteCapabilities: ['image_build', 'kubernetes'],
        gitExecutable,
        maxArchiveBytes: 8_388_608,
        maxSuiteTimeoutMs: 900_000,
        pollMs: 2_000,
      },
      'kubeclaw.network-http:http': {
        allowedOrigins: [route.endpoint, registryOrigin],
        allowedMethods: ['GET', 'POST', 'DELETE'],
        allowedHeaders: ['authorization', 'content-type', 'accept'],
        maxRequestBytes: 16_777_216,
        maxResponseBytes: 16_777_216,
        timeoutMs: 60_000,
      },
      'kubeclaw.secret-resolver:secrets': {
        environment: { 'buster.worker': 'BUSTER_V2_TOKEN' },
      },
    },
    activeAdapters: [],
    observers: {},
    storageRoot: state,
    shutdownTimeoutMs: 10_000,
    orchestratorIssuerId: 'nova',
    administrativeDecisionIssuers: [],
  });
  const result = await runPipelineV2(loadPlatformConfig(platformPath), {
    schemaVersion: 'pipeline-definition.v2',
    id: 'kubeclaw:nova-buildkit-preflight',
    maxConcurrency: 1,
    stages: [{
      id: 'buildkit-proof',
      type: 'kubeclaw.validate.buildkit-preflight',
      dependsOn: [],
      config: { registryOrigin },
      input: {
        repositoryRoot: fixture,
        moduleId: 'nova-buildkit-proof',
        attempt: 1,
        testConfig: {
          suite_timeout_ms: 900_000,
          serve: {
            type: 'server',
            project_dir: fixture,
            dockerfile: path.join(fixture, 'Dockerfile'),
            build_context: fixture,
            start_cmd: 'nginx -g "daemon off;"',
            port: 80,
            health_path: '/',
            ready_timeout_seconds: 120,
            timeout: 300,
          },
        },
        task: {
          project: 'nova-buildkit-preflight',
          run_id: runId,
          module_id: 'nova-buildkit-proof',
          task_type: 'infrastructure-preflight',
        },
      },
      execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 1_020_000 },
    }],
  }, runId);
  const stage = result.stages.get('buildkit-proof');
  if (result.status !== 'succeeded' || stage?.status !== 'succeeded') {
    const runDirectory = path.join(state, 'runs', runId.replaceAll(':', '_'));
    const eventsPath = path.join(runDirectory, 'events.jsonl');
    const events = fs.existsSync(eventsPath)
      ? fs.readFileSync(eventsPath, 'utf8').trim().split('\n').slice(-8).map((line) => JSON.parse(line))
      : [];
    throw new Error(`BUILDKIT_PREFLIGHT_PIPELINE_FAILED:${result.status}:${JSON.stringify({ stage, events })}`);
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    schemaVersion: 'nova-buildkit-preflight.v2',
    runId,
    provider: route,
    registryOrigin,
    status: result.status,
    stageStatus: stage.status,
  }, null, 2)}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
