import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

const lua = value => value === null || value === undefined ? 'nil' : typeof value === 'object'
  ? `{${Object.entries(value).map(([key, child]) => `[${Array.isArray(value) ? Number(key) + 1 : JSON.stringify(key)}]=${lua(child)}`).join(',')}}`
  : JSON.stringify(value);

test('original Application health Lua rejects stale sync, failed hooks, drift and unavailable Git', () => {
  const healthy = {
    spec: { source: { repoURL: 'https://github.com/datrab/kubeclaw.git', path: 'releases/gitops/test/nova', targetRevision: 'a'.repeat(40), directory: { include: 'resources.yaml' } },
      destination: { server: 'https://kubernetes.default.svc', namespace: 'agents' } },
    status: { sync: { status: 'Synced', revision: 'a'.repeat(40) }, health: { status: 'Healthy' }, operationState: { phase: 'Succeeded', syncResult: { revision: 'a'.repeat(40) } } },
  };
  healthy.status.sync.comparedTo = structuredClone(healthy.spec);
  const cases = [{ name: 'current healthy release', object: healthy, expected: 'Healthy' }];
  const change = (name, expected, edit) => { const object = structuredClone(healthy); edit(object); cases.push({ name, object, expected }); };
  change('new desired commit cannot reuse old healthy state', 'Progressing', object => { object.spec.source.targetRevision = 'b'.repeat(40); });
  change('changed source path cannot reuse old healthy state', 'Progressing', object => { object.spec.source.path += '-other'; });
  change('changed destination cannot reuse old healthy state', 'Progressing', object => { object.spec.destination.namespace = 'other'; });
  change('failed migration blocks next wave', 'Degraded', object => { object.status.operationState.phase = 'Failed'; });
  change('Git unavailable blocks next wave despite stale healthy', 'Degraded', object => { object.status.conditions = [{ type: 'ComparisonError', message: 'repository unavailable' }]; });
  change('pending registry pull blocks next wave', 'Progressing', object => { object.status.health.status = 'Progressing'; });
  change('deployment degraded blocks next wave', 'Degraded', object => { object.status.health.status = 'Degraded'; });
  change('drift is not a successful sync', 'Progressing', object => { object.status.sync.status = 'OutOfSync'; });
  change('unfinished operation blocks next wave', 'Progressing', object => { object.status.operationState.phase = 'Running'; });
  change('old successful operation is insufficient', 'Progressing', object => { object.status.operationState.syncResult.revision = 'c'.repeat(40); });
  change('missing status is progressing', 'Progressing', object => { delete object.status; });
  const platform = (object) => { object.metadata = { annotations: { 'kubeclaw.io/health-mode': 'observed' } }; object.spec.sources = [object.spec.source]; delete object.spec.source; };
  change('manual multi-source child reports actual health', 'Healthy', platform);
  change('manual Helm child reports actual health', 'Healthy', object => { platform(object); object.spec.source = { chart: 'ops', targetRevision: 'main' }; delete object.spec.sources; });
  change('manual child drift keeps health distinct from sync', 'Healthy', object => { platform(object); object.status.sync.status = 'OutOfSync'; });
  change('manual degraded child remains degraded', 'Degraded', object => { platform(object); object.status.health.status = 'Degraded'; });
  change('manual child missing health waits', 'Progressing', object => { platform(object); delete object.status.health; });
  change('manual comparison error remains degraded', 'Degraded', object => { platform(object); object.status.conditions = [{ type: 'ComparisonError' }]; });
  change('manual failed operation remains degraded', 'Degraded', object => { platform(object); object.status.operationState.phase = 'Failed'; });
  const script = `local cases = ${lua(cases)}\nfor _, case in ipairs(cases) do\nobj = case.object\nlocal health = assert(loadfile(arg[1]))\nsetfenv(health, {obj = obj, ipairs = ipairs})\nlocal result = health()\nassert(result.status == case.expected, case.name .. ': ' .. result.status)\nprint(case.name .. ': ' .. result.status)\nend\n`;
  const output = execFileSync(process.env.LUA_BIN ?? 'lua', ['-', path.resolve('charts/gitops/files/application-health.lua')], { input: script, encoding: 'utf8' });
  assert.equal(output.trim().split('\n').length, cases.length);
});
