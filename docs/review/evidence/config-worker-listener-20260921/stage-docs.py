from pathlib import Path
import json
b=Path('docs/review/evidence/config-worker-listener-20260921')
files=['docs/operations/operator-configuration.md','docs/operations/prism-operator-guide.md','skills/common/plugin-runtime/foundation/config/README.md','docs/review/remediation/implementation/config-inventory-20260920.md','docs/review/remediation/implementation/config-inventory-20260920.json']
for name in files:
 old=Path(name).read_text();s=old
 if name.endswith('operator-configuration.md'):
  s=s.replace('the central settings described below. Worker and ingestion retain their separate\nexisting listener authorities.','the central settings described below. Worker also rejects PORT and uses its\ncomponent ingress.port; ingestion retains its separate listener authority.')
  s=s.replace('Worker legitimately\nretains PORT, while Control and Studio reject it.','Worker, Control and Studio all\nreject their retired PORT author.')
 if name.endswith('prism-operator-guide.md'):
  s=s.replace('specific to Studio; Worker and Agent retain their separately documented inputs.','specific to each role; Worker also rejects PORT and uses its own component file,\nwhile Agent retains its separately documented inputs.')
 if name.endswith('.json'):
  x=json.loads(s)
  for r in x['entries']:
   if r.get('source')=='skills/prism/server/worker-config.ts' and r.get('name')=='PORT':
    r.update(classification='operator setting',resolutionRequired='Worker listener migration staged; local/image acceptance pending',resolved={'author':'prism-worker.config.json settings.ingress.port','type':'integer','unit':'TCP port','bounds':[1,65535],'legacy':'PORT rejected including empty/equal values; Service 8080 remains stable','evidence':'config-worker-listener-20260921.md'})
  s=json.dumps(x,indent=2,ensure_ascii=False)+'\n'
 else:
  s+='''\n## Worker listener component migration\n\nThe Worker listener is authored only by `prism-worker.config.json`\n`settings.ingress.port`, explicitly 8080 in the canonical profile. The integer\nrange is 1–65535. Remove Worker `PORT` from launch environments and `worker.port`\nfrom Helm values: even empty or equal values are rejected. Missing configuration\nfails before native initialization. The Worker captures the validated setting\nonce; configuration changes require restart/rollout. Host bind permissions and\nport collisions still apply.\n\nThe public `prism-worker` Service remains 8080; its target, Worker probes,\nEnvoy `worker-local` destination and plaintext Worker network-policy edges follow\nthe authored port. SPIFFE ingress/service 8443 and sidecar routing remain unchanged.\nThis does not centralize all service topology or secret/trust settings. The\nrole-specific image gate keeps inherited environment intact and checks the actual\nWorker loader. Source tests cannot substitute for an actual built-image or native\nworker-process proof. See the [Worker listener criteria](%s).\n\nThis update is prepared in isolated staging; runtime/image acceptance is pending.\n''' % ({'docs/operations/operator-configuration.md':'../review/remediation/implementation/config-worker-listener-20260921.md','docs/operations/prism-operator-guide.md':'../review/remediation/implementation/config-worker-listener-20260921.md','skills/common/plugin-runtime/foundation/config/README.md':'../../../../../docs/review/remediation/implementation/config-worker-listener-20260921.md','docs/review/remediation/implementation/config-inventory-20260920.md':'config-worker-listener-20260921.md'}[name])
 for folder,v in [('before',old),('staging/files',s)]:
  p=b/folder/name;p.parent.mkdir(parents=True,exist_ok=True);assert not p.exists();p.write_text(v)
