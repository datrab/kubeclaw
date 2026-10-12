import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import yaml from 'js-yaml';
import { ESLint } from 'eslint';

function section(script, start, end) {
  const first = script.indexOf(start);
  assert(first >= 0, `missing copy section: ${start}`);
  const last = script.indexOf(end, first + start.length);
  assert(last > first, `missing copy section end: ${end}`);
  return script.slice(first, last);
}

function copyLintFiles(shell, script, directories) {
  const loops = [...script.matchAll(/for lint_config in [^\n]+; do\n[\s\S]*?\n\s*done/g)];
  assert.equal(loops.length, 2, 'both maintained lint-copy phases must exist');
  const first = section(script, 'if [ -f "/init-swarm-config/eslint.config.mjs" ]; then',
    'if [ -f "/init-swarm-config/.yamllint.yml" ]; then');
  const second = section(script, 'if [ -f /config/eslint.config.mjs ]; then',
    'if [ -f /config/.yamllint.yml ]; then');
  let isolated = [first, loops[0][0], second, loops[1][0]].join('\n');
  for (const [original, target] of Object.entries(directories)) isolated = isolated.replaceAll(original, target);
  execFileSync(shell, ['-eu', '-c', isolated], {
    env: { ...process.env, OVERRIDE_SWARM_CONFIG: 'true' }, encoding: 'utf8',
  });
}

test('packaged ESLint policy survives both real copy phases and requires its rule module', async t => {
  const root = process.cwd();
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-delivery-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  execFileSync('helm', ['package', 'charts/kubeclaw', '--destination', temporary]);
  const archives = fs.readdirSync(temporary).filter(name => name.endsWith('.tgz'));
  assert.equal(archives.length, 1);
  execFileSync('tar', ['-xzf', path.join(temporary, archives[0]), '-C', temporary]);
  const chart = path.join(temporary, 'kubeclaw');
  for (const name of ['eslint-config.mjs', 'discipline-eslint-plugin.mjs']) {
    assert.deepEqual(fs.readFileSync(path.join(chart, 'files/config', name)),
      fs.readFileSync(path.join(root, 'charts/kubeclaw/files/config', name)));
  }
  const render = () => yaml.loadAll(execFileSync('helm', ['template', 'lint-delivery', chart,
    '-f', path.join(root, 'releases/values/nova.yaml')],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })).filter(Boolean);
  const documents = render();
  const config = documents.find(item => item.kind === 'ConfigMap' && item.data?.['eslint.config.mjs']);
  assert(config, 'rendered lint configuration must exist');
  const deployments = documents.filter(item => item.kind === 'Deployment');
  const deployment = deployments.find(item => item.spec.template.spec.initContainers?.some(container => container.name === 'init-setup'));
  assert(deployment, 'rendered deployment must own the actual init-setup container');
  const init = deployment.spec.template.spec.initContainers.find(item => item.name === 'init-setup');
  assert.equal(init.command?.length, 3, 'Kubernetes command must supply shell, -c and script');
  assert.deepEqual(init.command.slice(0, 2), ['/bin/bash', '-c']);
  assert.deepEqual(init.args ?? [], [], 'no extra shell arguments may change invocation semantics');
  const script = init.command[2];
  assert.equal(typeof script, 'string');
  const mounted = init.volumeMounts.find(item => item.mountPath === '/init-swarm-config');
  assert(mounted, 'init must mount the rendered ConfigMap at the copy source');
  assert.equal(mounted.subPath, undefined);
  assert.equal(mounted.subPathExpr, undefined);
  const volume = deployment.spec.template.spec.volumes.find(item => item.name === mounted.name);
  assert.equal(volume?.configMap?.name, config.metadata.name);
  assert.equal(volume.configMap.items, undefined, 'all ConfigMap keys including the plugin must be projected');
  for (const destination of ['/config', '/runtime-config']) {
    const mount = init.volumeMounts.find(item => item.mountPath === destination);
    assert(mount, `missing actual destination mount ${destination}`);
    assert.notEqual(mount.readOnly, true);
  }
  const source = path.join(temporary, 'source');
  const persisted = path.join(temporary, 'persisted');
  const runtime = path.join(temporary, 'runtime');
  for (const directory of [source, persisted, runtime]) fs.mkdirSync(directory);
  for (const name of ['eslint.config.mjs', 'discipline-eslint-plugin.mjs']) {
    assert.equal(typeof config.data[name], 'string');
    fs.writeFileSync(path.join(source, name), config.data[name]);
  }
  copyLintFiles(init.command[0], script, { '/runtime-config': runtime, '/init-swarm-config': source, '/config': persisted });
  for (const name of ['eslint.config.mjs', 'discipline-eslint-plugin.mjs']) {
    for (const directory of [persisted, runtime]) {
      assert.deepEqual(fs.readFileSync(path.join(directory, name)), fs.readFileSync(path.join(source, name)));
    }
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(runtime, 'node_modules'), 'dir');
  const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(runtime, 'eslint.config.mjs') });
  const [result] = await eslint.lintText('export const value = first ?? second ?? third;\n', {
    filePath: 'skills/nova/plugins/lint/src/delivery-probe.mjs',
  });
  assert(result.messages.some(message => message.ruleId === 'discipline/no-fallback-chain' && message.severity === 2));
  const checksum = docs => docs.filter(item => item.kind === 'Deployment').map(item => ({
    name: item.metadata.name, value: item.spec.template.metadata.annotations?.['checksum/swarm-config'],
  }));
  const originalChecksums = checksum(documents);
  assert(originalChecksums.length > 0 && originalChecksums.every(item => typeof item.value === 'string'));
  const extractedPlugin = path.join(chart, 'files/config/discipline-eslint-plugin.mjs');
  const owned = fs.lstatSync(extractedPlugin);
  assert(owned.isFile() && !owned.isSymbolicLink(), 'mutation target must be a private regular file');
  assert.equal(fs.realpathSync(extractedPlugin), extractedPlugin);
  assert(extractedPlugin.startsWith(`${fs.realpathSync(temporary)}${path.sep}`));
  const authored = fs.statSync(path.join(root, 'charts/kubeclaw/files/config/discipline-eslint-plugin.mjs'));
  assert(owned.dev !== authored.dev || owned.ino !== authored.ino, 'never mutate the authored source inode');
  fs.appendFileSync(extractedPlugin, '\n// rollout probe\n');
  const changedChecksums = checksum(render());
  assert.deepEqual(changedChecksums.map(item => item.name), originalChecksums.map(item => item.name));
  for (let index = 0; index < originalChecksums.length; index++) {
    assert.notEqual(changedChecksums[index].value, originalChecksums[index].value);
  }
  fs.unlinkSync(path.join(runtime, 'discipline-eslint-plugin.mjs'));
  const missing = spawnSync(process.execPath, ['--input-type=module', '-e',
    `await import(${JSON.stringify(pathToFileURL(path.join(runtime, 'eslint.config.mjs')).href)});`],
  { encoding: 'utf8' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /ERR_MODULE_NOT_FOUND/);
  assert.match(missing.stderr, /discipline-eslint-plugin\.mjs/);
});
