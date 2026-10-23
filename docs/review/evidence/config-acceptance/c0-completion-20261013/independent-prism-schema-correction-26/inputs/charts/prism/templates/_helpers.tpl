{{/* Render one immutable OCI image reference. */}}
{{- define "prism.imageRef" -}}
{{- $repository := required "Prism image repository is required" .repository -}}
{{- $digest := required "Prism image digest is required" .digest -}}
{{- if not (regexMatch "^sha256:[0-9a-f]{64}$" $digest) -}}
{{- fail "Prism image digest must be sha256:<64 lowercase hex characters>" -}}
{{- end -}}
{{- printf "%s@%s" $repository $digest -}}
{{- end -}}
