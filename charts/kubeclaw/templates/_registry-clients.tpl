{{- define "kubeclaw.registryContainer" -}}
{{- $root := .root -}}
{{- $container := deepCopy .container -}}
{{- $settings := $root.Values.runtimeInfrastructure -}}
{{- range $key, $_ := $settings -}}{{- if not (has $key (list "registry" "dockerHubMirror" "localRegistry")) -}}{{- fail (printf "unknown runtimeInfrastructure field %s" $key) -}}{{- end -}}{{- end -}}
{{- range $name, $client := dict "registry" $settings.registry "dockerHubMirror" $settings.dockerHubMirror -}}
  {{- $allowed := list "endpoint" "transport" "caSecretName" "caSecretKey" "nodeCaFile" -}}
  {{- if eq $name "registry" -}}{{- $allowed = concat $allowed (list "authSecretName" "usernameKey" "passwordKey") -}}{{- end -}}
  {{- range $key, $_ := $client -}}{{- if not (has $key $allowed) -}}{{- fail (printf "unknown runtimeInfrastructure.%s field %s" $name $key) -}}{{- end -}}{{- end -}}
{{- end -}}
{{- if and (empty $settings.dockerHubMirror.endpoint) (or $settings.dockerHubMirror.transport $settings.dockerHubMirror.caSecretName $settings.dockerHubMirror.nodeCaFile) -}}{{- fail "disabled Docker Hub mirror requires empty endpoint, transport and trust" -}}{{- end -}}
{{- if $settings.localRegistry -}}{{- fail "runtimeInfrastructure.localRegistry was replaced; configure runtimeInfrastructure.registry endpoint/transport/auth explicitly (docs/operations/registry-clients.md)" -}}{{- end -}}
{{- $registry := deepCopy $settings.registry -}}
{{- $mirror := deepCopy $settings.dockerHubMirror -}}
{{- range $name, $client := dict "registry" $registry "dockerHubMirror" $mirror -}}
  {{- if or (eq $name "registry") $client.endpoint -}}
    {{- $endpoint := required (printf "runtimeInfrastructure.%s.endpoint is required; configure a node-reachable registry origin" $name) $client.endpoint -}}
    {{- if not (has $client.transport (list "https" "http-lab")) -}}{{- fail (printf "runtimeInfrastructure.%s.transport must explicitly select https or http-lab" $name) -}}{{- end -}}
    {{- $scheme := ternary "https://" "http://" (eq $client.transport "https") -}}
    {{- if not (and (hasPrefix $scheme $endpoint) (regexMatch "^https?://[a-z0-9.-]+(:[0-9]+)?/?$" $endpoint)) -}}{{- fail (printf "runtimeInfrastructure.%s endpoint scheme/host does not match transport" $name) -}}{{- end -}}
    {{- if ne (not (empty $client.caSecretName)) (not (empty $client.nodeCaFile)) -}}{{- fail "custom CA requires both caSecretName and nodeCaFile" -}}{{- end -}}
    {{- if and $client.nodeCaFile (not (regexMatch "^/[^\r\n]+$" $client.nodeCaFile)) -}}{{- fail "nodeCaFile must be an absolute host path" -}}{{- end -}}
    {{- if $client.caSecretName -}}
      {{- if ne $client.transport "https" -}}{{- fail "registry CA requires HTTPS" -}}{{- end -}}
      {{- $_ := required (printf "runtimeInfrastructure.%s.nodeCaFile is required with custom CA" $name) $client.nodeCaFile -}}
      {{- $_ := set $client "caFile" (printf "/var/run/kubeclaw-%s-trust/ca.crt" $name) -}}
    {{- end -}}
  {{- end -}}
{{- end -}}
{{- if and $mirror.endpoint (eq (trimSuffix "/" $mirror.endpoint) (trimSuffix "/" $registry.endpoint)) -}}{{- fail "writable registry and Docker Hub mirror must be distinct" -}}{{- end -}}
{{- if and $mirror.endpoint (or (regexMatch "^https?://docker[.]io/?$" $mirror.endpoint) (regexMatch "^https?://docker[.]io/?$" $registry.endpoint)) -}}{{- fail "Docker Hub mirror routing collides with docker.io endpoint" -}}{{- end -}}
{{- $env := list (dict "name" "KUBECLAW_REGISTRY_CONFIG" "value" (toJson (dict "schemaVersion" "registry-clients.v1" "registry" $registry "dockerHubMirror" $mirror))) -}}
{{- if eq $registry.transport "https" -}}
  {{- $secret := required "runtimeInfrastructure.registry.authSecretName is required for HTTPS registry authentication" $registry.authSecretName -}}
  {{- $_ := set $registry "auth" (dict "usernameEnvironmentVariable" "KUBECLAW_REGISTRY_USERNAME" "passwordEnvironmentVariable" "KUBECLAW_REGISTRY_PASSWORD") -}}
  {{- $env = list (dict "name" "KUBECLAW_REGISTRY_CONFIG" "value" (toJson (dict "schemaVersion" "registry-clients.v1" "registry" $registry "dockerHubMirror" $mirror))) -}}
  {{- range $kind, $key := dict "USERNAME" $registry.usernameKey "PASSWORD" $registry.passwordKey -}}
    {{- $env = append $env (dict "name" (printf "KUBECLAW_REGISTRY_%s" $kind) "valueFrom" (dict "secretKeyRef" (dict "name" $secret "key" (required "registry credential secret key is required" $key)))) -}}
  {{- end -}}
{{- else if $registry.authSecretName -}}{{- fail "HTTP lab registry cannot send credentials" -}}{{- end -}}
{{- $mounts := $container.volumeMounts | default list -}}
{{- range $name, $client := dict "registry" $registry "dockerHubMirror" $mirror -}}
  {{- if $client.caSecretName -}}{{- $mounts = append $mounts (dict "name" (printf "registry-client-%s" (lower $name)) "mountPath" (printf "/var/run/kubeclaw-%s-trust" $name) "readOnly" true) -}}{{- end -}}
{{- end -}}
{{- range $entry := $container.env | default list -}}
  {{- if or (hasPrefix "KUBECLAW_REGISTRY_" $entry.name) (has $entry.name (list "KUBECLAW_LOCAL_REGISTRY" "CONTAINER_BUILD_REGISTRY_REFERENCE" "CONTAINER_BUILD_REGISTRY_BASE_URL" "NODE_EXTRA_CA_CERTS")) -}}{{- fail (printf "%s duplicates the shared registry contract; remove it from sidecar env" $entry.name) -}}{{- end -}}
{{- end -}}
{{- if $registry.caFile -}}{{- $env = append $env (dict "name" "NODE_EXTRA_CA_CERTS" "value" $registry.caFile) -}}{{- end -}}
{{- $_ := set $container "env" (concat ($container.env | default list) $env) -}}
{{- $_ := set $container "volumeMounts" $mounts -}}
{{- toYaml $container -}}
{{- end -}}
