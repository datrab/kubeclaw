#!/usr/bin/env python3
"""Original GitOps generated-binding lineage; no deployment or acceptance promotion."""
import importlib.util,json
from pathlib import Path
OUT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('helpers',OUT/'reconcile-platform-boundaries.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
SCRIPT='scripts/gitops.mjs';TEMPLATE='charts/gitops/templates/applications.yaml';CONTINUOUS='scripts/gitops-continuous.mjs'
CONSTRAINT='All eight original fields retain generated-binding classification. Four inventory fields derive from verified committed bundle resources; repository/revision are explicit validated invocation inputs; project/rootName derive from explicit naming or original fallbacks. Continuous route selects gitops/production/config.json naming, then intentionally changes rendered Application revision to main. The historical central deployment/profile contract and original cases remain OPEN. Do not invent eight independent editable settings, a parallel root, acceptance or denied-v10 activation.'
def build():
 full=h.build();roster=h.read(h.ROSTER);refs={r['id']:r for r in roster['fields']};cache={}
 specs={
 'REPOSITORY':(['validateBootstrapAddress(url, argoNamespace);','repository: url, revision, destinations'],['- {{ $repository | quote }}','repoURL: {{ $repository | quote }}'],'VALIDATED_INVOCATION_INPUT_CENTRAL_RECEIVING_OPEN'),
 'REVISION':(["if (!/^[a-f0-9]{40}$/u.test(revision))","git(repository, ['rev-parse', `${revision}^{commit}`])"],['targetRevision: {{ $revision | quote }}'],'COMMITTED_REVISION_INPUT_CONTINUOUS_MAIN_PROJECTION_CENTRAL_RECEIVING_OPEN'),
 'PROJECT':(['const workloadProject = naming.workloadProject ?? `${name}-workloads`;','project: workloadProject, groups: bundle.groups'],['name: {{ $project }}','project: {{ $project }}'],'EXPLICIT_NAMING_WITH_ORIGINAL_FALLBACK_CENTRAL_RECEIVING_OPEN'),
 'ROOTNAME':(['const name = naming.rootName ?? `${bundle.groups[0].namespace}-runtime`;'],['required "rootName is required" .Values.rootName'],'EXPLICIT_NAMING_WITH_ORIGINAL_FALLBACK_CENTRAL_RECEIVING_OPEN'),
 'GROUPS':(['const bundle = readCommittedBundle(repository, directory, revision);','groups: bundle.groups'],['range .Values.groups','path: {{ .path | quote }}'],'VERIFIED_BUNDLE_DERIVED_BINDING_CENTRAL_GENERATION_JOIN_OPEN'),
 'DESTINATIONS':(['const destinations = [...new Set(bundle.groups.flatMap'],['range .Values.destinations'],'VERIFIED_BUNDLE_DERIVED_BINDING_CENTRAL_GENERATION_JOIN_OPEN'),
 'CLUSTERRESOURCEWHITELIST':(['gitOpsClusterKinds.has(resource.kind) ? cluster : namespaced','clusterResourceWhitelist: [...cluster.values()]'],['toYaml .Values.clusterResourceWhitelist'],'VERIFIED_BUNDLE_DERIVED_BINDING_CENTRAL_GENERATION_JOIN_OPEN'),
 'NAMESPACERESOURCEWHITELIST':(['gitOpsClusterKinds.has(resource.kind) ? cluster : namespaced','namespaceResourceWhitelist: [...namespaced.values()]'],['toYaml .Values.namespaceResourceWhitelist'],'VERIFIED_BUNDLE_DERIVED_BINDING_CENTRAL_GENERATION_JOIN_OPEN')}
 rows=[]
 for row in h.read(str((OUT/'fields.json').relative_to(h.ROOT))):
  if not any(x['path']=='config/deployment/gitops/<profile>.json' for x in row['explicitConfigLocatorObservations']):continue
  ref=refs[row['id']];doc,loc=ref['original'].split('#',1)
  if doc not in cache:cache[doc]=h.read(roster['documents'][doc]['path'])
  original=h.pointer(cache[doc],loc)
  if any(row[k]!=v for k,v in [('original',ref['original']),('originalObjectSha256',ref['sha256']),('caseIds',ref['caseIds']),('class',original['class']),('owner',original['owner'])]) or row['class']!='generated-binding':raise ValueError('Original GitOps identity/class drift')
  source,effects,status=specs[row['id'].removeprefix('DLV-CHART-GITOPS-')]
  r={k:row[k] for k in ['id','original','originalObjectSha256','caseIds','class','owner']}
  r.update(originalSource=original.get('source'),status=status,centralPhysicalAuthor=None,sourceInputs=[h.anchor(SCRIPT,x) for x in source],actualEffects=[h.anchor(TEMPLATE,x) for x in effects],generatedTransport=h.anchor(SCRIPT,'helm: { valuesObject: values }'),committedRead=h.anchor(SCRIPT,'inspectCommittedGroup(repository, directory, revision, group, bundle.receipt)'),continuousReceiving=h.anchor(CONTINUOUS,'config.argoNamespace, config.naming'),runtimeAcceptance='OPEN; original results unchanged',independentReview='OPEN')
  if row['id'].endswith(('ROOTNAME','PROJECT')):r['currentNamingSelection']={**h.pin('gitops/production/config.json'),'pointer':'/naming/'+('rootName' if row['id'].endswith('ROOTNAME') else 'workloadProject')}
  if row['id'].endswith('REVISION'):r['continuousRevisionEffects']=[h.anchor(CONTINUOUS,"targetRevision: 'main'"),h.anchor(CONTINUOUS,"document.spec.source.targetRevision = 'main'")]
  rows.append(r)
 if len(rows)!=8 or len({r['id'] for r in rows})!=8:raise ValueError('GitOps8 identity loss')
 return {'scope':'Exact original GitOps8 generated-binding source lineage only, not implementation or acceptance','constraint':CONSTRAINT,'rows':rows,'preservedCounts':full['preservedCounts'],'originalCasesNewlyAccepted':0,'fullC0C6Complete':False,'independentReview':'OPEN'}
if __name__=='__main__':
 result=build();(OUT/'gitops-successors.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'fields':len(result['rows']),'preservedCounts':result['preservedCounts'],'originalCasesNewlyAccepted':0}))
