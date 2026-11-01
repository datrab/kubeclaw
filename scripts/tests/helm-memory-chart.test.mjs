import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {localHelmChartFiles,renderLocalHelmChart} from '../docs-helm-memory-chart.mjs';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'helm-memory-chart-controls-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const files={'Chart.yaml':'apiVersion: v2\nname: fixture\nversion: 1.0.0\n','values.yaml':'setting: false\n','templates/setting.yaml':'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: fixture\ndata:\n  setting: {{ .Values.setting | quote }}\n  content: {{ .Files.Get "files/text" | quote }}\n','files/text':'\ufeffexact nested file\n','templates/nested/.included.yaml':'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: nested-visible\n','templates/.ignored.yaml':'{{ invalid ignored syntax','templates/.ignored-dir/bad.yaml':'{{ invalid ignored syntax'};
 for(const [name,text] of Object.entries(files)){const file=path.join(root,'fixture',name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}
 return {root,chart:path.join(root,'fixture')};
}
test('real sealed memory chart matches native directory bytes and profile stdin',t=>{
 const f=fixture(t),files=localHelmChartFiles(f.root,'fixture');
 assert(files.has('templates/nested/.included.yaml'));
 assert(!files.has('templates/.ignored.yaml'));assert(!files.has('templates/.ignored-dir/bad.yaml'));
 const before=[...files].map(([k,v])=>[k,v.toString('base64')]);
 for(const values of ['setting: selected\n','setting: false\n','']){
  const old=spawnSync('helm',['template','discovery',f.chart,'--namespace','default','--kube-version','1.35.0','--include-crds','-f','-'],{input:values,encoding:'utf8'});
  const current=renderLocalHelmChart(files,values);assert.equal(old.status,0,old.stderr);assert.equal(current.status,0,current.stderr);assert.equal(current.stdout,old.stdout);
 }
 assert.deepEqual([...files].map(([k,v])=>[k,v.toString('base64')]),before);
});
test('real renderer preserves Helm failure without fabricated success',t=>{
 const f=fixture(t),files=localHelmChartFiles(f.root,'fixture');files.set('templates/setting.yaml',Buffer.from('{{ fail "original failure" }}'));
 const result=renderLocalHelmChart(files,'');assert.notEqual(result.status,0);assert.equal(result.stdout,'');assert.match(result.stderr,/original failure/);
});
test('unsupported namespace/irregular inputs fail closed',t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.chart,'.helmignore'),'*.yaml\n');assert.throws(()=>localHelmChartFiles(f.root,'fixture'),/IGNORE_UNQUALIFIED/);fs.unlinkSync(path.join(f.chart,'.helmignore'));
 fs.symlinkSync('values.yaml',path.join(f.chart,'alias'));assert.throws(()=>localHelmChartFiles(f.root,'fixture'),/SYMLINK_UNQUALIFIED/);
});
test('memory renderer rejects traversal, malformed members and missing chart',()=>{
 const chart=['Chart.yaml',Buffer.from('apiVersion: v2\nname: fixture\nversion: 1.0.0\n')];
 for(const name of ['../escape','/absolute','a/../b','a\\b','a\0b'])assert.throws(()=>renderLocalHelmChart(new Map([chart,[name,Buffer.from('x')]]),''),/MEMBER_INVALID/);
 assert.throws(()=>renderLocalHelmChart(new Map(),''),/CHART_MISSING/);assert.throws(()=>renderLocalHelmChart(new Map([chart]),null),/VALUES_INVALID/);
});
