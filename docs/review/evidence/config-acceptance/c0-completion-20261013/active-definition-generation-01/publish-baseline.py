"""Freeze the actual original Git revision; no active definitions or acceptance.

Preserve exact raw inputs and every normalized catalog occurrence. Never source
the historical baseline from a mutable current author-selected manifest.
"""
from pathlib import Path
import gzip
import hashlib
import json
import subprocess
import sys

root = Path.cwd().resolve()
base = Path(__file__).resolve().parent
revision = '0bcaf85d192d031814554c590b1bfca5b3ba81dd'
sys.path.insert(0, str(root/'docs/review/evidence/config-acceptance/author'))
from review_receipts import canonical_sha

out = base/'baseline'
objects = out/'objects'
objects.mkdir(parents=True, exist_ok=True)
inputs = {}
documents = {}
def load(path):
    if path not in documents:
        process = subprocess.run(['git', 'show', revision+':'+path], cwd=root,
                                 capture_output=True, check=True)
        raw = process.stdout
        digest = hashlib.sha256(raw).hexdigest()
        assert (root/path).read_bytes() == raw, 'current original input differs: '+path
        target = objects/(digest+'.json.gz')
        compressed = gzip.compress(raw, compresslevel=6, mtime=0)
        target.write_bytes(compressed)
        assert gzip.decompress(target.read_bytes()) == raw
        inputs[path] = {'originalPath':path,'gitRevision':revision,
                        'uncompressedSha256':digest,'uncompressedBytes':len(raw),
                        'objectPath':str(target.relative_to(root)),
                        'objectSha256':hashlib.sha256(compressed).hexdigest(),
                        'objectBytes':len(compressed),'encoding':'gzip'}
        documents[path] = json.loads(raw)
    return documents[path]

inventory_path = 'docs/review/remediation/config-semantic-inventory.json'
matrix_path = 'docs/review/remediation/config-acceptance-matrix.json'
inventory = load(inventory_path)
matrix = load(matrix_path)
catalog = {}
occurrences = 0
def add(kind, identifier, body, path, pointer):
    global occurrences
    assert isinstance(identifier,str) and identifier
    key = (kind,identifier)
    body_digest = canonical_sha(body)  # full original body, review decoration included
    if key in catalog:
        assert catalog[key]['bodySha256'] == body_digest, 'conflicting original duplicate: '+str(key)
    else:
        catalog[key] = {'kind':kind,'id':identifier,'bodySha256':body_digest,'occurrences':[]}
    catalog[key]['occurrences'].append({'originalPath':path,
        'uncompressedSha256':inputs[path]['uncompressedSha256'],'pointer':pointer})
    occurrences += 1

for kind, path, member in [('setting',inventory_path,'rows'),('case',matrix_path,'cases'),
                          ('requirement',matrix_path,'requirements'),
                          ('supplemental',inventory_path,'supplementalDefinitionPackages'),
                          ('definition-observation',matrix_path,'definitionObservationPackages'),
                          ('native-package',matrix_path,'nativeCasePackages')]:
    for index, body in enumerate(load(path).get(member,[])):
        add(kind,body['id'],body,path,f'/{member}/{index}')
        if kind == 'native-package':
            for child_index, child in enumerate(body['canonicalCaseMapping']):
                add('native-map',body['id']+':'+child['nativeCaseId'],child,path,
                    f'/{member}/{index}/canonicalCaseMapping/{child_index}')
for path in inventory['coordinateCandidateLedgers']:
    for index, body in enumerate(load(path)['coordinateCandidates']):
        add('coordinate',body['id'],body,path,f'/coordinateCandidates/{index}')
path = inventory['candidateLedger']
for index,body in enumerate(load(path)['candidates']):
    add('candidate',body['id'],body,path,f'/candidates/{index}')
path = inventory['sourceBoundary']
for index,body in enumerate(load(path)['boundaries']):
    add('source',body['path'],body,path,f'/boundaries/{index}')

ordered = [catalog[key] for key in sorted(catalog)]
catalog_document = {'schemaVersion':'config-definition-baseline-catalog.v1',
                    'sourceRevision':revision,'records':ordered,
                    'catalogSha256':canonical_sha(ordered)}
catalog_file = out/'catalog.json'
catalog_file.write_text(json.dumps(catalog_document,indent=2,ensure_ascii=False)+'\n')
manifest = {'schemaVersion':'config-definition-baseline-manifest.v1',
            'sourceRevision':revision,'inputs':[inputs[path] for path in sorted(inputs)],
            'catalogRef':{'path':str(catalog_file.relative_to(root)),
                          'sha256':hashlib.sha256(catalog_file.read_bytes()).hexdigest()},
            'catalogSha256':catalog_document['catalogSha256'],
            'catalogOccurrences':occurrences,'catalogUniqueIds':len(ordered),
            'requirementsSha256':canonical_sha(matrix['requirements']),
            'globalC0Accepted':False,'implementationAuthorization':None}
manifest_file = out/'manifest.json'
manifest_file.write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'sourceRevision':revision,'rawGitInputs':len(inputs),
                  'originalOccurrences':occurrences,'uniqueTypedIds':len(ordered),
                  'manifestPath':str(manifest_file.relative_to(root)),
                  'manifestSha256':hashlib.sha256(manifest_file.read_bytes()).hexdigest(),
                  'catalogSha256':catalog_document['catalogSha256'],
                  'qualification':'byte/body/occurrence preservation only; no active closure',
                  'globalC0Accepted':False},indent=2))
