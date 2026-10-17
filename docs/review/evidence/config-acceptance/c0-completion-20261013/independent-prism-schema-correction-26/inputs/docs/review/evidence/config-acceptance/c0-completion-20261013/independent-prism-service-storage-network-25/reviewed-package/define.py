"""Fifty-six Prism service/storage/network source clauses, not runtime proofs."""
from pathlib import Path
import json,hashlib,re
R=Path.cwd();P=R/'docs/review/evidence/config-acceptance/c0-completion-20261013/delivery';O=P/'batch-33';T='charts/prism/templates/'
names=['backup-storage-check.yaml','backup.yaml','ingestion.yaml','jobs.yaml','networkpolicy.yaml','postgresql.yaml','services.yaml']; sources=[T+n for n in names]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def ref(s,n):
 p=R/s;return dict(path=s,line=n,expression=p.read_text().splitlines()[n-1],sha256=sha(p))
def find(s,text):return [ref(s,n) for n,line in enumerate((R/s).read_text().splitlines(),1) if text in line]
q=json.loads((P/'batch-24/remaining-batches.json').read_text());ids=set().union(*(set(next(x['candidateIds'] for x in q['bySource'] if x['source']==s)) for s in sources));originals=json.loads((P/'candidate-dispositions.json').read_text())['candidates']
schema_path='charts/prism/values.schema.json';schema=json.loads((R/schema_path).read_text());rows=[]
for c in originals:
 if c['id'] not in ids:continue
 s=c['source'];n=c['line'];base=Path(s).name;expr=ref(s,n);refs=[];kind='deployment-policy';author='selected same-generation Chart deployment policy';domain='';name=''
 values=list(dict.fromkeys(re.findall(r'\$?\.Values\.([A-Za-z0-9_.]+)',expr['expression'])))
 schemaRefs=[]
 for value in values:
  node=schema;ptr=''
  for key in value.split('.'):
   if key not in node.get('properties',{}):break
   node=node['properties'][key];ptr+='/properties/'+key
  else:schemaRefs.append(dict(field=value,path=schema_path,pointer='#'+ptr,domain=node,sha256=sha(R/schema_path)))
 if base=='networkpolicy.yaml':
  lines=(R/s).read_text().splitlines();start=0
  for i in range(n):
   if lines[i]=='---':start=i+1
  stop=next((i for i in range(n,len(lines)) if lines[i]=='---'),len(lines))
  if n==151:
   start=n-1;stop=next(i+1 for i in range(n,len(lines)) if lines[i]=='{{- end }}')
  resource=next((line for line in lines[start:stop] if line.startswith('metadata:')), 'pending conditional resource')
  name='network projection '+str(n)+' '+resource;kind='generated-network-topology'
  domain='Exact resource/rule context retained in contextualSourceRefs. Namespace and pod selectors in the SAME peer entry are conjunctive; different entries remain distinct. Selector labels are network topology, not ServiceAccount authentication or actor/task grants. Existing multiple NetworkPolicies and CNI behavior need genuine native proof; no blanket isolation claim.'
  refs=[ref(s,i+1) for i in range(start,stop) if lines[i].strip()]
  if 'ternary 8443' in expr['expression']:
   domain+=' Selected trust boolean projects8443 when true, selected Control/Worker component port when false (worker expression is distinct); retain actual ingress/egress peer and direction, no independent editable duplicate port author.'
   refs+=find(T+'services.yaml','workerTrust.spiffe.enabled')+find(T+'workloads.yaml','name: worker-trust, containerPort: 8443')
  elif 'namespaceSelector' in expr['expression']:
   domain+=' Exact selected Nova/agent/Tailscale operator namespace must agree with genuine installed peer/provider topology; do not infer a new actor or namespace authorization from a string change.'
  else:domain+=' Ingestion policy branch uses selected ingestion.enabled; default-deny/DNS/other policies are separate source facts, not all controlled by this flag.'
 elif base=='services.yaml':
  D={13:('Control internal service applicability','workerTrust.spiffe.enabled','True emits prism-control-internal8443 targeting named worker-trust port; ordinary prism-control8080 targets selected component port and remains separately emitted.'),25:('Worker internal service applicability','workerTrust.spiffe.enabled','True emits prism-worker-internal8443 targeting named worker-trust port; ordinary prism-worker8080 remains separate.'),32:('Ingestion service applicability','ingestion.enabled','True emits service prism-ingestion8080 targeting8080, same selected flag as ingestion Deployment/policy; not proof pod ready or healthy.'),39:('Studio Tailscale ingress applicability','tailscale.enabled','True emits tailscale-class ingress default backend prism-studio80; policy source branch is separate and not gated by this flag.'),47:('Studio ingress hostname','tailscale.hostname','Selected exact hostname rendered into Ingress TLS hosts; authentic Tailscale operator/provider/domain ownership and exposure facts required; not a task capability grant.')}
  name,author,domain=D[n];kind='generated-service-topology' if n!=47 else 'installed-exposure-reference';refs=find(T+'networkpolicy.yaml','metadata: { name: prism-studio-entry }') if n in (39,47) else []
 elif base=='ingestion.yaml':
  D={1:('Ingestion deployment applicability','generated-applicability','Selected enabled flag gates this Deployment; service/policy have same flag, runtime availability separate.'),9:('Ingestion replicas','deployment-capacity-policy','Chart schema nonnegative integer, including0 paused deployment. Not a task concurrency/worker grant.'),20:('Ingestion immutable image','generated-release-reference','Selected ingestion repository/digest passed to prism.imageRef; exact sha256 digest required by helper, immutable image/runtime compatibility remains a release gate.'),21:('Ingestion image fetch policy','deployment-fetch-policy','Selected Always|IfNotPresent|Never schema enum; genuine image-cache/registry/native fetch behavior separate.'),25:('Ingestion request CPU','deployment-capacity-policy','Current required nonempty operator sizing projected quoted; native quantity validity/request<=limit/capacity remain complete profile and native gates.'),26:('Ingestion request memory','deployment-capacity-policy','Current required nonempty memory sizing, separate from quarantine disk capacity/TTL; native quantity and resource relation proof separate.'),28:('Ingestion limit CPU','deployment-capacity-policy','Current required nonempty CPU limit, distinct from requests and native task resource envelopes.'),29:('Ingestion limit memory','deployment-capacity-policy','Current required nonempty memory limit, not an OOM/retention/native scheduling proof.'),35:('Quarantine retention TTL','retention-policy','Chart integer60000..86400000 ms. Current JS convertsNumber with fallback3600000, rejects nonsafeinteger then clamps60000..86400000, reaps atstartup and schedules atmin(TTL,60000); this is ephemeral quarantine deletion, not evidence/log retention or a proof migrated default-free loader.')}
  name,kind,domain=D[n]
  if n==35:refs=[ref('skills/prism/server/ingestion.ts',i) for i in [14,15,16,18,20]]
  if n==20:refs=find(T+'_helpers.tpl','define "prism.imageRef"')+find(T+'_helpers.tpl','sha256:')
 elif base=='backup.yaml':
  D={1:('Backup workload applicability','generated-applicability','Selected postgresql.enabled gates backup script ConfigMap and all3CronJobs/PVC-related workloads, not an independent backup flag.'),18:('Backup/verification/database-proof schedules','scheduling-policy','Fixed mode loopbackup/verify/database-proof selects three distinct explicit cron strings. Retain individual schema string bounds; native CronJob grammar/controller/timezone/schedule facts separate.'),25:('Backup Job deadline relation','generated-budget-relation','activeDeadlineSeconds = selected maximumDurationSeconds+30, separate from script timeout and TERM kill-after15; current Chart duration integer1..86400.'),44:('Backup tools image','generated-release-reference','Direct postgresql.image string, not prism.imageRef; must provide actual bash/pg_dump/restore/core tools compatible with selected database. Genuine immutable image and runtime facts remain open.'),51:('Backup maximum group bytes','storage-budget-policy','Chart wire string ^[1-9][0-9]{0,12}$; script validates same positive decimal grammar and compares actual group du bytes. No generic timer-safe integer ceiling substituted.'),52:('Backup maximum retained bytes','storage-budget-policy','Same positive decimal-string grammar; script computes remaining allowance from actual used bytes and1048576 reserve, caps allowance atmaximum group bytes and rejects insufficient capacity. No automatic deletion or restoration inferred.'),53:('Backup maximum duration','operation-budget-policy','Chart integer1..86400 seconds, projected string; shell positive grammar independently broader, whole operation timeout wraps flock and TERM kill-after15. Job deadline isduration+30; unchanged shell standalone domain must not be mislabeled Chart domain.'),56:('Backup application image identity','generated-release-reference','Only backup mode emits selected Control immutable image via prism.imageRef; script validates repository@sha256 and recordsapplication_image metadata. Different from tools image and not proof the artifact came from that runtime.'),66:('Backup database admin secret reference','secret-reference','Non-verify modes project postgresql.existingSecret keypassword for postgres client; secret value/version/database role authority external. No actual secret stored in inventory.')}
  name,kind,domain=D[n]
  if n in (51,52,53):refs=[ref('charts/prism/files/prism-backup.sh',i) for i in [8,13,14,15,16,56,75,77,233]]
  if n==56:refs=find('charts/prism/files/prism-backup.sh','PRISM_BACKUP_IMAGE')+find(T+'_helpers.tpl','sha256:')
 elif base=='backup-storage-check.yaml':
  name='Backup storage check applicability' if n==1 else 'Backup storage check image';kind='generated-applicability' if n==1 else 'generated-release-reference'
  domain='Postgresql enabled gates sync Job; current120-second deadline, backup PVC read/write probe via mktemp/printf/cat and cleanup; no observed native binding/write proof.' if n==1 else 'Direct postgresql.image used to execute /bin/sh storage write-check, not application imageRef; needs compatible UID1000 filesystem/tools/PVC/provider facts.'
 elif base=='jobs.yaml':
  if n in (1,2):
   name='Migration/PVC applicability' if n==1 else 'Migration existingSecret precondition';kind='generated-applicability' if n==1 else 'precondition-only-secret-reference'
   domain='Postgresql enabled gates migration Job AND backup PVC; selected image/database/bootstrap/migrator contract required before effect.' if n==1 else 'Current required postgresql.existingSecret assigned to $postgresSecret but NEVER used later in this template. Actual bootstrap/migrate ENV uses Values.secrets.database refs; do not classify this unused variable as productive secret consumption.'
  else:
   bootstrap=n in (27,28); name=('Bootstrap' if bootstrap else 'Migration')+(' immutable Control image' if n in (27,45) else ' Control image pull policy');kind='generated-release-reference' if n in (27,45) else 'deployment-fetch-policy'
   domain='Selected Control immutableimageRef or explicit pullPolicy for '+('init bootstrap-database.ts, whose actual config loader reads admin and three role password references' if bootstrap else 'migrate.ts using actual DATABASE_URL migrator secret reference')+'; these are separate processes and roles, not shared task grants. Actual database readiness/migration/native privileges unproven.'
   refs=find(s,'command: ["node"')+find(s,'secretKeyRef:')
 elif base=='postgresql.yaml':
  if n==1:name='Postgresql local deployment applicability';kind='generated-applicability';domain='Selected enabled flag emits local ConfigMap/StatefulSet/Service; false does not automatically prove database-free Prism runtime or remove independently authored database SecretRefs.'
  elif n==2:name='Postgresql existing secret reference';kind='secret-reference';domain='Required selected Secret name; actual password/runtime/migrator/readonly keys consumed by StatefulSet. This differs from jobs.yaml unused precondition; role identity/revision agreement with Values.secrets.database must be explicit.';refs=find(s,'secretKeyRef:')
  elif n in (10,11,12,13):
   name={10:'Database initialization psql connection',11:'Migrator initialization password',12:'Runtime initialization password',13:'Readonly initialization password'}[n];kind='generated-database-role-input';domain='Generated init script reads exact ENV values supplied via selected existingSecret keys; SQL creates fixed roles only WHEN NOT EXISTS, grants CONNECT, creates vector/schema. This init hook is not credential rotation for existing roles; separate bootstrap-database Job has its own current contract. No secret values/privilege/native PostgreSQL execution credited.';refs=find(s,'secretKeyRef:')+find(s,'mountPath: /docker-entrypoint-initdb.d/')
  else:name='Postgresql daemon image';kind='generated-release-reference';domain='Direct selected postgresql.image, not ordinary imageRef helper; actual PostgreSQL/pgvector version, UID999 storage/PVC ownership, initializer compatibility and retained database lifecycle separate native gates.'
 assert name and domain,(s,n)
 rows.append(dict(candidateId=c['id'],originalCandidate=c,sourceRef=expr,field=name,classification=kind,currentAuthorOrGeneratedRef=author,currentValuesFields=values,currentSchemaRefs=schemaRefs,currentDomainAndRelations=domain,actualRendererOrGeneratedScriptReaderRef=expr,contextualSourceRefs=refs,
  proposedAuthority='Retain one selected role/deployment/storage/exposure/SecretRef/release policy authority as justified by current consumers; generated Kubernetes objects/ENV/init scripts are not competing authors. Whole schema/profile and setting/requirement/case joins remain open.',
  activation='Validate complete selected image/component/database/secret/namespace/provider/resource/schedule generation before delivery; no effect credited until actual consumer observes selected values. Persistent database/PVC state cannot be treated as empty on upgrade.',
  recovery='Retain original immutable generation and real database/PVC/image/role/secret-revision/topology identities. Do not overwrite retained storage, invent capacity/credentials, refresh latest into old modules or turn new values into old facts.',remaining=['whole role/schema/profile/setting/requirement/executable future case joins','real native Kubernetes/CNI/Tailscale/database/storage/image/secret and recovery facts','fresh independent source definition review'],definitionAccepted=False,runtimeResult='not-run'))
assert len(rows)==56 and {x['candidateId'] for x in rows}==ids
(O/'source-field-definitions.json').write_text(json.dumps(dict(scope='56 original Prism services/storage/network/ingestion/database clauses; static source definition',rows=rows,priorQueueRef=dict(path=str((P/'batch-24/remaining-batches.json').relative_to(R)),sha256=sha(P/'batch-24/remaining-batches.json')),remainingQueueUnchanged=True,globalC0Accepted=False),indent=2)+'\n')
print('56 original candidates retained; current renderer/script/schema/peer/budget relations distinct; no native effect or global C0 acceptance')
