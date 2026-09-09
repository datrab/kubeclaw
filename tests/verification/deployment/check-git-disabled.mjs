import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parseAllDocuments } from 'yaml';

let checks = 0;
for (const [role, values] of [
  ['default', null], ['nova', 'my-values/nova-values.yaml'],
  ['buster', 'my-values/buster-values.yaml'], ['prism', 'my-values/prism-agent-values.yaml'],
]) {
  for (const root of [true, false]) for (const enabled of [false, true]) {
    const args = ['template', `agent-${role}`, 'charts/kubeclaw',
      ...(values ? ['-f', values] : []), '--set', `agent.git.enabled=${enabled}`, '--set', `runAsRoot=${root}`];
    const rendered = spawnSync('helm', args, { encoding: 'utf8' });
    assert.equal(rendered.status, 0, rendered.stderr);
    const objects = parseAllDocuments(rendered.stdout).map((doc) => { assert.deepEqual(doc.errors, []); return doc.toJSON(); });
    const deployment = objects.find((doc) => doc?.kind === 'Deployment' && doc.spec.template.spec.initContainers?.some((container) => container.name === 'init-setup'));
    assert.ok(deployment);
    const pod = deployment.spec.template.spec;
    const setup = pod.initContainers.find((container) => container.name === 'init-setup');
    assert.ok(setup);
    const script = setup.command[2];
    assert.equal(spawnSync('bash', ['-n'], { input: script, encoding: 'utf8' }).status, 0, `${role}: invalid init shell`);
    const containers = [...pod.initContainers, ...pod.containers];
    const secret = pod.volumes.find((volume) => volume.name === 'ssh-secret-vol');
    const home = pod.volumes.find((volume) => volume.name === 'ssh-home-vol');
    const mounts = containers.flatMap((container) => container.volumeMounts ?? []).filter((mount) => ['ssh-secret-vol', 'ssh-home-vol'].includes(mount.name));
    if (enabled) {
      assert.ok(secret && home, `${role}: enabled Git must retain SSH volumes`);
      assert.equal(secret.secret.optional, false);
      assert.ok(mounts.length >= 3);
      assert.match(script, /git clone "\$GIT_REPO_URL"/);
      assert.match(script, /\/secrets\/ssh\/id_rsa/);
    } else {
      assert.equal(secret, undefined, `${role}/${root}: disabled Git still requires SSH Secret`);
      assert.equal(home, undefined);
      assert.deepEqual(mounts, []);
      assert.doesNotMatch(script, /INIT_SSH_HOME|\/secrets\/ssh|git clone|git fetch|git -C/);
      for (const container of containers) {
        assert.ok(!(container.env ?? []).some(({ name }) => ['GIT_REPO_URL', 'INIT_SSH_HOME'].includes(name)));
      }
    }
    for (const container of containers) for (const mount of container.volumeMounts ?? []) {
      assert.ok(pod.volumes.some((volume) => volume.name === mount.name), `${role}: dangling mount ${mount.name}`);
    }
    checks += 1;
  }
}
console.log(JSON.stringify({ ok: true, scope: 'real-helm-render', finding: 'IFR-19-002', combinations: checks, podStarted: false }));
