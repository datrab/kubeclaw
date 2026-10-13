from pathlib import Path
import json,copy,hashlib
root=Path.cwd();out=Path(__file__).parent;sha=lambda b:hashlib.sha256(b).hexdigest();batch=json.loads((out/'schema-coordinate-definitions.json').read_text());schema=json.loads((root/'skills/common/plugin-runtime/foundation/config/swarm-components.schema.json').read_text());original=json.loads((root/'docs/review/evidence/config-acceptance/components/semantic-fragment.json').read_text())['rows'];refs=json.loads((out/'committed-input-references.json').read_text())['refs'];observations=[]
def require(v,msg):
 if not v:raise ValueError('SCHEMA_SOURCE_BINDING:'+msg)
def ptr(j,p):
 for k in p.split('/')[1:]:j=j[int(k)] if isinstance(j,list) else j[k.replace('~1','/').replace('~0','~')]
 return j
def validate(v):
 require(len(v['records'])==105 and len({x['candidateId'] for x in v['records']})==105,'coordinate set lost/duplicate')
 for r in v['records']:
  s=r['source'];expected=next(x for x in batch['records'] if x['candidateId']==r['candidateId']);require([x['settingId'] for x in r['members']]==[x['settingId'] for x in expected['members']],'enumerated source-derived member set drift');require(r['noNewSettingAuthor'] is True,'second author');require(ptr(schema,s['rfc6901Pointer'])==s['currentMaximum'],'source domain value drift');require((root/s['path']).read_text().splitlines()[s['line']-1]==s['exactText'],'exact line drift');owner=s['rfc6901Pointer'].rsplit('/',1)[0]
  require(len(r['members'])==r['memberCount'] and bool(r['members']),'missing member')
  for m in r['members']:
   row=ptr({'rows':original},m['row']['rfc6901Pointer']);require(row['id']==m['settingId'] and row['source']['field']==m['field'] and row['reader']==m['reader'],'member/current-reader drift');require(row['caseIds']==m['caseIds'],'case loss');require(ptr(schema,m['effectiveScalarPointer'])==m['currentResolvedLeafSchema'],'effective leaf drift');direct=owner in m['schemaPathsTraversed'] or owner==m['effectiveScalarPointer'];alt=m.get('namedAPIAlternativeSchemaEntry')
   if not direct:
    require(alt is not None and owner in alt['schemaPathsTraversed'],'unproved separate validator alias');require(ptr(schema,alt['effectiveScalarPointer'])==m['currentResolvedLeafSchema'] and alt['fullResolvedLeafEqualityVerified'] is True,'same-maximum-only alias');src=alt['reader'];require(sha((root/src['path']).read_bytes())==src['sha256'],'named API source drift');require("validateComponentSettings('"+alt['definition']+"'" in (root/src['path']).read_text().splitlines()[src['line']-1],'wrong named API caller')
 for r in refs:require(sha((root/r['path']).read_bytes())==r['sha256'],'committed source beforebytes drift')
validate(batch);observations.append({'id':'all105-current-schema-sourced-member-bindings','result':'passed-document-integrity-only'})
def negative(id,fn):
 v=copy.deepcopy(batch);fn(v)
 try:validate(v)
 except (ValueError,KeyError,IndexError) as e:observations.append({'id':id,'result':'intended-doc-integrity-rejection','boundary':str(e)});return
 raise AssertionError('escaped '+id)
negative('coordinate-omitted',lambda v:v['records'].pop());negative('member-and-count-loss',lambda v:(v['records'][0]['members'].pop(),v['records'][0].update(memberCount=v['records'][0]['memberCount']-1)));negative('maximum-reinterpreted',lambda v:v['records'][0]['source'].update(currentMaximum=0));negative('leaf-pointer-wrong',lambda v:v['records'][0]['members'][0].update(effectiveScalarPointer='/$defs/positiveTimerInteger/type'));negative('current-reader-changed',lambda v:v['records'][0]['members'][0].update(reader={}));negative('case-obligations-removed',lambda v:v['records'][0]['members'][0].update(caseIds=[]));negative('second-author',lambda v:v['records'][0].update(noNewSettingAuthor=False))
altIndex=next(i for i,r in enumerate(batch['records']) if any('namedAPIAlternativeSchemaEntry' in m and r['source']['rfc6901Pointer'].rsplit('/',1)[0] not in m['schemaPathsTraversed'] for m in r['members']));negative('named-validator-bridge-removed',lambda v:v['records'][altIndex]['members'][0].pop('namedAPIAlternativeSchemaEntry'));validate(batch);observations.append({'id':'restored-source-bindings','result':'passed-document-integrity-only'});(out/'binding-integrity-controls.json').write_text(json.dumps({'scope':'Pure authored source/binding integrity, NOT semantic independent acceptance or consumer/runtime/Helm/native/emitter/F-MUT','observations':observations},indent=2)+'\n');print('8 intended document negatives /2 positives; future consumer/emitter cases NOTRUN')
