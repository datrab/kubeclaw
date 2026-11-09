import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../docs-api-output-discovery.mjs',import.meta.url),'utf8');
const start=source.indexOf("      assert(recipe.inline===undefined||typeof recipe.inline==='string'");
const stop=source.indexOf('      const documents=YAML.parseAllDocuments(rendered.stdout);',start);
assert(start>0&&stop>start);const body=source.slice(start,stop);
function run(inline,upgrade=false,status=0){let observed;const recipe={profile:'application:fixture',release:'fixture',namespace:'fixture',inputs:['base.yaml'],args:['--set','setting=final'],inline};vm.runInNewContext(body,{assert,path,root:'/repo',archivePath:'/repo/chart.tgz',recipe,upgrade,spawnSync:(...args)=>{observed=args;return {status,stderr:'render failed'};}});return observed;}
for(const upgrade of [false,true])for(const inline of [undefined,'','setting: selected\n'])test(`inline exact transport (${String(inline)}, upgrade=${upgrade})`,()=>{
 const [command,args,options]=run(inline,upgrade);assert.equal(command,'helm');assert.equal(args.includes('--is-upgrade'),upgrade);assert.equal(Object.hasOwn(options,'input'),inline!==undefined);assert.equal(options.input,inline);
 const expected=['-f','/repo/base.yaml',...(inline!==undefined?['-f','-']:[]),'--set','setting=final',...(upgrade?['--is-upgrade']:[])];assert.deepEqual(JSON.parse(JSON.stringify(args.slice(-expected.length))),expected);
});
test('invalid inline and native render failure reject',()=>{assert.throws(()=>run(null),/INLINE_INVALID/);assert.throws(()=>run('setting: selected\n',false,1),/RENDER_FAILED/);});
