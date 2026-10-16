// Finite documentation shell custody: lexical commands and literal heredocs.
// This does not execute expansions or interpret shell control flow.
const fail=(source,line,detail)=>{throw new Error(`SHELL_HEREDOC_CUSTODY_UNQUALIFIED: ${source}:${line}: ${detail}`);};
export function shellHeredocCustody(source,bytes) {
 const heredocs=[];let shell='',cursor=0,line=1,quote=null;const substitutions=[];
 while(cursor<bytes.length){const newline=bytes.indexOf('\n',cursor),end=newline<0?bytes.length:newline+1,header=bytes.slice(cursor,newline<0?end:newline);const openings=[];
  for(let i=0;i<header.length;i++){const c=header[i];if(c==='\\'&&quote!=="'"){i++;continue;}if(c==='$'&&header[i+1]==='('&&quote!=="'"&&header[i+2]!=='('){substitutions.push({quote,depth:1});quote=null;i++;continue;}if(quote){if(c===quote)quote=null;continue;}if(substitutions.length&&c==='('){substitutions.at(-1).depth++;continue;}if(substitutions.length&&c===')'){if(!--substitutions.at(-1).depth)quote=substitutions.pop().quote;continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='#'&&(i===0||/\s/u.test(header[i-1])))break;
   if(c==='<'&&header.slice(i,i+3)==='<<<'){i+=2;continue;}if(c!=='<'||header[i+1]!=='<')continue;
   const start=i,operator=header[i+2]==='-'?'<<-':'<<';i+=operator.length;while(/[ \t]/u.test(header[i]??'')&&i<header.length)i++;
   const match=/^(?:'([A-Za-z_][A-Za-z0-9_]*)'|"([A-Za-z_][A-Za-z0-9_]*)"|([A-Za-z_][A-Za-z0-9_]*))(?=$|[ \t;|&)])/u.exec(header.slice(i));
   if(!match)fail(source,line,'unsupported literal delimiter');
   const fdMatch=/(\d+)$/u.exec(header.slice(0,start));const fd=fdMatch&& (start===fdMatch[1].length||/[\s;|&]/u.test(header[start-fdMatch[1].length-1]))?Number(fdMatch[1]):0;
   openings.push({operator,delimiter:match[1]??match[2]??match[3],fd,start:cursor+start,line,header});i+=match[0].length-1;
  }
  shell+=bytes.slice(cursor,end);cursor=end;line++;
  for(const opening of openings){const bodyStart=cursor;let closeStart=-1,closeEnd=-1;
   while(cursor<bytes.length){const n=bytes.indexOf('\n',cursor),e=n<0?bytes.length:n+1,raw=bytes.slice(cursor,n<0?e:n),candidate=opening.operator==='<<-'?raw.replace(/^\t+/u,''):raw;
    if(candidate===opening.delimiter){closeStart=cursor;closeEnd=e;cursor=e;line++;break;}cursor=e;line++;
   }
   if(closeStart<0)fail(source,opening.line,`unterminated ${opening.operator} ${opening.delimiter}; closing delimiter must be exact${opening.operator==='<<-'?' after leading-tab removal':''}`);
   let rawBody=bytes.slice(bodyStart,closeStart);if(rawBody.endsWith('\n'))rawBody=rawBody.slice(0,-1);
   let body='',atLineStart=true;const bodyPositions=[];
   for(let offset=0;offset<rawBody.length;offset++){const char=rawBody[offset];if(opening.operator==='<<-'&&atLineStart&&char==='\t')continue;body+=char;bodyPositions.push(bodyStart+offset);atLineStart=char==='\n';}
   bodyPositions.push(bodyStart+rawBody.length);
   heredocs.push({...opening,body,bodyPositions,positions:bodyPositions,bodyStart,end:closeEnd});shell+=bytes.slice(bodyStart,closeEnd).replace(/[^\n]/gu,' ');
  }
 }
 return {shell,heredocs};
}
export function shellCommandAcquisitions(source,bytes) {
 const custody=shellHeredocCustody(source,bytes),code=custody.shell,commands=[];let words=[],redirections=[],start=0,index=0,line=1,at=1;
 const flush=end=>{if(words.length||redirections.length)commands.push({start,end,line:at,words,redirections});words=[];redirections=[];start=end;at=line;};
 function word(){
  const begin=index;let value='',quote=null,expanded=false;const positions=[];const append=(text,at)=>{value+=text;for(let offset=0;offset<text.length;offset++)positions.push(at+offset);};
  while(index<code.length){const c=code[index];
   if(quote){const at=index++;if(c===quote){quote=null;continue;}if(c==='\\'&&quote==='"'&&index<code.length){const next=code[index];if(next==='\n'){index++;line++;continue;}if(['\\','"','$','`'].includes(next)){append(next,index++);continue;}append(c,at);continue;}if(quote==='"'&&['$','`'].includes(c))expanded=true;if(c==='\n')line++;append(c,at);continue;}
   if(c==='"'||c==="'"){quote=c;index++;continue;}
   if(c==='\\'&&index+1<code.length){index++;if(code[index]==='\n'){index++;line++;continue;}append(code[index],index++);continue;}
   if(/[\s;|&<>]/u.test(c))break;if(['$','`'].includes(c))expanded=true;append(c,index++);
  }
  if(quote)fail(source,line,'unterminated command quote');positions.push(index);return {value,raw:code.slice(begin,index),start:begin,end:index,positions,expanded};
 }
 while(index<code.length){const c=code[index];if(c==='\\'&&code[index+1]==='\n'){index+=2;line++;continue;}if(c==='\n'){flush(index);index++;line++;at=line;continue;}if(/[ \t\r]/u.test(c)){index++;continue;}if(c==='#'){while(index<code.length&&code[index]!=='\n')index++;continue;}if(/[;|&]/u.test(c)){flush(index);index++;if(code[index]===c)index++;continue;}
  if(c==='('&&words.every(word=>['if','then','elif','while','until','do','!'].includes(word.value))&&/^\s*(?:node|python(?:[0-9]+(?:\.[0-9]+)?)?)(?=\s)/u.test(code.slice(index+1)))fail(source,line,'unsupported grouped Node/Python command custody');
  let fd=null;if(/\d/u.test(c)){const m=/^(\d+)(?=[<>])/u.exec(code.slice(index));if(m){fd=Number(m[1]);index+=m[1].length;}}
  if(/[<>]/u.test(code[index])){const begin=index;const m=/^(?:<<<|<<-|<<|>>|<>|>&|<&|>|<)/u.exec(code.slice(index));index+=m[0].length;while(/[ \t]/u.test(code[index]??'')&&index<code.length)index++;const target=word();redirections.push({operator:m[0],fd:fd??(m[0].startsWith('<')?0:1),target:target.value,start:begin,end:index});continue;}
  if(!words.length)at=line;const token=word();if(token.end===token.start)fail(source,line,'unsupported command token');words.push(token);
 }
 flush(index);
 // Acquire literal command substitutions, never text inside single quotes.
 // Parse their shell span with the same finite lexer; no expansion is evaluated.
 let quote=null;
 for(let i=0;i<code.length;i++){
  const c=code[i];if(c==='\\'){i++;continue;}if(quote==="'"){if(c===quote)quote=null;continue;}if(c==="'"&&quote!=='"'){quote=c;continue;}if(c==='"'){quote=quote==='"'?null:'"';continue;}
  if(c==='#'&&!quote&&(i===0||/\s/u.test(code[i-1]))){while(i<code.length&&code[i]!=='\n')i++;continue;}
  if(c==='`'){
   const begin=i+1;let close=begin;for(;close<code.length;close++){if(code[close]==='\\'){close++;continue;}if(code[close]==='`')break;}
   if(close===code.length)fail(source,code.slice(0,i).split('\n').length,'unterminated legacy command substitution');
   const nested=shellCommandAcquisitions(source,bytes.slice(begin,close)),lineOffset=bytes.slice(0,begin).split('\n').length-1;
   for(const command of nested.commands)commands.push({...command,start:command.start+begin,end:command.end+begin,line:command.line+lineOffset,channel:'legacy-command-substitution',words:command.words.map(word=>({...word,start:word.start+begin,end:word.end+begin,positions:word.positions.map(position=>position+begin)})),redirections:command.redirections.map(redirection=>({...redirection,start:redirection.start+begin,end:redirection.end+begin}))});i=close;continue;
  }
  if(c!=='$'||code[i+1]!=='('||code[i+2]==='(')continue;
  const begin=i+2;let depth=1,innerQuote=null,j=begin;
  for(;j<code.length;j++){const ch=code[j];if(ch==='\\'){j++;continue;}if(innerQuote){if(ch===innerQuote)innerQuote=null;continue;}if(ch==='"'||ch==="'"){innerQuote=ch;continue;}if(ch==='(')depth++;if(ch===')'){depth--;if(depth===0)break;}}
  if(depth!==0)fail(source,code.slice(0,i).split('\n').length,'unterminated command substitution');
  const nested=shellCommandAcquisitions(source,bytes.slice(begin,j)),lineOffset=bytes.slice(0,begin).split('\n').length-1;
  for(const command of nested.commands)commands.push({...command,start:command.start+begin,end:command.end+begin,line:command.line+lineOffset,channel:'command-substitution',words:command.words.map(word=>({...word,start:word.start+begin,end:word.end+begin,positions:word.positions.map(position=>position+begin)})),redirections:command.redirections.map(redirection=>({...redirection,start:redirection.start+begin,end:redirection.end+begin}))});i=j;
 }
 commands.sort((left,right)=>left.start-right.start);
 for(const command of commands){
  const descriptors=new Map();
  for(const redirection of command.redirections){
   if(redirection.operator==='<<'||redirection.operator==='<<-')descriptors.set(redirection.fd,{kind:'heredoc',start:redirection.start});
   else if(redirection.operator==='<&'){
    if(redirection.target==='-')descriptors.set(redirection.fd,{kind:'closed'});
    else if(/^\d+$/u.test(redirection.target))descriptors.set(redirection.fd,descriptors.get(Number(redirection.target))??{kind:'inherited',fd:Number(redirection.target)});
    else fail(source,command.line,`unsupported dynamic input descriptor: ${redirection.target}`);
   }else if(['<','<>','<<<'].includes(redirection.operator))descriptors.set(redirection.fd,{kind:redirection.operator==='<<<'?'here-string':'file',target:redirection.target});
  }
  command.stdin=descriptors.get(0)??{kind:'inherited',fd:0};
 }
 for(const body of custody.heredocs){const command=commands.filter(value=>body.start>=value.start&&body.start<value.end).sort((left,right)=>right.start-left.start)[0];if(!command)fail(source,body.line,'heredoc command ownership unresolved');body.commandStart=command.start;body.commandEnd=command.end;body.command=command;body.selectedStdin=command.stdin.kind==='heredoc'&&command.stdin.start===body.start;}

 return {...custody,commands};
}

