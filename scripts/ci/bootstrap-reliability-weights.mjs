import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
// Bootstrap only: historical spec logs contain test durations, not file summaries.
// Match top-level test names to their defining file; do not count nested tests twice.
const files=fs.readdirSync('tests/verification/reliability').filter(f=>/\.test\.(mts|mjs)$/u.test(f));
const patterns=[];
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
for(const file of files){
 const source=ts.createSourceFile(file,fs.readFileSync(path.join('tests/verification/reliability',file),'utf8'),ts.ScriptTarget.Latest,true);
 const walk=node=>{
  if(ts.isCallExpression(node)&&node.arguments.length>=2){
   const name=node.arguments[0];let pattern;
   if(ts.isStringLiteralLike(name))pattern=escape(name.text);
   else if(ts.isTemplateExpression(name))pattern=escape(name.head.text)+name.templateSpans.map(span=>'.*'+escape(span.literal.text)).join('');
   if(pattern)patterns.push({file,re:new RegExp(`^${pattern}$`,'u')});
  }
  ts.forEachChild(node,walk);
 };walk(source);
}
const seconds={},matches={};let matched=0,unknown=0;
for(const logFile of process.argv.slice(2))for(const line of fs.readFileSync(logFile,'utf8').split('\n')){
 const text=line.replace(/^\S+Z /u,'');const m=text.match(/^✔ (.+) \(([\d.]+)ms\)$/u);if(!m)continue;
 const candidates=[...new Set(patterns.filter(p=>p.re.test(m[1])).map(p=>p.file))];
 if(candidates.length!==1){unknown++;continue;}
 const file=candidates[0];seconds[file]=(seconds[file]??0)+Number(m[2])/1000;matches[file]=(matches[file]??0)+1;matched++;
}
console.log(JSON.stringify({schemaVersion:1,sourceRun:'https://github.com/datrab/kubeclaw/actions/runs/40236697726',method:'Bootstrap estimates: sum of uniquely matched top-level spec test durations; new file-level CI reporter supersedes these estimates.',matchedTests:matched,unmatchedTests:unknown,seconds:Object.fromEntries(Object.entries(seconds).sort().map(([f,s])=>[f,Math.max(0.01,Math.round(s*1000)/1000)]))},null,2));
