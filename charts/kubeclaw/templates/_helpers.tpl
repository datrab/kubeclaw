{{/*
Generate the full name for resources.
Uses agentRole to differentiate between agent instances.
*/}}
{{- define "kubeclaw.fullname" -}}
{{- printf "agent-%s" .Values.agentRole | trunc 63 | trimSuffix "-" -}}
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
