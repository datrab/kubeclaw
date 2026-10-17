{{- define "prism.swarmConfig" -}}
{{- if hasKey .Values.control "port" -}}{{- fail "control.port moved to prism-control.config.json settings.port" -}}{{- end -}}
{{- if hasKey .Values.control "pipelinePreferenceSubject" -}}{{- fail "control.pipelinePreferenceSubject moved to prism-control.config.json settings" -}}{{- end -}}
{{- if or (hasKey .Values.control "maximumWorkerResponseBytes") (hasKey .Values.control "nativeWorkerDispatchTimeoutMs") -}}
{{- fail "Control result limit belongs to prism-execution.config.json settings.maximumResultBytes; dispatch timeout belongs to prism-control.config.json settings.dispatchTimeoutMs" -}}
{{- end -}}
{{- if hasKey .Values.control "nativeResourcePolicy" -}}
{{- fail "Control resource policy must be authored under prism-execution.config.json settings.resourcePolicy" -}}
{{- end -}}
{{- if hasKey .Values.worker "port" -}}{{- fail "worker.port moved to prism-worker.config.json settings.ingress.port" -}}{{- end -}}
{{- if hasKey .Values.worker "shutdownTimeoutMs" -}}
{{- fail "worker.shutdownTimeoutMs moved to prism-worker.config.json settings.ingress.shutdownTimeoutMs" -}}
{{- end -}}
{{- if hasKey .Values.worker.native "closeTimeoutMs" -}}{{- fail "worker.native.closeTimeoutMs moved to prism-worker.config.json settings.supervisor" -}}{{- end -}}
{{- range $key := list "port" "controlTimeoutMs" "controlUrl" -}}
{{- if hasKey $.Values.studio $key -}}{{- fail (printf "studio.%s moved to prism-studio.config.json settings" $key) -}}{{- end -}}
{{- end -}}
{{- if hasKey .Values "swarmConfigJson" -}}{{- fail "swarmConfigJson is retired; edit config/pipeline.config.json" -}}{{- end -}}
{{- if hasKey .Values "busterComponentFile" -}}{{- fail "busterComponentFile is retired in Prism; select central bindings" -}}{{- end -}}
{{- if hasKey .Values.ingestion "quarantineTtlMs" -}}{{- fail "ingestion.quarantineTtlMs moved to prism-control.config.json settings.ingestionServer" -}}{{- end -}}
{{- $config := mustFromJson (required "generated Prism topology required; run npm run config:prism:sync" (.Files.Get "files/pipeline/prism-topology.json")) -}}
{{- if ne $config.schemaVersion "pipeline-prism-chart-projection.v1" -}}{{- fail "Prism topology projection version invalid" -}}{{- end -}}
{{- if or (ne $config.deployment.namespace .Release.Namespace) (ne $config.deployment.releaseName .Release.Name) -}}{{- fail "Prism release identity must match config/pipeline.config.json bindings; regenerate images and chart together" -}}{{- end -}}
{{- if .Values.workerTrust.spiffe.enabled -}}
{{- if or (ne $config.operator.prism.control.workerUrl "http://127.0.0.1:18081") (ne $config.operator.prism.control.controlInternalUrl "http://127.0.0.1:18080") -}}{{- fail "SPIFFE requires centrally selected proxy endpoints; select the spiffe Control profile" -}}{{- end -}}
{{- else -}}
{{- if or (ne $config.operator.prism.control.workerUrl "http://prism-worker:8080") (ne $config.operator.prism.control.controlInternalUrl "http://prism-control:8080") -}}{{- fail "non-SPIFFE topology requires centrally selected direct service endpoints" -}}{{- end -}}
{{- end -}}
{{- $studio := $config.operator.prism.studio -}}
{{- $origins := list "http://prism-control:8080" (printf "http://prism-control.%s.svc:8080" .Release.Namespace) (printf "http://prism-control.%s.svc.cluster.local:8080" .Release.Namespace) -}}
{{- if not (has (trimSuffix "/" $studio.controlUrl) $origins) -}}{{- fail "Studio Helm topology requires the in-cluster prism-control HTTP service on port 8080" -}}{{- end -}}
{{- toJson $config -}}
{{- end -}}
