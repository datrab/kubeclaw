import fs from 'node:fs';
import ts from 'typescript';
const options={indentSize:2,tabSize:2,convertTabsToSpaces:true,newLineCharacter:'\n',insertSpaceAfterCommaDelimiter:true,
 insertSpaceAfterKeywordsInControlFlowStatements:true,insertSpaceBeforeAndAfterBinaryOperators:true,
 insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces:true,placeOpenBraceOnNewLineForFunctions:false};
for(const name of ['durable-attempts','attempt-state','attempt-evidence','attempt-results','attempt-completeness','attempt-retirement']) {
 const file='skills/common/plugin-runtime/foundation/observability/'+name+'.ts';let source=fs.readFileSync(file,'utf8');
 const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
 const edits=ts.formatting.formatDocument(tree,ts.formatting.getFormatContext(options));
 for(const edit of edits.sort((a,b)=>b.span.start-a.span.start))source=source.slice(0,edit.span.start)+edit.newText+source.slice(edit.span.start+edit.span.length);
 fs.writeFileSync(file,source);
}
