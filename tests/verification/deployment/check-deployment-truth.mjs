#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function sourceRootFromArgs() {
  const index = process.argv.indexOf('--source-root');
  return path.resolve(index >= 0 ? process.argv[index + 1] : process.cwd());
}

const sourceRoot = sourceRootFromArgs();
const read = (relativePath) =>
  fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8');
const exists = (relativePath) =>
  fs.existsSync(path.join(sourceRoot, relativePath));

const chart = read('charts/kubeclaw/templates/deployment.yaml');
const generalDockerfile = read('docker/Dockerfile.general');
const busterRuntimeDockerfile = read('docker/Dockerfile.buster-runtime');
const values = read('charts/kubeclaw/values.yaml');
const novaValues = read('my-values/nova-values.yaml');
const busterValues = read('my-values/buster-values.yaml');
const workflow = read('.github/workflows/build-images.yaml');
const deploy = read('scripts/deploy.sh');
const dockerignore = read('.dockerignore');

for (const [label, source] of [
  ['chart', chart],
  ['values', values],
  ['image workflow', workflow],
  ['deploy script', deploy],
  ['dockerignore', dockerignore],
]) {
  assert.doesNotMatch(
    source,
    /busterPipeline|buster-pipeline/i,
    `${label} must not retain the deleted v1 Buster worker`,
  );
}

assert.equal(
  exists('docker/Dockerfile.buster-pipeline'),
  false,
  'the deleted v1 Buster worker image must stay absent',
);
assert.equal(
  exists('docker/buster-pipeline-entrypoint.sh'),
  false,
  'the deleted v1 Buster worker entrypoint must stay absent',
);
assert.equal(
  exists('skills/buster/pipeline'),
  false,
  'the deleted v1 Buster runtime must stay absent',
);

for (const relativePath of [
  'docker/Dockerfile.general',
  'docker/Dockerfile.buster-gateway',
  'docker/Dockerfile.buster-runtime',
  'docker/buster-runtime-entrypoint.sh',
  'docker/Dockerfile.namespace-controller',
  'docker/Dockerfile.prism-preview',
  'skills/nova/pipeline.ts',
  'skills/common/plugin-runtime/cli.ts',
  'skills/common/plugin-runtime/core/src/index.ts',
]) {
  assert.equal(exists(relativePath), true, `${relativePath} must exist`);
}

for (const buildInput of [
  'docker/Dockerfile.buster-runtime',
  'docker/buster-runtime-entrypoint.sh',
  'skills/buster/plugins/buster-suite-runtime/**',
  'skills/common/plugin-runtime/sdk/**',
]) {
  assert.match(
    dockerignore,
    new RegExp(`^!${buildInput.replaceAll('.', '\\.').replaceAll('**', '\\*\\*')}$`, 'm'),
    `${buildInput} must be present in the narrowed Docker build context`,
  );
}

