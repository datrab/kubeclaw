import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import { busterRenderConfigurationCompatible, isNonBusterRenderConfiguration, whollyBusterGuarded } from '../../../scripts/updates/runtime-publication-scope.mjs';
const guard='{{- if and .Values.busterNamespaceBroker.enabled (eq .Values.agentRole "buster") -}}';

test('only bounded Buster-owned render inputs are excluded from shared configuration comparison', () => {
  for(const file of ['charts/kubeclaw/templates/buster-namespace-controller.yaml','charts/kubeclaw/templates/buster-namespace-lease-crd.yaml','my-values/buster-values.yaml','gitops/production/overlays/buster-ax41.yaml']) assert.equal(isNonBusterRenderConfiguration(file),false,file);
  for(const file of ['charts/kubeclaw/templates/deployment.yaml','charts/kubeclaw/values.yaml','charts/prism/values.yaml','my-values/nova-values.yaml','gitops/production/overlays/nova-ax41.yaml','gitops/production/config.json']) assert.equal(isNonBusterRenderConfiguration(file),true,file);
});
test('whole-template guard rejects text/resources after an early end or outside role condition', () => {
  assert.equal(whollyBusterGuarded(guard+'\nkind: Deployment\n{{ if .Values.optional }}x{{ end }}\n{{- end }}'),true);
  for(const bytes of [guard+'{{ else }}kind: ConfigMap{{ end }}',guard+'{{ else if true }}kind: ConfigMap{{ end }}',guard+'\n{{ end }}\nkind: Deployment',guard+'\n{{ end }}\n{{ if true }}kind: Deployment{{ end }}','kind: Deployment\n'+guard+'\n{{ end }}',guard+'\nkind: Deployment']) assert.equal(whollyBusterGuarded(bytes),false);
});
test('real Git snapshots allow private Buster changes but reject shared changes and broken role guards', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buster-config-'));
  const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const write=(file,bytes)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),bytes);};
  const commit=()=>{git(['add','.']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','-qm','fixture']);return git(['rev-parse','HEAD']);};
  try{
    git(['init','-q']);
    for(const file of ['buster-namespace-controller.yaml','buster-namespace-lease-crd.yaml'])write('charts/kubeclaw/templates/'+file,guard+'\nkind: Deployment\n{{- end }}');
    write('charts/kubeclaw/values.yaml','shared: unchanged');write('my-values/buster-values.yaml','agentRole: buster');
    const before=commit();
    write('my-values/buster-values.yaml','agentRole: buster\nbootstrap: false');const privateChange=commit();
    assert.equal(busterRenderConfigurationCompatible(root,before,privateChange),true);
    write('charts/kubeclaw/values.yaml','shared: changed');const sharedChange=commit();
    assert.equal(busterRenderConfigurationCompatible(root,before,sharedChange),false);
    write('charts/kubeclaw/values.yaml','shared: unchanged');
    write('charts/kubeclaw/templates/buster-namespace-controller.yaml',guard+'\n{{ end }}\nkind: Deployment');const unguarded=commit();
    assert.equal(busterRenderConfigurationCompatible(root,before,unguarded),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
