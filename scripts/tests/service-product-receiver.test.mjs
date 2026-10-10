import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {receiverContracts} from '../docs-kubernetes-core-receiver-contracts.mjs';
test('empty chart type renders null; authority distinguishes default from allowed input policy',()=>{
 const render=execFileSync('helm',['template','service-check','charts/kubeclaw','--set-string','service.type=','--show-only','templates/service.yaml'],{encoding:'utf8'});
 assert.match(render,/^  type:\s*$/m);
 const authority=fs.readFileSync('scripts/docs-local-helm-field-authorities.json','utf8');
 const i=authority.indexOf('"$.service.type":');
 assert.match(authority.slice(i,i+1600),/YAML null/);
});
test('all selected Service records link diagnosis and preserve conditional cleanup',()=>{
 const services=receiverContracts.filter(x=>x.kind==='Service');
 assert.ok(services.length);
 for(const record of services)assert.ok(record.readerReferences.some(x=>x.target==='service-routing.md'));
 const source=fs.readFileSync('scripts/docs-kubernetes-core-receiver-contracts.mjs','utf8');
 assert.match(source,/Only when exists is true/);
 assert.match(source,/ImplementedElsewhere is ignored on that deletion branch/);
 assert.match(source,/Finalizer removal is not evidence of provider resource erasure/);
});
