from pathlib import Path
import json,hashlib,difflib
b=Path('docs/review/evidence/config-worker-listener-20260921');rows=[];patch=[]
paths=['skills/prism/tests/swarm-worker-config.test.mts','skills/prism/tests/control-listener.test.mts','skills/prism/tests/control-image-environment.test.mts','skills/prism/tests/worker-process-shutdown-native.mts','tests/verification/deployment/prism-swarm-config.test.mjs']
for name in paths:
 old=Path(name).read_text();s=old
 if name.endswith('swarm-worker-config.test.mts'):
  s=s.replace("keys.filter(k => k !== 'shutdownTimeoutMs')","keys.filter(k => k !== 'shutdownTimeoutMs' && k !== 'port')")
  s=s.replace("  for (const key of keys.filter", "  assert.equal(runtime.port, authored['prism-worker'].settings.ingress.port);\n  for (const key of keys.filter",1)
  s=s.replace('const values = { maximumActiveRequests:', 'const values = { port: 23458, maximumActiveRequests:')
  s=s.replace('  assert.equal(runtime.shutdownTimeoutMs, 5000);','  assert.equal(runtime.shutdownTimeoutMs, 5000);\n  assert.equal(runtime.port, 23458);')
 elif name.endswith('control-listener.test.mts'):
  s="import { readTestBundle, writeTestBundle } from '../../../tests/fixtures/config/swarm-bundle.mjs';\n"+s
  s=s.replace('Worker keeps its PORT author','Worker uses its separate authored port')
  s=s.replace("  const worker = loadWorkerConfig({...environment, PORT: '23458', DATABASE_URL: 'postgresql://test/prism'});", "  const bundle = readTestBundle(environment.SWARM_CONFIG);\n  bundle['prism-worker'].settings.ingress.port = 23458;\n  writeTestBundle(environment.SWARM_CONFIG, bundle);\n  const worker = loadWorkerConfig({...environment, DATABASE_URL: 'postgresql://test/prism'});\n  for (const PORT of ['', '8080', '23458']) {\n    assert.throws(() => loadWorkerConfig({...environment, PORT}), /SWARM_CONFIG_LEGACY_OVERRIDE:PORT/);\n  }")
 elif name.endswith('control-image-environment.test.mts'):
  s=s.replace('preserves legitimate Worker PORT','rejects the retired Worker PORT author')
  s=s.replace("      assert.equal(child.status, 0, child.stdout + child.stderr);", "      assert.notEqual(child.status, 0);\n      assert.match(child.stderr, /SWARM_CONFIG_LEGACY_OVERRIDE:PORT/u);")
 elif name.endswith('worker-process-shutdown-native.mts'):
  s=s.replace('shutdownTimeoutMs: number): Promise<string>','shutdownTimeoutMs: number, port: number): Promise<string>')
  s=s.replace("  config['prism-worker'].settings.ingress.shutdownTimeoutMs = shutdownTimeoutMs;", "  config['prism-worker'].settings.ingress.shutdownTimeoutMs = shutdownTimeoutMs;\n  config['prism-worker'].settings.ingress.port = port;")
  s=s.replace('...process.env, PORT: String(port),','...process.env,')
  s=s.replace('authoredConfig(t, 1500)','authoredConfig(t, 1500, port)').replace('authoredConfig(t, 30)','authoredConfig(t, 30, port)')
 elif name.endswith('prism-swarm-config.test.mjs'):
  s=s.replace('settings.ingress = { maximumActiveRequests:', 'settings.ingress = { port: 23458, maximumActiveRequests:')
  s=s.replace('const { shutdownTimeoutMs, ...ingress }','const { shutdownTimeoutMs, port, ...ingress }')
  s=s.replace('    assert.deepEqual(actual.ingress, ingress);','    assert.deepEqual(actual.ingress, ingress);\n    assert.equal(actual.port, port);')
 assert old!=s
 for folder,v in [('before',old),('staging/files',s)]:
  dest=b/folder/name;dest.parent.mkdir(parents=True,exist_ok=True);assert not dest.exists();dest.write_text(v)
 rows.append({'path':name,'beforeSha256':hashlib.sha256(old.encode()).hexdigest(),'stagedSha256':hashlib.sha256(s.encode()).hexdigest()})
 patch.extend(difflib.unified_diff(old.splitlines(True),s.splitlines(True),fromfile='a/'+name,tofile='b/'+name))
(b/'staged-tests.patch').write_text(''.join(patch));(b/'staged-tests-identities.json').write_text(json.dumps(rows,indent=2)+'\n')
# Preserve alias identity explicitly; integration must edit the physical sole author.
aliases=[]
for name in ['charts/prism/templates/_swarm-bundle.tpl','charts/kubeclaw/files/config/swarm-components.schema.json']:
 p=Path(name);aliases.append({'readPath':name,'linkTarget':str(p.readlink()) if p.is_symlink() else None,'physicalAuthor':str(p.resolve().relative_to(Path.cwd()))})
(b/'physical-authors.json').write_text(json.dumps(aliases,indent=2)+'\n')
