#!/usr/bin/env python3
from pathlib import Path
import json,copy,hashlib,subprocess
P=Path('docs/review/evidence/config-acceptance/runtime');B=P/'batches/bce3f075-security-02';I=json.loads((P/'inventory-fragment.json').read_text());common='skills/buster/plugins/security-providers/src/common.js';H='skills/buster/plugins/security-providers/src/headers.js';sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
waiver={'findingId':'case-finding','reason':'C0 reviewed control waiver','expiresAt':'2099-01-01T00:00:00Z'};rule={'id':'custom','header':'x-custom','severity':'high','kind':'equals','value':'a'};bases={'headers':{'profile':'api-http-v1','paths':['/a'],'requestTimeoutMs':10000,'rules':{'add':[rule],'replace':[{'id':'content-type-nosniff','header':'x-content-type-options','severity':'high','kind':'equals','value':'nosniff'}],'remove':[]},'policy':{'profile':'strict-v1','acceptances':[waiver]}},'dependency':{'projectDirectory':'.','timeoutMs':300000,'policy':{'profile':'strict-v1','acceptances':[waiver]}},'image':{'timeoutMs':300000,'policy':{'profile':'strict-v1','acceptances':[waiver]}},'kubernetes-policy':{'timeoutMs':120000,'policy':{'profile':'strict-v1','acceptances':[waiver]}},'kubernetes-runtime':{'timeoutMs':120000,'policy':{'profile':'strict-v1','acceptances':[waiver]}}}
contracts={'profile':('adjustable-policy-preset-selector',[H,3,20,H,35,50,H,79,83],'business rules preset selector into hardcoded PROFILES; not protocol identity. api-http four rules, web-https six including HSTS31536000; web profile requiresHTTPS. Target complete plugin-owned rule set/no PROFILES fallback, selector reference not independently writable duplicate.'),'paths':('task-data',[H,73,78,H,100,117],'task deployment route list;1..32 unique, pathchars<=2048, no //, backslash/newline/#/?; exactlyone authorized deployment endpoint; not CONFIG site/location author.'),'requestTimeoutMs':('adjustable-policy',[H,81,82,H,109,111],'integer1..300000ms, null/absent10000; provider forwards without min invocation.timeoutMs, real retained runtime/session/claimdeadline bounds separately apply, do not infer request20changes realtimer from parser.'),'rules':('adjustable-policy',[H,22,51,H,86,93,H,103,118],'business rule declarations add/replace/remove over selected PROFILES; IDs unique, add cannot collide base/replacement; replacements must matchbase; remove wins before replacement; unknown removeID ignored; add/replace actualmap does not enforce schema max32 (resolved total1..64). present ignores value; equals/contains case-insensitive, hsts numericmax-age>=value.'),'policy':('adjustable-policy',[common,3,5,common,18,43,common,49,105],'current policy root exact profile/acceptances only, strict-v1 expands hardcoded critical/high blocking + affected + missingfix; strict policy unknownkeys reject, acceptance entry unknownkeys ignored. Acceptances null/absent[], uniqueid, trimmedreason>=8, absoluteISO expiry Date.parse; schema datetime stricter than actualparser. Current clock Date.now, expired<=now visible notaccepted, unused waivers visible; original securityfindings retained, waiver does not hide finding. Header findings statusaffected meansseveritylowering doesnotremoveblock. Target single explicit plugin-owned policy including tunableimplemented verdictfields/no hardcoded POLICY fallback, waiver expiry remains absoluteand checked realclock evenduringrecovery; not an Eval-frozenclock claim.'),'projectDirectory':('task-data',['skills/buster/plugins/security-providers/src/dependency.js',5,14],'task repository-relative projectDir1..4096chars; resolution containsrepository, no realpath/symlink checkhere; actual scanner/runtimeattestation/grant/repository snapshot separate required; no defaultprojectDirectory.'),'timeoutMs':('adjustable-policy',[],'scanpolicytimeout: dependency/image integer1000..900000ms default300000; kubernetes-policy/runtime integer1000..300000ms default120000; null/absentfallsback. Provider forwards, actual scan/runtimecap/session/claimdeadline independently constrains; no assumedprovider min invocation.timeoutMs.')}
entries=[]
for r in I['rows']:
 if r.get('semanticStatus')!='consumer-review-required' or '/security-providers/schemas/' not in r['source']['path']:continue
 name=r['source']['path'].split('/')[-1].replace('.schema.json','');field=r['field'];root=field.split('.')[0].replace('[]','');cl,ranges,sem=contracts[root];A=copy.deepcopy(bases[name]);BB=copy.deepcopy(A);N=copy.deepcopy(A)
 if root=='profile':BB[root]='web-https-v1';N[root]='unknown'
 elif root=='paths':BB[root]=['/b'];N[root]=['//escape']
 elif root=='requestTimeoutMs':A[root]=20;BB[root]=40;N[root]=0
 elif root=='timeoutMs':A[root]=1000;BB[root]=2000;N[root]=0;ranges=['skills/buster/plugins/security-providers/src/'+name+'.js',1,len(Path('skills/buster/plugins/security-providers/src/'+name+'.js').read_text().splitlines())]
 elif root=='projectDirectory':BB[root]='nested';N[root]='../outside'
 elif root=='rules':
  collection='replace'if field.startswith('rules.replace')else'remove'if field.startswith('rules.remove')else'add'
  if collection=='remove':A['rules']['remove']=['referrer-policy'];BB['rules']['remove']=['permissions-policy'];N['rules']['remove']=['unknown-id']
  else:
   leaf=field.split('.')[-1]if'.'in field else'id'
   if leaf in ['rules','add','add[]','replace','replace[]']:leaf='header'
   item=BB['rules'][collection][0];negative=N['rules'][collection][0]
   if leaf=='id':
    if collection=='add':item['id']='custom-b';negative['id']='bad/id'
    else:item.update({'id':'referrer-policy','header':'referrer-policy','kind':'present'});item.pop('value',None);negative['id']='unknown-id'
   elif leaf=='header':item['header']='x-other';negative['header']='bad header'
   elif leaf=='severity':item['severity']='low';negative['severity']='unsupported'
   elif leaf=='kind':item['kind']='contains';negative['kind']='unsupported'
   elif leaf=='value':item['value']='b';negative['value']=''
 elif root=='policy':
  if field=='policy.profile':N['policy']['profile']='unknown'
  elif field.endswith('.reason'):BB['policy']['acceptances'][0]['reason']='Second reviewed source waiver';N['policy']['acceptances'][0]['reason']='short'
  elif field.endswith('.expiresAt'):BB['policy']['acceptances'][0]['expiresAt']='2000-01-01T00:00:00Z';N['policy']['acceptances'][0]['expiresAt']='not-date'
  else:BB['policy']['acceptances'][0]['findingId']='other-finding';N['policy']['acceptances'].append(copy.deepcopy(N['policy']['acceptances'][0]))
 readers=[]
 for p,low,high in zip(ranges[::3],ranges[1::3],ranges[2::3]):
  lines=Path(p).read_text().splitlines();assert high<=len(lines),(p,high)
  readers += [{'path':p,'line':n,'text':lines[n-1],'sha256':sha(p)}for n in range(low,high+1)]
 entries.append({'setting':r['id'],'provider':name,'field':field,'schemaPointer':r['source']['field'],'classification':cl,'semantics':sem,'readers':readers,'completeA':A,'completeB':BB,'completeNegative':N,'onlyOneCurrentPresetValue':field=='policy.profile','actualProductiveParse':'provider().execute -> testContract.configuration (same real function, exported instrumentation only) -> common.policy/integer; actual provider invokes scanner/network afterwards','targetAuthority':'task source/deployment paths remain task+plan author'if cl=='task-data'else'single kubeclaw.security-providers owned complete rule/verdict policy; source/provider-specific timeout scopes explicit, sharedpolicy derives from sameauthor, not anotherloader; alreadybound runtime ceilings/grants/expiryclock separate dependencies'})
(B/'contracts.json').write_text(json.dumps({'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'sourceTree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],text=True).strip(),'entries':entries,'scope':'actual source/parser+verdict definition and futurefullcases; no production/test implementation'},indent=2)+'\n');print('entries',len(entries))
