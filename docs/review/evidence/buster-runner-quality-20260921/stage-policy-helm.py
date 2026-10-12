from pathlib import Path
root=Path(__file__).resolve().parent/'files';p=root/'charts/prism/templates/_swarm-bundle.tpl';s=p.read_text();old='{{- if or (ne (len $buster) 3) (not (hasKey $buster "preparation")) (not (hasKey $buster "admission")) (not (hasKey $buster "dependencyReadiness")) -}}{{- fail "swarm buster requires preparation, admission and dependencyReadiness only" -}}{{- end -}}';new='{{- if or (ne (len $buster) 4) (not (hasKey $buster "preparation")) (not (hasKey $buster "admission")) (not (hasKey $buster "dependencyReadiness")) (not (hasKey $buster "execution")) -}}{{- fail "swarm buster requires preparation, admission, dependencyReadiness and execution only" -}}{{- end -}}';assert old in s;s=s.replace(old,new)
block='''
{{- $execution := $buster.execution -}}
{{- if not (kindIs "map" $execution) -}}{{- fail "buster-engine.config.json execution must be an object" -}}{{- end -}}
{{- if ne (len $execution) 4 -}}{{- fail "buster execution requires provider, reports, observation and stores" -}}{{- end -}}
{{- range $key := list "provider" "reports" "observation" "stores" -}}
{{- if not (hasKey $execution $key) -}}{{- fail (printf "buster execution requires %s" $key) -}}{{- end -}}
{{- end -}}
{{- if not (kindIs "map" $execution.stores) -}}{{- fail "buster execution stores must be an object" -}}{{- end -}}
{{- if or (ne (len $execution.stores) 2) (not (hasKey $execution.stores "attempts")) (not (hasKey $execution.stores "admission")) -}}{{- fail "buster execution stores requires attempts and admission" -}}{{- end -}}
{{- $policies := dict "provider" $execution.provider "reports" $execution.reports "observation" $execution.observation "store-attempts" $execution.stores.attempts "store-admission" $execution.stores.admission -}}
{{- range $section, $policy := $policies -}}
{{- $definition := index $definitions (printf "buster-execution-%s" $section) -}}
{{- if not (kindIs "map" $policy) -}}{{- fail (printf "buster execution %s must be an object" $section) -}}{{- end -}}
{{- if ne (len $policy) (len $definition.required) -}}{{- fail (printf "buster execution %s requires exactly supported keys" $section) -}}{{- end -}}
{{- range $key := $definition.required -}}
{{- if not (hasKey $policy $key) -}}{{- fail (printf "required buster execution %s.%s" $section $key) -}}{{- end -}}
{{- $value := index $policy $key -}}
{{- if not (kindIs "float64" $value) -}}{{- fail (printf "buster execution %s.%s must be an integer" $section $key) -}}{{- end -}}
{{- $limit := index $definition.properties $key -}}
{{- if or (lt $value (float64 $limit.minimum)) (gt $value (float64 $limit.maximum)) (ne $value (floor $value)) -}}{{- fail (printf "buster execution %s.%s is outside its integer bounds" $section $key) -}}{{- end -}}
{{- if hasKey $limit "multipleOf" -}}
{{- $quotient := divf $value (float64 $limit.multipleOf) -}}
{{- if ne $quotient (floor $quotient) -}}{{- fail (printf "buster execution %s.%s must be a whole CPU second" $section $key) -}}{{- end -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- if gt $execution.provider.maximumResultBytes (subf (subf (float64 9007199254740991) $execution.reports.maximumAggregateResultBytes) (float64 4096)) -}}{{- fail "buster execution result sum is unsafe" -}}{{- end -}}
'''
s=s.replace(new,new+block);p.write_text(s)
