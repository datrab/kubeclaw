{{/* One selected complete Buster owner document; no keywise settings merges. */}}
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
{{- $owners := list "prism-control" "prism-studio" "prism-worker" "prism-execution" "buster-engine" "worker-core" -}}
{{- if ne (len $config.components) (len $owners) -}}{{- fail "swarm requires exactly six component references" -}}{{- end -}}
{{- $components := dict -}}
{{- range $owner := $owners -}}
{{- $name := printf "%s.config.json" $owner -}}
{{- if ne (index $config.components $owner) $name -}}{{- fail (printf "swarm component reference invalid: %s" $owner) -}}{{- end -}}
{{- $componentRaw := $.Files.Get (printf "files/config/%s" $name) -}}
{{- if eq $owner "buster-engine" -}}{{- $componentRaw = include "kubeclaw.busterComponentRaw" $ -}}{{- end -}}
{{- $component := mustFromJson (required (printf "swarm component missing: %s" $owner) $componentRaw) -}}
{{- if not (kindIs "map" $component) -}}{{- fail "swarm component must be an object" -}}{{- end -}}
{{- if or (ne (len $component) 3) (ne $component.schemaVersion "swarm-component.v1") (ne $component.owner $owner) (not (hasKey $component "settings")) -}}{{- fail (printf "swarm component identity invalid: %s" $owner) -}}{{- end -}}
{{- $label := index (dict "prism-control" "control" "prism-worker" "worker" "prism-studio" "studio" "prism-execution" "native" "buster-engine" "buster" "worker-core" "worker-core") $owner -}}
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
{{- $core := index $components "worker-core" -}}
{{- if or (ne (len $core) 1) (not (hasKey $core "localRuntime")) (not (kindIs "map" $core.localRuntime)) -}}{{- fail "worker-core.config.json settings.localRuntime is required" -}}{{- end -}}
{{- $local := $core.localRuntime -}}
{{- if ne (len $local) 3 -}}{{- fail "worker-core.config.json localRuntime requires exactly three settings" -}}{{- end -}}
{{- range $key := list "drainTimeoutMs" "cancellationTimeoutMs" "replayLimit" -}}
{{- $value := index $local $key -}}
{{- $maximum := ternary (float64 1000000) (float64 2147483647) (eq $key "replayLimit") -}}
{{- if not (kindIs "float64" $value) -}}{{- fail (printf "worker-core.config.json localRuntime.%s must be an integer" $key) -}}{{- end -}}
{{- if or (lt $value (float64 1)) (gt $value $maximum) (ne $value (floor $value)) -}}{{- fail (printf "worker-core.config.json localRuntime.%s is out of range" $key) -}}{{- end -}}
{{- end -}}
{{- if not (kindIs "map" $config.operator) -}}{{- fail "swarm operator must be an object" -}}{{- end -}}
{{- if not (hasKey $config.operator "prism") -}}{{- fail "swarm operator requires prism" -}}{{- end -}}
{{- range $key, $value := $config.operator -}}
{{- if not (has $key (list "prism" "buster")) -}}{{- fail (printf "unsupported swarm operator %s" $key) -}}{{- end -}}
{{- end -}}
{{- if hasKey $config.operator "buster" -}}
{{- $buster := $config.operator.buster -}}
{{- if not (kindIs "map" $buster) -}}{{- fail "swarm buster must be an object" -}}{{- end -}}
{{- if or (ne (len $buster) 5) (not (hasKey $buster "preparation")) (not (hasKey $buster "admission")) (not (hasKey $buster "dependencyReadiness")) (not (hasKey $buster "execution")) (not (hasKey $buster "clusterInvokers")) -}}{{- fail "swarm buster requires preparation, admission, dependencyReadiness, execution and clusterInvokers only" -}}{{- end -}}
{{- $cluster := $buster.clusterInvokers -}}
{{- include "kubeclaw.validateClusterPolicy" (dict "value" $cluster "schema" (index $definitions "buster-cluster-invokers") "name" "clusterInvokers") -}}
{{- if or (gt $cluster.kubernetesFixture.maximumPersistentVolumeClaimBytes $cluster.kubernetesFixture.maximumPersistentVolumeTotalBytes) (gt $cluster.tailscaleExposure.pollIntervalMs $cluster.tailscaleExposure.maximumExecutionMs) (gt (mulf $cluster.kubernetesFixture.maximumManifestBytes $cluster.kubernetesFixture.commandOutputManifestMultiplier) (float64 9007199254740991)) -}}{{- fail "buster cluster policy coherence invalid" -}}{{- end -}}
{{- if gt $cluster.runtimeSecurity.pollIntervalMs $cluster.runtimeSecurity.maximumObservationAgeMs -}}{{- fail "buster cluster runtime security policy coherence invalid" -}}{{- end -}}
{{- range $suffix := $cluster.tailscaleExposure.allowedHostSuffixes -}}
{{- if contains ".." $suffix -}}{{- fail "buster cluster host suffix invalid" -}}{{- end -}}
{{- end -}}
{{- $execution := $buster.execution -}}
{{- if not (kindIs "map" $execution) -}}{{- fail "buster-engine.config.json execution must be an object" -}}{{- end -}}
{{- if ne (len $execution) 5 -}}{{- fail "buster execution requires provider, reports, observation, stores and processInput" -}}{{- end -}}
{{- range $key := list "provider" "reports" "observation" "stores" "processInput" -}}
{{- if not (hasKey $execution $key) -}}{{- fail (printf "buster execution requires %s" $key) -}}{{- end -}}
{{- end -}}
{{- if not (kindIs "map" $execution.stores) -}}{{- fail "buster execution stores must be an object" -}}{{- end -}}
{{- if or (ne (len $execution.stores) 2) (not (hasKey $execution.stores "attempts")) (not (hasKey $execution.stores "admission")) -}}{{- fail "buster execution stores requires attempts and admission" -}}{{- end -}}
{{- $policies := dict "processInput" $execution.processInput "provider" $execution.provider "reports" $execution.reports "observation" $execution.observation "store-attempts" $execution.stores.attempts "store-admission" $execution.stores.admission -}}
{{- range $section, $policy := $policies -}}
{{- $definition := index $definitions (printf "buster-execution-%s" $section) -}}
{{- if not (kindIs "map" $policy) -}}{{- fail (printf "buster execution %s must be an object" $section) -}}{{- end -}}
{{- if ne (len $policy) (len $definition.required) -}}{{- fail (printf "buster execution %s requires exactly supported keys" $section) -}}{{- end -}}
{{- range $key := $definition.required -}}
{{- if not (hasKey $policy $key) -}}{{- fail (printf "required buster execution %s.%s" $section $key) -}}{{- end -}}
{{- $value := index $policy $key -}}
{{- if not (kindIs "float64" $value) -}}{{- fail (printf "buster execution %s.%s must be a number" $section $key) -}}{{- end -}}
{{- $limit := index $definition.properties $key -}}
{{- if and (hasKey $limit "exclusiveMinimum") (le $value (float64 $limit.exclusiveMinimum)) -}}{{- fail (printf "buster execution %s.%s is below its exclusive bound" $section $key) -}}{{- end -}}
{{- if or (and (hasKey $limit "minimum") (lt $value (float64 $limit.minimum))) (gt $value (float64 $limit.maximum)) (and (eq $limit.type "integer") (ne $value (floor $value))) -}}{{- fail (printf "buster execution %s.%s is outside its numeric bounds" $section $key) -}}{{- end -}}
{{- if hasKey $limit "multipleOf" -}}
{{- $quotient := divf $value (float64 $limit.multipleOf) -}}
{{- if ne $quotient (floor $quotient) -}}{{- fail (printf "buster execution %s.%s must be a whole CPU second" $section $key) -}}{{- end -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- if gt $execution.provider.maximumResultBytes (subf (subf (float64 9007199254740991) $execution.reports.maximumAggregateResultBytes)  $execution.provider.workerResultWrapperBytes) -}}{{- fail "buster execution result sum is unsafe" -}}{{- end -}}
{{- if ge $execution.provider.terminationGraceMs $execution.provider.terminationTimeoutMs -}}{{- fail "buster execution termination grace must precede termination timeout" -}}{{- end -}}
{{- if or (ge $execution.processInput.terminationGraceMs $execution.processInput.cleanupTimeoutMs) (gt $execution.processInput.acknowledgementPollMs $execution.processInput.cleanupTimeoutMs) -}}{{- fail "buster execution processInput timing is invalid" -}}{{- end -}}
{{- if gt $execution.reports.minimumOpenFiles $execution.reports.maximumOpenFiles -}}{{- fail "buster execution report minimumOpenFiles exceeds maximumOpenFiles" -}}{{- end -}}
{{- $reportMemory := addf $execution.reports.runtimeMemoryReserveBytes (mulf (float64 3) $execution.reports.maximumSourceBytes) (mulf (float64 2) $execution.reports.maximumAggregateResultBytes) -}}
{{- if lt $execution.reports.memoryBytes $reportMemory -}}{{- fail "buster execution report memory cannot hold the maximum selected report profile" -}}{{- end -}}
{{- if gt $execution.stores.attempts.maximumEvidenceObjectBytes $execution.stores.attempts.maximumEvidenceBytes -}}{{- fail "buster execution evidence object exceeds pool" -}}{{- end -}}


