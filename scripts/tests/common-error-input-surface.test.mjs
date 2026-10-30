import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {catalogueInputSurface,checkCatalogueInputSurface} from '../lib/docs-catalogue-input-surface.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const expected=JSON.parse(fs.readFileSync(path.join(root,'docs/config/common-error-input-surface.json'))).files;
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'pr13-mnt011-controls-'));
const results=[];
try {
 fs.mkdirSync(path.join(scratch,'scripts'),{recursive:true});
 for(const name of Object.keys(expected)){fs.mkdirSync(path.dirname(path.join(scratch,name)),{recursive:true});fs.copyFileSync(path.join(root,name),path.join(scratch,name));}
 const run=(label,change,restore,pattern)=>{change();try{if(pattern)assert.throws(()=>checkCatalogueInputSurface(scratch,expected),pattern);else checkCatalogueInputSurface(scratch,expected);results.push({label,passed:true});}finally{restore();}};
 checkCatalogueInputSurface(scratch,expected);results.push({label:'baseline',passed:true});
 for(const name of ['skills/nova/core/src/index.ts','skills/prism/studio/app.tsx','skills/nova/core/package.json','package.json','package-lock.json']){
 const file=path.join(scratch,name),bytes=fs.readFileSync(file);
 run('changed:'+name,()=>fs.appendFileSync(file,'\n// new diagnostic or registration change\n'),()=>fs.writeFileSync(file,bytes),/CATALOGUE_INPUT_SURFACE_DRIFT:changed:/);
 }
 const added=path.join(scratch,'skills/nova/core/src/new-runtime-diagnostic.ts');
 run('new production member',()=>fs.writeFileSync(added,"throw new Error('NEW_DIAGNOSTIC');\n"),()=>fs.rmSync(added),/CATALOGUE_INPUT_SURFACE_DRIFT:added:/);
 const removed=path.join(scratch,'skills/nova/core/src/index.ts'),saved=fs.readFileSync(removed);
 run('removed active entry',()=>fs.rmSync(removed),()=>fs.writeFileSync(removed,saved),/CATALOGUE_INPUT_SURFACE_DRIFT:removed:/);
 const fixture=path.join(scratch,'skills/nova/core/tests/ignored.ts');
 run('excluded fixture',()=>{fs.mkdirSync(path.dirname(fixture),{recursive:true});fs.writeFileSync(fixture,'test');},()=>fs.rmSync(fixture),null);
 for(const name of ['package.json','skills/nova','scripts']) {
  const file=path.join(scratch,name),parked=file+'.parked';
  run('symlink rejection:'+name,()=>{fs.renameSync(file,parked);fs.symlinkSync(parked,file);},()=>{fs.unlinkSync(file);fs.renameSync(parked,file);},/CATALOGUE_INPUT_SYMLINK:/);
 }
 const link=path.join(scratch,'scripts/deploy-unreviewed.sh');
 run('new deployment script symlink',()=>fs.symlinkSync(path.join(scratch,'package.json'),link),()=>fs.unlinkSync(link),/CATALOGUE_INPUT_SYMLINK:/);
 checkCatalogueInputSurface(scratch,expected);results.push({label:'restored baseline',passed:true});
 console.log(JSON.stringify({status:'PASS',selectedInputs:Object.keys(catalogueInputSurface(root)).length,results},null,2));
}finally{fs.rmSync(scratch,{recursive:true,force:true});}
