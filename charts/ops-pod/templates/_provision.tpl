{{- define "ops.provisionPod" -}}
metadata:
  labels: {app.kubernetes.io/name: {{ .Release.Name }}-mcp-provisioner}
spec:
  serviceAccountName: {{ .Release.Name }}-mcp-provisioner
  automountServiceAccountToken: false
  restartPolicy: Never
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 1000
    fsGroup: 1000
    seccompProfile: {type: RuntimeDefault}
  {{- with .Values.imagePullSecrets }}
  imagePullSecrets: {{ toYaml . | nindent 4 }}
  {{- end }}
  containers:
    - name: provision
      image: {{ .Values.mcpImage | quote }}
      command: [node, /app/src/provision.mjs]
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities: {drop: [ALL]}
      resources:
        requests: {cpu: 25m, memory: 64Mi}
        limits: {cpu: 500m, memory: 128Mi}
      volumeMounts:
        - {name: config, mountPath: /etc/ops-provision, readOnly: true}
        - {name: kube-api, mountPath: /var/run/secrets/kubernetes.io/serviceaccount, readOnly: true}
        - {name: tmp, mountPath: /tmp}
  volumes:
    - name: config
      configMap: {name: {{ .Release.Name }}-mcp-provisioner}
    - {name: tmp, emptyDir: {medium: Memory, sizeLimit: 8Mi}}
    - name: kube-api
      projected:
        defaultMode: 0440
        sources:
          - serviceAccountToken: {path: token, expirationSeconds: 3600}
          - configMap:
              name: kube-root-ca.crt
              items: [{key: ca.crt, path: ca.crt}]
{{- end -}}