{{- range $section, $schema := dict "admission" "buster-admission" "dependencyReadiness" "buster-dependency-readiness" -}}
{{- $policy := index $buster $section -}}
{{- $policyDefinition := index $definitions $schema -}}
{{- if not (kindIs "map" $policy) -}}{{- fail (printf "swarm buster %s must be an object" $section) -}}{{- end -}}
{{- if ne (len $policy) (len $policyDefinition.required) -}}{{- fail (printf "swarm buster %s requires exactly supported keys" $section) -}}{{- end -}}
{{- range $key := $policyDefinition.required -}}
{{- if not (hasKey $policy $key) -}}{{- fail (printf "required buster %s key %s" $section $key) -}}{{- end -}}
{{- $value := index $policy $key -}}
{{- if not (kindIs "float64" $value) -}}{{- fail (printf "buster %s %s must be an integer" $section $key) -}}{{- end -}}
{{- $limit := index $policyDefinition.properties $key -}}
{{- if or (lt $value (float64 $limit.minimum)) (gt $value (float64 $limit.maximum)) (ne $value (floor $value)) -}}{{- fail (printf "buster %s %s is outside its integer bounds" $section $key) -}}{{- end -}}
{{- end -}}
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
{{- range $name := list "swarm" "prism-control" "prism-studio" "prism-worker" "prism-execution" "buster-engine" "worker-core" -}}
{{- $file := printf "%s.config.json" $name -}}
{{- $raw := $.Files.Get (printf "files/config/%s" $file) -}}
{{- if eq $name "buster-engine" -}}{{- $raw = include "kubeclaw.busterComponentRaw" $ -}}{{- end -}}
{{- $_ := set $bundle $file $raw -}}
{{- end -}}
{{- toJson $bundle -}}
{{- end -}}

