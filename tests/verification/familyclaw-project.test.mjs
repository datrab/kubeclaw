import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseAllDocuments} from 'yaml';
test('Familyclaw admits its browser ingress and credential controller without cluster authority or pruning',()=>{
 const docs=parseAllDocuments(readFileSync(new URL('../../gitops/production/household-applications.yaml',import.meta.url),'utf8')).map(x=>x.toJSON());
 const project=docs.find(x=>x.kind==='AppProject'&&x.metadata.name==='familyclaw');
 assert.deepEqual(project.spec.clusterResourceWhitelist,[]);
 assert.deepEqual(project.spec.destinations,[{namespace:'familyclaw',server:'https://kubernetes.default.svc'}]);
 const active=parseAllDocuments(readFileSync(new URL('../../gitops/production/apps/applications.yaml',import.meta.url),'utf8')).map(x=>x.toJSON()).find(x=>x.kind==='AppProject'&&x.metadata.name==='familyclaw');
 assert.deepEqual(active.spec,project.spec,'the root application consumes apps/applications.yaml, not only the source fragment');
 const kinds=project.spec.namespaceResourceWhitelist;
 for(const [group,kind] of [['','ServiceAccount'],['rbac.authorization.k8s.io','Role'],['rbac.authorization.k8s.io','RoleBinding'],['networking.k8s.io','Ingress']])assert.ok(kinds.some(x=>x.group===group&&x.kind===kind),kind);
 assert.ok(kinds.every(x=>x.group!=='*'&&x.kind!=='*'&&!['Secret','ClusterRole','ClusterRoleBinding'].includes(x.kind)));
 const app=docs.find(x=>x.kind==='Application'&&x.metadata.name==='familyclaw');
 assert.equal(app.metadata.annotations['argocd.argoproj.io/sync-options'],'Prune=false,Delete=false');
 assert.equal(app.spec.syncPolicy.automated,undefined);
});
