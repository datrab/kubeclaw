import assert from 'node:assert/strict';
import {analyzeTypedCliSources} from '../lib/cli/typed-cli-ast.mjs';
const requireFrom=new URL('../../package.json',import.meta.url),analyze=(text,extra=[])=>analyzeTypedCliSources([{path:'entry.ts',text},...extra],{requireFrom}),names=r=>r.sources[0].options.map(x=>x.name);let tests=0;const test=(name,fn)=>{fn();tests++;process.stdout.write('PASS '+name+'\n')};
test('actual aliases,add/remove and fixture string negative',()=>{
 const a=analyze('const args=process.argv.slice(2);const check=args.includes("--check");const fixture="process.argv.includes(\\\"--fake\\\")";const child=["--foreign"];');assert(names(a).includes('--check'));assert(!names(a).includes('--fake'));assert(!names(a).includes('--foreign'));
 const b=analyze('const args=process.argv.slice(2);const check=args.includes("--changed");');assert(names(b).includes('--changed'));assert(!names(b).includes('--check'));
});
test('scoped process and argv shadows reject fake owners',()=>{
 const r=analyze('function helper(process:any){const argv=process.argv;return argv.includes("--fake")}function other(argv:any){return argv.includes("--private")}const options=["--foreign"];');assert.deepEqual(names(r),[]);assert.equal(r.sources[0].positionals.length,0);
});
test('helper(name,fallback) sourcevalue change',()=>{
 const src='const argv=process.argv.slice(2);const option=(name:string,fallback:any)=>{const i=argv.indexOf(name);return i<0?fallback:argv[i+1]};const root=option("--root",17);';
 const a=analyze(src),b=analyze(src.replace('17','29'));assert(names(a).includes('--root'));assert(a.sources[0].defaults.some(x=>x.kind==='bound-helper-fallback-argument'&&x.expression==='17'));assert(b.sources[0].defaults.some(x=>x.kind==='bound-helper-fallback-argument'&&x.expression==='29'));
});
test('real imported parser binding and raw property receivers',()=>{
 const parser={path:'parser.ts',text:'export function parse(values:string[]){const out:Record<string,string>={};for(let i=0;i<values.length;i+=2){const flag=values[i],value=values[i+1];out[flag.slice(2)]=value}return Object.freeze(out)}'};
 const r=analyze('import {parse} from "./parser.ts";const args=parse(process.argv.slice(2));const root=args.root??process.cwd();', [parser]);assert(names(r).includes('--root'));assert(r.sources[0].delegations.some(x=>x.target?.path==='parser.ts'));assert(r.analysis.fixedPointStable);
});
test('conditional native exits and shadow negative',()=>{
 const r=analyze('if(process.argv.includes("--check")){process.exit(result.ok?0:2)}else{process.exitCode=3}function fake(process:any){process.exit(9)}');assert.equal(r.sources[0].exits.filter(x=>x.kind.startsWith('explicit-process-')).length,2);assert(r.sources[0].exits.some(x=>x.valueExpression==='result.ok?0:2'&&x.conditions[0].role==='then'));assert(r.sources[0].exits.some(x=>x.valueExpression==='3'&&x.conditions[0].role==='else'));
});
test('parameterparser allowlist and value map',()=>{
 const r=analyze('function parse(argv:string[]){const table=new Map([["--real","value"]]);for(const arg of argv){if(["--check","--write"].includes(arg)){return arg};table.get(arg)}}parse(process.argv.slice(2));');assert(names(r).includes('--real'));assert(names(r).includes('--check'));assert(names(r).includes('--write'));
});
test('runtime-derived defaults retained not evaluated;UTF8span',()=>{
 const text='const label="ä";const args=process.argv.slice(2);const path=args[0]??(process.env.ROOT||new Date().toISOString());';const r=analyze(text);assert(r.sources[0].defaults.some(x=>x.expression.includes('new Date().toISOString()')));for(const f of r.sources[0].positionals)assert.equal(Buffer.from(text).subarray(f.startByte,f.endByte).toString(),f.expression);
});
test('syntaxerror explicit',()=>assert(analyze('const =').sources[0].unresolved.some(x=>x.rule==='syntax-error')));
test('tracked dependency callback binds actual parser return defaults only',()=>{
 const entry={path:'entry.ts',text:'import {parse} from "./parser.ts";import "./unrelated.ts";const args=parse(process.argv.slice(2));const limit=args.limit;'},dep={path:'parser.ts',text:'export function parse(argv:string[]){const args={limit:17};for(let i=0;i<argv.length;i++)if(argv[i]==="--limit")args.limit=Number(argv[++i]);return args}'};const reads=[];
 const r=analyzeTypedCliSources([entry],{requireFrom,readDependency(name){reads.push(name);if(name===dep.path)return dep;throw Error("CLI_SOURCE_NOT_REGULAR_TRACKED_FILE:"+name)}});
 const binding=r.sources[0].delegations.find(x=>x.target?.path==='parser.ts');assert(binding);assert(binding.boundParserDefaultSources.some(x=>x.expression==='17'&&x.sourcePath==='parser.ts'));assert(binding.boundParserReturnSources.length);assert(!reads.includes('unrelated.ts'));
});
test('raw map helper keys and generic dash syntax do not invent flags',()=>{
 const r=analyze('function parse(values:string[]){const out=new Map();for(let i=0;i<values.length;i+=2){const key=values[i];if(!key.startsWith("--"))throw Error();out.set(key.slice(2),values[i+1])}return out}function required(map:any,name:string){return map.get(name)}const args=parse(process.argv.slice(2));const root=required(args,"workdir");');assert(names(r).includes('--workdir'));assert(!names(r).includes('--'));
});
test('mixed reassignment cannot launder fixture into public options',()=>{
 const r=analyze('let args=process.argv.slice(2);args=["--fake"];const copy=args;copy.includes("--fake");');assert(!names(r).includes('--fake'));assert(r.sources[0].unresolved.some(x=>x.rule==='mixed-tainted-and-untainted-symbol-reassignment'));
 const q=analyze('process.argv=["node","entry","--fake"];process.argv.includes("--fake");');assert(!names(q).includes('--fake'));assert(q.sources[0].unresolved.some(x=>x.rule==='global-argv-reassignment-not-original-input'));
});
test('each Node CLI source has separate lexical top-level scope',()=>{
 const r=analyzeTypedCliSources([{path:'one.ts',text:'const process={argv:["--fake"]};process.argv.includes("--fake")'},{path:'two.ts',text:'process.argv.includes("--real")'}],{requireFrom});assert.deepEqual(r.sources[0].options,[]);assert(r.sources[1].options.some(x=>x.name==='--real'));
});
test('conditional module dispatch requires exact native module binding',()=>{
 const source={path:'project.ts',text:'if(!process.argv.includes("--project"))await import("@local/core/cli");'},core={path:'core.ts',text:'process.argv.includes("--core")'};
 const unresolved=analyzeTypedCliSources([source,core],{requireFrom});assert(unresolved.sources[0].unresolved.some(x=>x.rule==='conditional-argv-module-delegation-binding-unresolved'));
 const bound=analyzeTypedCliSources([source,core],{requireFrom,moduleBindings:{'@local/core/cli':'core.ts'}});assert(bound.sources[0].delegations.some(x=>x.kind==='conditional-or-input-derived-module-delegation'&&x.sourcePathTarget==='core.ts'));assert(!bound.sources[0].unresolved.some(x=>x.rule==='conditional-argv-module-delegation-binding-unresolved'));
});
test('destructuring/rest/defaults and explicit exit helper returns are source bound',()=>{
 const r=analyze('const [command,family="runtime",...rest]=process.argv.slice(2);async function main(){if(command==="ok")return 0;return 2}process.exit(await main())');assert(r.sources[0].positionals.some(x=>x.kind==='argv-destructured-rest'&&x.bindingExpression==='rest'));assert(r.sources[0].defaults.some(x=>x.kind==='destructuring-source-default'&&x.expression==='"runtime"'));assert(r.sources[0].delegations.some(x=>x.kind==='explicit-exit-source-helper-binding'&&x.returnSources.length===2));
});
test('callee parameter default composed from actual source binding',()=>{
 const dep={path:'sync.ts',text:'const fallback="canonical";export function sync(source=fallback){return source}'};const r=analyze('import {sync} from "./sync.ts";sync(process.argv[2]||undefined)',[dep]);const binding=r.sources[0].delegations.find(x=>x.target?.path==='sync.ts');assert(binding.boundCalleeParameterDefaults.some(x=>x.expression==='fallback'&&x.initializerBinding.expression==='"canonical"'));
});
test('Map methods are not option names; literal Map.get keys remain',()=>{
 const r=analyze('function parse(values:string[]){const output=new Map();for(let i=0;i<values.length;i+=2){const key=values[i];output.set(key.slice(2),values[i+1])}return output}const args=parse(process.argv.slice(2));args.get("root");args.has("check");');assert(names(r).includes('--root'));assert(names(r).includes('--check'));for(const fake of ['--set','--get','--has'])assert(!names(r).includes(fake));assert(r.sources[0].delegations.some(x=>x.kind==='native-Map-key-replacement-rule'));
 const record=analyze('const args=process.argv.slice(2);const out:any={};for(let i=0;i<args.length;i+=2)out[args[i].slice(2)]=args[i+1];out.set;out.get;');assert(names(record).includes('--set'));assert(names(record).includes('--get'));
});
test('throw lexical catch finally and function boundary are explicit',()=>{
 const r=analyze('try{function inner(){throw Error("later")}if(process.argv.includes("--bad"))throw Error("caught")}catch(error){throw error}finally{process.exitCode=7}');const throws=r.sources[0].exits.filter(x=>x.kind==='source-throw-completion');assert.equal(throws.length,3);assert.equal(throws.find(x=>x.valueExpression==='Error("later")').exceptionContext.length,0);const caught=throws.find(x=>x.valueExpression==='Error("caught")');assert.equal(caught.exceptionContext[0].origin,'try');assert(caught.exceptionContext[0].finallySource);assert(caught.conditions.some(x=>x.role==='then'));assert.equal(throws.find(x=>x.valueExpression==='error').exceptionContext[0].origin,'catch');
});
test('async chain, child status and nonstatus return remain symbolic',()=>{
 const r=analyze('import {spawnSync as run} from "node:child_process";async function main(){const child=run("tool",process.argv.slice(2));if(child.error)throw child.error;return child.status}main().catch(error=>{process.exitCode=2});');assert(r.sources[0].exits.some(x=>x.kind==='source-async-function-completion-chain'));assert(r.sources[0].exits.some(x=>x.kind==='native-child-result-property'&&x.property==='status'));assert(r.sources[0].exits.some(x=>x.kind==='source-function-return-completion'&&x.valueExpression==='child.status'));assert(r.sources[0].exits.some(x=>x.kind==='source-module-normal-completion-policy'&&!('valueExpression'in x)));
});
test('fallback kinds and formal to actual guards are not arbitrary initializer defaults',()=>{
 const r=analyze('function parse(args:string[],fallback=17){const plain=args[0];const a=plain??fallback;const b=plain||fallback;return a}if(process.argv.includes("--go"))parse(process.argv.slice(2),29);');assert(r.sources[0].defaults.some(x=>x.kind==='nullish-fallback-rule'));assert(r.sources[0].defaults.some(x=>x.kind==='falsy-fallback-rule'));assert(!r.sources[0].defaults.some(x=>x.expression==='args[0]'));const binding=r.sources[0].delegations.find(x=>x.kind==='source-argv-call-binding'&&x.target);assert.equal(binding.formalActualBindings[1].actual.expression,'29');assert(binding.formalActualBindings[1].callerConditions.some(x=>x.role==='then'));
});
test('custom Map-shaped receiver is explicit unresolved, not native policy',()=>{const r=analyze('class Map{set(key:any,value:any){}}const out=new Map();const args=process.argv.slice(2);out.set(args[0].slice(2),args[1]);');assert(!names(r).includes('--set'));assert(r.sources[0].unresolved.some(x=>x.rule==='argv-keyed-custom-set-receiver-contract-unresolved'));assert(!r.sources[0].delegations.some(x=>x.kind==='native-Map-key-replacement-rule'))});
test('scope identity separates same-name nested and anonymous functions from modules',()=>{
 const source='const args=process.argv.slice(2);const moduleValue=args[0]??"module";function same(){const value=args[0]??"outer";function same(){const value=args[0]??"inner"}return ()=>{const value=args[0]??"anonymous-one"}}const other=()=>{const value=args[0]??"anonymous-two"};';
 const r=analyze(source),facts=r.sources[0].defaults.filter(x=>x.kind==='nullish-fallback-rule');assert.equal(facts.length,5);assert.equal(new Set(facts.map(x=>x.scopeId)).size,5);const named=facts.filter(x=>x.scope==='same');assert.equal(named.length,2);assert.notEqual(named[0].scopeId,named[1].scopeId);const anonymous=facts.filter(x=>x.scope==='<module-or-anonymous>');assert.equal(anonymous.length,3);assert.equal(facts.find(x=>x.expression.includes('"module"')).scopeIdentity.kind,'module');for(const f of facts){assert.equal(f.scopeIdentity.sourcePath,'entry.ts');assert.equal(f.scopeId,'entry.ts#'+f.scopeIdentity.kind+'@'+f.scopeIdentity.startByte+':'+f.scopeIdentity.endByte)}
 const cross=analyzeTypedCliSources([{path:'a.ts',text:'const x=process.argv[0]??1'},{path:'b.ts',text:'const x=process.argv[0]??1'}],{requireFrom});assert.notEqual(cross.sources[0].defaults[0].scopeId,cross.sources[1].defaults[0].scopeId);
});
test('switch conditions bind selector ordered labels default and symbolic fallthrough',()=>{
 const r=analyze('const command=process.argv[2];switch(command){case "compile":process.exitCode=2;case "run":if(process.argv.includes("--stop"))break;process.exitCode=3;default:process.exitCode=4;case "last":process.exitCode=5;break}');
 const exits=r.sources[0].exits.filter(x=>x.kind==='explicit-process-exitCode');assert.equal(exits.length,4);for(let i=0;i<exits.length;i++){const c=exits[i].conditions.find(x=>x.role==='case'||x.role==='default');assert.equal(c.selectorExpression,'command');assert.equal(c.selectorSource.expression,'command');assert.equal(c.clauseIndex,i);assert.deepEqual(c.orderedLabels.map(x=>x.labelExpression),['"compile"','"run"',null,'"last"']);assert.equal(c.orderedLabels[2].kind,'default');assert.equal(c.priorClauseFlow.length,i);assert(c.entryRule.includes('need not match'));assert(c.fallthroughPolicy.includes('actual abrupt'));}const fallback=exits[2].conditions.find(x=>x.role==='default');assert.equal(fallback.conditionExpression,null);assert(fallback.priorClauseFlow[1].completionSources.some(x=>x.kind==='BreakStatement'));assert.equal(fallback.priorClauseFlow[0].completionSources.length,0);assert(fallback.priorClauseFlow[1].completionSources.find(x=>x.kind==='BreakStatement').exitsCurrentSwitch);const nestedBreak=analyze('switch(process.argv[2]){case "one":switch(secondary){case 1:break}case "two":process.exitCode=8}').sources[0].exits.find(x=>x.kind==='explicit-process-exitCode').conditions[0].priorClauseFlow[0].completionSources.find(x=>x.kind==='BreakStatement');assert.equal(nestedBreak.exitsCurrentSwitch,false);assert(nestedBreak.controlTarget.source.expression.startsWith('switch(secondary)'));
 const nested=analyze('switch(process.argv[2]){case "outer":function later(){process.exitCode=7}break}');assert.equal(nested.sources[0].exits.find(x=>x.kind==='explicit-process-exitCode').conditions.length,0);
});
test('normal completion anchors stay on physical final line, not empty EOF line',()=>{const r=analyze('const args=process.argv.slice(2);\n');const fact=r.sources[0].exits.find(f=>f.kind==='source-module-normal-completion-policy');assert.equal(fact.line,1);assert.equal(fact.endLine,1);assert.equal(fact.startByte,fact.endByte);});

