import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

/** Test-only support outside installed role root. Buster/Foundation/SDK always
 * resolve to installed code; only Nova orchestration is a proof dependency. */
export function buildBusterProofHarness({repository,output,installedRoot}) {
 for(const value of [repository,output,installedRoot])if(typeof value!=='string'||!path.isAbsolute(value))throw new Error('BUSTER_PROOF_PATH_REQUIRED');
 if(fs.existsSync(output))throw new Error('BUSTER_PROOF_OUTPUT_EXISTS');fs.mkdirSync(output,{recursive:true});
 const copy=(source,target=source)=>{fs.mkdirSync(path.dirname(path.join(output,target)),{recursive:true});fs.cpSync(path.join(repository,source),path.join(output,target),{recursive:true,filter:file=>!['node_modules','dist','tests'].includes(path.basename(file))});};
 for(const file of ['tests/verification/contracts/check-pipeline-container-build-production.mts','tests/verification/contracts/check-pipeline-container-build-recovery.mts']){
  fs.mkdirSync(path.dirname(path.join(output,file)),{recursive:true});fs.copyFileSync(path.join(repository,file),path.join(output,file));
 }
 for(const source of ['scripts/updates','tests/fixtures/test-gate','tests/fixtures/config','config','skills/nova/core'])copy(source);
 fs.mkdirSync(path.join(output,'tests/fixtures'),{recursive:true});fs.copyFileSync(path.join(repository,'tests/fixtures/core-runtime-policy.mjs'),path.join(output,'tests/fixtures/core-runtime-policy.mjs'));
 const link=(target,destination)=>{const file=path.join(output,destination);fs.mkdirSync(path.dirname(file),{recursive:true});fs.symlinkSync(target,file);};
 const ownership=JSON.parse(fs.readFileSync(path.join(repository,'packaging/runtime/package-ownership.json'),'utf8'));
 const receipt=JSON.parse(fs.readFileSync(path.join(installedRoot,'manifest.json'),'utf8'));
 for(const pkg of receipt.packages.filter(pkg=>pkg.kind!=='entrypoint')){
  const owner=ownership.packages.find(owner=>owner.id===pkg.id);if(owner)link(path.join(installedRoot,pkg.target),owner.source);
 }
 link(path.join(installedRoot,'skills/plugins'),'skills/buster/plugins');
 fs.mkdirSync(path.join(output,'skills/node_modules/@kubeclaw'),{recursive:true});
 for(const name of fs.readdirSync(path.join(installedRoot,'skills/node_modules'))){
  if(name==='@kubeclaw'){for(const pkg of fs.readdirSync(path.join(installedRoot,'skills/node_modules/@kubeclaw')))link(path.join(installedRoot,'skills/node_modules/@kubeclaw',pkg),`skills/node_modules/@kubeclaw/${pkg}`);}
  else link(path.join(installedRoot,'skills/node_modules',name),`skills/node_modules/${name}`);
 }
 link('../../nova/core','skills/node_modules/@kubeclaw/nova-core');
 link('skills/node_modules','node_modules');
 fs.writeFileSync(path.join(output,'package.json'),'{"type":"module"}\n');
 return output;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const [output,installedRoot]=process.argv.slice(2);if(process.argv.length!==4)throw new Error('Usage: build-buster-proof-harness.mjs OUTPUT INSTALLED_ROLE_ROOT');
 buildBusterProofHarness({repository:path.resolve(import.meta.dirname,'..'),output,installedRoot});
}
