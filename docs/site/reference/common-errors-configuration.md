# Helm rendering and configuration — error catalogue

Status: generated source-backed reference
Audience: operator, developer, maintainer
Owner: documentation automation
Evidence: docs/config/common-error-catalogue.json; scripts/docs-common-error-catalogue.mjs
Applies to: current workspace-owned diagnostic families; source-bound descriptions, not execution evidence
Last verified: generation checks the declared source digests

<!-- BEGIN GENERATED: common error catalogue -->

[All component families](common-errors.md) · [Diagnostic routing](errors.md)

Search for the exact diagnostic or constructor. Each entry distinguishes its identity from effects and recovery; source links are representative, not a complete call graph.

## Families

- [Helm: gitops/templates/applications.yaml](#helm-charts-gitops-templates-applications-yaml)
- [Helm: `kubeclaw/templates/_demo-ready-client.tpl`](#helm-charts-kubeclaw-templates-demo-ready-client-tpl)
- [Helm: `kubeclaw/templates/_helpers.tpl`](#helm-charts-kubeclaw-templates-helpers-tpl)
- [Helm: `kubeclaw/templates/_registry-clients.tpl`](#helm-charts-kubeclaw-templates-registry-clients-tpl)
- [Helm: kubeclaw/templates/archviewer.yaml](#helm-charts-kubeclaw-templates-archviewer-yaml)
- [Helm: kubeclaw/templates/buster-namespace-controller.yaml](#helm-charts-kubeclaw-templates-buster-namespace-controller-yaml)
- [Helm: kubeclaw/templates/buster-namespace-fence.yaml](#helm-charts-kubeclaw-templates-buster-namespace-fence-yaml)
- [Helm: kubeclaw/templates/buster-runtime-pvc.yaml](#helm-charts-kubeclaw-templates-buster-runtime-pvc-yaml)
- [Helm: kubeclaw/templates/configmap-worker-trust.yaml](#helm-charts-kubeclaw-templates-configmap-worker-trust-yaml)
- [Helm: kubeclaw/templates/demo-ready-service.yaml](#helm-charts-kubeclaw-templates-demo-ready-service-yaml)
- [Helm: kubeclaw/templates/deployment.yaml](#helm-charts-kubeclaw-templates-deployment-yaml)
- [Helm: kubeclaw/templates/rbac.yaml](#helm-charts-kubeclaw-templates-rbac-yaml)
- [Helm: ops-pod/templates/network.yaml](#helm-charts-ops-pod-templates-network-yaml)
- [Helm: ops-pod/templates/rbac.yaml](#helm-charts-ops-pod-templates-rbac-yaml)
- [Helm: ops-pod/templates/workload.yaml](#helm-charts-ops-pod-templates-workload-yaml)
- [Helm: `prism/templates/_helpers.tpl`](#helm-charts-prism-templates-helpers-tpl)
- [Helm: `prism/templates/_product-decisions.tpl`](#helm-charts-prism-templates-product-decisions-tpl)
- [Helm: prism/templates/configmap-worker-trust.yaml](#helm-charts-prism-templates-configmap-worker-trust-yaml)
- [Helm: prism/templates/ingestion.yaml](#helm-charts-prism-templates-ingestion-yaml)
- [Helm: prism/templates/jobs.yaml](#helm-charts-prism-templates-jobs-yaml)
- [Helm: prism/templates/postgresql.yaml](#helm-charts-prism-templates-postgresql-yaml)
- [Helm: prism/templates/workloads.yaml](#helm-charts-prism-templates-workloads-yaml)

<a id="helm-charts-gitops-templates-applications-yaml"></a>

## Helm: gitops/templates/applications.yaml

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 1:**

```text
{{- $repository := required "repository is required" .Values.repository -}}
```

**Template line 2:**

```text
{{- $revision := required "revision is required" .Values.revision -}}
```

**Template line 3:**

```text
{{ fail "revision must be a complete Git commit" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/gitops/templates/applications.yaml', 'sha256': 'db8564cbc9ab705454123e8e1f209115c0f128c8746a6c7dd6361e824b2dd107', 'startUtf16': 146, 'endUtf16': 199, 'startLine': 3, 'endLine': 3, 'exactText': '{{- if not (regexMatch "^[a-f0-9]{40}$" $revision) }}', 'exactTextSha256': '3ab49e0a5e86322c6bd096c08079590c7ec69532701269679557b35d6fa4cbbb'}, 'branchTransitions': []}
```

**Template line 4:**

```text
{{- $project := required "project is required" .Values.project -}}
```

**Template line 5:**

```text
{{ fail "release groups are required" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/gitops/templates/applications.yaml', 'sha256': 'db8564cbc9ab705454123e8e1f209115c0f128c8746a6c7dd6361e824b2dd107', 'startUtf16': 328, 'endUtf16': 356, 'startLine': 5, 'endLine': 5, 'exactText': '{{- if not .Values.groups }}', 'exactTextSha256': '75dd73cea33025629c7935a4f1fcaf5aa8df24b06fa66d694e66eb72be27e1e9'}, 'branchTransitions': []}
```

**Template line 11:**

```text
{{ required "rootName is required" .Values.rootName }}
```

**Owning / consuming source:**

- [charts/gitops/templates/applications.yaml:1](../../../charts/gitops/templates/applications.yaml#L1)

<a id="helm-charts-kubeclaw-templates-demo-ready-client-tpl"></a>

## Helm: `kubeclaw/templates/_demo-ready-client.tpl`

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 6:**

```text
{{- fail "Ready client requires the actual Nova release ServiceAccount" -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_demo-ready-client.tpl', 'sha256': 'ac285eb2f3f3527bada6abc5338cf9b2d7c73b0518215281a8cbb614babe6536', 'startUtf16': 154, 'endUtf16': 203, 'startLine': 3, 'endLine': 3, 'exactText': '{{- define "kubeclaw.demoReadyClientValidate" -}}', 'exactTextSha256': '7757c4a996a31f09b0399eb343cffe30c4f8a3ad06f210be1ef38ec66395850a'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_demo-ready-client.tpl', 'sha256': 'ac285eb2f3f3527bada6abc5338cf9b2d7c73b0518215281a8cbb614babe6536', 'startUtf16': 204, 'endUtf16': 264, 'startLine': 4, 'endLine': 4, 'exactText': '{{- if .Values.busterNamespaceBroker.readyClient.enabled -}}', 'exactTextSha256': '0442804078fd2589081cbe2222930da9df4a2590872251bab46b3f6ef056e92d'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_demo-ready-client.tpl', 'sha256': 'ac285eb2f3f3527bada6abc5338cf9b2d7c73b0518215281a8cbb614babe6536', 'startUtf16': 265, 'endUtf16': 344, 'startLine': 5, 'endLine': 5, 'exactText': '{{- if or (ne .Values.agentRole "nova") (not .Values.serviceAccount.create) -}}', 'exactTextSha256': '6c2ae29654a1ddb7cb8646cdfe0bbc98b20f4b2dc3e30db3e2364f53314bda4b'}, 'branchTransitions': []}
```

**Template line 9:**

```text
{{- fail "Ready client requires an explicit HTTPS controller endpoint" -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_demo-ready-client.tpl', 'sha256': 'ac285eb2f3f3527bada6abc5338cf9b2d7c73b0518215281a8cbb614babe6536', 'startUtf16': 154, 'endUtf16': 203, 'startLine': 3, 'endLine': 3, 'exactText': '{{- define "kubeclaw.demoReadyClientValidate" -}}', 'exactTextSha256': '7757c4a996a31f09b0399eb343cffe30c4f8a3ad06f210be1ef38ec66395850a'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_demo-ready-client.tpl', 'sha256': 'ac285eb2f3f3527bada6abc5338cf9b2d7c73b0518215281a8cbb614babe6536', 'startUtf16': 204, 'endUtf16': 264, 'startLine': 4, 'endLine': 4, 'exactText': '{{- if .Values.busterNamespaceBroker.readyClient.enabled -}}', 'exactTextSha256': '0442804078fd2589081cbe2222930da9df4a2590872251bab46b3f6ef056e92d'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_demo-ready-client.tpl', 'sha256': 'ac285eb2f3f3527bada6abc5338cf9b2d7c73b0518215281a8cbb614babe6536', 'startUtf16': 433, 'endUtf16': 521, 'startLine': 8, 'endLine': 8, 'exactText': '{{- if not (hasPrefix "https://" .Values.busterNamespaceBroker.readyClient.endpoint) -}}', 'exactTextSha256': '7c61c55da4b8b2b519efb5dabf7eb6b7c3fce71964f22353c294ef9bcb9ac8d8'}, 'branchTransitions': []}
```

**Template line 20:**

```text
{{ required "Ready client audience is required" .Values.busterNamespaceBroker.readyClient.audience | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_demo-ready-client.tpl', 'sha256': 'ac285eb2f3f3527bada6abc5338cf9b2d7c73b0518215281a8cbb614babe6536', 'startUtf16': 634, 'endUtf16': 678, 'startLine': 14, 'endLine': 14, 'exactText': '{{- define "kubeclaw.demoReadyClientEnv" -}}', 'exactTextSha256': 'd28033aadc15eced3fb45a704ac82e5bb662e226d5ec38917658db209851c7c7'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_demo-ready-client.tpl', 'sha256': 'ac285eb2f3f3527bada6abc5338cf9b2d7c73b0518215281a8cbb614babe6536', 'startUtf16': 732, 'endUtf16': 791, 'startLine': 16, 'endLine': 16, 'exactText': '{{- if .Values.busterNamespaceBroker.readyClient.enabled }}', 'exactTextSha256': '14de5629fa58278b56674c22603d436ba73d5c564dedeb3e39d6748c7248f7de'}, 'branchTransitions': []}
```

**Template line 42:**

```text
{{ required "Ready client audience is required" .Values.busterNamespaceBroker.readyClient.audience | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_demo-ready-client.tpl', 'sha256': 'ac285eb2f3f3527bada6abc5338cf9b2d7c73b0518215281a8cbb614babe6536', 'startUtf16': 1555, 'endUtf16': 1603, 'startLine': 35, 'endLine': 35, 'exactText': '{{- define "kubeclaw.demoReadyClientVolumes" -}}', 'exactTextSha256': '8fc0df448dc622751080593d8bf61aadbcc52ec3bb2bbc161d50608601c46e4e'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_demo-ready-client.tpl', 'sha256': 'ac285eb2f3f3527bada6abc5338cf9b2d7c73b0518215281a8cbb614babe6536', 'startUtf16': 1604, 'endUtf16': 1663, 'startLine': 36, 'endLine': 36, 'exactText': '{{- if .Values.busterNamespaceBroker.readyClient.enabled }}', 'exactTextSha256': '14de5629fa58278b56674c22603d436ba73d5c564dedeb3e39d6748c7248f7de'}, 'branchTransitions': []}
```

**Template line 47:**

```text
{{ required "Ready client CA Secret is required" .Values.busterNamespaceBroker.readyClient.caSecretName | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_demo-ready-client.tpl', 'sha256': 'ac285eb2f3f3527bada6abc5338cf9b2d7c73b0518215281a8cbb614babe6536', 'startUtf16': 1555, 'endUtf16': 1603, 'startLine': 35, 'endLine': 35, 'exactText': '{{- define "kubeclaw.demoReadyClientVolumes" -}}', 'exactTextSha256': '8fc0df448dc622751080593d8bf61aadbcc52ec3bb2bbc161d50608601c46e4e'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_demo-ready-client.tpl', 'sha256': 'ac285eb2f3f3527bada6abc5338cf9b2d7c73b0518215281a8cbb614babe6536', 'startUtf16': 1604, 'endUtf16': 1663, 'startLine': 36, 'endLine': 36, 'exactText': '{{- if .Values.busterNamespaceBroker.readyClient.enabled }}', 'exactTextSha256': '14de5629fa58278b56674c22603d436ba73d5c564dedeb3e39d6748c7248f7de'}, 'branchTransitions': []}
```

**Owning / consuming source:**

- [charts/kubeclaw/templates/_demo-ready-client.tpl:1](../../../charts/kubeclaw/templates/_demo-ready-client.tpl#L1)
- [charts/kubeclaw/templates/deployment.yaml:1354](../../../charts/kubeclaw/templates/deployment.yaml#L1354)

<a id="helm-charts-kubeclaw-templates-helpers-tpl"></a>

## Helm: `kubeclaw/templates/_helpers.tpl`

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 6:**

```text
{{- $role := required "agentRole is required" .Values.agentRole -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_helpers.tpl', 'sha256': '69986722975a973479b9fb1a2c35ab1a1ecb972662e8c19dd03718ac441f5103', 'startUtf16': 105, 'endUtf16': 139, 'startLine': 5, 'endLine': 5, 'exactText': '{{- define "kubeclaw.fullname" -}}', 'exactTextSha256': 'a5216b42d95c6f94b7b117105108745c44471469eae7768fef9a2544e0309c4d'}, 'branchTransitions': []}
```

**Template line 8:**

```text
{{- fail "agentRole must be a DNS label of at most 57 characters" -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_helpers.tpl', 'sha256': '69986722975a973479b9fb1a2c35ab1a1ecb972662e8c19dd03718ac441f5103', 'startUtf16': 105, 'endUtf16': 139, 'startLine': 5, 'endLine': 5, 'exactText': '{{- define "kubeclaw.fullname" -}}', 'exactTextSha256': 'a5216b42d95c6f94b7b117105108745c44471469eae7768fef9a2544e0309c4d'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_helpers.tpl', 'sha256': '69986722975a973479b9fb1a2c35ab1a1ecb972662e8c19dd03718ac441f5103', 'startUtf16': 208, 'endUtf16': 280, 'startLine': 7, 'endLine': 7, 'exactText': '{{- if not (regexMatch "^[a-z0-9]([a-z0-9-]{0,55}[a-z0-9])?$" $role) -}}', 'exactTextSha256': '7a695bd9bc4de21fd07e87a863be6660e3fdf6e24e43a615b730c4d07f842531'}, 'branchTransitions': []}
```

**Template line 17:**

```text
{{- $role := required "capability provider agentRole is required" . -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_helpers.tpl', 'sha256': '69986722975a973479b9fb1a2c35ab1a1ecb972662e8c19dd03718ac441f5103', 'startUtf16': 482, 'endUtf16': 524, 'startLine': 16, 'endLine': 16, 'exactText': '{{- define "kubeclaw.agentServiceName" -}}', 'exactTextSha256': '4b3fd5e66bc9edec7c4af6c60861513d605611a4ec9a2dd0666a67195fff17f4'}, 'branchTransitions': []}
```

**Template line 19:**

```text
{{- fail "capability provider agentRole must be a DNS label" -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_helpers.tpl', 'sha256': '69986722975a973479b9fb1a2c35ab1a1ecb972662e8c19dd03718ac441f5103', 'startUtf16': 482, 'endUtf16': 524, 'startLine': 16, 'endLine': 16, 'exactText': '{{- define "kubeclaw.agentServiceName" -}}', 'exactTextSha256': '4b3fd5e66bc9edec7c4af6c60861513d605611a4ec9a2dd0666a67195fff17f4'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_helpers.tpl', 'sha256': '69986722975a973479b9fb1a2c35ab1a1ecb972662e8c19dd03718ac441f5103', 'startUtf16': 597, 'endUtf16': 669, 'startLine': 18, 'endLine': 18, 'exactText': '{{- if not (regexMatch "^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$" $role) -}}', 'exactTextSha256': '8bae8450c56e9fe180d28f86fc04b56283752a9fabd96ff99e2fa02d7f0214a3'}, 'branchTransitions': []}
```

**Template line 135:**

```text
{{- fail "image.digest must be sha256 followed by 64 lowercase hex characters" -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_helpers.tpl', 'sha256': '69986722975a973479b9fb1a2c35ab1a1ecb972662e8c19dd03718ac441f5103', 'startUtf16': 3345, 'endUtf16': 3376, 'startLine': 132, 'endLine': 132, 'exactText': '{{- define "kubeclaw.image" -}}', 'exactTextSha256': 'b43ebeb28a7f30103c708df9751586cc6f3dab16566682feb3e518baebe45d34'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_helpers.tpl', 'sha256': '69986722975a973479b9fb1a2c35ab1a1ecb972662e8c19dd03718ac441f5103', 'startUtf16': 3377, 'endUtf16': 3395, 'startLine': 133, 'endLine': 133, 'exactText': '{{- if .digest -}}', 'exactTextSha256': 'c1c14ead664c244479829d4bbd35e5e34ff2fa4699edff1a8db85661dd84951a'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_helpers.tpl', 'sha256': '69986722975a973479b9fb1a2c35ab1a1ecb972662e8c19dd03718ac441f5103', 'startUtf16': 3396, 'endUtf16': 3455, 'startLine': 134, 'endLine': 134, 'exactText': '{{- if not (regexMatch "^sha256:[a-f0-9]{64}$" .digest) -}}', 'exactTextSha256': 'ffecf0aa1365b36cfb74cd69a6b42daf8ef3826b3354a06e52534440aee925c1'}, 'branchTransitions': []}
```

**Owning / consuming source:**

- [charts/kubeclaw/templates/_helpers.tpl:1](../../../charts/kubeclaw/templates/_helpers.tpl#L1)
- [charts/kubeclaw/templates/NOTES.txt:17](../../../charts/kubeclaw/templates/NOTES.txt#L17)
- [charts/kubeclaw/templates/archviewer.yaml:14](../../../charts/kubeclaw/templates/archviewer.yaml#L14)

<a id="helm-charts-kubeclaw-templates-registry-clients-tpl"></a>

## Helm: `kubeclaw/templates/_registry-clients.tpl`

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 5:**

```text
{{- fail (printf "unknown runtimeInfrastructure field %s" $key) -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 0, 'endUtf16': 43, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "kubeclaw.registryContainer" -}}', 'exactTextSha256': '7d7576479d5620ee8117fde2acaf18ef10e44bc471a1262baf1245c5b95d2663'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 165, 'endUtf16': 200, 'startLine': 5, 'endLine': 5, 'exactText': '{{- range $key, $_ := $settings -}}', 'exactTextSha256': '2c2549e2c12f7fe7ec5e608ca7b4dff489ba8f7c6d3a951657042a6e2a0180d7'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 200, 'endUtf16': 277, 'startLine': 5, 'endLine': 5, 'exactText': '{{- if not (has $key (list "registry" "dockerHubMirror" "localRegistry")) -}}', 'exactTextSha256': '2e10ed2555aeb86c1d5fbae2c9fc92d2610c7fa8a3400df59b0ce086ac2f7edf'}, 'branchTransitions': []}
```

**Template line 9:**

```text
{{- fail (printf "unknown runtimeInfrastructure.%s field %s" $name $key) -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 0, 'endUtf16': 43, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "kubeclaw.registryContainer" -}}', 'exactTextSha256': '7d7576479d5620ee8117fde2acaf18ef10e44bc471a1262baf1245c5b95d2663'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 367, 'endUtf16': 477, 'startLine': 6, 'endLine': 6, 'exactText': '{{- range $name, $client := dict "registry" $settings.registry "dockerHubMirror" $settings.dockerHubMirror -}}', 'exactTextSha256': 'ce41bfb64053a0e6bc1fc80ad7c6df4f62bc92a8fef809dec3cf9967d08220bf'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 702, 'endUtf16': 735, 'startLine': 9, 'endLine': 9, 'exactText': '{{- range $key, $_ := $client -}}', 'exactTextSha256': '2fabc9e1d7bf3778f96cdebb69ac1f2c14a5eda184ed5faf511bfdce9b7ed5f0'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 735, 'endUtf16': 769, 'startLine': 9, 'endLine': 9, 'exactText': '{{- if not (has $key $allowed) -}}', 'exactTextSha256': '776012f8d666eac420d15e0429737d8754cb6950149f272db8142932e9ad44cb'}, 'branchTransitions': []}
```

**Template line 11:**

```text
{{- fail "disabled Docker Hub mirror requires empty endpoint, transport and trust" -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 0, 'endUtf16': 43, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "kubeclaw.registryContainer" -}}', 'exactTextSha256': '7d7576479d5620ee8117fde2acaf18ef10e44bc471a1262baf1245c5b95d2663'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 880, 'endUtf16': 1054, 'startLine': 11, 'endLine': 11, 'exactText': '{{- if and (empty $settings.dockerHubMirror.endpoint) (or $settings.dockerHubMirror.transport $settings.dockerHubMirror.caSecretName $settings.dockerHubMirror.nodeCaFile) -}}', 'exactTextSha256': '21e8f6a724897b0e9aa1e862070df37e4995cb6e947eb2e5c39788d03f78aa74'}, 'branchTransitions': []}
```

**Template line 12:**

```text
{{- fail "runtimeInfrastructure.localRegistry was replaced; configure runtimeInfrastructure.registry endpoint/transport/auth explicitly (docs/site/understand/platform-and-operations.md#writable-local-oci-registry)" -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 0, 'endUtf16': 43, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "kubeclaw.registryContainer" -}}', 'exactTextSha256': '7d7576479d5620ee8117fde2acaf18ef10e44bc471a1262baf1245c5b95d2663'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 1152, 'endUtf16': 1186, 'startLine': 12, 'endLine': 12, 'exactText': '{{- if $settings.localRegistry -}}', 'exactTextSha256': '52b54fdc107cdf5709b214153ca9b94b94c0fa5dc0d4ed8dc81fe7fb67a8e07d'}, 'branchTransitions': []}
```

**Template line 17:**

```text
{{- $endpoint := required (printf "runtimeInfrastructure.%s.endpoint is required; configure a node-reachable registry origin" $name) $client.endpoint -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 0, 'endUtf16': 43, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "kubeclaw.registryContainer" -}}', 'exactTextSha256': '7d7576479d5620ee8117fde2acaf18ef10e44bc471a1262baf1245c5b95d2663'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 1519, 'endUtf16': 1602, 'startLine': 15, 'endLine': 15, 'exactText': '{{- range $name, $client := dict "registry" $registry "dockerHubMirror" $mirror -}}', 'exactTextSha256': 'ab7bfe47073640c6bea4e7e53ed14501298dd6c4a2245bd61105f3b3bda878ac'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 1605, 'endUtf16': 1657, 'startLine': 16, 'endLine': 16, 'exactText': '{{- if or (eq $name "registry") $client.endpoint -}}', 'exactTextSha256': 'a6a91e932493a88dc69df9920d52a939d51923feb4af95bdf3e7f7fce25ede80'}, 'branchTransitions': []}
```

**Template line 18:**

```text
{{- fail (printf "runtimeInfrastructure.%s.transport must explicitly select https or http-lab" $name) -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 0, 'endUtf16': 43, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "kubeclaw.registryContainer" -}}', 'exactTextSha256': '7d7576479d5620ee8117fde2acaf18ef10e44bc471a1262baf1245c5b95d2663'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 1519, 'endUtf16': 1602, 'startLine': 15, 'endLine': 15, 'exactText': '{{- range $name, $client := dict "registry" $registry "dockerHubMirror" $mirror -}}', 'exactTextSha256': 'ab7bfe47073640c6bea4e7e53ed14501298dd6c4a2245bd61105f3b3bda878ac'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 1605, 'endUtf16': 1657, 'startLine': 16, 'endLine': 16, 'exactText': '{{- if or (eq $name "registry") $client.endpoint -}}', 'exactTextSha256': 'a6a91e932493a88dc69df9920d52a939d51923feb4af95bdf3e7f7fce25ede80'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 1820, 'endUtf16': 1884, 'startLine': 18, 'endLine': 18, 'exactText': '{{- if not (has $client.transport (list "https" "http-lab")) -}}', 'exactTextSha256': 'f11095b2f5f000a832dddbb789474242a0b79c730ecca5a59a9ee2620b12d0db'}, 'branchTransitions': []}
```

**Template line 20:**

```text
{{- fail (printf "runtimeInfrastructure.%s endpoint scheme/host does not match transport" $name) -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 0, 'endUtf16': 43, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "kubeclaw.registryContainer" -}}', 'exactTextSha256': '7d7576479d5620ee8117fde2acaf18ef10e44bc471a1262baf1245c5b95d2663'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 1519, 'endUtf16': 1602, 'startLine': 15, 'endLine': 15, 'exactText': '{{- range $name, $client := dict "registry" $registry "dockerHubMirror" $mirror -}}', 'exactTextSha256': 'ab7bfe47073640c6bea4e7e53ed14501298dd6c4a2245bd61105f3b3bda878ac'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 1605, 'endUtf16': 1657, 'startLine': 16, 'endLine': 16, 'exactText': '{{- if or (eq $name "registry") $client.endpoint -}}', 'exactTextSha256': 'a6a91e932493a88dc69df9920d52a939d51923feb4af95bdf3e7f7fce25ede80'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 2088, 'endUtf16': 2198, 'startLine': 20, 'endLine': 20, 'exactText': '{{- if not (and (hasPrefix $scheme $endpoint) (regexMatch "^https?://[a-z0-9.-]+(:[0-9]+)?/?$" $endpoint)) -}}', 'exactTextSha256': '7c516a270bcebe8bbf28c1ec16b927059b48ec8b52745a5d8c5eed5b968df84e'}, 'branchTransitions': []}
```

**Template line 21:**

```text
{{- fail "custom CA requires both caSecretName and nodeCaFile" -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 0, 'endUtf16': 43, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "kubeclaw.registryContainer" -}}', 'exactTextSha256': '7d7576479d5620ee8117fde2acaf18ef10e44bc471a1262baf1245c5b95d2663'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 1519, 'endUtf16': 1602, 'startLine': 15, 'endLine': 15, 'exactText': '{{- range $name, $client := dict "registry" $registry "dockerHubMirror" $mirror -}}', 'exactTextSha256': 'ab7bfe47073640c6bea4e7e53ed14501298dd6c4a2245bd61105f3b3bda878ac'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 1605, 'endUtf16': 1657, 'startLine': 16, 'endLine': 16, 'exactText': '{{- if or (eq $name "registry") $client.endpoint -}}', 'exactTextSha256': 'a6a91e932493a88dc69df9920d52a939d51923feb4af95bdf3e7f7fce25ede80'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 2314, 'endUtf16': 2395, 'startLine': 21, 'endLine': 21, 'exactText': '{{- if ne (not (empty $client.caSecretName)) (not (empty $client.nodeCaFile)) -}}', 'exactTextSha256': '640fc227a347eddf8563d3974db0fe5a557ae4684c9af9c2555c44cd2787ad69'}, 'branchTransitions': []}
```

**Template line 22:**

```text
{{- fail "nodeCaFile must be an absolute host path" -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 0, 'endUtf16': 43, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "kubeclaw.registryContainer" -}}', 'exactTextSha256': '7d7576479d5620ee8117fde2acaf18ef10e44bc471a1262baf1245c5b95d2663'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 1519, 'endUtf16': 1602, 'startLine': 15, 'endLine': 15, 'exactText': '{{- range $name, $client := dict "registry" $registry "dockerHubMirror" $mirror -}}', 'exactTextSha256': 'ab7bfe47073640c6bea4e7e53ed14501298dd6c4a2245bd61105f3b3bda878ac'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 1605, 'endUtf16': 1657, 'startLine': 16, 'endLine': 16, 'exactText': '{{- if or (eq $name "registry") $client.endpoint -}}', 'exactTextSha256': 'a6a91e932493a88dc69df9920d52a939d51923feb4af95bdf3e7f7fce25ede80'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 2477, 'endUtf16': 2562, 'startLine': 22, 'endLine': 22, 'exactText': '{{- if and $client.nodeCaFile (not (regexMatch "^/[^\\r\\n]+$" $client.nodeCaFile)) -}}', 'exactTextSha256': '7218b0035672711c3df995826de8ffb53eb969dd09d8ffc7abb9a1c396e8a3c7'}, 'branchTransitions': []}
```

**Template line 24:**

```text
{{- fail "registry CA requires HTTPS" -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 0, 'endUtf16': 43, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "kubeclaw.registryContainer" -}}', 'exactTextSha256': '7d7576479d5620ee8117fde2acaf18ef10e44bc471a1262baf1245c5b95d2663'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 1519, 'endUtf16': 1602, 'startLine': 15, 'endLine': 15, 'exactText': '{{- range $name, $client := dict "registry" $registry "dockerHubMirror" $mirror -}}', 'exactTextSha256': 'ab7bfe47073640c6bea4e7e53ed14501298dd6c4a2245bd61105f3b3bda878ac'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 1605, 'endUtf16': 1657, 'startLine': 16, 'endLine': 16, 'exactText': '{{- if or (eq $name "registry") $client.endpoint -}}', 'exactTextSha256': 'a6a91e932493a88dc69df9920d52a939d51923feb4af95bdf3e7f7fce25ede80'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 2633, 'endUtf16': 2664, 'startLine': 23, 'endLine': 23, 'exactText': '{{- if $client.caSecretName -}}', 'exactTextSha256': '2dd9fc2056dee42466cf14a2a92245034947a6022c92c82694c959f42443201c'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 2671, 'endUtf16': 2710, 'startLine': 24, 'endLine': 24, 'exactText': '{{- if ne $client.transport "https" -}}', 'exactTextSha256': '8de32acc966bd4fdd35a3b9f8899a7d13cfae3d489b059eaa5989187cf7a7490'}, 'branchTransitions': []}
```

**Template line 25:**

```text
{{- $_ := required (printf "runtimeInfrastructure.%s.nodeCaFile is required with custom CA" $name) $client.nodeCaFile -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 0, 'endUtf16': 43, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "kubeclaw.registryContainer" -}}', 'exactTextSha256': '7d7576479d5620ee8117fde2acaf18ef10e44bc471a1262baf1245c5b95d2663'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 1519, 'endUtf16': 1602, 'startLine': 15, 'endLine': 15, 'exactText': '{{- range $name, $client := dict "registry" $registry "dockerHubMirror" $mirror -}}', 'exactTextSha256': 'ab7bfe47073640c6bea4e7e53ed14501298dd6c4a2245bd61105f3b3bda878ac'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 1605, 'endUtf16': 1657, 'startLine': 16, 'endLine': 16, 'exactText': '{{- if or (eq $name "registry") $client.endpoint -}}', 'exactTextSha256': 'a6a91e932493a88dc69df9920d52a939d51923feb4af95bdf3e7f7fce25ede80'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 2633, 'endUtf16': 2664, 'startLine': 23, 'endLine': 23, 'exactText': '{{- if $client.caSecretName -}}', 'exactTextSha256': '2dd9fc2056dee42466cf14a2a92245034947a6022c92c82694c959f42443201c'}, 'branchTransitions': []}
```

**Template line 30:**

```text
{{- fail "writable registry and Docker Hub mirror must be distinct" -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 0, 'endUtf16': 43, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "kubeclaw.registryContainer" -}}', 'exactTextSha256': '7d7576479d5620ee8117fde2acaf18ef10e44bc471a1262baf1245c5b95d2663'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 3025, 'endUtf16': 3131, 'startLine': 30, 'endLine': 30, 'exactText': '{{- if and $mirror.endpoint (eq (trimSuffix "/" $mirror.endpoint) (trimSuffix "/" $registry.endpoint)) -}}', 'exactTextSha256': '9ed58210cfec38427caa1a18ca60d11b36caccecaccd2332dc5e9fba720ae5d3'}, 'branchTransitions': []}
```

**Template line 31:**

```text
{{- fail "Docker Hub mirror routing collides with docker.io endpoint" -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 0, 'endUtf16': 43, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "kubeclaw.registryContainer" -}}', 'exactTextSha256': '7d7576479d5620ee8117fde2acaf18ef10e44bc471a1262baf1245c5b95d2663'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 3214, 'endUtf16': 3366, 'startLine': 31, 'endLine': 31, 'exactText': '{{- if and $mirror.endpoint (or (regexMatch "^https?://docker[.]io/?$" $mirror.endpoint) (regexMatch "^https?://docker[.]io/?$" $registry.endpoint)) -}}', 'exactTextSha256': '3b5562198f9d396d665d887a9add869b1232fbd06c770c8a636ba9a225e0ba84'}, 'branchTransitions': []}
```

**Template line 34:**

```text
{{- $secret := required "runtimeInfrastructure.registry.authSecretName is required for HTTPS registry authentication" $registry.authSecretName -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 0, 'endUtf16': 43, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "kubeclaw.registryContainer" -}}', 'exactTextSha256': '7d7576479d5620ee8117fde2acaf18ef10e44bc471a1262baf1245c5b95d2663'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 3622, 'endUtf16': 3663, 'startLine': 33, 'endLine': 33, 'exactText': '{{- if eq $registry.transport "https" -}}', 'exactTextSha256': '341f494518523f0da94b273ece6ec7dd54d16de42493dc0bc65725ed8e2d2396'}, 'branchTransitions': []}
```

**Template line 38:**

```text
{{- $env = append $env (dict "name" (printf "KUBECLAW_REGISTRY_%s" $kind) "valueFrom" (dict "secretKeyRef" (dict "name" $secret "key" (required "registry credential secret key is required" $key)))) -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 0, 'endUtf16': 43, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "kubeclaw.registryContainer" -}}', 'exactTextSha256': '7d7576479d5620ee8117fde2acaf18ef10e44bc471a1262baf1245c5b95d2663'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 3622, 'endUtf16': 3663, 'startLine': 33, 'endLine': 33, 'exactText': '{{- if eq $registry.transport "https" -}}', 'exactTextSha256': '341f494518523f0da94b273ece6ec7dd54d16de42493dc0bc65725ed8e2d2396'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 4149, 'endUtf16': 4248, 'startLine': 37, 'endLine': 37, 'exactText': '{{- range $kind, $key := dict "USERNAME" $registry.usernameKey "PASSWORD" $registry.passwordKey -}}', 'exactTextSha256': 'da16fb0c984b9b82ce5b3592ce0cbd1ecae3e3bb2d283e430cea394d99d1f143'}, 'branchTransitions': []}
```

**Template line 40:**

```text
{{- fail "HTTP lab registry cannot send credentials" -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 0, 'endUtf16': 43, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "kubeclaw.registryContainer" -}}', 'exactTextSha256': '7d7576479d5620ee8117fde2acaf18ef10e44bc471a1262baf1245c5b95d2663'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 3622, 'endUtf16': 3663, 'startLine': 33, 'endLine': 33, 'exactText': '{{- if eq $registry.transport "https" -}}', 'exactTextSha256': '341f494518523f0da94b273ece6ec7dd54d16de42493dc0bc65725ed8e2d2396'}, 'branchTransitions': [{'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 4469, 'endUtf16': 4509, 'startLine': 40, 'endLine': 40, 'exactText': '{{- else if $registry.authSecretName -}}', 'exactTextSha256': '33e3dc3d216e1fff178a42cb7efa27b306fb15a92fb6ef111ef198fd50030b2a'}]}
```

**Template line 46:**

```text
{{- fail (printf "%s duplicates the shared registry contract; remove it from sidecar env" $entry.name) -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 0, 'endUtf16': 43, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "kubeclaw.registryContainer" -}}', 'exactTextSha256': '7d7576479d5620ee8117fde2acaf18ef10e44bc471a1262baf1245c5b95d2663'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 4938, 'endUtf16': 4991, 'startLine': 45, 'endLine': 45, 'exactText': '{{- range $entry := $container.env | default list -}}', 'exactTextSha256': 'e9d8c28f1f7252fdd915afbbbc620cadfdf0d75c0d381a215b807119b74417f9'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/_registry-clients.tpl', 'sha256': '7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46', 'startUtf16': 4994, 'endUtf16': 5198, 'startLine': 46, 'endLine': 46, 'exactText': '{{- if or (hasPrefix "KUBECLAW_REGISTRY_" $entry.name) (has $entry.name (list "KUBECLAW_LOCAL_REGISTRY" "CONTAINER_BUILD_REGISTRY_REFERENCE" "CONTAINER_BUILD_REGISTRY_BASE_URL" "NODE_EXTRA_CA_CERTS")) -}}', 'exactTextSha256': 'ab3a5d5ee03b8fa7b74ba4c591bf1beef34d234d8e1f2bffe614760af4df792e'}, 'branchTransitions': []}
```

**Owning / consuming source:**

- [charts/kubeclaw/templates/_registry-clients.tpl:1](../../../charts/kubeclaw/templates/_registry-clients.tpl#L1)
- [charts/kubeclaw/templates/deployment.yaml:1597](../../../charts/kubeclaw/templates/deployment.yaml#L1597)

<a id="helm-charts-kubeclaw-templates-archviewer-yaml"></a>

## Helm: kubeclaw/templates/archviewer.yaml

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 3:**

```text
{{- fail "archviewer is a Nova-only sidecar" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/archviewer.yaml', 'sha256': '5a89affd7b25f63ff38a0de9bec61388927e06b5d20a7075f6af0a92d4c7cb2a', 'startUtf16': 0, 'endUtf16': 36, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if .Values.archviewer.enabled }}', 'exactTextSha256': '27ee7b736d120d7b6c43c1d3a8b6c607d2a32ddbf207cf430773f90b6796e846'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/archviewer.yaml', 'sha256': '5a89affd7b25f63ff38a0de9bec61388927e06b5d20a7075f6af0a92d4c7cb2a', 'startUtf16': 37, 'endUtf16': 74, 'startLine': 2, 'endLine': 2, 'exactText': '{{- if ne .Values.agentRole "nova" }}', 'exactTextSha256': '15bf601ecd65a812c23ac6d6b45c3478e9b6466b314e742252e9fd1b485259c2'}, 'branchTransitions': []}
```

**Template line 7:**

```text
{{- fail "archviewer.networkPolicyProvider must be cilium or kubernetes" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/archviewer.yaml', 'sha256': '5a89affd7b25f63ff38a0de9bec61388927e06b5d20a7075f6af0a92d4c7cb2a', 'startUtf16': 0, 'endUtf16': 36, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if .Values.archviewer.enabled }}', 'exactTextSha256': '27ee7b736d120d7b6c43c1d3a8b6c607d2a32ddbf207cf430773f90b6796e846'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/archviewer.yaml', 'sha256': '5a89affd7b25f63ff38a0de9bec61388927e06b5d20a7075f6af0a92d4c7cb2a', 'startUtf16': 220, 'endUtf16': 284, 'startLine': 6, 'endLine': 6, 'exactText': '{{- if not (has $policyProvider (list "cilium" "kubernetes")) }}', 'exactTextSha256': '8686b5f3c9c03a4ecc282e0df5d4b708fba57aad8fed181ce126865954edfbe0'}, 'branchTransitions': []}
```

**Template line 11:**

```text
{{- fail "Remove legacy archviewer service.extraPorts; the dedicated private Service owns this port" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/archviewer.yaml', 'sha256': '5a89affd7b25f63ff38a0de9bec61388927e06b5d20a7075f6af0a92d4c7cb2a', 'startUtf16': 0, 'endUtf16': 36, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if .Values.archviewer.enabled }}', 'exactTextSha256': '27ee7b736d120d7b6c43c1d3a8b6c607d2a32ddbf207cf430773f90b6796e846'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/archviewer.yaml', 'sha256': '5a89affd7b25f63ff38a0de9bec61388927e06b5d20a7075f6af0a92d4c7cb2a', 'startUtf16': 372, 'endUtf16': 411, 'startLine': 9, 'endLine': 9, 'exactText': '{{- range .Values.service.extraPorts }}', 'exactTextSha256': 'd6d5002c0de1959b872696184af9b7679e417e2ba7774c0bef967f44a761e5ad'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/archviewer.yaml', 'sha256': '5a89affd7b25f63ff38a0de9bec61388927e06b5d20a7075f6af0a92d4c7cb2a', 'startUtf16': 412, 'endUtf16': 546, 'startLine': 10, 'endLine': 10, 'exactText': '{{- if or (eq .name "archviewer") (eq (int .port) 3456) (eq (toString .targetPort) "archviewer") (eq (toString .targetPort) "3456") }}', 'exactTextSha256': 'f58d0fd562de409a7fb7efbc4c0c632345790feb03d9c4a99ea03e245cc60460'}, 'branchTransitions': []}
```

**Template line 37:**

```text
{{ required "archviewer.hostname is required" .Values.archviewer.hostname | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/archviewer.yaml', 'sha256': '5a89affd7b25f63ff38a0de9bec61388927e06b5d20a7075f6af0a92d4c7cb2a', 'startUtf16': 0, 'endUtf16': 36, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if .Values.archviewer.enabled }}', 'exactTextSha256': '27ee7b736d120d7b6c43c1d3a8b6c607d2a32ddbf207cf430773f90b6796e846'}, 'branchTransitions': []}
```

**Template line 53:**

```text
{{ required "archviewer.tailscaleOperatorNamespace is required" .Values.archviewer.tailscaleOperatorNamespace | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/archviewer.yaml', 'sha256': '5a89affd7b25f63ff38a0de9bec61388927e06b5d20a7075f6af0a92d4c7cb2a', 'startUtf16': 0, 'endUtf16': 36, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if .Values.archviewer.enabled }}', 'exactTextSha256': '27ee7b736d120d7b6c43c1d3a8b6c607d2a32ddbf207cf430773f90b6796e846'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/archviewer.yaml', 'sha256': '5a89affd7b25f63ff38a0de9bec61388927e06b5d20a7075f6af0a92d4c7cb2a', 'startUtf16': 1315, 'endUtf16': 1356, 'startLine': 39, 'endLine': 39, 'exactText': '{{- if eq $policyProvider "kubernetes" }}', 'exactTextSha256': 'aa59ed55205bd41e637091fbeac41384a7fcfc3824424a06107aa8c55c68d1f4'}, 'branchTransitions': []}
```

**Template line 74:**

```text
{{ required "archviewer.tailscaleOperatorNamespace is required" .Values.archviewer.tailscaleOperatorNamespace | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/archviewer.yaml', 'sha256': '5a89affd7b25f63ff38a0de9bec61388927e06b5d20a7075f6af0a92d4c7cb2a', 'startUtf16': 0, 'endUtf16': 36, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if .Values.archviewer.enabled }}', 'exactTextSha256': '27ee7b736d120d7b6c43c1d3a8b6c607d2a32ddbf207cf430773f90b6796e846'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/archviewer.yaml', 'sha256': '5a89affd7b25f63ff38a0de9bec61388927e06b5d20a7075f6af0a92d4c7cb2a', 'startUtf16': 1315, 'endUtf16': 1356, 'startLine': 39, 'endLine': 39, 'exactText': '{{- if eq $policyProvider "kubernetes" }}', 'exactTextSha256': 'aa59ed55205bd41e637091fbeac41384a7fcfc3824424a06107aa8c55c68d1f4'}, 'branchTransitions': [{'path': 'charts/kubeclaw/templates/archviewer.yaml', 'sha256': '5a89affd7b25f63ff38a0de9bec61388927e06b5d20a7075f6af0a92d4c7cb2a', 'startUtf16': 2152, 'endUtf16': 2163, 'startLine': 62, 'endLine': 62, 'exactText': '{{- else }}', 'exactTextSha256': '080184bdede81db35e6d841ac6f29eb2ecb89db3bcd5d78a8b93f1fa74888eb4'}]}
```

**Owning / consuming source:**

- [charts/kubeclaw/templates/archviewer.yaml:1](../../../charts/kubeclaw/templates/archviewer.yaml#L1)

<a id="helm-charts-kubeclaw-templates-buster-namespace-controller-yaml"></a>

## Helm: kubeclaw/templates/buster-namespace-controller.yaml

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 227:**

```text
{{ required "Ready audience is required" .Values.busterNamespaceBroker.controller.readiness.audience | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-namespace-controller.yaml', 'sha256': '760a82838ffce8fbf2a29f17914a1395b5dbaac61b71742155e378f962ccaee3', 'startUtf16': 0, 'endUtf16': 84, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if and .Values.busterNamespaceBroker.enabled (eq .Values.agentRole "buster") -}}', 'exactTextSha256': '20113aef14d789486e9157aa8df82593572fdd531cf8168c9f8f2a72c7c0a0ef'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-namespace-controller.yaml', 'sha256': '760a82838ffce8fbf2a29f17914a1395b5dbaac61b71742155e378f962ccaee3', 'startUtf16': 8896, 'endUtf16': 8964, 'startLine': 223, 'endLine': 223, 'exactText': '{{- if .Values.busterNamespaceBroker.controller.readiness.enabled }}', 'exactTextSha256': 'c51a78c07e9ec4a81bd3ed4444e2096dad49fe97ef8489707d02de487cd28903'}, 'branchTransitions': []}
```

**Template line 229:**

```text
{{ printf "system:serviceaccount:%s:%s" (required "Ready producer namespace is required" .Values.busterNamespaceBroker.controller.readiness.producerNamespace) (required "Ready producer ServiceAccount is required" .Values.busterNamespaceBroker.controller.readiness.producerServiceAccount) | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-namespace-controller.yaml', 'sha256': '760a82838ffce8fbf2a29f17914a1395b5dbaac61b71742155e378f962ccaee3', 'startUtf16': 0, 'endUtf16': 84, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if and .Values.busterNamespaceBroker.enabled (eq .Values.agentRole "buster") -}}', 'exactTextSha256': '20113aef14d789486e9157aa8df82593572fdd531cf8168c9f8f2a72c7c0a0ef'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-namespace-controller.yaml', 'sha256': '760a82838ffce8fbf2a29f17914a1395b5dbaac61b71742155e378f962ccaee3', 'startUtf16': 8896, 'endUtf16': 8964, 'startLine': 223, 'endLine': 223, 'exactText': '{{- if .Values.busterNamespaceBroker.controller.readiness.enabled }}', 'exactTextSha256': 'c51a78c07e9ec4a81bd3ed4444e2096dad49fe97ef8489707d02de487cd28903'}, 'branchTransitions': []}
```

**Template line 237:**

```text
{{- fail "Product decisions require the Ready TLS listener" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-namespace-controller.yaml', 'sha256': '760a82838ffce8fbf2a29f17914a1395b5dbaac61b71742155e378f962ccaee3', 'startUtf16': 0, 'endUtf16': 84, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if and .Values.busterNamespaceBroker.enabled (eq .Values.agentRole "buster") -}}', 'exactTextSha256': '20113aef14d789486e9157aa8df82593572fdd531cf8168c9f8f2a72c7c0a0ef'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-namespace-controller.yaml', 'sha256': '760a82838ffce8fbf2a29f17914a1395b5dbaac61b71742155e378f962ccaee3', 'startUtf16': 9809, 'endUtf16': 9884, 'startLine': 235, 'endLine': 235, 'exactText': '{{- if .Values.busterNamespaceBroker.controller.productDecisions.enabled }}', 'exactTextSha256': '68e18af9e093de3323c883fc460e8ad5a264b52629498a51550caa9763b4726d'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-namespace-controller.yaml', 'sha256': '760a82838ffce8fbf2a29f17914a1395b5dbaac61b71742155e378f962ccaee3', 'startUtf16': 9897, 'endUtf16': 9969, 'startLine': 236, 'endLine': 236, 'exactText': '{{- if not .Values.busterNamespaceBroker.controller.readiness.enabled }}', 'exactTextSha256': '329401ae6b13dd83edb274de67cd21630d5aff7ba90498e0557830c9d71ea1f5'}, 'branchTransitions': []}
```

**Template line 242:**

```text
{{ required "Product audience is required" .Values.busterNamespaceBroker.controller.productDecisions.audience | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-namespace-controller.yaml', 'sha256': '760a82838ffce8fbf2a29f17914a1395b5dbaac61b71742155e378f962ccaee3', 'startUtf16': 0, 'endUtf16': 84, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if and .Values.busterNamespaceBroker.enabled (eq .Values.agentRole "buster") -}}', 'exactTextSha256': '20113aef14d789486e9157aa8df82593572fdd531cf8168c9f8f2a72c7c0a0ef'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-namespace-controller.yaml', 'sha256': '760a82838ffce8fbf2a29f17914a1395b5dbaac61b71742155e378f962ccaee3', 'startUtf16': 9809, 'endUtf16': 9884, 'startLine': 235, 'endLine': 235, 'exactText': '{{- if .Values.busterNamespaceBroker.controller.productDecisions.enabled }}', 'exactTextSha256': '68e18af9e093de3323c883fc460e8ad5a264b52629498a51550caa9763b4726d'}, 'branchTransitions': []}
```

**Template line 244:**

```text
{{ printf "system:serviceaccount:%s:%s" (required "Product producer namespace is required" .Values.busterNamespaceBroker.controller.productDecisions.producerNamespace) (required "Product producer ServiceAccount is required" .Values.busterNamespaceBroker.controller.productDecisions.producerServiceAccount) | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-namespace-controller.yaml', 'sha256': '760a82838ffce8fbf2a29f17914a1395b5dbaac61b71742155e378f962ccaee3', 'startUtf16': 0, 'endUtf16': 84, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if and .Values.busterNamespaceBroker.enabled (eq .Values.agentRole "buster") -}}', 'exactTextSha256': '20113aef14d789486e9157aa8df82593572fdd531cf8168c9f8f2a72c7c0a0ef'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-namespace-controller.yaml', 'sha256': '760a82838ffce8fbf2a29f17914a1395b5dbaac61b71742155e378f962ccaee3', 'startUtf16': 9809, 'endUtf16': 9884, 'startLine': 235, 'endLine': 235, 'exactText': '{{- if .Values.busterNamespaceBroker.controller.productDecisions.enabled }}', 'exactTextSha256': '68e18af9e093de3323c883fc460e8ad5a264b52629498a51550caa9763b4726d'}, 'branchTransitions': []}
```

**Template line 246:**

```text
{{ required "Human product issuer is required" .Values.busterNamespaceBroker.controller.productDecisions.issuer | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-namespace-controller.yaml', 'sha256': '760a82838ffce8fbf2a29f17914a1395b5dbaac61b71742155e378f962ccaee3', 'startUtf16': 0, 'endUtf16': 84, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if and .Values.busterNamespaceBroker.enabled (eq .Values.agentRole "buster") -}}', 'exactTextSha256': '20113aef14d789486e9157aa8df82593572fdd531cf8168c9f8f2a72c7c0a0ef'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-namespace-controller.yaml', 'sha256': '760a82838ffce8fbf2a29f17914a1395b5dbaac61b71742155e378f962ccaee3', 'startUtf16': 9809, 'endUtf16': 9884, 'startLine': 235, 'endLine': 235, 'exactText': '{{- if .Values.busterNamespaceBroker.controller.productDecisions.enabled }}', 'exactTextSha256': '68e18af9e093de3323c883fc460e8ad5a264b52629498a51550caa9763b4726d'}, 'branchTransitions': []}
```

**Template line 248:**

```text
{{ required "Human product issuer verify key is required" .Values.busterNamespaceBroker.controller.productDecisions.verifyKey | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-namespace-controller.yaml', 'sha256': '760a82838ffce8fbf2a29f17914a1395b5dbaac61b71742155e378f962ccaee3', 'startUtf16': 0, 'endUtf16': 84, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if and .Values.busterNamespaceBroker.enabled (eq .Values.agentRole "buster") -}}', 'exactTextSha256': '20113aef14d789486e9157aa8df82593572fdd531cf8168c9f8f2a72c7c0a0ef'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-namespace-controller.yaml', 'sha256': '760a82838ffce8fbf2a29f17914a1395b5dbaac61b71742155e378f962ccaee3', 'startUtf16': 9809, 'endUtf16': 9884, 'startLine': 235, 'endLine': 235, 'exactText': '{{- if .Values.busterNamespaceBroker.controller.productDecisions.enabled }}', 'exactTextSha256': '68e18af9e093de3323c883fc460e8ad5a264b52629498a51550caa9763b4726d'}, 'branchTransitions': []}
```

**Template line 250:**

```text
{{ required "Human product actor allowlist is required" .Values.busterNamespaceBroker.controller.productDecisions.allowedActors | toJson | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-namespace-controller.yaml', 'sha256': '760a82838ffce8fbf2a29f17914a1395b5dbaac61b71742155e378f962ccaee3', 'startUtf16': 0, 'endUtf16': 84, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if and .Values.busterNamespaceBroker.enabled (eq .Values.agentRole "buster") -}}', 'exactTextSha256': '20113aef14d789486e9157aa8df82593572fdd531cf8168c9f8f2a72c7c0a0ef'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-namespace-controller.yaml', 'sha256': '760a82838ffce8fbf2a29f17914a1395b5dbaac61b71742155e378f962ccaee3', 'startUtf16': 9809, 'endUtf16': 9884, 'startLine': 235, 'endLine': 235, 'exactText': '{{- if .Values.busterNamespaceBroker.controller.productDecisions.enabled }}', 'exactTextSha256': '68e18af9e093de3323c883fc460e8ad5a264b52629498a51550caa9763b4726d'}, 'branchTransitions': []}
```

**Template line 264:**

```text
{{ required "Ready TLS Secret is required" .Values.busterNamespaceBroker.controller.readiness.tlsSecretName | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-namespace-controller.yaml', 'sha256': '760a82838ffce8fbf2a29f17914a1395b5dbaac61b71742155e378f962ccaee3', 'startUtf16': 0, 'endUtf16': 84, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if and .Values.busterNamespaceBroker.enabled (eq .Values.agentRole "buster") -}}', 'exactTextSha256': '20113aef14d789486e9157aa8df82593572fdd531cf8168c9f8f2a72c7c0a0ef'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-namespace-controller.yaml', 'sha256': '760a82838ffce8fbf2a29f17914a1395b5dbaac61b71742155e378f962ccaee3', 'startUtf16': 11766, 'endUtf16': 11834, 'startLine': 260, 'endLine': 260, 'exactText': '{{- if .Values.busterNamespaceBroker.controller.readiness.enabled }}', 'exactTextSha256': 'c51a78c07e9ec4a81bd3ed4444e2096dad49fe97ef8489707d02de487cd28903'}, 'branchTransitions': []}
```

**Owning / consuming source:**

- [charts/kubeclaw/templates/buster-namespace-controller.yaml:1](../../../charts/kubeclaw/templates/buster-namespace-controller.yaml#L1)

<a id="helm-charts-kubeclaw-templates-buster-namespace-fence-yaml"></a>

## Helm: kubeclaw/templates/buster-namespace-fence.yaml

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 3:**

```text
{{- fail "Buster namespace broker requires Kubernetes >=1.30 with admissionregistration.k8s.io/v1 ValidatingAdmissionPolicy" -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-namespace-fence.yaml', 'sha256': '405866681db66cc38aa8b9018cfdb18bff2fd6a56137ee39632b9eebd808b62d', 'startUtf16': 0, 'endUtf16': 84, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if and .Values.busterNamespaceBroker.enabled (eq .Values.agentRole "buster") -}}', 'exactTextSha256': '20113aef14d789486e9157aa8df82593572fdd531cf8168c9f8f2a72c7c0a0ef'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-namespace-fence.yaml', 'sha256': '405866681db66cc38aa8b9018cfdb18bff2fd6a56137ee39632b9eebd808b62d', 'startUtf16': 85, 'endUtf16': 162, 'startLine': 2, 'endLine': 2, 'exactText': '{{- if not (semverCompare ">=1.30.0-0" .Capabilities.KubeVersion.Version) -}}', 'exactTextSha256': '663cbb46502e45611822709d3ccc6c8a8718f8647c971e422e350a095b3fea1b'}, 'branchTransitions': []}
```

**Owning / consuming source:**

- [charts/kubeclaw/templates/buster-namespace-fence.yaml:1](../../../charts/kubeclaw/templates/buster-namespace-fence.yaml#L1)

<a id="helm-charts-kubeclaw-templates-buster-runtime-pvc-yaml"></a>

## Helm: kubeclaw/templates/buster-runtime-pvc.yaml

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 3:**

```text
{{- fail "The Buster file store requires exactly one service writer" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-runtime-pvc.yaml', 'sha256': 'cacf352b9b0ea8daa2f7d47f59ca00256cc8997621075441a22966da0aca8279', 'startUtf16': 0, 'endUtf16': 50, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if .Values.busterRuntimePersistence.enabled }}', 'exactTextSha256': '26732548aa74a6467f6bf18182908a8ecb85cbfaa431cd72fa84514fa165c2a6'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-runtime-pvc.yaml', 'sha256': 'cacf352b9b0ea8daa2f7d47f59ca00256cc8997621075441a22966da0aca8279', 'startUtf16': 51, 'endUtf16': 92, 'startLine': 2, 'endLine': 2, 'exactText': '{{- if ne (int .Values.replicaCount) 1 }}', 'exactTextSha256': 'a0a71b9530eb521e71cf2a9620b8c17c522090682c9115e8f906d20c6d5912f4'}, 'branchTransitions': []}
```

**Template line 8:**

```text
{{ required "busterRuntimePersistence.claimName is required" .Values.busterRuntimePersistence.claimName }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/buster-runtime-pvc.yaml', 'sha256': 'cacf352b9b0ea8daa2f7d47f59ca00256cc8997621075441a22966da0aca8279', 'startUtf16': 0, 'endUtf16': 50, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if .Values.busterRuntimePersistence.enabled }}', 'exactTextSha256': '26732548aa74a6467f6bf18182908a8ecb85cbfaa431cd72fa84514fa165c2a6'}, 'branchTransitions': []}
```

**Owning / consuming source:**

- [charts/kubeclaw/templates/buster-runtime-pvc.yaml:1](../../../charts/kubeclaw/templates/buster-runtime-pvc.yaml#L1)

<a id="helm-charts-kubeclaw-templates-configmap-worker-trust-yaml"></a>

## Helm: kubeclaw/templates/configmap-worker-trust.yaml

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 3:**

```text
{{- fail "workerTrust.spiffe requires serviceAccount.create=true for the actual release ServiceAccount" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/configmap-worker-trust.yaml', 'sha256': '23ccc1eca6b30efcc57f32e0689a06a5be1ad4fbee967b3632750a95e5d6e7be', 'startUtf16': 0, 'endUtf16': 44, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if .Values.workerTrust.spiffe.enabled }}', 'exactTextSha256': '5939b9cd970b46a5b1c0e8e8ed89bdfdc014c1bc119307f2ea0b64a745084650'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/configmap-worker-trust.yaml', 'sha256': '23ccc1eca6b30efcc57f32e0689a06a5be1ad4fbee967b3632750a95e5d6e7be', 'startUtf16': 45, 'endUtf16': 88, 'startLine': 2, 'endLine': 2, 'exactText': '{{- if not .Values.serviceAccount.create }}', 'exactTextSha256': 'f96eed6542837079efe81b6abbe86eadf8e48eaa96a2e7eb600aa0350aebe3ec'}, 'branchTransitions': []}
```

**Template line 5:**

```text
{{- $trustDomain := required "workerTrust.spiffe.trustDomain is required" .Values.workerTrust.spiffe.trustDomain }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/configmap-worker-trust.yaml', 'sha256': '23ccc1eca6b30efcc57f32e0689a06a5be1ad4fbee967b3632750a95e5d6e7be', 'startUtf16': 0, 'endUtf16': 44, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if .Values.workerTrust.spiffe.enabled }}', 'exactTextSha256': '5939b9cd970b46a5b1c0e8e8ed89bdfdc014c1bc119307f2ea0b64a745084650'}, 'branchTransitions': []}
```

**Template line 119:**

```text
{{- fail "workerTrust.spiffe is supported only for nova, buster, and prism agent roles" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/configmap-worker-trust.yaml', 'sha256': '23ccc1eca6b30efcc57f32e0689a06a5be1ad4fbee967b3632750a95e5d6e7be', 'startUtf16': 0, 'endUtf16': 44, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if .Values.workerTrust.spiffe.enabled }}', 'exactTextSha256': '5939b9cd970b46a5b1c0e8e8ed89bdfdc014c1bc119307f2ea0b64a745084650'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/configmap-worker-trust.yaml', 'sha256': '23ccc1eca6b30efcc57f32e0689a06a5be1ad4fbee967b3632750a95e5d6e7be', 'startUtf16': 1042, 'endUtf16': 1079, 'startLine': 23, 'endLine': 23, 'exactText': '{{- if eq .Values.agentRole "nova" }}', 'exactTextSha256': '8f3c8df3d1381f64b622f19c1132d4302d9375b0fc5eb0fe11e7c298fdfbab4c'}, 'branchTransitions': [{'path': 'charts/kubeclaw/templates/configmap-worker-trust.yaml', 'sha256': '23ccc1eca6b30efcc57f32e0689a06a5be1ad4fbee967b3632750a95e5d6e7be', 'startUtf16': 1757, 'endUtf16': 1801, 'startLine': 35, 'endLine': 35, 'exactText': '{{- else if eq .Values.agentRole "buster" }}', 'exactTextSha256': '555d208332b3528f1f7f1db61d2d25bb71a679719ebb77fae9ef43321a2cdd30'}, {'path': 'charts/kubeclaw/templates/configmap-worker-trust.yaml', 'sha256': '23ccc1eca6b30efcc57f32e0689a06a5be1ad4fbee967b3632750a95e5d6e7be', 'startUtf16': 4533, 'endUtf16': 4576, 'startLine': 84, 'endLine': 84, 'exactText': '{{- else if eq .Values.agentRole "prism" }}', 'exactTextSha256': '860bfa0f966e93dd0ab263652faa79944b85231ef5813fa493dd3e8fba96d6c8'}, {'path': 'charts/kubeclaw/templates/configmap-worker-trust.yaml', 'sha256': '23ccc1eca6b30efcc57f32e0689a06a5be1ad4fbee967b3632750a95e5d6e7be', 'startUtf16': 7396, 'endUtf16': 7407, 'startLine': 118, 'endLine': 118, 'exactText': '{{- else }}', 'exactTextSha256': '080184bdede81db35e6d841ac6f29eb2ecb89db3bcd5d78a8b93f1fa74888eb4'}]}
```

**Owning / consuming source:**

- [charts/kubeclaw/templates/configmap-worker-trust.yaml:1](../../../charts/kubeclaw/templates/configmap-worker-trust.yaml#L1)

<a id="helm-charts-kubeclaw-templates-demo-ready-service-yaml"></a>

## Helm: kubeclaw/templates/demo-ready-service.yaml

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 32:**

```text
{{ required "Ready producer namespace is required" .Values.busterNamespaceBroker.controller.readiness.producerNamespace | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/demo-ready-service.yaml', 'sha256': '770f0e10f731ec8881c879654147fd62b12b3c549e2f88288c561101956be5f1', 'startUtf16': 0, 'endUtf16': 142, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if and .Values.busterNamespaceBroker.enabled (eq .Values.agentRole "buster") .Values.busterNamespaceBroker.controller.readiness.enabled }}', 'exactTextSha256': '49d543e1844bb91270242546de5f3aa8303d43651878aa0ade4a1ddc4631879f'}, 'branchTransitions': []}
```

**Template line 39:**

```text
{{ required "Product producer namespace is required" .Values.busterNamespaceBroker.controller.productDecisions.producerNamespace | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/demo-ready-service.yaml', 'sha256': '770f0e10f731ec8881c879654147fd62b12b3c549e2f88288c561101956be5f1', 'startUtf16': 0, 'endUtf16': 142, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if and .Values.busterNamespaceBroker.enabled (eq .Values.agentRole "buster") .Values.busterNamespaceBroker.controller.readiness.enabled }}', 'exactTextSha256': '49d543e1844bb91270242546de5f3aa8303d43651878aa0ade4a1ddc4631879f'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/demo-ready-service.yaml', 'sha256': '770f0e10f731ec8881c879654147fd62b12b3c549e2f88288c561101956be5f1', 'startUtf16': 1263, 'endUtf16': 1338, 'startLine': 36, 'endLine': 36, 'exactText': '{{- if .Values.busterNamespaceBroker.controller.productDecisions.enabled }}', 'exactTextSha256': '68e18af9e093de3323c883fc460e8ad5a264b52629498a51550caa9763b4726d'}, 'branchTransitions': []}
```

**Owning / consuming source:**

- [charts/kubeclaw/templates/demo-ready-service.yaml:1](../../../charts/kubeclaw/templates/demo-ready-service.yaml#L1)

<a id="helm-charts-kubeclaw-templates-deployment-yaml"></a>

## Helm: kubeclaw/templates/deployment.yaml

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 1376:**

```text
{{- fail "capability provider id must be a DNS label" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 71464, 'endUtf16': 71501, 'startLine': 1372, 'endLine': 1372, 'exactText': '{{- if .Values.capabilityProviders }}', 'exactTextSha256': 'ba3836f8b63e15f73f605c29280c002fc8ae85eed8cd07ba5c67ef91776a801b'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 71550, 'endUtf16': 71616, 'startLine': 1374, 'endLine': 1374, 'exactText': '{{- range $providerId, $provider := .Values.capabilityProviders }}', 'exactTextSha256': 'd5da73c75d9664f4fcc73d718233d727c897bdb6c9e87306b030075ce509c0f6'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 71629, 'endUtf16': 71706, 'startLine': 1375, 'endLine': 1375, 'exactText': '{{- if not (regexMatch "^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$" $providerId) }}', 'exactTextSha256': '342f3e8834fb8826f6eb1e0ea3733d40e75b7ffa1d07df509bf4e7f66515b5e5'}, 'branchTransitions': []}
```

**Template line 1378:**

```text
{{- $agentRole := required (printf "capabilityProviders.%s.agentRole is required" $providerId) $provider.agentRole }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 71464, 'endUtf16': 71501, 'startLine': 1372, 'endLine': 1372, 'exactText': '{{- if .Values.capabilityProviders }}', 'exactTextSha256': 'ba3836f8b63e15f73f605c29280c002fc8ae85eed8cd07ba5c67ef91776a801b'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 71550, 'endUtf16': 71616, 'startLine': 1374, 'endLine': 1374, 'exactText': '{{- range $providerId, $provider := .Values.capabilityProviders }}', 'exactTextSha256': 'd5da73c75d9664f4fcc73d718233d727c897bdb6c9e87306b030075ce509c0f6'}, 'branchTransitions': []}
```

**Template line 1380:**

```text
{{- $capabilities := required (printf "capabilityProviders.%s.capabilities is required" $providerId) $provider.capabilities }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 71464, 'endUtf16': 71501, 'startLine': 1372, 'endLine': 1372, 'exactText': '{{- if .Values.capabilityProviders }}', 'exactTextSha256': 'ba3836f8b63e15f73f605c29280c002fc8ae85eed8cd07ba5c67ef91776a801b'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 71550, 'endUtf16': 71616, 'startLine': 1374, 'endLine': 1374, 'exactText': '{{- range $providerId, $provider := .Values.capabilityProviders }}', 'exactTextSha256': 'd5da73c75d9664f4fcc73d718233d727c897bdb6c9e87306b030075ce509c0f6'}, 'branchTransitions': []}
```

**Template line 1384:**

```text
{{- fail (printf "capabilityProviders.%s capability name is invalid" $providerId) }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 71464, 'endUtf16': 71501, 'startLine': 1372, 'endLine': 1372, 'exactText': '{{- if .Values.capabilityProviders }}', 'exactTextSha256': 'ba3836f8b63e15f73f605c29280c002fc8ae85eed8cd07ba5c67ef91776a801b'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 71550, 'endUtf16': 71616, 'startLine': 1374, 'endLine': 1374, 'exactText': '{{- range $providerId, $provider := .Values.capabilityProviders }}', 'exactTextSha256': 'd5da73c75d9664f4fcc73d718233d727c897bdb6c9e87306b030075ce509c0f6'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 72193, 'endUtf16': 72242, 'startLine': 1382, 'endLine': 1382, 'exactText': '{{- range $capability, $route := $capabilities }}', 'exactTextSha256': 'da2b8dfa9b240b72b555c50b2e014397b670ec696c4998db71fa25a67d8b253c'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 72255, 'endUtf16': 72332, 'startLine': 1383, 'endLine': 1383, 'exactText': '{{- if not (regexMatch "^[a-z][a-z0-9]*(\\\\.[a-z][a-z0-9]*)+$" $capability) }}', 'exactTextSha256': '6cd61a700f0298f5ad37f07b3d59288d4615a58877a93b08f08c7799216c0335'}, 'branchTransitions': []}
```

**Template line 1386:**

```text
{{- $adapter := required (printf "capabilityProviders.%s.capabilities.%s.adapter is required" $providerId $capability) $route.adapter }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 71464, 'endUtf16': 71501, 'startLine': 1372, 'endLine': 1372, 'exactText': '{{- if .Values.capabilityProviders }}', 'exactTextSha256': 'ba3836f8b63e15f73f605c29280c002fc8ae85eed8cd07ba5c67ef91776a801b'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 71550, 'endUtf16': 71616, 'startLine': 1374, 'endLine': 1374, 'exactText': '{{- range $providerId, $provider := .Values.capabilityProviders }}', 'exactTextSha256': 'd5da73c75d9664f4fcc73d718233d727c897bdb6c9e87306b030075ce509c0f6'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 72193, 'endUtf16': 72242, 'startLine': 1382, 'endLine': 1382, 'exactText': '{{- range $capability, $route := $capabilities }}', 'exactTextSha256': 'da2b8dfa9b240b72b555c50b2e014397b670ec696c4998db71fa25a67d8b253c'}, 'branchTransitions': []}
```

**Template line 1388:**

```text
{{- fail (printf "capabilityProviders.%s.capabilities.%s.adapter must be a DNS label" $providerId $capability) }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 71464, 'endUtf16': 71501, 'startLine': 1372, 'endLine': 1372, 'exactText': '{{- if .Values.capabilityProviders }}', 'exactTextSha256': 'ba3836f8b63e15f73f605c29280c002fc8ae85eed8cd07ba5c67ef91776a801b'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 71550, 'endUtf16': 71616, 'startLine': 1374, 'endLine': 1374, 'exactText': '{{- range $providerId, $provider := .Values.capabilityProviders }}', 'exactTextSha256': 'd5da73c75d9664f4fcc73d718233d727c897bdb6c9e87306b030075ce509c0f6'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 72193, 'endUtf16': 72242, 'startLine': 1382, 'endLine': 1382, 'exactText': '{{- range $capability, $route := $capabilities }}', 'exactTextSha256': 'da2b8dfa9b240b72b555c50b2e014397b670ec696c4998db71fa25a67d8b253c'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 72614, 'endUtf16': 72688, 'startLine': 1387, 'endLine': 1387, 'exactText': '{{- if not (regexMatch "^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$" $adapter) }}', 'exactTextSha256': '46262b4219d4f68410087198ef38e8e08df7e1f16bf833b58eb9a71962fd4f4e'}, 'branchTransitions': []}
```

**Template line 1390:**

```text
{{- $port := int (required (printf "capabilityProviders.%s.capabilities.%s.port is required" $providerId $capability) $route.port) }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 71464, 'endUtf16': 71501, 'startLine': 1372, 'endLine': 1372, 'exactText': '{{- if .Values.capabilityProviders }}', 'exactTextSha256': 'ba3836f8b63e15f73f605c29280c002fc8ae85eed8cd07ba5c67ef91776a801b'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 71550, 'endUtf16': 71616, 'startLine': 1374, 'endLine': 1374, 'exactText': '{{- range $providerId, $provider := .Values.capabilityProviders }}', 'exactTextSha256': 'd5da73c75d9664f4fcc73d718233d727c897bdb6c9e87306b030075ce509c0f6'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 72193, 'endUtf16': 72242, 'startLine': 1382, 'endLine': 1382, 'exactText': '{{- range $capability, $route := $capabilities }}', 'exactTextSha256': 'da2b8dfa9b240b72b555c50b2e014397b670ec696c4998db71fa25a67d8b253c'}, 'branchTransitions': []}
```

**Template line 1392:**

```text
{{- fail (printf "capabilityProviders.%s.capabilities.%s.port must be between 1 and 65535" $providerId $capability) }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 71464, 'endUtf16': 71501, 'startLine': 1372, 'endLine': 1372, 'exactText': '{{- if .Values.capabilityProviders }}', 'exactTextSha256': 'ba3836f8b63e15f73f605c29280c002fc8ae85eed8cd07ba5c67ef91776a801b'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 71550, 'endUtf16': 71616, 'startLine': 1374, 'endLine': 1374, 'exactText': '{{- range $providerId, $provider := .Values.capabilityProviders }}', 'exactTextSha256': 'd5da73c75d9664f4fcc73d718233d727c897bdb6c9e87306b030075ce509c0f6'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 72193, 'endUtf16': 72242, 'startLine': 1382, 'endLine': 1382, 'exactText': '{{- range $capability, $route := $capabilities }}', 'exactTextSha256': 'da2b8dfa9b240b72b555c50b2e014397b670ec696c4998db71fa25a67d8b253c'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 72996, 'endUtf16': 73038, 'startLine': 1391, 'endLine': 1391, 'exactText': '{{- if or (lt $port 1) (gt $port 65535) }}', 'exactTextSha256': '7792225d7fdc2a724e05778ae950a65c0fd310223842174dba1dd3409a88ff2e'}, 'branchTransitions': []}
```

**Template line 1396:**

```text
{{- fail (printf "capabilityProviders.%s.capabilities.%s.scheme must be http or https" $providerId $capability) }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 71464, 'endUtf16': 71501, 'startLine': 1372, 'endLine': 1372, 'exactText': '{{- if .Values.capabilityProviders }}', 'exactTextSha256': 'ba3836f8b63e15f73f605c29280c002fc8ae85eed8cd07ba5c67ef91776a801b'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 71550, 'endUtf16': 71616, 'startLine': 1374, 'endLine': 1374, 'exactText': '{{- range $providerId, $provider := .Values.capabilityProviders }}', 'exactTextSha256': 'd5da73c75d9664f4fcc73d718233d727c897bdb6c9e87306b030075ce509c0f6'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 72193, 'endUtf16': 72242, 'startLine': 1382, 'endLine': 1382, 'exactText': '{{- range $capability, $route := $capabilities }}', 'exactTextSha256': 'da2b8dfa9b240b72b555c50b2e014397b670ec696c4998db71fa25a67d8b253c'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 73264, 'endUtf16': 73313, 'startLine': 1395, 'endLine': 1395, 'exactText': '{{- if not (has $scheme (list "http" "https")) }}', 'exactTextSha256': '23afc38558b0366f91487af77900c3fca85af486216bfbdabc589beaa994f128'}, 'branchTransitions': []}
```

**Template line 1402:**

```text
{{- fail (printf "capabilityProviders.%s.capabilities.%s.proxyPort must be between 1 and 65535" $providerId $capability) }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 71464, 'endUtf16': 71501, 'startLine': 1372, 'endLine': 1372, 'exactText': '{{- if .Values.capabilityProviders }}', 'exactTextSha256': 'ba3836f8b63e15f73f605c29280c002fc8ae85eed8cd07ba5c67ef91776a801b'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 71550, 'endUtf16': 71616, 'startLine': 1374, 'endLine': 1374, 'exactText': '{{- range $providerId, $provider := .Values.capabilityProviders }}', 'exactTextSha256': 'd5da73c75d9664f4fcc73d718233d727c897bdb6c9e87306b030075ce509c0f6'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 72193, 'endUtf16': 72242, 'startLine': 1382, 'endLine': 1382, 'exactText': '{{- range $capability, $route := $capabilities }}', 'exactTextSha256': 'da2b8dfa9b240b72b555c50b2e014397b670ec696c4998db71fa25a67d8b253c'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 73551, 'endUtf16': 73628, 'startLine': 1399, 'endLine': 1399, 'exactText': '{{- if and $.Values.workerTrust.spiffe.enabled (hasKey $route "proxyPort") }}', 'exactTextSha256': 'e22c65c92f149902f927a6593b91dc08a4873b7c6b30bbc530189a8f9d4ee9b1'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 73695, 'endUtf16': 73747, 'startLine': 1401, 'endLine': 1401, 'exactText': '{{- if or (lt $proxyPort 1) (gt $proxyPort 65535) }}', 'exactTextSha256': '7e2e65ddc18b606f4f1cb90aed0bdb6e7f0ed7855c6f46e4d539e1d49a7d5dc0'}, 'branchTransitions': []}
```

**Template line 1593:**

```text
{{- fail "Buster registry configuration requires exactly one extraContainers entry named buster-v2-runtime" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 82475, 'endUtf16': 82585, 'startLine': 1592, 'endLine': 1592, 'exactText': '{{- if or (gt (int $registryWorkers) 1) (and (eq .Values.agentRole "buster") (ne (int $registryWorkers) 1)) }}', 'exactTextSha256': '1ea7d1d291e6d35b4c95506774481a9319b5b6a01e7fbbfa59978d3a95787c4e'}, 'branchTransitions': []}
```

**Template line 1652:**

```text
{{ required "registry CA secret key is required" $client.caSecretKey | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 85212, 'endUtf16': 85361, 'startLine': 1646, 'endLine': 1646, 'exactText': '{{- range $name, $client := dict "registry" .Values.runtimeInfrastructure.registry "dockerHubMirror" .Values.runtimeInfrastructure.dockerHubMirror }}', 'exactTextSha256': 'a30e6a5fd56622ba7dd281744a2a9b687c1cc74dbaeb4a999692784b822520ff'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 85370, 'endUtf16': 85400, 'startLine': 1647, 'endLine': 1647, 'exactText': '{{- if $client.caSecretName }}', 'exactTextSha256': 'a854879a33a2bc6de2cbd7fa3dd3625ca753006accb55e94337f758430c87acf'}, 'branchTransitions': []}
```

**Template line 1719:**

```text
{{ required "archviewer.existingSecret is required" .Values.archviewer.existingSecret | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/deployment.yaml', 'sha256': '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883', 'startUtf16': 87952, 'endUtf16': 87988, 'startLine': 1716, 'endLine': 1716, 'exactText': '{{- if .Values.archviewer.enabled }}', 'exactTextSha256': '27ee7b736d120d7b6c43c1d3a8b6c607d2a32ddbf207cf430773f90b6796e846'}, 'branchTransitions': []}
```

**Owning / consuming source:**

- [charts/kubeclaw/templates/deployment.yaml:1](../../../charts/kubeclaw/templates/deployment.yaml#L1)

<a id="helm-charts-kubeclaw-templates-rbac-yaml"></a>

## Helm: kubeclaw/templates/rbac.yaml

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 80:**

```text
{{- $operatorNamespace := required "verificationRead.tailscaleOperatorNamespace is required" .Values.busterNamespaceBroker.leaseClient.verificationRead.tailscaleOperatorNamespace }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/rbac.yaml', 'sha256': '66bde2d8f04e0e77e373cbd6e7722c00fb98345afa1042487a2b60f777914f3d', 'startUtf16': 1856, 'endUtf16': 1924, 'startLine': 46, 'endLine': 46, 'exactText': '{{- if and .Values.serviceAccount.create $verificationReadEnabled }}', 'exactTextSha256': '5691df857640beeeb0dc059e39278f2e969516ddad338220312c00db184f685e'}, 'branchTransitions': []}
```

**Template line 81:**

```text
{{- $oauthSecret := required "verificationRead.tailscaleOAuthSecretName is required" .Values.busterNamespaceBroker.leaseClient.verificationRead.tailscaleOAuthSecretName }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/kubeclaw/templates/rbac.yaml', 'sha256': '66bde2d8f04e0e77e373cbd6e7722c00fb98345afa1042487a2b60f777914f3d', 'startUtf16': 1856, 'endUtf16': 1924, 'startLine': 46, 'endLine': 46, 'exactText': '{{- if and .Values.serviceAccount.create $verificationReadEnabled }}', 'exactTextSha256': '5691df857640beeeb0dc059e39278f2e969516ddad338220312c00db184f685e'}, 'branchTransitions': []}
```

**Owning / consuming source:**

- [charts/kubeclaw/templates/rbac.yaml:1](../../../charts/kubeclaw/templates/rbac.yaml#L1)

<a id="helm-charts-ops-pod-templates-network-yaml"></a>

## Helm: ops-pod/templates/network.yaml

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 3:**

```text
{{- fail "networkPolicy.apiServerCIDRs is required; use scripts/deploy-ops-pod.sh deploy to discover it" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/ops-pod/templates/network.yaml', 'sha256': '1a96b733c35c853cf2064dd57caae1f061a94a023cc8637b4799464ad163e283', 'startUtf16': 0, 'endUtf16': 39, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if .Values.networkPolicy.enabled }}', 'exactTextSha256': '6af48eb3a288753fb46bb66f631e51337c800a9942b44643bc8504f5ea813a66'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/ops-pod/templates/network.yaml', 'sha256': '1a96b733c35c853cf2064dd57caae1f061a94a023cc8637b4799464ad163e283', 'startUtf16': 40, 'endUtf16': 90, 'startLine': 2, 'endLine': 2, 'exactText': '{{- if not .Values.networkPolicy.apiServerCIDRs }}', 'exactTextSha256': 'a236827366580a3b91c30b14e607a2953bb0b5b644182d0f4ec41bb4757d7d63'}, 'branchTransitions': []}
```

**Owning / consuming source:**

- [charts/ops-pod/templates/network.yaml:1](../../../charts/ops-pod/templates/network.yaml#L1)

<a id="helm-charts-ops-pod-templates-rbac-yaml"></a>

## Helm: ops-pod/templates/rbac.yaml

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 65:**

```text
{{- fail "rbac.execNamespaces must contain valid namespace names" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/ops-pod/templates/rbac.yaml', 'sha256': '103ed540a9b71ca0fdde5d693e5e4d07b2943910e79116bbd7206d528668874b', 'startUtf16': 1965, 'endUtf16': 2005, 'startLine': 63, 'endLine': 63, 'exactText': '{{- range .Values.rbac.execNamespaces }}', 'exactTextSha256': '1d4c72830418b3a1085bbc76774aa9280094b3300052f06a8b87a2b8f5739a83'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/ops-pod/templates/rbac.yaml', 'sha256': '103ed540a9b71ca0fdde5d693e5e4d07b2943910e79116bbd7206d528668874b', 'startUtf16': 2006, 'endUtf16': 2115, 'startLine': 64, 'endLine': 64, 'exactText': '{{- if or (not (kindIs "string" .)) (not (regexMatch "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$" .)) (gt (len .) 63) }}', 'exactTextSha256': '1758ca597b837f99e3c40874210555b08b16d4825d5d291ec9f1521e67f7b034'}, 'branchTransitions': []}
```

**Owning / consuming source:**

- [charts/ops-pod/templates/rbac.yaml:1](../../../charts/ops-pod/templates/rbac.yaml#L1)

<a id="helm-charts-ops-pod-templates-workload-yaml"></a>

## Helm: ops-pod/templates/workload.yaml

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 3:**

```text
{{- fail "codexImage must be an immutable image@sha256:digest" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/ops-pod/templates/workload.yaml', 'sha256': '3471a815948e99e52b03b7952f1076c9d21afddbd24b62c37e1c848b7a129d58', 'startUtf16': 31, 'endUtf16': 103, 'startLine': 2, 'endLine': 2, 'exactText': '{{- if not (regexMatch "^.+@sha256:[a-f0-9]{64}$" .Values.codexImage) }}', 'exactTextSha256': '7b64ff6d473f7ae59a8c7e77499dd24b1e62117ebcf6d18d8573b85347f3b252'}, 'branchTransitions': []}
```

**Template line 6:**

```text
{{- fail "mcpImage must be an immutable image@sha256:digest" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/ops-pod/templates/workload.yaml', 'sha256': '3471a815948e99e52b03b7952f1076c9d21afddbd24b62c37e1c848b7a129d58', 'startUtf16': 181, 'endUtf16': 251, 'startLine': 5, 'endLine': 5, 'exactText': '{{- if not (regexMatch "^.+@sha256:[a-f0-9]{64}$" .Values.mcpImage) }}', 'exactTextSha256': 'fc0862b4aaf49b439013820ff67e49e3de9cdd9a5d4a932d2ed600d17406803f'}, 'branchTransitions': []}
```

**Owning / consuming source:**

- [charts/ops-pod/templates/workload.yaml:1](../../../charts/ops-pod/templates/workload.yaml#L1)

<a id="helm-charts-prism-templates-helpers-tpl"></a>

## Helm: `prism/templates/_helpers.tpl`

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 3:**

```text
{{- $repository := required "Prism image repository is required" .repository -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/prism/templates/_helpers.tpl', 'sha256': '33d5044abeae2faabd1202e544aeb33b34a30fb7afe9300b4bfb11d7ef914e49', 'startUtf16': 52, 'endUtf16': 83, 'startLine': 2, 'endLine': 2, 'exactText': '{{- define "prism.imageRef" -}}', 'exactTextSha256': '16ad73b216a7e08127cf03895ae61e3cdb22aee6a4afe9c637e28f8f71a23bbc'}, 'branchTransitions': []}
```

**Template line 4:**

```text
{{- $digest := required "Prism image digest is required" .digest -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/prism/templates/_helpers.tpl', 'sha256': '33d5044abeae2faabd1202e544aeb33b34a30fb7afe9300b4bfb11d7ef914e49', 'startUtf16': 52, 'endUtf16': 83, 'startLine': 2, 'endLine': 2, 'exactText': '{{- define "prism.imageRef" -}}', 'exactTextSha256': '16ad73b216a7e08127cf03895ae61e3cdb22aee6a4afe9c637e28f8f71a23bbc'}, 'branchTransitions': []}
```

**Template line 6:**

```text
{{- fail "Prism image digest must be sha256:<64 lowercase hex characters>" -}}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/prism/templates/_helpers.tpl', 'sha256': '33d5044abeae2faabd1202e544aeb33b34a30fb7afe9300b4bfb11d7ef914e49', 'startUtf16': 52, 'endUtf16': 83, 'startLine': 2, 'endLine': 2, 'exactText': '{{- define "prism.imageRef" -}}', 'exactTextSha256': '16ad73b216a7e08127cf03895ae61e3cdb22aee6a4afe9c637e28f8f71a23bbc'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/prism/templates/_helpers.tpl', 'sha256': '33d5044abeae2faabd1202e544aeb33b34a30fb7afe9300b4bfb11d7ef914e49', 'startUtf16': 234, 'endUtf16': 293, 'startLine': 5, 'endLine': 5, 'exactText': '{{- if not (regexMatch "^sha256:[0-9a-f]{64}$" $digest) -}}', 'exactTextSha256': '0432f066b6e0c651d18a94d22fd8108d738f8ef50765f997a39081ddc053fd55'}, 'branchTransitions': []}
```

**Owning / consuming source:**

- [charts/prism/templates/_helpers.tpl:1](../../../charts/prism/templates/_helpers.tpl#L1)
- [charts/prism/templates/backup.yaml:59](../../../charts/prism/templates/backup.yaml#L59)
- [charts/prism/templates/ingestion.yaml:20](../../../charts/prism/templates/ingestion.yaml#L20)

<a id="helm-charts-prism-templates-product-decisions-tpl"></a>

## Helm: `prism/templates/_product-decisions.tpl`

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 4:**

```text
{{ fail "Product decisions require the authenticated Tailscale Studio ingress" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/prism/templates/_product-decisions.tpl', 'sha256': 'bf5fb46a70cc33359e8cb08011c36ebdf27ca195960d4911ff49fc92ed1eee2c', 'startUtf16': 0, 'endUtf16': 48, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "prism.productDecisions.validate" -}}', 'exactTextSha256': '0d6d45147e1a179c63de734a8948fb22e4766b16bfcca11c565b0b5c6ee5d2f5'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/prism/templates/_product-decisions.tpl', 'sha256': 'bf5fb46a70cc33359e8cb08011c36ebdf27ca195960d4911ff49fc92ed1eee2c', 'startUtf16': 101, 'endUtf16': 127, 'startLine': 3, 'endLine': 3, 'exactText': '{{- if $config.enabled -}}', 'exactTextSha256': 'f57d8bb9f0b53ec45d34bc20b8eb04d17d6fdf654d9500861953cb20d3b54b02'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/prism/templates/_product-decisions.tpl', 'sha256': 'bf5fb46a70cc33359e8cb08011c36ebdf27ca195960d4911ff49fc92ed1eee2c', 'startUtf16': 128, 'endUtf16': 168, 'startLine': 4, 'endLine': 4, 'exactText': '{{- if not .Values.tailscale.enabled -}}', 'exactTextSha256': 'e336edff31e7da6b6153b77f271a6ef275d7fb97bae3dceff8f44a96a66163e0'}, 'branchTransitions': []}
```

**Template line 5:**

```text
{{ fail "Product decision signing authority must use a separate Secret" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/prism/templates/_product-decisions.tpl', 'sha256': 'bf5fb46a70cc33359e8cb08011c36ebdf27ca195960d4911ff49fc92ed1eee2c', 'startUtf16': 0, 'endUtf16': 48, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "prism.productDecisions.validate" -}}', 'exactTextSha256': '0d6d45147e1a179c63de734a8948fb22e4766b16bfcca11c565b0b5c6ee5d2f5'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/prism/templates/_product-decisions.tpl', 'sha256': 'bf5fb46a70cc33359e8cb08011c36ebdf27ca195960d4911ff49fc92ed1eee2c', 'startUtf16': 101, 'endUtf16': 127, 'startLine': 3, 'endLine': 3, 'exactText': '{{- if $config.enabled -}}', 'exactTextSha256': 'f57d8bb9f0b53ec45d34bc20b8eb04d17d6fdf654d9500861953cb20d3b54b02'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/prism/templates/_product-decisions.tpl', 'sha256': 'bf5fb46a70cc33359e8cb08011c36ebdf27ca195960d4911ff49fc92ed1eee2c', 'startUtf16': 261, 'endUtf16': 324, 'startLine': 5, 'endLine': 5, 'exactText': '{{- if eq $config.signingSecretName .Values.secrets.runtime -}}', 'exactTextSha256': 'bf4dc330dc64b38761b5eac35197aa42f7ee0fa4626d61e3f85e2dd8a2faf069'}, 'branchTransitions': []}
```

**Template line 7:**

```text
{{ fail (printf "Product decisions require %s" $name) }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/prism/templates/_product-decisions.tpl', 'sha256': 'bf5fb46a70cc33359e8cb08011c36ebdf27ca195960d4911ff49fc92ed1eee2c', 'startUtf16': 0, 'endUtf16': 48, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "prism.productDecisions.validate" -}}', 'exactTextSha256': '0d6d45147e1a179c63de734a8948fb22e4766b16bfcca11c565b0b5c6ee5d2f5'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/prism/templates/_product-decisions.tpl', 'sha256': 'bf5fb46a70cc33359e8cb08011c36ebdf27ca195960d4911ff49fc92ed1eee2c', 'startUtf16': 101, 'endUtf16': 127, 'startLine': 3, 'endLine': 3, 'exactText': '{{- if $config.enabled -}}', 'exactTextSha256': 'f57d8bb9f0b53ec45d34bc20b8eb04d17d6fdf654d9500861953cb20d3b54b02'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/prism/templates/_product-decisions.tpl', 'sha256': 'bf5fb46a70cc33359e8cb08011c36ebdf27ca195960d4911ff49fc92ed1eee2c', 'startUtf16': 410, 'endUtf16': 637, 'startLine': 6, 'endLine': 6, 'exactText': '{{- range $name := list "issuer" "origin" "authorityRevision" "signingSecretName" "signingSecretKey" "controllerUrl" "controllerNamespace" "controllerRelease" "controllerCaSecretName" "controllerCaSecretKey" "tokenAudience" -}}', 'exactTextSha256': '401db9b48d0b7721c2b3548d41e3c768c2413bf5a49a884e61b87e3f00c97dff'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/prism/templates/_product-decisions.tpl', 'sha256': 'bf5fb46a70cc33359e8cb08011c36ebdf27ca195960d4911ff49fc92ed1eee2c', 'startUtf16': 638, 'endUtf16': 674, 'startLine': 7, 'endLine': 7, 'exactText': '{{- if not (index $config $name) -}}', 'exactTextSha256': '831bdb1bcb40166ceb714cdf21d50ebf168df06274414f8374b339887991dece'}, 'branchTransitions': []}
```

**Template line 9:**

```text
{{ fail "Product decisions require an explicit operator allowlist" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/prism/templates/_product-decisions.tpl', 'sha256': 'bf5fb46a70cc33359e8cb08011c36ebdf27ca195960d4911ff49fc92ed1eee2c', 'startUtf16': 0, 'endUtf16': 48, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "prism.productDecisions.validate" -}}', 'exactTextSha256': '0d6d45147e1a179c63de734a8948fb22e4766b16bfcca11c565b0b5c6ee5d2f5'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/prism/templates/_product-decisions.tpl', 'sha256': 'bf5fb46a70cc33359e8cb08011c36ebdf27ca195960d4911ff49fc92ed1eee2c', 'startUtf16': 101, 'endUtf16': 127, 'startLine': 3, 'endLine': 3, 'exactText': '{{- if $config.enabled -}}', 'exactTextSha256': 'f57d8bb9f0b53ec45d34bc20b8eb04d17d6fdf654d9500861953cb20d3b54b02'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/prism/templates/_product-decisions.tpl', 'sha256': 'bf5fb46a70cc33359e8cb08011c36ebdf27ca195960d4911ff49fc92ed1eee2c', 'startUtf16': 754, 'endUtf16': 786, 'startLine': 9, 'endLine': 9, 'exactText': '{{- if not $config.operators -}}', 'exactTextSha256': 'db71799655c2bc36fa3b5098ba3814c14a8c6725272328ffe1af347326f3f57c'}, 'branchTransitions': []}
```

**Template line 11:**

```text
{{ fail "Product operator identities must be nonempty and have no surrounding whitespace" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/prism/templates/_product-decisions.tpl', 'sha256': 'bf5fb46a70cc33359e8cb08011c36ebdf27ca195960d4911ff49fc92ed1eee2c', 'startUtf16': 0, 'endUtf16': 48, 'startLine': 1, 'endLine': 1, 'exactText': '{{- define "prism.productDecisions.validate" -}}', 'exactTextSha256': '0d6d45147e1a179c63de734a8948fb22e4766b16bfcca11c565b0b5c6ee5d2f5'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/prism/templates/_product-decisions.tpl', 'sha256': 'bf5fb46a70cc33359e8cb08011c36ebdf27ca195960d4911ff49fc92ed1eee2c', 'startUtf16': 101, 'endUtf16': 127, 'startLine': 3, 'endLine': 3, 'exactText': '{{- if $config.enabled -}}', 'exactTextSha256': 'f57d8bb9f0b53ec45d34bc20b8eb04d17d6fdf654d9500861953cb20d3b54b02'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/prism/templates/_product-decisions.tpl', 'sha256': 'bf5fb46a70cc33359e8cb08011c36ebdf27ca195960d4911ff49fc92ed1eee2c', 'startUtf16': 867, 'endUtf16': 908, 'startLine': 10, 'endLine': 10, 'exactText': '{{- range $actor := $config.operators -}}', 'exactTextSha256': '051a2d2042d8e0038e298b45bfc14f4c225f4f51975484bc94c3978eac312563'}, 'branchTransitions': []}
```

```text
{'opening': {'path': 'charts/prism/templates/_product-decisions.tpl', 'sha256': 'bf5fb46a70cc33359e8cb08011c36ebdf27ca195960d4911ff49fc92ed1eee2c', 'startUtf16': 909, 'endUtf16': 963, 'startLine': 11, 'endLine': 11, 'exactText': '{{- if or (eq $actor "") (ne $actor (trim $actor)) -}}', 'exactTextSha256': '7712be0c826fec8cdd7a4826c9ebbcad6bf37875f45a37301e54d122f550646a'}, 'branchTransitions': []}
```

**Owning / consuming source:**

- [charts/prism/templates/_product-decisions.tpl:1](../../../charts/prism/templates/_product-decisions.tpl#L1)
- [charts/prism/templates/workloads.yaml:4](../../../charts/prism/templates/workloads.yaml#L4)

<a id="helm-charts-prism-templates-configmap-worker-trust-yaml"></a>

## Helm: prism/templates/configmap-worker-trust.yaml

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 2:**

```text
{{- $trustDomain := required "workerTrust.spiffe.trustDomain is required" .Values.workerTrust.spiffe.trustDomain }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/prism/templates/configmap-worker-trust.yaml', 'sha256': '61d7e98c21c7f9ae69fc7a5bbeec145fff6c8c85123763cb8cdd8fb562c1ebd6', 'startUtf16': 0, 'endUtf16': 44, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if .Values.workerTrust.spiffe.enabled }}', 'exactTextSha256': '5939b9cd970b46a5b1c0e8e8ed89bdfdc014c1bc119307f2ea0b64a745084650'}, 'branchTransitions': []}
```

**Owning / consuming source:**

- [charts/prism/templates/configmap-worker-trust.yaml:1](../../../charts/prism/templates/configmap-worker-trust.yaml#L1)

<a id="helm-charts-prism-templates-ingestion-yaml"></a>

## Helm: prism/templates/ingestion.yaml

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 25:**

```text
{{ required "ingestion.resources.requests.cpu requires operator sizing" .Values.ingestion.resources.requests.cpu | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/prism/templates/ingestion.yaml', 'sha256': '73f19bc39066d2f6f0944846c2784c193a4d1e59202ed737d3a6c6ff8ec77f98', 'startUtf16': 0, 'endUtf16': 35, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if .Values.ingestion.enabled }}', 'exactTextSha256': 'a80f7a7a964be06b30f39f13c3e56ddf5499e39d36f385d3a186f0ddda8106c7'}, 'branchTransitions': []}
```

**Template line 26:**

```text
{{ required "ingestion.resources.requests.memory requires operator sizing" .Values.ingestion.resources.requests.memory | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/prism/templates/ingestion.yaml', 'sha256': '73f19bc39066d2f6f0944846c2784c193a4d1e59202ed737d3a6c6ff8ec77f98', 'startUtf16': 0, 'endUtf16': 35, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if .Values.ingestion.enabled }}', 'exactTextSha256': 'a80f7a7a964be06b30f39f13c3e56ddf5499e39d36f385d3a186f0ddda8106c7'}, 'branchTransitions': []}
```

**Template line 28:**

```text
{{ required "ingestion.resources.limits.cpu requires operator sizing" .Values.ingestion.resources.limits.cpu | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/prism/templates/ingestion.yaml', 'sha256': '73f19bc39066d2f6f0944846c2784c193a4d1e59202ed737d3a6c6ff8ec77f98', 'startUtf16': 0, 'endUtf16': 35, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if .Values.ingestion.enabled }}', 'exactTextSha256': 'a80f7a7a964be06b30f39f13c3e56ddf5499e39d36f385d3a186f0ddda8106c7'}, 'branchTransitions': []}
```

**Template line 29:**

```text
{{ required "ingestion.resources.limits.memory requires operator sizing" .Values.ingestion.resources.limits.memory | quote }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/prism/templates/ingestion.yaml', 'sha256': '73f19bc39066d2f6f0944846c2784c193a4d1e59202ed737d3a6c6ff8ec77f98', 'startUtf16': 0, 'endUtf16': 35, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if .Values.ingestion.enabled }}', 'exactTextSha256': 'a80f7a7a964be06b30f39f13c3e56ddf5499e39d36f385d3a186f0ddda8106c7'}, 'branchTransitions': []}
```

**Owning / consuming source:**

- [charts/prism/templates/ingestion.yaml:1](../../../charts/prism/templates/ingestion.yaml#L1)

<a id="helm-charts-prism-templates-jobs-yaml"></a>

## Helm: prism/templates/jobs.yaml

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 2:**

```text
{{- $postgresSecret := required "postgresql.existingSecret is required when postgresql.enabled=true" .Values.postgresql.existingSecret }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/prism/templates/jobs.yaml', 'sha256': 'ed074c7d460591a458e2bfe3967e93ea4632588f460500d2e7965d68324140da', 'startUtf16': 0, 'endUtf16': 36, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if .Values.postgresql.enabled }}', 'exactTextSha256': '74db8bc35c69dcc5289372574b35078511ebe5ea00b4e6ebaa5f1ccd67041787'}, 'branchTransitions': []}
```

**Owning / consuming source:**

- [charts/prism/templates/jobs.yaml:1](../../../charts/prism/templates/jobs.yaml#L1)

<a id="helm-charts-prism-templates-postgresql-yaml"></a>

## Helm: prism/templates/postgresql.yaml

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 2:**

```text
{{- $postgresSecret := required "postgresql.existingSecret is required when postgresql.enabled=true" .Values.postgresql.existingSecret }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/prism/templates/postgresql.yaml', 'sha256': 'e81248bfa623695e0e79f36ddf347ad75a1d7bc449a4250287a96a80e17742c1', 'startUtf16': 0, 'endUtf16': 36, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if .Values.postgresql.enabled }}', 'exactTextSha256': '74db8bc35c69dcc5289372574b35078511ebe5ea00b4e6ebaa5f1ccd67041787'}, 'branchTransitions': []}
```

**Owning / consuming source:**

- [charts/prism/templates/postgresql.yaml:1](../../../charts/prism/templates/postgresql.yaml#L1)

<a id="helm-charts-prism-templates-workloads-yaml"></a>

## Helm: prism/templates/workloads.yaml

**Representation:** render-diagnostic-family

**Identity / construction:** Helm fail/required diagnostic messages in the expressions below. no separate error-code field.

**Trigger:** The listed required expressions reject their empty value argument. Each fail expression rejects only when its listed enclosing branches execute.

**Effect:** Helm rendering reports a diagnostic failure. This is not a pod runtime error or proof of cluster state.

**Retry boundary:** No retry policy in these diagnostics.

**Safe next action:** Locate the exact message below. Correct its value or guard in the named template, then render again before applying. Do not infer live cluster state.

**Retained evidence:** No runtime retention guarantee follows from rendering.

**Consumer / translation:** Helm evaluates this template or its included helper during rendering. A render diagnostic is not a pod-runtime failure. use the actual helper and caller links.

### Render diagnostics and guards

Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.

**Template line 2:**

```text
{{- fail "control.replicas must be 1 while prism-artifacts uses ReadWriteOnce storage" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/prism/templates/workloads.yaml', 'sha256': '9bb2865f5d232b2cc5fac39259c8957e573decc891d2c9b25d7554da01148739', 'startUtf16': 0, 'endUtf16': 45, 'startLine': 1, 'endLine': 1, 'exactText': '{{- if ne (int .Values.control.replicas) 1 }}', 'exactTextSha256': '0a2174ce1c1e05ee46aed4018dee39a346c9d0dee8180be58ce3688188a98ad4'}, 'branchTransitions': []}
```

**Template line 6:**

```text
{{- fail "native Prism requires one worker, its selected namespace/node and generated policy digest" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/prism/templates/workloads.yaml', 'sha256': '9bb2865f5d232b2cc5fac39259c8957e573decc891d2c9b25d7554da01148739', 'startUtf16': 198, 'endUtf16': 411, 'startLine': 5, 'endLine': 5, 'exactText': '{{- if or (ne (int .Values.worker.replicas) 1) (ne .Values.worker.native.namespace .Release.Namespace) (not .Values.worker.native.nodeName) (not (regexMatch "^[a-f0-9]{64}$" .Values.worker.native.policyDigest)) }}', 'exactTextSha256': '9b90f4afcb5139929df8a575717a96d6a925abaa62f880d87afee8461cf9ff0a'}, 'branchTransitions': []}
```

**Template line 9:**

```text
{{- fail "worker shutdown must cover native close plus scope drain, and fit within pod termination grace" }}
```

**Enclosing controls:**

```text
{'opening': {'path': 'charts/prism/templates/workloads.yaml', 'sha256': '9bb2865f5d232b2cc5fac39259c8957e573decc891d2c9b25d7554da01148739', 'startUtf16': 527, 'endUtf16': 744, 'startLine': 8, 'endLine': 8, 'exactText': '{{- if or (le (int .Values.worker.shutdownTimeoutMs) (add (int .Values.worker.native.closeTimeoutMs) 10000)) (le (mul (int .Values.worker.terminationGracePeriodSeconds) 1000) (int .Values.worker.shutdownTimeoutMs)) }}', 'exactTextSha256': '497fb07d14aa641b2ae52ce31d1816aab9b3da5214281fa63632d2554533eb10'}, 'branchTransitions': []}
```

**Owning / consuming source:**

- [charts/prism/templates/workloads.yaml:1](../../../charts/prism/templates/workloads.yaml#L1)

<!-- END GENERATED: common error catalogue -->