test('full and stripped record keys preserve actual argv spelling not startsWith bypass',()=>{
 const full=analyze('const args=process.argv.slice(2);const out:any={};for(let i=0;i<args.length;i+=2)out[args[i]]=args[i+1];out["--root"];');assert(names(full).includes('--root'));assert(!names(full).includes('----root'));
 const stripped=analyze('const args=process.argv.slice(2);const out:any={};for(let i=0;i<args.length;i+=2)out[args[i].slice(2)]=args[i+1];out.root;out["--root"];');assert(names(stripped).includes('--root'));assert(names(stripped).includes('----root'));assert(stripped.sources[0].options.find(x=>x.name==='----root').keyRepresentation==='record-key-stripped-prefix');
});
test('full native Map and stripped native Map keys remain distinct through aliases/helper',()=>{
 const src='function parse(values:string[]){const output=new Map();for(let i=0;i<values.length;i+=2)output.set(values[i],values[i+1]);return output}function required(map:any,name:string){return map.get(name)}const original=parse(process.argv.slice(2));const alias=original;required(alias,"--workdir");';const full=analyze(src);assert(names(full).includes('--workdir'));assert(!names(full).includes('----workdir'));assert(!names(full).includes('--get'));assert(!names(full).includes('--set'));
 const stripped=analyze(src.replace('output.set(values[i],','output.set(values[i].slice(2),'));assert(names(stripped).includes('----workdir'));assert(!names(stripped).includes('--workdir'));
});
test('imported record parser preserves full key mode through returned aliases and helper',()=>{
 const dep={path:'parser.ts',text:'export function parse(values:string[]){const out:Record<string,string>={};for(let i=0;i<values.length;i+=2)out[values[i]]=values[i+1];const alias=out;return alias}'};const r=analyze('import{parse}from"./parser.ts";const result=parse(process.argv.slice(2));const alias=result;const root=alias["--root"]??"fallback";',[dep]);assert(names(r).includes('--root'));assert(!names(r).includes('----root'));assert(r.sources[0].delegations.some(x=>x.target?.sourcePath==='parser.ts'));
});
test('mixed and unknown record/Map transforms fail closed, not invented names',()=>{
 for(const body of ['out[args[0]]=args[1];out[args[2].slice(2)]=args[3];','out[normalize(args[0])]=args[1];','out[args[0]+"suffix"]=args[1];','out[args[0].slice(2,5)]=args[1];']){const r=analyze('const args=process.argv.slice(2);const out:any={};'+body+'out["--root"];');assert(!names(r).includes('--root'));assert(!names(r).includes('----root'));assert(r.sources[0].unresolved.some(x=>x.rule==='raw-argv-key-representation-unresolved'));}
 const map=analyze('const args=process.argv.slice(2);const out=new Map();out.set(args[0],args[1]);out.set(args[2].slice(2),args[3]);out.get("--root");');assert(!names(map).includes('--root'));assert(!names(map).includes('----root'));assert(map.sources[0].unresolved.some(x=>x.rule==='raw-argv-key-representation-unresolved'));
});
test('unknown Map key transform is unresolved and full/stripped helpers preserve source mode',()=>{
 const unknown=analyze('const args=process.argv.slice(2);const out=new Map();out.set(normalize(args[0]),args[1]);out.get("--root");');assert(!names(unknown).includes('--root'));assert(!names(unknown).includes('----root'));assert(unknown.sources[0].unresolved.some(x=>x.rule==='raw-argv-key-representation-unresolved'));
 const helper='function key(input:string){return input}function parse(values:string[]){const out:any={};out[key(values[0])]=values[1];return out}const result=parse(process.argv.slice(2));result["--root"];';assert(names(analyze(helper)).includes('--root'));const strip=analyze(helper.replace('return input}','return input.slice(2)}'));assert(names(strip).includes('----root'));assert(!names(strip).includes('--root'));
});
process.stdout.write(JSON.stringify({tests,passed:tests})+'\n');