// Finite native Node command acquisition, shared by package-entry discovery and
// harness caller custody. Quoted text in other commands is not an invocation.
export function shellNativeNodeAcquisitions(source,bytes,depth=0){
 if(depth>8)fail(source,1,'unsupported nested shell command custody depth');
 const result=[];
 for(const command of shellCommandAcquisitions(source,bytes).commands){
  const words=command.words;let index=0;
   while(words[index]&&(/^[A-Za-z_][A-Za-z0-9_]*=/u.test(words[index].value)||['if','then','elif','while','until','do','!','exec'].includes(words[index].value)))index++;
  if(['env','/usr/bin/env'].includes(words[index]?.value)){
   index++;while(words[index]&&/^[A-Za-z_][A-Za-z0-9_]*=/u.test(words[index].value))index++;
   if(words[index]?.value.startsWith('-')&&words.slice(index).some(word=>/(?:^|\/)node$/u.test(word.value)))fail(source,command.line,'unsupported env-wrapped Node argv authority');
  }
  if(words[index]?.value==='command'){
   index++;if(['-v','-V'].includes(words[index]?.value))continue;
   if(words[index]?.value.startsWith('-')&&words.slice(index).some(word=>/(?:^|\/)node$/u.test(word.value)))fail(source,command.line,'unsupported command-wrapped Node argv authority');
  }
  if(['sh','bash','/bin/sh','/bin/bash','/usr/bin/sh','/usr/bin/bash'].includes(words[index]?.value)&&words[index+1]?.value==='-c'&&words[index+2]){
   if(shellNativeNodeAcquisitions(source,words[index+2].value,depth+1).length)fail(source,command.line,'unsupported nested shell -c Node acquisition authority');
  }
  if(words[index]&&/(?:^|\/)node$/u.test(words[index].value))result.push({...command,nodeWord:words[index],nodeArgv:words.slice(index+1)});
 }
 return result;
}

