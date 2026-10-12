{{- define "kubeclaw.busterNativeContainer" -}}
{{- $root := .root -}}
{{- $container := deepCopy .container -}}
{{- $native := $root.Values.busterNative -}}
{{- if or (ne (int $root.Values.replicaCount) 1) (ne $native.namespace $root.Release.Namespace) (not $native.nodeName) (not (regexMatch "^[a-f0-9]{64}$" $native.policyDigest)) -}}
{{- fail "native Buster requires one replica and the generated namespace/node/policy binding" -}}
{{- end -}}
{{- if not (regexMatch "@sha256:[a-f0-9]{64}$" $container.image) -}}{{- fail "native Buster requires its existing release image pinned by digest" -}}{{- end -}}
{{- $env := $container.env | default list -}}
{{- range $entry := $env -}}
{{- if has $entry.name (list "BUSTER_NATIVE_POOL_POLICY_FILE" "BUSTER_ENGINE_CONTENT_DIGEST" "SWARM_CONFIG" "BUSTER_V2_MAX_ARCHIVE_BYTES" "BUSTER_V2_MAX_EXTRACTED_BYTES" "BUSTER_V2_MAX_REQUEST_BYTES" "BUSTER_V2_MAX_ACTIVE_JOBS" "BUSTER_V2_MAX_QUEUED_JOBS" "BUSTER_V2_MAX_CONCURRENT_ATTEMPTS") -}}
{{- fail (printf "%s duplicates the native Buster startup author" $entry.name) -}}
{{- end -}}
{{- end -}}
{{- $env = concat $env (list
  (dict "name" "BUSTER_NATIVE_POOL_POLICY_FILE" "value" "/etc/kubeclaw/buster-pool.json")
  (dict "name" "BUSTER_ENGINE_CONTENT_DIGEST" "value" (trimPrefix "@" (regexFind "@sha256:[a-f0-9]{64}$" $container.image)))
  (dict "name" "SWARM_CONFIG" "value" "/etc/kubeclaw/swarm/swarm.config.json")) -}}
{{- $mounts := $container.volumeMounts | default list -}}
{{- range $mount := $mounts -}}
{{- if or (hasPrefix "/app" $mount.mountPath) (hasPrefix "/opt/kubeclaw-trusted" $mount.mountPath) (hasPrefix "/run/kubeclaw-buster" $mount.mountPath) (hasPrefix "/etc/kubeclaw" $mount.mountPath) -}}
{{- fail "Buster root code/config mounts are exclusively authored by the native role" -}}
{{- end -}}
{{- end -}}
{{- $mounts = concat $mounts (list
  (dict "name" "buster-native-pool" "mountPath" "/sys/fs/cgroup/kubeclaw.slice/kubeclaw-native-pools.service/buster")
  (dict "name" "buster-native-ownership" "mountPath" "/var/lib/kubeclaw/native/buster")
  (dict "name" "buster-native-policy" "mountPath" "/etc/kubeclaw/buster-pool.json" "readOnly" true)
  (dict "name" "buster-native-node" "mountPath" "/etc/kubeclaw/native-node-id" "readOnly" true)
  (dict "name" "buster-native-runtime" "mountPath" "/etc/kubeclaw/native-runtime-identity.json" "readOnly" true)
  (dict "name" "init-swarm-config" "mountPath" "/etc/kubeclaw/swarm" "readOnly" true)) -}}
{{- $_ := set $container "env" $env -}}
{{- $_ := set $container "volumeMounts" $mounts -}}
{{- include "kubeclaw.registryContainer" (dict "root" $root "container" $container) -}}
{{- end -}}