{{/* Validates only the explicit cluster policy schema vocabulary; no defaults. */}}
{{- define "kubeclaw.validateClusterPolicy" -}}
{{- $value := .value -}}{{- $schema := .schema -}}{{- $name := .name -}}
{{- if eq $schema.type "object" -}}
{{- if not (kindIs "map" $value) -}}{{- fail (printf "%s must be an object" $name) -}}{{- end -}}
{{- if ne (len $value) (len $schema.required) -}}{{- fail (printf "%s requires exactly declared fields" $name) -}}{{- end -}}
{{- range $key := $schema.required -}}
{{- if not (hasKey $value $key) -}}{{- fail (printf "%s.%s required" $name $key) -}}{{- end -}}
{{- include "kubeclaw.validateClusterPolicy" (dict "value" (index $value $key) "schema" (index $schema.properties $key) "name" (printf "%s.%s" $name $key)) -}}
{{- end -}}
{{- else if eq $schema.type "array" -}}
{{- if not (kindIs "slice" $value) -}}{{- fail (printf "%s must be an array" $name) -}}{{- end -}}
{{- if or (lt (len $value) (int $schema.minItems)) (and (hasKey $schema "maxItems") (gt (len $value) (int $schema.maxItems))) -}}{{- fail (printf "%s array bounds invalid" $name) -}}{{- end -}}
{{- range $item := $value -}}{{- include "kubeclaw.validateClusterPolicy" (dict "value" $item "schema" $schema.items "name" $name) -}}{{- end -}}
{{- else if eq $schema.type "string" -}}
{{- if not (kindIs "string" $value) -}}{{- fail (printf "%s must be a string" $name) -}}{{- end -}}
{{- if lt (len $value) (int $schema.minLength) -}}{{- fail (printf "%s cannot be empty" $name) -}}{{- end -}}
{{- if and (hasKey $schema "maxLength") (gt (len $value) (int $schema.maxLength)) -}}{{- fail (printf "%s string too long" $name) -}}{{- end -}}
{{- if and (hasKey $schema "pattern") (not (regexMatch $schema.pattern $value)) -}}{{- fail (printf "%s string invalid" $name) -}}{{- end -}}
{{- else if eq $schema.type "boolean" -}}
{{- if not (kindIs "bool" $value) -}}{{- fail (printf "%s must be boolean" $name) -}}{{- end -}}
{{- else if eq $schema.type "integer" -}}
{{- if not (kindIs "float64" $value) -}}{{- fail (printf "%s must be a number" $name) -}}{{- end -}}
{{- if or (ne $value (floor $value)) (lt $value (float64 $schema.minimum)) (gt $value (float64 $schema.maximum)) -}}{{- fail (printf "%s integer bounds invalid" $name) -}}{{- end -}}
{{- else -}}{{- fail "unsupported cluster policy schema type" -}}{{- end -}}
{{- end -}}

{{- define "kubeclaw.busterComponentRaw" -}}
{{- if not (hasKey .Values "busterComponentFile") -}}{{- fail "busterComponentFile is required" -}}{{- end -}}
{{- $file := .Values.busterComponentFile -}}
{{- if not (kindIs "string" $file) -}}{{- fail "busterComponentFile must be a string" -}}{{- end -}}
{{- if not (regexMatch "^files/config/(profiles/)?buster-engine([.][a-z0-9-]+)?[.]config[.]json$" $file) -}}{{- fail "busterComponentFile path invalid" -}}{{- end -}}
{{- if hasKey .Values "busterNamespaceBroker" -}}
{{- range $key := list "leaseApiGroup" "leaseApiVersion" -}}
{{- if hasKey $.Values.busterNamespaceBroker $key -}}{{- fail (printf "retired busterNamespaceBroker.%s; use selected Buster component" $key) -}}{{- end -}}
{{- end -}}{{- end -}}
{{- $raw := required "selected Buster component file missing or empty" (.Files.Get $file) -}}
{{- $component := mustFromJson $raw -}}
{{- if or (ne $component.owner "buster-engine") (ne $component.schemaVersion "swarm-component.v1") -}}{{- fail "selected Buster component identity invalid" -}}{{- end -}}
{{- $raw -}}
{{- end -}}
