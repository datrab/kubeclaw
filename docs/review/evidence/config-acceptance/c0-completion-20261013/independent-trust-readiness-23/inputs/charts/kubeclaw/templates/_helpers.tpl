{{/*
Generate the full name for resources.
Uses agentRole to differentiate between agent instances.
*/}}
{{- define "kubeclaw.fullname" -}}
{{- $role := required "agentRole is required" .Values.agentRole -}}
{{- if not (regexMatch "^[a-z0-9]([a-z0-9-]{0,55}[a-z0-9])?$" $role) -}}
{{- fail "agentRole must be a DNS label of at most 57 characters" -}}
{{- end -}}
{{- printf "agent-%s" $role -}}
{{- end -}}

{{/*
Resolve the canonical Service name for a configured agent role.
*/}}
{{- define "kubeclaw.agentServiceName" -}}
{{- $role := required "capability provider agentRole is required" . -}}
{{- if not (regexMatch "^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$" $role) -}}
{{- fail "capability provider agentRole must be a DNS label" -}}
{{- end -}}
{{- printf "agent-%s" $role | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels applied to all resources.
*/}}
{{- define "kubeclaw.labels" -}}
app.kubernetes.io/name: kubeclaw
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: {{ .Values.agentRole }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
kubeclaw/role: {{ .Values.agentRole }}
{{- end -}}

{{/*
Selector labels for pods.
*/}}
{{- define "kubeclaw.selectorLabels" -}}
app.kubernetes.io/name: kubeclaw
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Resolve the secret name for the gateway token.
*/}}
{{- define "kubeclaw.gatewaySecretName" -}}
{{- if .Values.auth.existingSecret -}}
{{- .Values.auth.existingSecret -}}
{{- else -}}
{{- include "kubeclaw.fullname" . }}-gateway
{{- end -}}
{{- end -}}

{{/*
Resolve the secret key for the gateway token.
*/}}
{{- define "kubeclaw.gatewaySecretKey" -}}
{{- if .Values.auth.existingSecret -}}
{{- .Values.auth.existingSecretKey -}}
{{- else -}}
gatewayToken
{{- end -}}
{{- end -}}

{{/*
Resolve the LiteLLM API key secret name.
*/}}
{{- define "kubeclaw.litellmSecretName" -}}
{{- if .Values.litellm.existingSecret -}}
{{- .Values.litellm.existingSecret -}}
{{- else -}}
{{- include "kubeclaw.fullname" . }}-gateway
{{- end -}}
{{- end -}}

{{/*
Resolve the LiteLLM API key secret key.
*/}}
{{- define "kubeclaw.litellmSecretKey" -}}
{{- if .Values.litellm.existingSecret -}}
{{- .Values.litellm.existingSecretKey -}}
{{- else -}}
litellmApiKey
{{- end -}}
{{- end -}}

{{/*
Resolve the Discord token secret name.
*/}}
{{- define "kubeclaw.discordSecretName" -}}
{{- if .Values.discord.existingSecret -}}
{{- .Values.discord.existingSecret -}}
{{- else -}}
{{- include "kubeclaw.fullname" . }}-gateway
{{- end -}}
{{- end -}}

{{/*
Resolve the Discord token secret key.
*/}}
{{- define "kubeclaw.discordSecretKey" -}}
{{- if .Values.discord.existingSecret -}}
{{- .Values.discord.existingSecretKey -}}
{{- else -}}
discordToken
{{- end -}}
{{- end -}}

{{/*
Resolve the Stitch API key secret name.
*/}}
{{- define "kubeclaw.stitchSecretName" -}}
{{- if .Values.stitch.existingSecret -}}
{{- .Values.stitch.existingSecret -}}
{{- else -}}
{{- include "kubeclaw.fullname" . }}-gateway
{{- end -}}
{{- end -}}

{{/*
Resolve the Stitch API key secret key.
*/}}
{{- define "kubeclaw.stitchSecretKey" -}}
{{- if .Values.stitch.existingSecret -}}
{{- .Values.stitch.existingSecretKey -}}
{{- else -}}
stitchApiKey
{{- end -}}
{{- end -}}

{{/* A release overlay selects an immutable artifact; development values may retain tags. */}}
{{- define "kubeclaw.image" -}}
{{- if .digest -}}
{{- if not (regexMatch "^sha256:[a-f0-9]{64}$" .digest) -}}
{{- fail "image.digest must be sha256 followed by 64 lowercase hex characters" -}}
{{- end -}}
{{- printf "%s@%s" .repository .digest -}}
{{- else -}}
{{- printf "%s:%s" .repository .tag -}}
{{- end -}}
{{- end -}}
