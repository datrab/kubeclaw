import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import {helmGatewayCommandProjection} from '../docs-helm-environment-projections.mjs';

const file = 'charts/kubeclaw/templates/deployment.yaml';
const frame = `- name: kubeclaw
  image: {{ include "kubeclaw.image" .Values.image | quote }}
  imagePullPolicy: {{ .Values.image.pullPolicy }}
  command: {{- toYaml .Values.gateway.command | nindent 12 }}
`;
const argv = ['node', '/app/openclaw.mjs', 'gateway', '--bind', 'lan', '--port', '18789'];
function fixture(run) {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-gateway-command-test-'));
  try {
    fs.mkdirSync(path.join(sourceRoot, 'charts/kubeclaw'), {recursive: true});
    fs.writeFileSync(path.join(sourceRoot, 'charts/kubeclaw/values.yaml'), YAML.stringify({gateway: {command: argv}}));
    return run(sourceRoot);
  } finally { fs.rmSync(sourceRoot, {recursive: true, force: true}); }
}
test('records the image-owned default route without inventing a checked-in Node reader', () => fixture(sourceRoot => {
  const result = helmGatewayCommandProjection({file, text: frame, sourceRoot, required: true});
  assert.deepEqual(result.defaultArgv, argv);
  assert.match(result.programBoundary, /not acquisition of a checked-in Node source reader/);
  assert.match(result.overrideBoundary, /custom container argv/);
  assert.equal(frame.slice(result.commandKeyOffset).split('\n')[0], result.template.expression);
}));
test('a changed default argv requires renewed qualification', () => fixture(sourceRoot => {
  fs.writeFileSync(path.join(sourceRoot, 'charts/kubeclaw/values.yaml'), YAML.stringify({gateway: {command: ['sh', '-c', 'node other.mjs']}}));
  assert.throws(() => helmGatewayCommandProjection({file, text: frame, sourceRoot}), /DEFAULT_DRIFT/);
}));
test('changed or removed acquisition and a different selected container refuse', () => fixture(sourceRoot => {
  for (const text of [frame.replace('nindent 12', 'nindent 10'), frame.replace('gateway.command', 'gateway.otherCommand'), frame.replace('name: kubeclaw', 'name: other')]) {
    assert.throws(() => helmGatewayCommandProjection({file, text, sourceRoot, required: true}), /SOURCE_DRIFT/);
  }
}));
test('does not claim unrelated literal probe or heredoc commands', () => fixture(sourceRoot => {
  assert.equal(helmGatewayCommandProjection({file, text: 'command: [node, probe.mjs]\n', sourceRoot}), null);
  assert.equal(helmGatewayCommandProjection({file: 'charts/other/templates/pod.yaml', text: frame, sourceRoot}), null);
}));
