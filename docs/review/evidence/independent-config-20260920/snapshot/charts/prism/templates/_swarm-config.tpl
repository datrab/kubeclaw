{{/* Five migrated operator settings come only from the authored swarm file. */}}
{{- define "prism.swarmConfig" -}}
{{- if hasKey .Values.worker "shutdownTimeoutMs" -}}
{{- fail "worker.shutdownTimeoutMs moved to swarm.config.json operator.prism.worker.shutdownTimeoutMs" -}}
{{- end -}}
{{- $raw := required "canonical swarm.config.json is required" (.Files.Get "files/config/swarm.config.json") -}}
{{- $config := mustFromJson $raw -}}
{{- $schema := mustFromJson (.Files.Get "files/config/swarm.schema.json") -}}
{{- range $key, $value := $config -}}
{{- if not (hasKey $schema.properties $key) -}}{{- fail (printf "unsupported swarm key %s" $key) -}}{{- end -}}
{{- end -}}
{{- range $key := $schema.required -}}
{{- if not (hasKey $config $key) -}}{{- fail (printf "required swarm key %s" $key) -}}{{- end -}}
{{- end -}}
{{- range $key := list "profile" "features" "tuning" -}}
{{- if ne (toJson (index $config $key)) (toJson (index $schema.properties $key).const) -}}{{- fail (printf "unsupported swarm %s" $key) -}}{{- end -}}
{{- end -}}
{{- if and (hasKey $config "_doc") (not (kindIs "string" $config._doc)) -}}{{- fail "swarm _doc must be a string" -}}{{- end -}}
{{- if not (kindIs "map" $config.overrides) -}}{{- fail "swarm overrides must be an empty object" -}}{{- end -}}
{{- if ne (len $config.overrides) 0 -}}{{- fail "swarm overrides must be an empty object" -}}{{- end -}}
{{- if not (kindIs "map" $config.operator) -}}{{- fail "swarm operator must be an object" -}}{{- end -}}
{{- if or (ne (len $config.operator) 1) (not (hasKey $config.operator "prism")) -}}{{- fail "swarm operator supports prism only" -}}{{- end -}}
{{- if not (kindIs "map" $config.operator.prism) -}}{{- fail "swarm prism must be an object" -}}{{- end -}}
{{- if or (ne (len $config.operator.prism) 1) (not (hasKey $config.operator.prism "worker")) -}}{{- fail "swarm prism requires worker only" -}}{{- end -}}
{{- if not (kindIs "map" $config.operator.prism.worker) -}}{{- fail "swarm worker must be an object" -}}{{- end -}}
{{- $worker := dig "operator" "prism" "worker" (dict) $config -}}
{{- $keys := list "maximumActiveRequests" "maximumProbeRequests" "maximumConnections" "requestTimeoutMs" "shutdownTimeoutMs" -}}
{{- if ne (len $worker) (len $keys) -}}{{- fail "swarm worker settings must contain exactly the five supported keys" -}}{{- end -}}
{{- range $key := $keys -}}
{{- $value := index $worker $key -}}
{{- if not (kindIs "float64" $value) -}}{{- fail (printf "swarm worker %s must be an integer" $key) -}}{{- end -}}
{{- if or (lt $value (float64 1)) (gt $value (float64 2147483647)) (ne $value (floor $value)) -}}
{{- fail (printf "swarm worker %s must be a positive timer-safe integer" $key) -}}
{{- end -}}
{{- end -}}
{{- if gt (add (int $worker.maximumActiveRequests) (int $worker.maximumProbeRequests)) (int $worker.maximumConnections) -}}
{{- fail "swarm worker connection budget is too small" -}}
{{- end -}}
{{- $raw -}}
{{- end -}}
