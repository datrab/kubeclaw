"""Ref-only delivery alias to exact primary canonical strict recursive schema.
No schema properties/rules are invented or weakened; source bytes remain unchanged.
"""
import pathlib,json,hashlib
out=pathlib.Path(__file__).resolve().parent;repo=out.parents[4];acq=json.loads((out/'kubernetes-source-acquisitions.json').read_text())
record=next(r for r in acq['records'] if r['result']=='acquired' and r.get('repository')=='yannh/kubernetes-json-schema' and r['path']=='v1.35.6-standalone-strict/_definitions.json')
primary=repo/record['localPath'];assert hashlib.sha256(primary.read_bytes()).hexdigest()==record['sha256']
key='io.k8s.apiextensions-apiserver.pkg.apis.apiextensions.v1.CustomResourceDefinition';defs=json.loads(primary.read_text());schema=defs['definitions'][key]
assert schema['additionalProperties'] is False and schema['required']==['spec']
# The $ref URI is an immutable projection to a pinned file+exact definition,
# not a replacement schema. Recursive child refs resolve inside primary document.
dest=out/'pinned-schema-aliases';dest.mkdir(exist_ok=True);target=dest/'customresourcedefinition-apiextensions-v1.json';uri=primary.resolve().as_uri()+'#/definitions/'+key
body={'$schema':'http://json-schema.org/draft-04/schema#','$ref':uri};target.write_text(json.dumps(body,indent=2)+'\n')
metadata={'method':'generated $ref-only delivery alias to exact primary strict canonical recursive definition; no local schema properties, enums, constraints or permissive object fallback authored','source':record,'definitionPointer':'#/definitions/'+key,'definitionCanonicalSha256':hashlib.sha256(json.dumps(schema,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'alias':{'path':str(target.relative_to(repo)),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'body':body},'standaloneAbsence':'exact pinned directory lacks standalone CRD file; previous raw404/failures preserved','scope':'same primary pinned schema structural check only; native API structural/CEL/admission/runtime validation still distinct; actual deployed version unknown'}
(out/'pinned-schema-aliases.json').write_text(json.dumps(metadata,indent=2)+'\n');print('Pinned strict canonical CRD ref-only alias materialized')
