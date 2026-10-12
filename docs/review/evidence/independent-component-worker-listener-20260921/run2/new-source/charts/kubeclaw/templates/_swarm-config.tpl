{{/* One fixed component bundle; no alternate authored settings. */}}
{{- define "kubeclaw.swarmConfig" -}}
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
{{- if ne $config.schemaVersion "swarm-entry.v2" -}}{{- fail "swarm entry schemaVersion is invalid" -}}{{- end -}}
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
{{- $label := index (dict "prism-control" "control" "prism-worker" "worker" "prism-studio" "studio" "prism-execution" "native" "buster-engine" "buster") $owner -}}
{{- if not (kindIs "map" $component.settings) -}}{{- fail (printf "swarm %s settings must be an object" $label) -}}{{- end -}}
{{- $_ := set $components $owner $component.settings -}}
{{- end -}}
{{- $control := index $components "prism-control" -}}
{{- $worker := index $components "prism-worker" -}}
{{- $execution := index $components "prism-execution" -}}
{{- if not (hasKey $control "dispatchTimeoutMs") -}}{{- fail "swarm native dispatchTimeoutMs required in prism-control.config.json" -}}{{- end -}}
{{- if ne (len $control) 5 -}}{{- fail "swarm control requires exactly five settings" -}}{{- end -}}
{{- if or (ne (len $worker) 2) (not (hasKey $worker "ingress")) (not (hasKey $worker "supervisor")) -}}{{- fail "swarm worker requires ingress and supervisor only" -}}{{- end -}}
{{- if or (ne (len $execution) 2) (not (hasKey $execution "resourcePolicy")) (not (hasKey $execution "maximumResultBytes")) -}}{{- fail "swarm native requires resourcePolicy and maximumResultBytes only" -}}{{- end -}}
{{- $native := dict "resourcePolicy" $execution.resourcePolicy "maximumResultBytes" $execution.maximumResultBytes "dispatchTimeoutMs" $control.dispatchTimeoutMs "supervisor" $worker.supervisor -}}
{{- $_ := set $config "operator" (dict "prism" (dict "control" (omit $control "dispatchTimeoutMs") "studio" (index $components "prism-studio") "worker" $worker.ingress "native" $native) "buster" (index $components "buster-engine")) -}}
{{- $componentSchema := mustFromJson (required "component schema required" (.Files.Get "files/config/swarm-components.schema.json")) -}}
{{- $definitions := index $componentSchema "$defs" -}}
{{- if not (kindIs "map" $config.operator) -}}{{- fail "swarm operator must be an object" -}}{{- end -}}
{{- if not (hasKey $config.operator "prism") -}}{{- fail "swarm operator requires prism" -}}{{- end -}}
{{- range $key, $value := $config.operator -}}
{{- if not (has $key (list "prism" "buster")) -}}{{- fail (printf "unsupported swarm operator %s" $key) -}}{{- end -}}
{{- end -}}
{{- if hasKey $config.operator "buster" -}}
{{- $buster := $config.operator.buster -}}
{{- if not (kindIs "map" $buster) -}}{{- fail "swarm buster must be an object" -}}{{- end -}}
{{- if or (ne (len $buster) 2) (not (hasKey $buster "preparation")) (not (hasKey $buster "admission")) -}}{{- fail "swarm buster requires preparation and admission only" -}}{{- end -}}
{{- $admission := $buster.admission -}}
{{- $admissionDefinition := (index $definitions "buster-admission") -}}
{{- if not (kindIs "map" $admission) -}}{{- fail "swarm buster admission must be an object" -}}{{- end -}}
{{- if ne (len $admission) (len $admissionDefinition.required) -}}{{- fail "swarm buster admission requires exactly supported keys" -}}{{- end -}}
{{- range $key := $admissionDefinition.required -}}
{{- if not (hasKey $admission $key) -}}{{- fail (printf "required buster admission key %s" $key) -}}{{- end -}}
{{- $value := index $admission $key -}}
{{- if not (kindIs "float64" $value) -}}{{- fail (printf "buster admission %s must be an integer" $key) -}}{{- end -}}
{{- $limit := index $admissionDefinition.properties $key -}}
{{- if or (lt $value (float64 $limit.minimum)) (gt $value (float64 $limit.maximum)) (ne $value (floor $value)) -}}{{- fail (printf "buster admission %s is outside its integer bounds" $key) -}}{{- end -}}
{{- end -}}
{{- $preparation := $buster.preparation -}}
{{- $definition := (index $definitions "buster-preparation") -}}
{{- if not (kindIs "map" $preparation) -}}{{- fail "swarm buster preparation must be an object" -}}{{- end -}}
{{- if ne (len $preparation) (len $definition.required) -}}{{- fail "swarm buster preparation requires exactly supported keys" -}}{{- end -}}
{{- range $key := $definition.required -}}
{{- if not (hasKey $preparation $key) -}}{{- fail (printf "required buster preparation key %s" $key) -}}{{- end -}}
{{- if ne $key "resourcePolicy" -}}
{{- $value := index $preparation $key -}}
{{- if not (kindIs "float64" $value) -}}{{- fail (printf "buster preparation %s must be an integer" $key) -}}{{- end -}}
{{- $limit := index $definition.properties $key -}}
{{- if or (lt $value (float64 $limit.minimum)) (gt $value (float64 $limit.maximum)) (ne $value (floor $value)) -}}{{- fail (printf "buster preparation %s is outside its integer bounds" $key) -}}{{- end -}}
{{- end -}}
{{- end -}}
{{- $policy := $preparation.resourcePolicy -}}
{{- if not (kindIs "map" $policy) -}}{{- fail "buster preparation resourcePolicy must be an object" -}}{{- end -}}
{{- if ne (len $policy) 3 -}}{{- fail "buster preparation resourcePolicy requires exactly three limits" -}}{{- end -}}
{{- range $key := list "cpuTimeMs" "memoryBytes" "tasks" -}}
{{- $value := index $policy $key -}}
{{- if not (kindIs "float64" $value) -}}{{- fail (printf "buster preparation %s must be an integer" $key) -}}{{- end -}}
{{- if or (lt $value (float64 1)) (gt $value (float64 9007199254740991)) (ne $value (floor $value)) -}}{{- fail (printf "buster preparation %s must be a positive safe integer" $key) -}}{{- end -}}
{{- end -}}
{{- end -}}
{{- if not (kindIs "map" $config.operator.prism) -}}{{- fail "swarm prism must be an object" -}}{{- end -}}
{{- if or (ne (len $config.operator.prism) 4) (not (hasKey $config.operator.prism "worker")) (not (hasKey $config.operator.prism "native")) (not (hasKey $config.operator.prism "control")) (not (hasKey $config.operator.prism "studio")) -}}{{- fail "swarm prism requires worker, native, control and studio only" -}}{{- end -}}
{{- $studio := $config.operator.prism.studio -}}
{{- if not (kindIs "map" $studio) -}}{{- fail "swarm studio must be an object" -}}{{- end -}}
{{- if ne (len $studio) 3 -}}{{- fail "swarm studio requires exactly the supported keys" -}}{{- end -}}
{{- range $key, $maximum := dict "port" 65535 "controlTimeoutMs" 2147483647 -}}
{{- $value := index $studio $key -}}
{{- if not (kindIs "float64" $value) -}}{{- fail (printf "swarm studio %s must be an integer" $key) -}}{{- end -}}
{{- if or (lt $value (float64 1)) (gt $value (float64 $maximum)) (ne $value (floor $value)) -}}{{- fail (printf "swarm studio %s is outside its integer bounds" $key) -}}{{- end -}}
{{- end -}}
{{- if not (kindIs "string" $studio.controlUrl) -}}{{- fail "swarm studio controlUrl must be a string" -}}{{- end -}}
{{- $control := $config.operator.prism.control -}}
{{- if not (kindIs "map" $control) -}}{{- fail "swarm control must be an object" -}}{{- end -}}
{{- if or (ne (len $control) 4) (not (hasKey $control "pipelinePreferenceSubject")) (not (hasKey $control "artifactRoot")) (not (hasKey $control "studioPublicUrl")) (not (hasKey $control "port")) -}}{{- fail "swarm control requires exactly the supported keys" -}}{{- end -}}
{{- if not (kindIs "float64" $control.port) -}}{{- fail "swarm control port must be an integer" -}}{{- end -}}
{{- if or (lt $control.port (float64 1)) (gt $control.port (float64 65535)) (ne $control.port (floor $control.port)) -}}{{- fail "swarm control port must be an integer from 1 to 65535" -}}{{- end -}}
{{- if ne $control.pipelinePreferenceSubject nil -}}
{{- if not (kindIs "string" $control.pipelinePreferenceSubject) -}}{{- fail "swarm control pipelinePreferenceSubject must be null or a user ID" -}}{{- end -}}
{{- if not (regexMatch "^user-[a-f0-9]{24}$" $control.pipelinePreferenceSubject) -}}{{- fail "swarm control pipelinePreferenceSubject is invalid" -}}{{- end -}}
{{- end -}}
{{- if not (kindIs "string" $control.artifactRoot) -}}{{- fail "swarm control artifactRoot must be a path" -}}{{- end -}}
{{- if or (not (regexMatch "^/[^\\x00]+$" $control.artifactRoot)) (ne (clean $control.artifactRoot) $control.artifactRoot) -}}{{- fail "swarm control artifactRoot must be a normalized absolute non-root path" -}}{{- end -}}
{{- if not (kindIs "string" $control.studioPublicUrl) -}}{{- fail "swarm control studioPublicUrl must be an HTTP(S) URL" -}}{{- end -}}
{{- if not (regexMatch "^https?://[^/?#\\s@]+(?:/[^?#\\s]*)?$" $control.studioPublicUrl) -}}{{- fail "swarm control studioPublicUrl is invalid" -}}{{- end -}}
{{- $_ := urlParse $control.studioPublicUrl -}}
{{- if not (kindIs "map" $config.operator.prism.worker) -}}{{- fail "swarm worker must be an object" -}}{{- end -}}
{{- $worker := dig "operator" "prism" "worker" (dict) $config -}}
{{- $keys := list "port" "maximumActiveRequests" "maximumProbeRequests" "maximumConnections" "requestTimeoutMs" "shutdownTimeoutMs" "maximumInputBytes" -}}
{{- if ne (len $worker) (len $keys) -}}{{- fail "swarm worker settings must contain exactly the supported keys" -}}{{- end -}}
{{- range $key := $keys -}}
{{- $value := index $worker $key -}}
{{- if not (kindIs "float64" $value) -}}{{- fail (printf "swarm worker %s must be an integer" $key) -}}{{- end -}}
{{- if or (lt $value (float64 1)) (gt $value (float64 2147483647)) (ne $value (floor $value)) -}}
{{- fail (printf "swarm worker %s must be a positive timer-safe integer" $key) -}}
{{- end -}}
{{- end -}}
{{- if gt (int $worker.port) 65535 -}}{{- fail "swarm worker port must be between 1 and 65535" -}}{{- end -}}
{{- $native := $config.operator.prism.native -}}
{{- if not (kindIs "map" $native) -}}{{- fail "swarm native must be an object" -}}{{- end -}}
{{- if ne (len $native) 4 -}}{{- fail "swarm native settings must contain exactly the supported keys" -}}{{- end -}}
{{- range $key := list "maximumResultBytes" "dispatchTimeoutMs" -}}
{{- $value := index $native $key -}}
{{- if not (kindIs "float64" $value) -}}{{- fail (printf "swarm native %s must be an integer" $key) -}}{{- end -}}
{{- if or (lt $value (float64 1)) (gt $value (float64 2147483647)) (ne $value (floor $value)) -}}
{{- fail (printf "swarm native %s must be a positive timer-safe integer" $key) -}}
{{- end -}}
{{- end -}}
{{- $supervisor := $native.supervisor -}}
{{- if not (kindIs "map" $supervisor) -}}{{- fail "swarm supervisor must be an object" -}}{{- end -}}
{{- $supervisorKeys := list "uid" "gid" "maximumOwnershipRecords" "maximumOwnershipBytes" "maximumOutputBytes" "maximumJournalBytes" "pollIntervalMs" "drainTimeoutMs" "closeTimeoutMs" -}}
{{- if ne (len $supervisor) (len $supervisorKeys) -}}{{- fail "swarm supervisor requires exactly the supported keys" -}}{{- end -}}
{{- range $key := $supervisorKeys -}}
{{- $value := index $supervisor $key -}}
{{- $maximum := ternary (float64 9007199254740991) (float64 2147483647) (eq $key "maximumJournalBytes") -}}
{{- if not (kindIs "float64" $value) -}}{{- fail (printf "swarm supervisor %s must be an integer" $key) -}}{{- end -}}
{{- if or (lt $value (float64 1)) (gt $value $maximum) (ne $value (floor $value)) -}}{{- fail (printf "swarm supervisor %s exceeds its positive integer bound" $key) -}}{{- end -}}
{{- end -}}
{{- if le (int $worker.shutdownTimeoutMs) (add (int $supervisor.closeTimeoutMs) (int $supervisor.drainTimeoutMs)) -}}{{- fail "swarm worker shutdown must cover native close plus drain" -}}{{- end -}}
{{- $policy := $native.resourcePolicy -}}
{{- if not (kindIs "map" $policy) -}}{{- fail "swarm resourcePolicy must be an object" -}}{{- end -}}
{{- if ne (len $policy) 3 -}}{{- fail "swarm resourcePolicy requires exactly cpuTimeMs, memoryBytes and tasks" -}}{{- end -}}
{{- range $key := list "cpuTimeMs" "memoryBytes" "tasks" -}}
{{- $value := index $policy $key -}}
{{- if not (kindIs "float64" $value) -}}{{- fail (printf "swarm resourcePolicy %s must be an integer" $key) -}}{{- end -}}
{{- if or (lt $value (float64 1)) (gt $value (float64 9007199254740991)) (ne $value (floor $value)) -}}
{{- fail (printf "swarm resourcePolicy %s must be a positive safe integer" $key) -}}
{{- end -}}
{{- end -}}
{{- if gt (add (int $worker.maximumActiveRequests) (int $worker.maximumProbeRequests)) (int $worker.maximumConnections) -}}
{{- fail "swarm worker connection budget is too small" -}}
{{- end -}}
{{- $b := $config.operator.buster.preparation -}}
{{- range $key := list "maximumRequestBytes" "maximumArchiveBytes" "maximumHeaderBytes" "maximumInputBytes" "maximumOutputBytes" "maximumResultBytes" -}}
{{- if gt (index $b $key) (float64 2147483647) -}}{{- fail "swarm Buster buffer limit invalid" -}}{{- end -}}
{{- end -}}
{{- if or (gt $b.maximumArchiveBytes $b.maximumRequestBytes) (ge $b.maximumHeaderBytes $b.maximumMetadataBytes) (gt $b.maximumInputBytes $b.maximumJournalBytes) (gt (addf $b.maximumResultBytes (mulf 4 $b.maximumInputBytes)) $b.maximumOutputBytes) (gt (addf $b.maximumHeaderBytes (mulf 4 $b.maximumInputBytes)) $b.maximumResultBytes) (gt $b.maximumOutputBytes $b.maximumJournalBytes) -}}{{- fail "swarm Buster storage budget invalid" -}}{{- end -}}
{{- if le $b.closeTimeoutMs $b.drainTimeoutMs -}}{{- fail "swarm Buster close budget invalid" -}}{{- end -}}
{{- $reservation := addf $b.maximumRequestBytes $b.maximumArchiveBytes $b.maximumExtractedBytes $b.maximumHeaderBytes (mulf (addf $b.maximumArchiveEntries 7) $b.sourceEntryReservationBytes) -}}
{{- if or (gt $reservation (float64 9007199254740991)) (gt $reservation $b.maximumSourceBytes) (gt (addf $b.maximumArchiveEntries 7) $b.maximumSourceEntries) -}}{{- fail "swarm Buster source reservation invalid" -}}{{- end -}}
{{- toJson $config -}}
{{- end -}}

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
