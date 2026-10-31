import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import test from 'node:test';import ts from 'typescript';import {createHash} from 'node:crypto';
import {documentationModuleInputAuthority} from '../docs-api-output-discovery.mjs';
const sources=[
  "scripts/check-platform-specialist-guides.mjs",
  "scripts/docs-lint-policy-reference.mjs",
  "scripts/docs-configuration-inventory.mjs",
  "tests/verification/contracts/check-plugin-system-v2-boundaries.mjs",
  "tests/verification/contracts/check-plugin-system-v2-capability-runtime.mjs",
  "tests/verification/contracts/check-plugin-system-v2-e2e.mjs",
  "tests/verification/contracts/check-plugin-system-v2-import-safety.mjs",
  "tests/verification/contracts/check-plugin-system-v2-installation.mjs",
  "tests/verification/contracts/check-plugin-system-v2-lifecycle.mjs",
  "tests/verification/contracts/check-plugin-system-v2-platform-config.mjs",
  "tests/verification/contracts/check-plugin-system-v2-registry.mjs",
  "tests/verification/contracts/check-plugin-system-v2-capability-security.mjs",
  "tests/verification/contracts/check-plugin-system-v2-phase6.mjs",
  "tests/verification/contracts/check-plugin-system-v2-phase7.mjs",
  "tests/verification/contracts/check-plugin-system-v2-external-engine.mjs",
  "tests/verification/contracts/check-plugin-system-v2-isolation.mjs",
  "tests/verification/contracts/check-plugin-system-v2-phase11.mts",
  "tests/verification/contracts/check-project-compiler.mts",
  "tests/verification/contracts/project-legacy-import-cases.mts",
  "tests/verification/historical-branch-acceptance/delivery-manifest-v3-compiler-recovery-independent.test.mjs",
  "tests/verification/historical-branch-acceptance/delivery-manifest-v3-contract-independent.test.mjs",
  "tests/verification/historical-branch-acceptance/delivery-manifest-v3-summary-mode-independent.test.mjs",
  "tests/verification/reliability/observability-replay.test.mjs",
  "tests/verification/reliability/review-cache-legacy-prefix.test.mjs",
  "tests/verification/reliability/review-evidence-compiler-recovery.test.mjs",
  "tests/verification/reliability/review-report-compiler-recovery.test.mjs",
  "tests/verification/reliability/runtime-dispatch-native-profile.test.mjs"
],sha=x=>createHash('sha256').update(x).digest('hex'),repository=path.resolve(new URL('../..',import.meta.url).pathname);
test('the exact 27 current module recipes retain source caller operation and selected-path refusal',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'docs-module-input-successor-'));const write=(p,b)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),b);};
 try{
  const boundary=JSON.parse(fs.readFileSync(path.join(repository,'scripts/docs-api-producer-adapter-authorities.json'))).documentationToolBoundary,selected=sources.map(s=>boundary.unresolvedModuleInputAuthorities.find(r=>r.source===s));assert(selected.every(Boolean));assert.equal(selected.length,27);
  for(const p of new Set(selected.flatMap(r=>[r.source,...r.authorityInputs.map(i=>i.path),...(r.inputConstraints.modulePaths??[])])))write(p,fs.readFileSync(path.join(repository,p)));
  const graph={dynamicOperations:[],resolutionOnlyOperations:[]};
  for(const r of selected){const text=fs.readFileSync(path.join(root,r.source),'utf8'),tree=ts.createSourceFile(r.source,text,ts.ScriptTarget.Latest,true,/\.[cm]?ts$/u.test(r.source)?ts.ScriptKind.TS:ts.ScriptKind.JS);
   for(const expected of r.operations){const candidates=[];const visit=n=>{if(n.getText(tree)===expected.expression){let owner=n;for(let p=n.parent;p;p=p.parent)if(ts.isFunctionDeclaration(p))owner=p;if(sha(owner.getText(tree))===expected.operationSha256)candidates.push(owner.getText(tree));}ts.forEachChild(n,visit);};visit(tree);assert(candidates.length,r.source+' actual owner');graph.dynamicOperations.push({source:r.source,expression:expected.expression,operation:candidates[0]});}
  }
  const check=(b=boundary,g=graph)=>documentationModuleInputAuthority(root,b,g),baseline=check(),frozen=JSON.stringify(graph);assert.match(baseline,/^[a-f0-9]{64}$/u);assert.equal(JSON.stringify(graph),frozen);
  for(const source of sources.slice(0,3)){
   const original=fs.readFileSync(path.join(root,source));write(source,Buffer.concat([original,Buffer.from('\n// unreviewed source\n')]));assert.throws(()=>check(),/input\/caller authority changed/);write(source,original);
   const changed=structuredClone(graph),operation=changed.dynamicOperations.find(o=>o.source===source);operation.expression+=' /* unreviewed */';assert.throws(()=>check(boundary,changed),/outside its semantic input recipe/);
   const forged=structuredClone(boundary),r=forged.unresolvedModuleInputAuthorities.find(r=>r.source===source);r.inputConstraints.modulePaths.push('tools/unreviewed.mjs');assert.throws(()=>check(forged),/no reviewed semantic input authority/);
  }
  const helper='scripts/docs-lint-policy-reference.mjs',helperBytes=fs.readFileSync(path.join(root,helper));write(helper,Buffer.concat([helperBytes,Buffer.from('\n')]));assert.throws(()=>check(),/input\/caller authority changed/);write(helper,helperBytes);
  const packageBytes=fs.readFileSync(path.join(root,'package.json')),pkg=JSON.parse(packageBytes);pkg.scripts['new:unreviewed']='node tools/unreviewed.mjs';write('package.json',JSON.stringify(pkg));assert.throws(()=>check(),/input\/caller authority changed/);write('package.json',packageBytes);
  const target=selected[0].inputConstraints.modulePaths[0],targetBytes=fs.readFileSync(path.join(root,target));fs.rmSync(path.join(root,target));assert.throws(()=>check(),/finite selected module missing/);write(target,targetBytes);assert.equal(check(),baseline);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
