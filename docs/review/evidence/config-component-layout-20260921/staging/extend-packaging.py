from pathlib import Path
import json,os
root=Path.cwd();st=root/'docs/review/evidence/config-component-layout-20260921/staging';out=st/'files'
def write(name,s):
 p=out/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s)
def source(name):return (root/name).read_text()
names=['prism-control','prism-studio','prism-worker','prism-execution','buster-engine']
# Preserve original Helm semantic validation; feed it only the strict component projection.
s=source('charts/prism/templates/_swarm-config.tpl')
a=s.index('{{- $raw :=');prefix=s[s.index('{{- if hasKey .Values.control'):a]
s=s[a:]
studio='''{{- range $key := list "port" "controlTimeoutMs" "controlUrl" -}}
{{- if hasKey $.Values.studio $key -}}{{- fail (printf "studio.%s moved to swarm.config.json operator.prism.studio" $key) -}}{{- end -}}
{{- end -}}
'''
assert studio in s;s=s.replace(studio,'');prefix+=studio
s=s.replace('{{- $raw -}}','{{- toJson $config -}}')
insert='''{{- if ne $config.schemaVersion "swarm-entry.v2" -}}{{- fail "swarm entry schemaVersion is invalid" -}}{{- end -}}
{{- if not (kindIs "map" $config.components) -}}{{- fail "swarm components must be an object" -}}{{- end -}}
{{- $owners := list "prism-control" "prism-studio" "prism-worker" "prism-execution" "buster-engine" -}}
{{- if ne (len $config.components) (len $owners) -}}{{- fail "swarm requires exactly five component references" -}}{{- end -}}
{{- $components := dict -}}
{{- range $owner := $owners -}}
{{- $name := printf "%s.config.json" $owner -}}
{{- if ne (index $config.components $owner) $name -}}{{- fail (printf "swarm component reference invalid: %s" $owner) -}}{{- end -}}
{{- $component := mustFromJson (required (printf "swarm component missing: %s" $owner) ($.Files.Get (printf "files/config/%s" $name))) -}}
{{- if not (kindIs "map" $component) -}}{{- fail "swarm component must be an object" -}}{{- end -}}
{{- if or (ne (len $component) 3) (ne $component.schemaVersion "swarm-component.v1") (ne $component.owner $owner) (not (hasKey $component "settings")) -}}{{- fail (printf "swarm component identity invalid: %s" $owner) -}}{{- end -}}
{{- if not (kindIs "map" $component.settings) -}}{{- fail "swarm settings must be an object" -}}{{- end -}}
{{- $_ := set $components $owner $component.settings -}}
{{- end -}}
{{- $control := index $components "prism-control" -}}
{{- $worker := index $components "prism-worker" -}}
{{- $execution := index $components "prism-execution" -}}
{{- if or (ne (len $control) 5) (not (hasKey $control "dispatchTimeoutMs")) -}}{{- fail "swarm Control requires exactly five settings" -}}{{- end -}}
{{- if or (ne (len $worker) 2) (not (hasKey $worker "ingress")) (not (hasKey $worker "supervisor")) -}}{{- fail "swarm Worker requires ingress and supervisor only" -}}{{- end -}}
{{- if or (ne (len $execution) 2) (not (hasKey $execution "resourcePolicy")) (not (hasKey $execution "maximumResultBytes")) -}}{{- fail "swarm Execution requires resourcePolicy and maximumResultBytes only" -}}{{- end -}}
{{- $native := dict "resourcePolicy" $execution.resourcePolicy "maximumResultBytes" $execution.maximumResultBytes "dispatchTimeoutMs" $control.dispatchTimeoutMs "supervisor" $worker.supervisor -}}
{{- $_ := set $config "operator" (dict "prism" (dict "control" (omit $control "dispatchTimeoutMs") "studio" (index $components "prism-studio") "worker" $worker.ingress "native" $native) "buster" (index $components "buster-engine")) -}}
{{- $componentSchema := mustFromJson (required "component schema required" (.Files.Get "files/config/swarm-components.schema.json")) -}}
{{- $definitions := index $componentSchema "$defs" -}}
'''
marker='{{- if not (kindIs "map" $config.operator)'
pos=s.index(marker);s=s[:pos]+insert+s[pos:]
s=s.replace('$schema.properties.operator.properties.buster.properties.admission','(index $definitions "buster-admission")').replace('$schema.properties.operator.properties.buster.properties.preparation','(index $definitions "buster-preparation")')
# Strict component loader is shared by both charts; topology restrictions stay Prism-only.
a=s.index('{{- $origins :=');b=s.index('{{- $control := $config.operator.prism.control -}}',a)
topology=s[a:b];s=s[:a]+s[b:]
# Loader's same relational Buster budgets, absent from old Prism-only helper.
pos=s.index('{{- toJson $config -}}')
budgets='''{{- $b := $config.operator.buster.preparation -}}
{{- range $key := list "maximumRequestBytes" "maximumArchiveBytes" "maximumHeaderBytes" "maximumInputBytes" "maximumOutputBytes" "maximumResultBytes" -}}
{{- if gt (index $b $key) (float64 2147483647) -}}{{- fail "swarm Buster buffer limit invalid" -}}{{- end -}}
{{- end -}}
{{- if or (gt $b.maximumArchiveBytes $b.maximumRequestBytes) (ge $b.maximumHeaderBytes $b.maximumMetadataBytes) (gt $b.maximumInputBytes $b.maximumJournalBytes) (gt (addf $b.maximumResultBytes (mulf 4 $b.maximumInputBytes)) $b.maximumOutputBytes) (gt (addf $b.maximumHeaderBytes (mulf 4 $b.maximumInputBytes)) $b.maximumResultBytes) (gt $b.maximumOutputBytes $b.maximumJournalBytes) -}}{{- fail "swarm Buster storage budget invalid" -}}{{- end -}}
{{- if le $b.closeTimeoutMs $b.drainTimeoutMs -}}{{- fail "swarm Buster close budget invalid" -}}{{- end -}}
{{- $reservation := addf $b.maximumRequestBytes $b.maximumArchiveBytes $b.maximumExtractedBytes $b.maximumHeaderBytes (mulf (addf $b.maximumArchiveEntries 7) $b.sourceEntryReservationBytes) -}}
{{- if or (gt $reservation (float64 9007199254740991)) (gt $reservation $b.maximumSourceBytes) (gt (addf $b.maximumArchiveEntries 7) $b.maximumSourceEntries) -}}{{- fail "swarm Buster source reservation invalid" -}}{{- end -}}
'''
s=s[:pos]+budgets+s[pos:]
shared='{{/* One fixed component bundle; no alternate authored settings. */}}\n{{- define "kubeclaw.swarmConfig" -}}\n'+s
shared+='''
{{- define "kubeclaw.swarmBundle" -}}
{{- if hasKey .Values "swarmConfigJson" -}}{{- fail "swarmConfigJson duplicates the component bundle author" -}}{{- end -}}
{{- $_ := include "kubeclaw.swarmConfig" . -}}
{{- $bundle := dict -}}
{{- range $name := list "swarm" "prism-control" "prism-studio" "prism-worker" "prism-execution" "buster-engine" -}}
{{- $file := printf "%s.config.json" $name -}}
{{- $_ := set $bundle $file ($.Files.Get (printf "files/config/%s" $file)) -}}
{{- end -}}
{{- toJson $bundle -}}
{{- end -}}
'''
write('charts/kubeclaw/templates/_swarm-config.tpl',shared)
write('charts/prism/templates/_swarm-config.tpl','{{- define "prism.swarmConfig" -}}\n'+prefix+'{{- $config := include "kubeclaw.swarmConfig" . | mustFromJson -}}\n{{- $studio := $config.operator.prism.studio -}}\n'+topology+'{{- toJson $config -}}\n{{- end -}}\n')
links={
 'charts/prism/templates/_swarm-bundle.tpl':'../../kubeclaw/templates/_swarm-config.tpl',
 'charts/kubeclaw/files/config/swarm.schema.json':'../../../../skills/common/plugin-runtime/foundation/config/swarm.schema.json',
 'charts/kubeclaw/files/config/swarm-components.schema.json':'../../../../skills/common/plugin-runtime/foundation/config/swarm-components.schema.json',
 'charts/prism/files/config/swarm-components.schema.json':'../../../../skills/common/plugin-runtime/foundation/config/swarm-components.schema.json',
 **{'charts/prism/files/config/'+n+'.config.json':'../../../kubeclaw/files/config/'+n+'.config.json' for n in names}}
