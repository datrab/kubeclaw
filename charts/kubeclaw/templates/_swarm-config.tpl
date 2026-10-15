{{/* Build-only projection of selected shared topology; never a runtime author. */}}
{{- define "kubeclaw.busterTopology" -}}
{{- if hasKey .Values "busterComponentFile" -}}{{- fail "busterComponentFile is retired; select central pipeline bindings" -}}{{- end -}}
{{- if hasKey .Values "swarmConfigJson" -}}{{- fail "swarmConfigJson is retired; select central pipeline bindings" -}}{{- end -}}
{{- $topology := mustFromJson (required "generated Buster topology required; run npm run config:buster:sync" (.Files.Get "files/pipeline/buster-topology.json")) -}}
{{- if ne $topology.schemaVersion "pipeline-buster-chart-projection.v1" -}}{{- fail "Buster topology projection version invalid" -}}{{- end -}}
{{- toJson $topology -}}
{{- end -}}

{{- define "kubeclaw.busterDelivery" -}}
{{- $topology := include "kubeclaw.busterTopology" . | mustFromJson -}}
{{- if or (ne $topology.deployment.namespace .Release.Namespace) (ne $topology.deployment.releaseName .Release.Name) -}}{{- fail "Buster release identity must match central bindings" -}}{{- end -}}
{{- $delivery := required "exact selected Buster image delivery receipt required; materialize runtime release" .Values.pipelineDelivery.buster -}}
{{- $expected := required "Buster parent expected receipt required" $delivery.expected -}}
{{- if or (ne $delivery.schemaVersion "buster-image-delivery.v1") (ne $delivery.namespace .Release.Namespace) (ne $delivery.releaseName .Release.Name) (ne $expected.role "buster") (ne $expected.callerId "buster-preparation") (ne $expected.schemaVersion "pipeline-expected-delivery.v1") (ne $expected.serviceInstanceId (printf "%s/%s/buster-v2-runtime" .Release.Namespace .Release.Name)) (ne $expected.generationDigest $topology.generationDigest) -}}{{- fail "Buster image delivery selection/generation mismatch" -}}{{- end -}}
{{- range $key := list "generationDigest" "selectionDigest" "packageReceiptDigest" "imageReceiptDigest" -}}
{{- if not (regexMatch "^sha256:[a-f0-9]{64}$" (index $expected $key)) -}}{{- fail "Buster image delivery digest required" -}}{{- end -}}
{{- end -}}
{{- toJson $expected -}}
{{- end -}}