assert.match(
  chart,
  /plugin-runtime|common\/plugins|nova\/plugins|buster\/plugins/,
  'the chart must materialize the v2 core and plugin roots',
);
assert.match(
  workflow,
  /image_inputs:\s*\n\s+- '\.dockerignore'/,
  'Docker context policy changes must trigger image builds',
);
assert.doesNotMatch(chart, /execution-buildkit|execution-api-token|executionRuntime/);
assert.doesNotMatch(values, /executionRuntime|moby\/buildkit/);
assert.doesNotMatch(novaValues, /BUILDKIT_HOST|executionRuntime|moby\/buildkit/);
assert.doesNotMatch(
  novaValues,
  /https?:\/\/agent-buster(?::|\/)/,
  'Nova must derive Buster endpoints from its configured provider role',
);
assert.match(
  novaValues,
  /capabilityProviders:\s*\n\s+buster:\s*\n\s+agentRole:\s*buster\s*\n\s+capabilities:[\s\S]*runtime\.dispatch:[\s\S]*adapter:\s*openclaw[\s\S]*port:\s*18789[\s\S]*test\.suite\.execute:[\s\S]*adapter:\s*buster-suite-v2[\s\S]*port:\s*18891/,
  'Nova must identify Buster through the provider-role contract',
);
assert.match(
  chart,
  /KUBECLAW_CAPABILITY_PROVIDERS[\s\S]*toJson \$catalog/,
  'the chart must render the neutral capability-provider catalog',
);
assert.doesNotMatch(chart, /BUSTER_V2_ENDPOINT|BUSTER_GATEWAY_ORIGIN|busterGateway/);
assert.match(
  busterRuntimeDockerfile,
  /FROM moby\/buildkit:v[\w.-]+-rootless@sha256:[a-f0-9]{64} AS buildkit/,
  'Buster must own a digest-pinned rootless BuildKit runtime',
);
assert.match(
  busterRuntimeDockerfile,
  /dist\/src\/worker\.js|buster-runtime-entrypoint/,
  'the Buster image must run the v2 suite worker',
);
assert.match(
  read('skills/buster/plugins/buster-suite-runtime/src/worker.ts'),
  /--pid[\s\S]*--kill-child=SIGKILL[\s\S]*--mount-proc/,
  'suite jobs must run in a killable private PID namespace',
);
assert.match(busterValues, /name:\s*buster-v2-runtime/);
assert.match(busterValues, /containerPort:\s*18891/);
assert.match(
  busterValues,
  /BUSTER_V2_STATE_DIR[\s\S]*\/var\/lib\/buster-v2\/jobs[\s\S]*name:\s*buster-v2-state[\s\S]*mountPath:\s*\/var\/lib\/buster-v2/,
  'authoritative worker state must use the sidecar-only state volume',
);
assert.match(
  busterValues,
  /name:\s*buster-v2-state[\s\S]*emptyDir:[\s\S]*sizeLimit:\s*64Mi/,
  'worker state must be bounded and absent from the shared workspace PVC',
);
assert.doesNotMatch(novaValues, /\.kubeclaw\.svc\.cluster\.local/);
assert.match(chart, /fsGroup:\s*1000/);
assert.match(
  busterValues,
  /name:\s*buster-api-token[\s\S]*defaultMode:\s*288/,
  'the worker credential projection must remain group-readable only',
);
assert.match(
  busterValues,
  /add:\s*\["CHOWN",\s*"SETGID",\s*"SETPCAP",\s*"SETUID"\]/,
  'the supervisor must be able to enter the job UID and then drop the complete capability set',
);
for (const toolProof of [
  /playwright install --with-deps chromium/,
  /k6 version/,
  /hadolint --version/,
  /kubeconform -v/,
  /kubectl version --client=true/,
  /ruff --version/,
  /mypy --version/,
  /semgrep --version/,
  /shellcheck/,
]) {
  assert.match(
    generalDockerfile,
    toolProof,
    `the authoritative Nova runtime lost deterministic suite tooling: ${toolProof}`,
  );
}
assert.doesNotMatch(
  chart,
  /skills\/(?:nova|buster|common)\/pipeline(?:\/|["'])/,
  'the chart must not materialize v1 runtime directories',
);

const helm = spawnSync(
  'helm',
  ['template', 'kubeclaw', path.join(sourceRoot, 'charts/kubeclaw')],
  { cwd: sourceRoot, encoding: 'utf8' },
);
if (helm.error?.code !== 'ENOENT') {
  assert.equal(helm.status, 0, `helm template failed:\n${helm.stderr}`);
  assert.match(helm.stdout, /kind: Deployment/, 'chart must render a Deployment');
  assert.doesNotMatch(
    helm.stdout,
    /name:\s*buster-pipeline|kubeclaw-buster-pipeline/,
    'rendered manifests must not contain the deleted worker',
  );
  assert.doesNotMatch(
    helm.stdout,
    /name:\s*execution-buildkit|name:\s*buster-v2-runtime/,
    'the generic default must not invent an execution provider',
  );

  const busterHelm = spawnSync(
    'helm',
    [
      'template',
      'agent-buster',
      path.join(sourceRoot, 'charts/kubeclaw'),
      '--namespace',
      'kubeclaw',
      '--values',
      path.join(sourceRoot, 'my-values/buster-values.yaml'),
    ],
    { cwd: sourceRoot, encoding: 'utf8' },
  );
  assert.equal(
    busterHelm.status,
    0,
    `Buster runtime helm template failed:\n${busterHelm.stderr}`,
  );
  assert.match(
    busterHelm.stdout,
    /name:\s*buster-v2-runtime/,
    'Buster must render its isolated v2 suite worker',
  );
  assert.match(
    busterHelm.stdout,
    /containerPort:\s*18891/,
    'Buster must expose the authenticated v2 worker port',
  );
  assert.match(
    busterHelm.stdout,
    /fsGroup:\s*1000/,
    'the non-root Buster worker must receive projected credentials through fsGroup 1000',
  );
  assert.match(
    busterHelm.stdout,
    /name:\s*buster-api-token[\s\S]*defaultMode:\s*288/,
    'the rendered Buster token projection must remain mode 0440',
  );
  assert.doesNotMatch(busterHelm.stdout, /name:\s*execution-buildkit/);

  const novaHelm = spawnSync(
    'helm',
    [
      'template',
      'agent-nova',
      path.join(sourceRoot, 'charts/kubeclaw'),
      '--namespace',
      'kubeclaw',
      '--values',
      path.join(sourceRoot, 'my-values/nova-values.yaml'),
    ],
    { cwd: sourceRoot, encoding: 'utf8' },
  );
  assert.equal(
    novaHelm.status,
    0,
    `Nova provider-role helm template failed:\n${novaHelm.stderr}`,
  );
  assert.match(
    novaHelm.stdout,
    /name:\s*KUBECLAW_CAPABILITY_PROVIDERS[\s\S]*agent-buster:18789[\s\S]*agent-buster:18891/,
  );
  assert.doesNotMatch(novaHelm.stdout, /name:\s*BUSTER_V2_ENDPOINT|name:\s*BUSTER_GATEWAY_ORIGIN/);

  const numericRole = spawnSync(
    'helm',
    [
      'template',
      'numeric-provider',
      path.join(sourceRoot, 'charts/kubeclaw'),
      '--set-string', 'capabilityProviders.numeric.agentRole=1buster',
      '--set-string', 'capabilityProviders.numeric.capabilities.runtime\\.dispatch.adapter=custom-python',
      '--set-string', 'capabilityProviders.numeric.capabilities.runtime\\.dispatch.port=18789',
    ],
    { cwd: sourceRoot, encoding: 'utf8' },
  );
  assert.equal(numericRole.status, 0, numericRole.stderr);
  assert.match(numericRole.stdout, /http:\/\/agent-1buster:18789/);

  for (const [label, overrides, expected] of [
    [
      'invalid provider role',
      [
        '--set-string', 'capabilityProviders.buster.agentRole=INVALID_ROLE',
        '--set-string', 'capabilityProviders.buster.capabilities.runtime\\.dispatch.adapter=openclaw',
        '--set-string', 'capabilityProviders.buster.capabilities.runtime\\.dispatch.port=18789',
      ],
      /agentRole must be a DNS label/,
    ],
    [
      'invalid provider port',
      [
        '--set-string', 'capabilityProviders.buster.agentRole=buster',
        '--set-string', 'capabilityProviders.buster.capabilities.runtime\\.dispatch.adapter=openclaw',
        '--set-string', 'capabilityProviders.buster.capabilities.runtime\\.dispatch.port=70000',
      ],
      /port must be between 1 and 65535/,
    ],
  ]) {
    const invalid = spawnSync(
      'helm',
      ['template', 'invalid-provider', path.join(sourceRoot, 'charts/kubeclaw'), ...overrides],
      { cwd: sourceRoot, encoding: 'utf8' },
    );
    assert.notEqual(invalid.status, 0, `${label} must fail Helm rendering`);
    assert.match(`${invalid.stdout}\n${invalid.stderr}`, expected);
  }
}

const kubeconform = spawnSync('sh', ['-c', 'command -v kubeconform'], {
  cwd: sourceRoot,
  encoding: 'utf8',
});
if (helm.status === 0 && kubeconform.status === 0) {
  const renderedPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-manifests-')),
    'rendered.yaml',
  );
  fs.writeFileSync(renderedPath, helm.stdout);
  const validation = spawnSync(
    'kubeconform',
    ['-strict', '-summary', renderedPath],
    { cwd: sourceRoot, encoding: 'utf8' },
  );
  assert.equal(
    validation.status,
    0,
    `kubeconform failed:\n${validation.stdout}\n${validation.stderr}`,
  );
}

console.log(
  JSON.stringify({
    ok: true,
    phase: 12,
    v2Deployment: true,
    legacyWorkerAbsent: true,
    deterministicSuiteRuntime: true,
  }),
);
