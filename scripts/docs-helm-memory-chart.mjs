// Native local-chart observation only: a sealed anonymous chart descriptor is
// seekable for Helm without materializing transformed templates on disk.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';

export function localHelmChartFiles(root, chart) {
  const directory=path.join(root,chart), files=new Map();
  // The maintained template namespace already rejects custom ignore policies.
  // Do not silently replace Helm's arbitrary .helmignore evaluator.
  assert(!fs.existsSync(path.join(directory,'.helmignore')),
    `API_PRODUCT_HELM_MEMORY_IGNORE_UNQUALIFIED: ${chart}`);
  function visit(relative='') {
    for(const entry of fs.readdirSync(path.join(directory,relative),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const selected=path.posix.join(relative,entry.name);
      // Helm3.22.0 pkg/ignore Rules.AddDefaults ignores templates/.?*,
      // including the entire contents of an immediately hidden directory.
      if(relative==='templates'&&entry.name.startsWith('.')&&entry.name.length>1)continue;
      assert(!entry.isSymbolicLink(),`API_PRODUCT_HELM_MEMORY_SYMLINK_UNQUALIFIED: ${chart}/${selected}`);
      if(entry.isDirectory())visit(selected);
      else {
        assert(entry.isFile(),`API_PRODUCT_HELM_MEMORY_IRREGULAR_INPUT: ${chart}/${selected}`);
        files.set(selected,fs.readFileSync(path.join(directory,selected)));
      }
    }
  }
  visit();return files;
}

const archiveWriter = String.raw`
import base64, io, json, sys, tarfile
request = json.load(sys.stdin)
archive = io.BytesIO()
with tarfile.open(fileobj=archive, mode='w', format=tarfile.PAX_FORMAT) as chart:
    for name, encoded in request:
        data = base64.b64decode(encoded, validate=True)
        member = tarfile.TarInfo('chart/' + name)
        member.size = len(data)
        member.mode = 0o644
        member.mtime = 0
        chart.addfile(member, io.BytesIO(data))
sys.stdout.buffer.write(archive.getvalue())
`;

const renderer = String.raw`
import base64, fcntl, json, os, subprocess, sys
request = json.load(sys.stdin)
archive = base64.b64decode(request['archive'], validate=True)
fd = os.memfd_create('kubeclaw-docs-observation-chart', os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)
try:
    remaining = memoryview(archive)
    while remaining:
        remaining = remaining[os.write(fd, remaining):]
    fcntl.fcntl(fd, fcntl.F_ADD_SEALS, fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL)
    os.lseek(fd, 0, os.SEEK_SET)
    result = subprocess.run(['helm', 'template', 'discovery', '/proc/self/fd/' + str(fd), '--namespace', 'default', '--kube-version', '1.35.0', '--include-crds', '-f', '-'], input=request['values'].encode('utf-8'), stdout=subprocess.PIPE, stderr=subprocess.PIPE, pass_fds=(fd,))
    sys.stdout.buffer.write(result.stdout)
    sys.stderr.buffer.write(result.stderr)
    sys.exit(result.returncode if result.returncode >= 0 else 128 - result.returncode)
finally:
    os.close(fd)
`;

export function renderLocalHelmChart(files, values) {
  assert(files instanceof Map&&files.has('Chart.yaml'),'API_PRODUCT_HELM_MEMORY_CHART_MISSING');
  assert(typeof values==='string','API_PRODUCT_HELM_MEMORY_VALUES_INVALID');
  const entries=[...files].sort(([a],[b])=>a.localeCompare(b)).map(([name,bytes])=>{
    assert(typeof name==='string'&&name&&name===path.posix.normalize(name)&&!path.posix.isAbsolute(name)
      &&!name.includes('\\')&&!name.includes('\0')
      &&!name.split('/').some(part=>part==='..'||part==='.')&&Buffer.isBuffer(bytes),
      'API_PRODUCT_HELM_MEMORY_MEMBER_INVALID');
    return [name,bytes.toString('base64')];
  });
  // Compression uses Node's declared built-in zlib. Python's native parser
  // installation need not include the optional Python zlib extension.
  const packed=spawnSync('python3',['-I','-B','-c',archiveWriter],{
    input:JSON.stringify(entries),maxBuffer:64*1024*1024,
  });
  if(packed.status!==0)return {...packed,stdout:packed.stdout?.toString('utf8'),stderr:packed.stderr?.toString('utf8')};
  const archive=gzipSync(packed.stdout).toString('base64');
  return spawnSync('python3',['-I','-B','-c',renderer],{
    input:JSON.stringify({archive,values}),encoding:'utf8',maxBuffer:64*1024*1024,
  });
}
