from pathlib import Path
import re,json,hashlib
b=Path(__file__).parent
for name in ['production.patch','identities.json']:
 p=b/name;old=b/('initial-'+name)
 if not old.exists():old.write_bytes(p.read_bytes())
def stage(p,t):
 p=Path(p);dest=b/'files'/p;before=b/'before'/p
 if not before.exists() and p.exists():before.parent.mkdir(parents=True,exist_ok=True);before.write_bytes(p.read_bytes())
 dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(t)
rows=[]
for p in Path('tests').rglob('*'):
 if p.suffix not in ['.ts','.mts','.mjs']:continue
 t=(b/'before'/p).read_text() if (b/'before'/p).exists() else p.read_text();pat=r'new (?:Modeled)?BusterRemotePlanService\(\{'
 matches=list(re.finditer(pat,t))
 if not matches:continue
 out=re.sub(pat,lambda m:m.group(0)+'\n    dependencyReadiness: { maximumExecutionMs: 1000, maximumOutputBytes: 65536 },',t)
 stage(p,out);rows.append({'path':str(p),'literalCallers':len(matches),'onlyAdditiveExplicitPolicy':True})
p=Path('tests/verification/contracts/check-pipeline-worker-local-config.mts');t=(b/'before'/p).read_text() if (b/'before'/p).exists() else p.read_text();old='const serviceOptions = { store, preparation, registry, workerRevision:';assert old in t;t=t.replace(old,'const serviceOptions = { dependencyReadiness: { maximumExecutionMs: 1000, maximumOutputBytes: 65536 }, store, preparation, registry, workerRevision:');stage(p,t)
rows.append({'path':str(p),'variableCallers':2,'onlyAdditiveExplicitPolicy':True})
(b/'caller-migration.json').write_text(json.dumps(rows,indent=2)+'\n')
p=Path('tests/verification/deployment/buster-readiness.test.mts');t=(b/'before'/p).read_text() if (b/'before'/p).exists() else p.read_text()
t=t.replace("import {parseAllDocuments} from 'yaml';", "import {parseAllDocuments} from 'yaml';\nimport yaml from 'js-yaml';\nimport { nativePoolPolicy } from '../../../scripts/native-worker-node-policy.mjs';")
old="test('actual Helm uses bootstrap and functional readiness separately from liveness',()=>{\n const rendered=spawnSync('helm',['template','readiness-test','charts/kubeclaw','-f','my-values/buster-values.yaml','--set','runtimeInfrastructure.registry.endpoint=https://registry.example.test','--set','runtimeInfrastructure.registry.transport=https','--set','runtimeInfrastructure.registry.authSecretName=registry-test'],{encoding:'utf8'});"
new="""test('actual Helm uses bootstrap and functional readiness separately from liveness',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'readiness-helm-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const values=yaml.load(fs.readFileSync('my-values/buster-values.yaml','utf8')) as Record<string, any>;
 const policy=yaml.load(fs.readFileSync('my-values/infra/native-worker-pools.yaml','utf8')) as Record<string, any>;
 policy.nodeName='readiness-render-only';policy.pools.buster.namespace='readiness-test';
 const binding=nativePoolPolicy(policy,'buster');
 values.busterNative={namespace:'readiness-test',nodeName:binding.nodeName,policyDigest:binding.policyDigest};
 // Valid-shaped immutable reference is render-only; no image existence or activation claim.
 values.extraContainers.find((item:{name:string})=>item.name==='buster-v2-runtime').image=`ghcr.io/datrab/kubeclaw-buster-runtime@sha256:${'a'.repeat(64)}`;
 const file=path.join(root,'values.yaml');fs.writeFileSync(file,yaml.dump(values));
 const rendered=spawnSync('helm',['template','readiness-test','charts/kubeclaw','--namespace','readiness-test','-f',file,'--set','runtimeInfrastructure.registry.endpoint=https://registry.example.test','--set','runtimeInfrastructure.registry.transport=https','--set','runtimeInfrastructure.registry.authSecretName=registry-test'],{encoding:'utf8'});"""
assert old in t;t=t.replace(old,new);stage(p,t)
