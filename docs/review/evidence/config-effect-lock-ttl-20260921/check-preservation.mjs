import fs from 'node:fs';
import assert from 'node:assert/strict';
const base=new URL('./',import.meta.url),rows=[];
for(const file of ['fixture-edits.json','historical-runner-edits.json']){
 for(const row of JSON.parse(fs.readFileSync(new URL(file,base),'utf8'))){
  let expected=fs.readFileSync(new URL('before/'+row.file+'.snapshot',base),'utf8');
  for(const edit of row.edits.toSorted((a,b)=>b.at-a.at))expected=expected.slice(0,edit.at)+edit.text+expected.slice(edit.at);
  assert.equal(fs.readFileSync(row.file,'utf8'),expected,row.file);
  rows.push({path:row.file,onlyExactTtlInsertions:true,insertions:row.edits.length});
 }
}
console.log(JSON.stringify(rows,null,2));
