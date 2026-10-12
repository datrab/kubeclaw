from pathlib import Path
import json,hashlib,difflib
base=Path('docs/review/evidence/config-worker-listener-20260921')
paths=['skills/prism/server/worker-config.ts','skills/common/plugin-runtime/foundation/config/swarm.ts','charts/kubeclaw/files/config/swarm-components.schema.json','charts/kubeclaw/files/config/prism-worker.config.json','docker/Dockerfile.prism-worker','charts/prism/templates/_swarm-bundle.tpl','charts/prism/templates/_swarm-config.tpl','charts/prism/templates/workloads.yaml','charts/prism/templates/services.yaml','charts/prism/templates/configmap-worker-trust.yaml','charts/prism/templates/networkpolicy.yaml','tests/verification/deployment/prism-swarm-image.mjs']
rows=[];patch=[]
for name in paths:
 p=Path(name);old=p.read_text(); s=old
 if name.endswith('worker-config.ts'):
  s=s.replace("  const spiffeEnabled =", "  if (environment.PORT !== undefined) throw new Error('SWARM_CONFIG_LEGACY_OVERRIDE:PORT moved to prism-worker.config.json settings.ingress.port');\n  const spiffeEnabled =",1).replace('port: Number(environment.PORT ?? 8080)','port: settings.port')
 elif name.endswith('/swarm.ts'):
  s=s.replace('export interface PrismWorkerSettings {','export interface PrismWorkerSettings {\n  readonly port: number;')
 elif name.endswith('swarm-components.schema.json'):
  data=json.loads(s); worker=data['$defs']['prism-worker']['properties']['ingress'];worker['required'].insert(0,'port');worker['properties']={'port':{'type':'integer','minimum':1,'maximum':65535},**worker['properties']};s=json.dumps(data,indent=2)+'\n'
 elif name.endswith('prism-worker.config.json'):
  data=json.loads(s); w=data['settings']['ingress'];data['settings']['ingress']={'port':8080,**w};s=json.dumps(data,indent=2)+'\n'
 elif name.endswith('Dockerfile.prism-worker'): s=s.replace('ENV NODE_ENV=production PORT=8080','ENV NODE_ENV=production')
 elif name.endswith('_swarm-bundle.tpl'):
  s=s.replace('$keys := list "maximumActiveRequests"','$keys := list "port" "maximumActiveRequests"')
  marker='{{- $native := $config.operator.prism.native -}}'
  s=s.replace(marker,'{{- if gt (int $worker.port) 65535 -}}{{- fail "swarm worker port must be between 1 and 65535" -}}{{- end -}}\n'+marker)
 elif name.endswith('_swarm-config.tpl'):
  s='{{- if hasKey .Values.worker "port" -}}{{- fail "worker.port moved to prism-worker.config.json settings.ingress.port" -}}{{- end -}}\n'+s if False else s
  # Guard belongs inside the named helper, not at template file top level.
  needle='{{- if hasKey .Values.worker "shutdownTimeoutMs" -}}'
  assert needle in s
  s=s.replace(needle,'{{- if hasKey .Values.worker "port" -}}{{- fail "worker.port moved to prism-worker.config.json settings.ingress.port" -}}{{- end -}}\n'+needle)
 elif name.endswith('workloads.yaml'):
  block='            {{- if eq $name "worker" }}\n            - { name: PORT, value: "8080" }\n            {{- end }}\n'
  assert block in s;s=s.replace(block,'')
  s=s.replace('(ternary (int $swarm.operator.prism.studio.port) 8080 (eq $name "studio"))','(ternary (int $swarm.operator.prism.studio.port) (int $swarm.operator.prism.worker.port) (eq $name "studio"))')
 elif name.endswith('services.yaml'):
  s=s.replace('spec: { selector: { app: prism-worker }, ports: [{ port: 8080, targetPort: 8080 }] }','spec: { selector: { app: prism-worker }, ports: [{ port: 8080, targetPort: {{ (include "prism.swarmConfig" . | fromJson).operator.prism.worker.port | int }} }] }')
 elif name.endswith('configmap-worker-trust.yaml'):
  oldtarget='load_assignment: { cluster_name: worker-local, endpoints: [{ lb_endpoints: [{ endpoint: { address: { socket_address: { address: 127.0.0.1, port_value: 8080 } } } }] }] }'
  assert oldtarget in s;s=s.replace(oldtarget,oldtarget.replace('port_value: 8080','port_value: {{ (include "prism.swarmConfig" . | fromJson).operator.prism.worker.port | int }}'))
 elif name.endswith('networkpolicy.yaml'):
  assert s.count('ternary 8443 8080 .Values.workerTrust.spiffe.enabled')==2
  s=s.replace('ternary 8443 8080 .Values.workerTrust.spiffe.enabled','ternary 8443 ((include "prism.swarmConfig" . | fromJson).operator.prism.worker.port | int) .Values.workerTrust.spiffe.enabled')
 elif name.endswith('prism-swarm-image.mjs'):
  s=s.replace('const { shutdownTimeoutMs, ...ingress } = expected;','const { shutdownTimeoutMs, port, ...ingress } = expected;\nassert.equal(actual.port, port);\nfor (const legacy of [String(port), \'\']) {\n  assert.throws(() => loadWorkerConfig({ ...process.env, SWARM_CONFIG: file, PORT: legacy }), /SWARM_CONFIG_LEGACY_OVERRIDE/);\n}')
 assert s!=old,name
 for folder,value in [('before',old),('staging/files',s)]:
  target=base/folder/name;target.parent.mkdir(parents=True,exist_ok=True);assert not target.exists();target.write_text(value)
 rows.append({'path':name,'beforeSha256':hashlib.sha256(old.encode()).hexdigest(),'stagedSha256':hashlib.sha256(s.encode()).hexdigest()})
 patch.extend(difflib.unified_diff(old.splitlines(True),s.splitlines(True),fromfile='a/'+name,tofile='b/'+name))
(base/'staged-production.patch').write_text(''.join(patch));(base/'staged-production-identities.json').write_text(json.dumps(rows,indent=2)+'\n')
