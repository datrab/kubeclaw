{{- define "prism.backupJobSpec" -}}
{{- $mode := .mode -}}
# Applies to scheduled jobs and manual jobs copied from this template.
# Keep a bounded diagnostic window without retaining failed pods forever.
ttlSecondsAfterFinished: 3600
backoffLimit: 0
activeDeadlineSeconds: {{ add $.Values.backup.maximumDurationSeconds 30 }}
template:
  metadata:
    labels: { app: prism-backup }
    annotations:
      checksum/backup-script: {{ $.Files.Get "files/prism-backup.sh" | sha256sum }}
  spec:
    serviceAccountName: prism-backup
    imagePullSecrets: {{ toYaml $.Values.imagePullSecrets | nindent 6 }}
    automountServiceAccountToken: false
    # Immutable objects are mode 0600 and owned by Prism's UID 1000.
    # The source mount stays read-only; fsGroup only owns the backup PVC.
    securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000, seccompProfile: { type: RuntimeDefault } }
    restartPolicy: Never
    containers:
      # Container names are Kubernetes merge keys. Preserve the original
      # Helm identities so adoption updates the existing process instead
      # of retaining the old backup/restore program as a second container.
      - name: {{ if eq $mode "backup" }}proof{{ else if eq $mode "database-proof" }}restore-proof{{ else }}{{ $mode }}{{ end }}
        image: {{ $.Values.postgresql.image | quote }}
        command: ["bash", "/backup-program/prism-backup.sh", {{ $mode | quote }}]
        # The legacy containers put their shell program in args. Explicit
        # deletion is needed when it is absent from last-applied state.
        args: null
        env:
          - { name: BACKUP_ROOT, value: /backups }
          - { name: BACKUP_MAXIMUM_BYTES, value: {{ $.Values.backup.maximumBytes | quote }} }
          - { name: BACKUP_MAXIMUM_RETAINED_BYTES, value: {{ $.Values.backup.maximumRetainedBytes | quote }} }
          - { name: BACKUP_MAXIMUM_DURATION_SECONDS, value: {{ $.Values.backup.maximumDurationSeconds | quote }} }
          {{- if eq $mode "backup" }}
          - { name: ARTIFACT_ROOT, value: /artifacts }
          - { name: PRISM_BACKUP_IMAGE, value: {{ include "prism.imageRef" $.Values.images.control | quote }} }
          {{- end }}
          {{- if ne $mode "verify" }}
          - { name: PGCONNECT_TIMEOUT, value: "15" }
          - { name: PGHOST, value: prism-postgresql }
          - { name: PGDATABASE, value: prism }
          - { name: PGUSER, value: postgres }
          - name: PGPASSWORD
            valueFrom:
              secretKeyRef:
                name: {{ $.Values.postgresql.existingSecret }}
                key: password
          {{- end }}
        securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ["ALL"] } }
        resources: {{ toYaml $.Values.backup.resources | nindent 10 }}
        volumeMounts:
          - { name: backups, mountPath: /backups }
          - { name: program, mountPath: /backup-program, readOnly: true }
          {{- if eq $mode "backup" }}
          - { name: artifacts, mountPath: /artifacts, readOnly: true }
          {{- end }}
    volumes:
      - name: backups
        persistentVolumeClaim: { claimName: prism-backups }
      - name: program
        configMap: { name: prism-backup-script }
      {{- if eq $mode "backup" }}
      - name: artifacts
        persistentVolumeClaim: { claimName: prism-artifacts, readOnly: true }
      {{- end }}
{{- end -}}