// Native argv selection is shared, so script arguments remain passive while
// --test's actual file argv are independently admitted. No inline interpreter
// or custom loader acquisition is inferred from a filename-like string.
export function shellNativeNodeEntries(source,bytes){
 const result=[];
 for(const acquisition of shellNativeNodeAcquisitions(source,bytes)){
  const words=acquisition.nodeArgv;let index=0,nativeTest=false;
  const unsupported=detail=>{throw new Error(`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; ${detail}`);};
  while(words[index]?.value.startsWith('-')){
   const option=words[index++].value;
   if(option==='--')break;
   if(['-e','-p','--eval','--print','--import','--loader','--experimental-loader','-r','--require'].includes(option)||/^--(?:eval|print|import|loader|experimental-loader|require)=/u.test(option))unsupported(`unsupported inline or loader Node authority: ${option}`);
   if(option==='--test')nativeTest=true;
   else if(!/^(?:--(?:test-concurrency|test-timeout|test-name-pattern|test-skip-pattern)=.+|--(?:expose-gc|experimental-strip-types|experimental-transform-types|enable-source-maps|no-warnings))$/u.test(option))unsupported(`unsupported Node option: ${option}`);
  }
  result.push({...acquisition,nativeTest,entryWords:nativeTest?words.slice(index):words.slice(index,index+1)});
 }
 return result;
}
