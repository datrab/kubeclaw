{{/* These helpers belong only in the actual trusted Nova runtime container.
     A mount does not isolate plugins/processes sharing that container. */}}
{{- define "kubeclaw.demoReadyClientValidate" -}}
{{- if .Values.busterNamespaceBroker.readyClient.enabled -}}
{{- if or (ne .Values.agentRole "nova") (not .Values.serviceAccount.create) -}}
{{- fail "Ready client requires the actual Nova release ServiceAccount" -}}
{{- end -}}
{{- if not (hasPrefix "https://" .Values.busterNamespaceBroker.readyClient.endpoint) -}}
{{- fail "Ready client requires an explicit HTTPS controller endpoint" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "kubeclaw.demoReadyClientEnv" -}}
{{- include "kubeclaw.demoReadyClientValidate" . -}}
{{- if .Values.busterNamespaceBroker.readyClient.enabled }}
- name: KUBECLAW_DEMO_READY_ENDPOINT
  value: {{ .Values.busterNamespaceBroker.readyClient.endpoint | quote }}
- name: KUBECLAW_DEMO_READY_AUDIENCE
  value: {{ required "Ready client audience is required" .Values.busterNamespaceBroker.readyClient.audience | quote }}
- name: KUBECLAW_DEMO_READY_TOKEN_PATH
  value: /var/run/kubeclaw/demo-ready/token
- name: KUBECLAW_DEMO_READY_CA_PATH
  value: /var/run/kubeclaw/demo-ready-ca/ca.crt
{{- end }}
{{- end -}}

{{- define "kubeclaw.demoReadyClientMounts" -}}
{{- if .Values.busterNamespaceBroker.readyClient.enabled }}
- { name: demo-ready-client, mountPath: /var/run/kubeclaw/demo-ready, readOnly: true }
- { name: demo-ready-ca, mountPath: /var/run/kubeclaw/demo-ready-ca, readOnly: true }
{{- end }}
{{- end -}}

{{- define "kubeclaw.demoReadyClientVolumes" -}}
{{- if .Values.busterNamespaceBroker.readyClient.enabled }}
- name: demo-ready-client
  projected:
    defaultMode: 0440
    sources:
      - serviceAccountToken:
          audience: {{ required "Ready client audience is required" .Values.busterNamespaceBroker.readyClient.audience | quote }}
          expirationSeconds: 600
          path: token
- name: demo-ready-ca
  secret:
    secretName: {{ required "Ready client CA Secret is required" .Values.busterNamespaceBroker.readyClient.caSecretName | quote }}
    items:
      - { key: ca.crt, path: ca.crt }
{{- end }}
{{- end -}}
