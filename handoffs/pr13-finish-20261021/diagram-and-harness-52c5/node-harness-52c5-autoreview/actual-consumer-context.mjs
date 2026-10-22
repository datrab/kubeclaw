function entrySourceBytes(root,source){
 const file=path.resolve(root,source);
 assert(!path.isAbsolute(source)&&!source.split('/').includes('..')&&file.startsWith(path.resolve(root)+path.sep),`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: ${source}; source containment`);
 assert(fs.existsSync(file)&&fs.statSync(file).isFile()&&fs.realpathSync(file)===file,`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: ${source}; actual canonical regular source missing or aliased`);
 return fs.readFileSync(file,'utf8');
}
const nodeEntryTree=(source,bytes)=>ts.createSourceFile(source,bytes,ts.ScriptTarget.Latest,true,source.endsWith('.ts')?ts.ScriptKind.TS:ts.ScriptKind.JS);
export function nodeEntryDeclarationReceipt(source,bytes){const tree=nodeEntryTree(source,bytes);return tree.statements.map(statement=>({kind:ts.SyntaxKind[statement.kind],syntaxSha256:syntaxSha256(statement.getText(tree))}));}
export function nodeEntryInitializationReceipt(source,bytes){
 const tree=nodeEntryTree(source,bytes);
 return tree.statements.filter(statement=>!ts.isFunctionDeclaration(statement)&&!ts.isInterfaceDeclaration(statement)&&!ts.isTypeAliasDeclaration(statement)).map(statement=>{
  if(ts.isClassDeclaration(statement)){
    // Decorators on classes, members and parameters may execute at initialization.
    // Until their eager effects are qualified, fail closed without renewing receipts.
    const rejectDecorators=node=>{assert(!ts.isDecorator(node),`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: ${source}; executable decorators require independent initialization qualification`);ts.forEachChild(node,rejectDecorators);};rejectDecorators(statement);
   const staticEffects=statement.members.filter(member=>ts.isClassStaticBlockDeclaration(member)||member.modifiers?.some(item=>item.kind===ts.SyntaxKind.StaticKeyword)&&ts.isPropertyDeclaration(member)||member.name&&ts.isComputedPropertyName(member.name)).map(member=>member.getText(tree));
   return {kind:'ClassInitialization',symbol:statement.name?.text??'<anonymous>',syntaxSha256:syntaxSha256(JSON.stringify({heritage:statement.heritageClauses?.map(item=>item.getText(tree))??[],staticEffects}))};
  }
  return {kind:ts.SyntaxKind[statement.kind],syntaxSha256:syntaxSha256(statement.getText(tree))};
 });
}
function assertHarnessExportAbsence(source,bytes){
 const tree=nodeEntryTree(source,bytes);let exported=false;
 const visit=node=>{if(ts.isExportDeclaration(node)||ts.isExportAssignment(node)||node.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword)||ts.isPropertyAccessExpression(node)&&((ts.isIdentifier(node.expression)&&node.expression.text==='exports')||node.getText(tree)==='module.exports'))exported=true;ts.forEachChild(node,visit);};visit(tree);
 assert(!exported,`DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED: ${source}; reviewed harness cannot acquire product-facing exports`);
}
function assertRootHarnessClosure(root){
 for(const receipt of reviewedRootNodeEntryRecipes.closure){
  const bytes=entrySourceBytes(root,receipt.source);
  if(receipt.kind==='selected-declarative-data'){
   assert.equal(syntaxSha256(JSON.stringify(JSON.parse(bytes))),receipt.valueSha256,`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: ${receipt.source}; selected manifest/schema data authority changed`);continue;
  }
  const tree=nodeEntryTree(receipt.source,bytes),lines=bytes.match(/[^\n]*\n|[^\n]+$/gu)??[];
  for(const unit of receipt.units){
   assert(tree.statements.some(statement=>ts.SyntaxKind[statement.kind]===unit.kind&&tree.getLineAndCharacterOfPosition(statement.getStart(tree)).line+1===unit.startLine&&tree.getLineAndCharacterOfPosition(statement.end).line+1===unit.endLine&&syntaxSha256(statement.getText(tree))===unit.syntaxSha256),`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: ${receipt.source}; reviewed defining operation changed: ${unit.symbol}`);
  }
  // Reviewed range bytes also capture selected constructors and generated
  // children whose custody is broader than a top-level named declaration.
  for(const range of receipt.ranges)assert.equal(syntaxSha256(lines.slice(range.startLine-1,range.endLine).join('')),range.sha256,`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: ${receipt.source}; operative initialization/constructor/child range changed: ${range.startLine}-${range.endLine}`);
  assert.deepEqual(nodeEntryInitializationReceipt(receipt.source,bytes),receipt.initialization,`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: ${receipt.source}; actual module import/initialization inventory changed`);
 }
}
function assertNativeNpmPosixAuthority(root,source){
 assert(!process.env.NODE_OPTIONS,`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: ${source}; unsupported NODE_OPTIONS acquisition authority`);
 const candidates=(process.env.PATH??'').split(path.delimiter).map(directory=>path.resolve(directory,'npm'));
 const executable=candidates.find(file=>fs.existsSync(file)&&fs.statSync(file).isFile());
 assert(executable&&fs.realpathSync(executable)==='/usr/local/lib/node_modules/npm/bin/npm-cli.js',`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: ${source}; unsupported native npm command identity`);
 if(process.env.npm_execpath)assert(fs.existsSync(process.env.npm_execpath)&&fs.realpathSync(process.env.npm_execpath)==='/usr/local/lib/node_modules/npm/bin/npm-cli.js',`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: ${source}; unsupported active npm caller identity`);
 const nodeExecutable=(process.env.PATH??'').split(path.delimiter).map(directory=>path.resolve(directory,'node')).find(file=>fs.existsSync(file)&&fs.statSync(file).isFile());
 assert(nodeExecutable&&fs.realpathSync(nodeExecutable)===fs.realpathSync(process.execPath),`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: ${source}; unsupported native Node command identity`);
 for(let directory=path.resolve(root);;directory=path.dirname(directory)){assert(!fs.existsSync(path.join(directory,'node_modules','.bin','node')),`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: ${source}; npm local Node executable override requires source authority`);if(path.dirname(directory)===directory)break;}
 assert(fs.realpathSync('/bin/sh')==='/usr/bin/dash',`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: ${source}; reviewed native POSIX shell identity changed`);
 for(const [setting,expected]of [['script-shell','null'],['node-options','null']]){
  const config=spawnSync(executable,['config','get',setting],{cwd:root,encoding:'utf8',maxBuffer:1024*1024,env:{...process.env,npm_config_offline:'true'}});
  assert(config.status===0&&config.stdout.trim()===expected,`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: ${source}; custom/unavailable npm ${setting} authority`);
 }
}
export function qualifiedRootNodeHarnessSources(root,definition,entries){
 assert.equal(reviewedRootNodeEntryRecipes.protocol,'docs-node-harness-custody-v1',`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: package.json; unsupported harness custody protocol`);
 const packageFile=path.join(root,'package.json');
 if(fs.existsSync(packageFile))assert.deepEqual(definition,JSON.parse(entrySourceBytes(root,'package.json')),`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: package.json; actual caller/public entry authority differs`);
 const selected=new Set();
 for(const [source,recipe]of Object.entries(reviewedRootNodeEntryRecipes.entries)){
  const actual=[];
  for(const [name,command]of Object.entries(definition.scripts??{}))for(const acquisition of shellNativeNodeEntries(`package.json scripts.${name}`,command)){
   for(const word of acquisition.entryWords)if(/[*?]/u.test(word.value))assert(reviewedRootNodeEntryRecipes.wildcards.some(recipe=>recipe.script===name&&recipe.command===command&&recipe.pattern===word.value&&word.raw===word.value&&acquisition.nativeTest),`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: package.json scripts.${name}; unknown native caller glob authority`);
   if(acquisition.entryWords.some(word=>path.posix.normalize(word.value)===source))actual.push({name,command,source});
  }
  // The discovery parser and role guard must agree on every actual invocation;
  // a caller cannot omit a new public command from a precomputed entry list.
  const supplied=entries.filter(entry=>entry.source===source);
  assert.deepEqual(supplied.map(entry=>({name:entry.name,command:entry.command,source})).sort((a,b)=>a.name.localeCompare(b.name)),actual.sort((a,b)=>a.name.localeCompare(b.name)),`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: ${source}; actual native caller inventory differs`);
  if(!actual.length)continue;
  assert(fs.existsSync(packageFile),`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: package.json; reviewed caller authority missing`);
  for(const entry of actual)assert(recipe.callers.some(caller=>caller.name===entry.name&&caller.command===entry.command),`DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED: ${source}; unreviewed direct/package harness caller: ${entry.name}`);
  assert(recipe.purpose&&recipe.terminalPurpose&&recipe.limits,`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: ${source}; finite terminal-purpose authority missing`);
  selected.add(source);
 }
 if(!selected.size)return selected;
 assert(fs.realpathSync(root)===path.resolve(root),`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: ${root}; npm package cwd must be canonical`);
 assertNativeNpmPosixAuthority(root,'package.json reviewed --test callers');
 const targets=value=>typeof value==='string'?[value]:value&&typeof value==='object'?Object.values(value).flatMap(targets):[];
 for(const target of [definition.main,definition.exports,definition.bin].flatMap(targets)){
  const file=path.resolve(root,target);if(!fs.existsSync(file))continue;const canonical=path.relative(root,fs.realpathSync(file)).replaceAll(path.sep,'/');
  assert(!selected.has(canonical),`DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED: ${canonical}; harness acquired by package public entry`);
 }
 const bytesBySource=new Map();for(const source of new Set([...selected,...reviewedRootNodeEntryRecipes.closure.map(receipt=>receipt.source)]))bytesBySource.set(source,entrySourceBytes(root,source));
 const key=syntaxSha256(JSON.stringify([[...selected].sort(),entries.filter(entry=>selected.has(entry.source)),[...bytesBySource].map(([source,bytes])=>[source,syntaxSha256(bytes)])]));
 if(rootHarnessCustodyCache.get(root)===key)return selected;
 for(const source of selected){const bytes=bytesBySource.get(source),recipe=reviewedRootNodeEntryRecipes.entries[source];assertHarnessExportAbsence(source,bytes);assert.deepEqual(nodeEntryDeclarationReceipt(source,bytes),recipe.declarations,`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: ${source}; fixture/init/child/assertion declarations changed`);assert.deepEqual(documentationSelectorReceipt(documentationExecutableSelectors(source,bytes,root)),recipe.selectors,`DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED: ${source}; terminal operation inventory changed`);}
 assertRootHarnessClosure(root);rootHarnessCustodyCache.set(root,key);return selected;
}

