// Inventory membership proof only, never a substitute for component review.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const inventory=JSON.parse(fs.readFileSync('docs/review/inventory-data.json','utf8'));
const files=execFileSync('git',['ls-files'],{encoding:'utf8'}).trim().split('\n');
const owners=p=>inventory.components.filter(c=>c.paths.some(root=>p===root||p.startsWith(root+'/'))).map(c=>c.id);
const manifests=files.filter(p=>p.startsWith('skills/')&&['plugin.json','openclaw.plugin.json'].includes(path.basename(p)));
const manifestCoverage=manifests.map(p=>({path:p,manifestId:JSON.parse(fs.readFileSync(p,'utf8')).id,reviewIds:owners(p)}));
assert(manifestCoverage.every(m=>m.reviewIds.length===1));
const sourceFiles=files.filter(p=>/^(skills|cmd|contracts)\//.test(p)&&/\.(?:ts|tsx|mts|js|jsx|mjs|cjs|go|py|sh|c)$/.test(p)&&!p.split('/').some(x=>['tests','test','testdata','fixtures','generated'].includes(x))&&!/\.(?:test|spec)\./.test(p));
const uncovered=sourceFiles.filter(p=>owners(p).length===0);assert.deepEqual(uncovered,[]);
const ownership=JSON.parse(fs.readFileSync('packaging/runtime/package-ownership.json','utf8'));
const packageCoverage=ownership.packages.map(p=>({id:p.id,source:p.source,reviewIds:inventory.components.filter(c=>c.paths.some(q=>q===p.source||q.startsWith(p.source+'/')||p.source.startsWith(q+'/'))).map(c=>c.id)}));
assert(packageCoverage.every(p=>p.reviewIds.length>0));
const roles=['nova','buster','prism'].map(role=>{const r=JSON.parse(fs.readFileSync(`packaging/runtime/roles/${role}.json`,'utf8'));return {role,entrypoint:r.entrypoint,packages:r.packages.length,plugins:r.plugins.length,extensions:r.extensions.length};});
console.log(JSON.stringify({baseline:inventory.baseline,components:inventory.components.length,pipelineManifests:manifestCoverage.filter(m=>m.path.endsWith('/plugin.json')).length,extensionManifests:manifestCoverage.filter(m=>m.path.endsWith('/openclaw.plugin.json')).length,sourceFiles:sourceFiles.length,uncovered,manifestCoverage,packageCoverage,roles},null,2));
