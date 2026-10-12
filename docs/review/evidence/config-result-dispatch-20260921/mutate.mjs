import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=process.cwd(), out=path.join(root,'docs/review/evidence/config-result-dispatch-20260921');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prism-config-mutation-'));
function imports(source,file){return source.replace(/from (['"])(\.[^'"]+)\1/g,(_,quote,specifier)=>`from ${quote}${pathToFileURL(path.resolve(path.dirname(file),specifier)).href}${quote}`);}
try {
 const module=path.join(root,'skills/prism/server/control-config.ts'), test=path.join(root,'skills/prism/tests/swarm-native-settings.test.mts');
 const result=[];
 for(const [name,field,value,pattern] of [['result','settings.maximumResultBytes','67108864','CR03'],['deadline','settings.dispatchTimeoutMs','900000','CR04']]){
  const target=path.join(directory,`control-${name}.ts`);
  fs.writeFileSync(target,imports(fs.readFileSync(module,'utf8'),module).replace(field,value));
  const changed=imports(fs.readFileSync(test,'utf8'),test).replace(pathToFileURL(module).href,pathToFileURL(target).href).replace("new URL('../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url)",`new URL(${JSON.stringify(pathToFileURL(path.join(root,'charts/kubeclaw/files/config/swarm.config.json')).href)})`);
  const runner=path.join(directory,`test-${name}.mts`);fs.writeFileSync(runner,changed);
  const child=spawnSync(process.execPath,['--test',`--test-name-pattern=${pattern}`,runner],{encoding:'utf8',timeout:15000});
  fs.writeFileSync(path.join(out,`mutant-${name}.txt`),child.stdout+child.stderr);
  assert.equal(child.error,undefined);assert.equal(child.status,1);
  assert.match(child.stdout+child.stderr,/Missing expected rejection/);
  assert.doesNotMatch(child.stdout+child.stderr,/ERR_MODULE_NOT_FOUND/);
  result.push({name,mutation:`${field} -> ${value}`,status:child.status,detected:'Original real HTTP test rejected missing expected rejection; no module/fixture error'});
 }
 fs.writeFileSync(path.join(out,'mutation-results.json'),JSON.stringify(result,null,2)+'\n');
} finally {fs.rmSync(directory,{recursive:true,force:true});}
