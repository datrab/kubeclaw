"""Freeze this staged documentation checkpoint without recursive self-inclusion."""
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

root = Path.cwd()
base = root/'docs/review/evidence/config-acceptance/author'
receipt = base/'checkpoint-6-identities.json'
if receipt.exists():
    raise SystemExit('Do not overwrite a historical checkpoint freeze.')
head = subprocess.check_output(['git','rev-parse','HEAD'], text=True).strip()
tree = subprocess.check_output(['git','rev-parse','HEAD^{tree}'], text=True).strip()
paths = subprocess.check_output(['git','diff','--cached','--name-only','-z','HEAD']).split(b'\0')
inputs = []
index = {}
index_modes = {}
for entry in subprocess.check_output(['git','ls-files','--stage','-z']).split(b'\0'):
    if entry:
        metadata, name = entry.split(b'\t',1)
        mode, oid, stage = metadata.split()
        if stage != b'0':
            raise SystemExit('Unmerged index cannot be frozen')
        index[os.fsdecode(name)] = oid.decode()
        index_modes[os.fsdecode(name)] = mode.decode()
if subprocess.check_output(['git','rev-parse','--show-object-format'],text=True).strip() != 'sha1':
    raise SystemExit('Checkpoint helper requires explicitly supported SHA1 Git object format')
for raw in paths:
    if not raw:
        continue
    p = Path(os.fsdecode(raw))
    if not str(p).startswith('docs/review/'):
        raise SystemExit(f'Non-documentation staged change: {p}')
    data = os.fsencode(os.readlink(p)) if index_modes[str(p)] == '120000' else p.read_bytes()
    blob_header = f'blob {len(data)}\0'.encode()
    if hashlib.sha1(blob_header+data).hexdigest() != index[str(p)]:
        raise SystemExit(f'Stale staged input; refresh before freeze: {p}')
    inputs.append({'path':str(p), 'sha256':hashlib.sha256(data).hexdigest(), 'bytes':len(data),
                   'gitMode':index_modes[str(p)], 'symlinkTargetBytesOnly':index_modes[str(p)] == '120000'})
descriptor, temporary = tempfile.mkstemp(prefix='kubeclaw-c0-checkpoint6-', suffix='.gz')
os.close(descriptor)
raw_hash = hashlib.sha256()
raw_bytes = 0
try:
    process = subprocess.Popen(['git','diff','--cached','--binary','HEAD'], stdout=subprocess.PIPE)
    with gzip.GzipFile(filename=temporary, mode='wb', mtime=0) as output:
        while chunk := process.stdout.read(1024*1024):
            raw_hash.update(chunk)
            raw_bytes += len(chunk)
            output.write(chunk)
    if process.wait() != 0:
        raise SystemExit('git diff failed; do not accept partial patch')
    # Validate the complete gzip round-trip without materializing a huge raw file.
    restored = hashlib.sha256()
    with gzip.open(temporary,'rb') as stream:
        while chunk := stream.read(1024*1024):
            restored.update(chunk)
    assert restored.hexdigest() == raw_hash.hexdigest()
    compressed_hash = hashlib.sha256()
    parts = []
    with open(temporary,'rb') as stream:
        index = 0
        while chunk := stream.read(70*1024*1024):
            index += 1
            compressed_hash.update(chunk)
            target = base/f'checkpoint-6-dirty.patch.gz.part-{index:03d}'
            with target.open('xb') as output:
                output.write(chunk)
            parts.append({'path':str(target.relative_to(root)), 'bytes':len(chunk),
                          'sha256':hashlib.sha256(chunk).hexdigest()})
    value = {'scope':'Exact staged documentation checkpoint input identities; C0 not accepted',
             'parentCommit':head, 'parentTree':tree, 'inputs':inputs,
             'stagedInputCount':len(inputs),
             'patch':{'command':['git','diff','--cached','--binary','HEAD'],
                      'rawBytes':raw_bytes, 'rawSha256':raw_hash.hexdigest(),
                      'gzipSha256':compressed_hash.hexdigest(), 'parts':parts,
                      'restore':'Concatenate parts in listed order, then gzip-decompress; verify rawSha256.',
                      'roundTripVerified':True},
             'selfExclusions':'This receipt and its derived patch parts are added after capture to avoid recursive inclusion. Later checkpoint metadata is separately identified at commit; no final whole-C0 acceptance freeze is claimed.',
             'untrackedInputMeaning':'New author/reviewer inputs staged into this patch are included byte-for-byte and hashed; interpreter caches are excluded as derived non-inputs.'}
    receipt.write_text(json.dumps(value,indent=2)+'\n')
    print(json.dumps({'inputs':len(inputs),'rawPatchBytes':raw_bytes,'gzipParts':len(parts),
                      'rawSha256':raw_hash.hexdigest(),'acceptedC0':False}))
finally:
    Path(temporary).unlink(missing_ok=True)
