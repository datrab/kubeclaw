// Unapplied transport proposal: actual documentation validators/renderers,
// unchanged input bytes in sealed anonymous descriptors, never named fixtures.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const relay=String.raw`
import base64, fcntl, json, os, subprocess, sys
request=json.load(sys.stdin)
fds={}
try:
    for name, encoded in request['files'].items():
        fd=os.memfd_create('kubeclaw-docs-input-'+name,os.MFD_CLOEXEC|os.MFD_ALLOW_SEALING)
        fds[name]=fd
        remaining=memoryview(base64.b64decode(encoded,validate=True))
        while remaining:
            remaining=remaining[os.write(fd,remaining):]
        os.lseek(fd,0,os.SEEK_SET)
        fcntl.fcntl(fd,fcntl.F_ADD_SEALS,fcntl.F_SEAL_WRITE|fcntl.F_SEAL_GROW|fcntl.F_SEAL_SHRINK|fcntl.F_SEAL_SEAL)
    argv=[argument if isinstance(argument,str) else argument.get('prefix','')+'/proc/'+str(os.getpid())+'/fd/'+str(fds[argument['file']]) for argument in request['args']]
    result=subprocess.run([request['command'],*argv],cwd=request['cwd'],input=base64.b64decode(request['stdin'],validate=True),stdout=subprocess.PIPE,stderr=subprocess.PIPE,pass_fds=tuple(fds.values()),timeout=(request['timeout']/1000 or None))
    sys.stdout.buffer.write(result.stdout)
    sys.stderr.buffer.write(result.stderr)
    sys.exit(result.returncode if result.returncode>=0 else 128-result.returncode)
finally:
    for fd in fds.values():os.close(fd)
`;
export function runDocumentationInputs(command,args,files,{cwd,stdin=Buffer.alloc(0),maxBuffer=64*1024*1024,timeout=0,env=process.env}={}){
 assert(process.platform==='linux','DOCS_MEMORY_INPUTS_PLATFORM_UNSUPPORTED');
 assert(typeof command==='string'&&command&&Array.isArray(args)&&files instanceof Map,'DOCS_MEMORY_INPUTS_REQUEST_INVALID');
 const encoded={};
 for(const [name,bytes]of files){assert(/^[a-z][a-z0-9.-]*$/u.test(name)&&!name.includes('..')&&Buffer.isBuffer(bytes),'DOCS_MEMORY_INPUTS_MEMBER_INVALID');encoded[name]=bytes.toString('base64');}
 for(const argument of args)assert(typeof argument==='string'||(argument&&Object.keys(argument).every(key=>['file','prefix'].includes(key))&&files.has(argument.file)&&['','--discovery='].includes(argument.prefix??'')),'DOCS_MEMORY_INPUTS_ARGUMENT_INVALID');
 assert(typeof cwd==='string'&&cwd.startsWith('/')&&Buffer.isBuffer(stdin),'DOCS_MEMORY_INPUTS_CONTEXT_INVALID');
 return spawnSync('python3',['-I','-B','-c',relay],{input:JSON.stringify({command,args,files:encoded,cwd,stdin:stdin.toString('base64'),timeout}),encoding:'utf8',maxBuffer,env,timeout:timeout?timeout+5000:0});
}