for name,target in links.items():
 p=out/name;p.parent.mkdir(parents=True,exist_ok=True)
 if p.is_symlink():p.unlink()
 p.symlink_to(target)
# Configmaps carry raw source component files, never reconstructed inline config.
s=source('charts/kubeclaw/templates/configmap-swarm-config.yaml');a=s.index('  swarm.config.json:');b=s.index('  .semgrep.yml:',a)
s=s[:a]+'''{{- range $name, $contents := (include "kubeclaw.swarmBundle" . | mustFromJson) }}
  {{ $name }}: |
{{ $contents | indent 4 }}
{{- end }}
'''+s[b:];write('charts/kubeclaw/templates/configmap-swarm-config.yaml',s)
s=source('charts/prism/templates/configmap-swarm-config.yaml');a=s.index('  swarm.config.json:')
s=s[:a]+'''{{- $_ := include "prism.swarmConfig" . }}
{{- range $name, $contents := (include "kubeclaw.swarmBundle" . | mustFromJson) }}
  {{ $name }}: |
{{ $contents | indent 4 }}
{{- end }}
''';write('charts/prism/templates/configmap-swarm-config.yaml',s)
s=source('charts/prism/templates/workloads.yaml').replace('include "prism.swarmConfig" $ | sha256sum','include "kubeclaw.swarmBundle" $ | sha256sum');write('charts/prism/templates/workloads.yaml',s)
s=source('charts/kubeclaw/templates/_buster-native.tpl').replace('"value" "/etc/kubeclaw/swarm.config.json"','"value" "/etc/kubeclaw/swarm/swarm.config.json"').replace('"mountPath" "/etc/kubeclaw/swarm.config.json" "subPath" "swarm.config.json"','"mountPath" "/etc/kubeclaw/swarm"');write('charts/kubeclaw/templates/_buster-native.tpl',s)
s=source('docker/Dockerfile.buster-runtime').replace('COPY charts/kubeclaw/files/config/swarm.config.json /etc/kubeclaw/swarm.config.json','COPY '+ ' '.join('charts/kubeclaw/files/config/'+n+'.config.json' for n in ['swarm',*names])+' /etc/kubeclaw/swarm/').replace('ENV SWARM_CONFIG=/etc/kubeclaw/swarm.config.json','ENV SWARM_CONFIG=/etc/kubeclaw/swarm/swarm.config.json');write('docker/Dockerfile.buster-runtime',s)
s=source('docker/Dockerfile.prism-studio').replace('source=charts/kubeclaw/files/config/swarm.config.json,target=/tmp/studio-authored.json','source=charts/kubeclaw/files/config,target=/tmp/studio-authored').replace('SWARM_CONFIG=/tmp/studio-authored.json','SWARM_CONFIG=/tmp/studio-authored/swarm.config.json');write('docker/Dockerfile.prism-studio',s)
s=source('scripts/updates/release-configuration.mjs');pos=s.index('\n};',s.index('const configurationAliases'))
s=s[:pos]+''.join('\n  '+json.dumps(k)+': '+json.dumps(v)+',' for k,v in links.items())+s[pos:];write('scripts/updates/release-configuration.mjs',s)
print('Staged shared Helm validation/delivery and image patches, unexecuted.')
