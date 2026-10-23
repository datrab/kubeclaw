# Independent remaining source inventory

**124/124 original candidates,24 sources observed.** Static enumeration, no global C0 or implementation approval. Original bodies preserved; JSON citations give exact line expressions/full-file hashes. No generic validators added.

## Important boundaries

- `test-gates/preparation-*` is production-reachable via native-parent and runtime entrypoint, not test-only.
- NOTES are informational and omit MEMORY.md though actual seeding includes it.
- Root tuning.retention high is a constant marker, not automatic data expiry.
- KubeClaw values.schema.json absent; direct template guards are not full schema validation. Prism runtime ingestion clamps direct env input while schema rejects out-of-range values.
- Observer gateway status uses operator.read; selfTest operator.admin. Prism coding profile metadata not execute-level authorization guard.
- verificationRead intentionally grants GET on one named OAuth Secret; no blanket secret denial.
- Observer generated contract directory absent; sync-contract copies canonical source. Installed dist identity unobserved.

## Per-source observations

### charts/kubeclaw/files/config/swarm.config.json

1 candidate(s); SHA256 `1fd90067492b1a5cafd31d7618015a9cdd15fa3315f086eebcdb2a51338a5c58`.

**Author/class:** Packaged swarm-entry.v2 JSON / fixed-root-entry-marker.

tuning.retention high is part of constant tuning object, not numeric expiry policy; helper compares complete tuning to schema.const. Effective policies live in component settings.

**Defaults/precedence:** No per-field override; root Files.Get then complete bundle mount.

**Candidate fields:** L11 `SRC-15f4cafe131dc43f` tuning.retention fixed marker

**Unknown:** Actual component retention/live input semantics not derived from marker.

### charts/kubeclaw/templates/NOTES.txt

11 candidate(s); SHA256 `9beb978bc26b4432f319992574860cce2fa041e5d3d5554415a59e2b6091a3cc`.

**Author/class:** Selected Helm release values / informational-render-output.

Display only: NodePort link if type NodePort and int(nodePort)>0; otherwise port-forward uses gatewayPort twice. Workspace announcements gated by truthy fields; MEMORY.md missing from announcement but seeding supports it. Success text is not observed deployment result.

**Defaults/precedence:** Selected values over chart defaults; no productive config authority.

**Candidate fields:** L2 `SRC-8720d3127023a1b1` agentRole display; L14 `SRC-1151cafaea71028a` NodePort display gate; L15 `SRC-0e454afe6feed12e` NodePort URL display; L17 `SRC-651bea5b67d63013` port-forward display; L20 `SRC-2e23beaf178a7927` workspace display gate; L23 `SRC-b31582b49c0d80bb` SOUL.md announcement; L24 `SRC-fa45584a98c45d3f` AGENTS.md announcement; L25 `SRC-f76d4ddd70b7c737` USER.md announcement; L26 `SRC-ec942754844edc3a` TOOLS.md announcement; L27 `SRC-6c35b249fefb7900` IDENTITY.md announcement; L28 `SRC-b4c1e27a98059de1` BOOTSTRAP.md announcement

**Unknown:** Actual deployment/health/access/seeding not proved by notes.

### charts/kubeclaw/templates/_buster-native.tpl

7 candidate(s); SHA256 `06eaa44435684f2af9a14365b149ecef0c5cab1a0929413d5edbc2b73e8247e6`.

**Author/class:** Generated busterNative binding plus extraContainer / generated-native-container-contract.

Requires int replicas1, native namespace equals release, node nonempty, policy64lowerhex, image @sha256:64lowerhex suffix. Reject reserved env duplicates and mounts prefixed /app,/opt/kubeclaw-trusted,/run/kubeclaw-buster,/etc/kubeclaw. Adds fixed pool/config/digest env and host policy/node/runtime/pool/ownership/bundle mounts; delegates registry helper.

**Defaults/precedence:** Env/mount defaults empty lists; native authors not overrideable; deployment selects named buster-v2-runtime, requires exactly1 for buster and rejects duplicates.

**Candidate fields:** L4 `SRC-60b5863ff1f3c54a` busterNative binding; L5 `SRC-f0ca2e983c5d89e3` singlewriter/namespace/node/policy guard; L9 `SRC-93707e36eb25018e` input env default; L10 `SRC-a541216fcef537a2` reserved env rejection; L15 `SRC-f8588e047fbcfaf6` native authored env concat; L19 `SRC-5ef58e91acf26a34` input mounts default/rejection; L32 `SRC-fb98f92838b245c1` native env assignment

**Unknown:** Selected host/provider/native enforcement and generation identity unproved.

### charts/kubeclaw/templates/archviewer.yaml

7 candidate(s); SHA256 `5a89affd7b25f63ff38a0de9bec61388927e06b5d20a7075f6af0a92d4c7cb2a`.

**Author/class:** Helm archviewer/service selected values / conditional-private-exposure.

Enabled Nova-only; provider cilium/kubernetes default cilium; dedicated ClusterIP TCP3456 target archviewer and tailscale Ingress requires hostname. Reject legacy extraPorts name/port/target collisions. Ordinary/Cilium ingress selects managed proxy pod labels and required operator namespace; additive network policy not credential authentication.

**Defaults/precedence:** enabled false; provider cilium; hostname nova-architecture; operator namespace tailscale.

**Candidate fields:** L1 `SRC-022a87d32985df19` archviewer.enabled; L2 `SRC-d2619fb8f9419187` Nova role guard; L5 `SRC-e962db81df06caf6` networkPolicyProvider; L9 `SRC-c19a258a942aa8e3` legacy service.extraPorts rejection; L37 `SRC-beb4f291bc767284` archviewer.hostname; L53 `SRC-c03703aaf63f4146` operatorNamespace ordinary selector; L74 `SRC-b5ae37b2598dfc67` operatorNamespace Cilium selector

**Unknown:** Actual sidecar listener/auth and CNI/Tailscale installed identity unproved.

### charts/kubeclaw/templates/buster-namespace-fence.yaml

2 candidate(s); SHA256 `405866681db66cc38aa8b9018cfdb18bff2fd6a56137ee39632b9eebd808b62d`.

**Author/class:** Helm broker values/release identities / generated-admission-boundary.

Only enabled buster; Kubernetes>=1.30. Admission CREATE/DELETE namespaces matched worker/controller SA, failurePolicy Fail; worker denied, controller requires allowedPrefix plus dash and managed-by label. Binding Deny; no permission granted by admission.

**Defaults/precedence:** broker disabled; allowedPrefixes [test].

**Candidate fields:** L1 `SRC-68080ef1ff0e6c71` {{- if and .Values.busterNamespaceBroker.enabled (eq .Values.agentRole "buster") -}}; L31 `SRC-0720842bfcd51168` {{ toJson .Values.busterNamespaceBroker.allowedPrefixes }}.exists(prefix, variables.target.metadata.name.startsWith(prefix + "-")) &&

**Unknown:** Actual API/CEL/admission execution and all principal grants unproved.

### charts/kubeclaw/templates/buster-runtime-pvc.yaml

1 candidate(s); SHA256 `cacf352b9b0ea8daa2f7d47f59ca00256cc8997621075441a22966da0aca8279`.

**Author/class:** Helm persistence/replica values / single-writer-storage.

Enabled PVC int replicas1; claim required; RWO, keep, Prune=false/Delete=false; size selected and optional storageClass omitted means cluster default. PVC creation alone does not mount it; checked-in buster-values extraVolume claim and runtime sidecar mount join this claim explicitly.

**Defaults/precedence:** disabled; size64Gi, class empty; replicaCount1.

**Candidate fields:** L2 `SRC-4d5dc53173e0925b` {{- if ne (int .Values.replicaCount) 1 }}

**Unknown:** Actual storage and complete durable recovery set unproved.

### charts/kubeclaw/templates/configmap-skills.yaml

2 candidate(s); SHA256 `0147b857c5c3659cfad74bf410a39e81f6187d5d1b7df2ebdb8d23c7595f7a6c`.

**Author/class:** Helm customSkills map / extension-content-emitter.

Truthy map emits name/content text; init overlays after bundle but rejects pipeline.ts/runtime.ts/contracts/packages/node_modules/plugins protected paths. Do not infer every hypothetical core-like path protected.

**Defaults/precedence:** empty map; extension content overlay after base bundle, not canonical config author.

**Candidate fields:** L12 `SRC-088b1869ffa46305` {{- if .Values.customSkills }}; L20 `SRC-e95d9fa0836afe29` {{- range $name, $content := .Values.customSkills }}

**Unknown:** Per-extension imports, permission boundaries and actual selected content unproved.

### charts/kubeclaw/templates/configmap-swarm-config.yaml

4 candidate(s); SHA256 `7ce3ac38ef57504e4daf3185cd1194c74b2029493db0bca1398866c75793f875`.

**Author/class:** semgrepConfigYaml/eslintConfigMjs or packaged files / lint-policy-emitter.

Truthy overrides replace respective bundled full text in ConfigMap; init copies semgrep/eslint to config PVC only if missing or override true, then runtime config. Other fixed lint assets copied. Operator bundle whole mounted, not PVC copied.

**Defaults/precedence:** Both override strings empty; swarmConfig.overrideOnRestart false -> existing lint files win.

**Candidate fields:** L15 `SRC-e6bda8d7a7ad8049` {{- if .Values.semgrepConfigYaml }}; L16 `SRC-c08822b7465b1cd9` {{ .Values.semgrepConfigYaml | indent 4 }}; L21 `SRC-90d371e27daff134` {{- if .Values.eslintConfigMjs }}; L22 `SRC-d145f7cb10d57db9` {{ .Values.eslintConfigMjs | indent 4 }}

**Unknown:** Actual existing PVC lint contents and effective tool invocation joins unproved.

### charts/kubeclaw/templates/configmap-workspace.yaml

15 candidate(s); SHA256 `0b84da5dcaa5c5a3c698f7b53b343882eeedb7cfda3275d2ee5e71fb94a2b647`.

**Author/class:** Helm workspace markdown fields / workspace-seed-content.

enabled gates ConfigMap; soul/agents/user/tools/memory/identity/bootstrap truthy content emit7Markdown files. Init loops7, copies only missing or explicit override; absent seed does not remove destination.

**Defaults/precedence:** enabled true,7fields empty, overrideOnRestart false; existing workspace wins.

**Candidate fields:** L1 `SRC-d9e4c71bccb02648` workspace.enabled; L9 `SRC-ef58a353b91d2fbb` workspace.soul gate; L11 `SRC-98dfe623dc910246` workspace.soul content; L13 `SRC-ce2a46277a9308cf` workspace.agents gate; L15 `SRC-7c96750ec6508ec3` workspace.agents content; L17 `SRC-6ebcc7cc622ae4aa` workspace.user gate; L19 `SRC-deef03cd82734229` workspace.user content; L21 `SRC-99245371818e117f` workspace.tools gate; L23 `SRC-5848db9c3a4e5aff` workspace.tools content; L25 `SRC-f2ca5e58950f0c67` workspace.memory gate; L27 `SRC-63c3ab015d976358` workspace.memory content; L29 `SRC-604956c9177802d9` workspace.identity gate; L31 `SRC-3f967097d421f3ce` workspace.identity content; L33 `SRC-5492b82d34fe2b01` workspace.bootstrap gate; L35 `SRC-cabccd1d8c0fc37c` workspace.bootstrap content

**Unknown:** Actual persistent files and OpenClaw context/runtime consumers not inferred from filename.

### charts/kubeclaw/templates/demo-ready-service.yaml

4 candidate(s); SHA256 `770f0e10f731ec8881c879654147fd62b12b3c549e2f88288c561101956be5f1`.

**Author/class:** Broker readiness/product selected topology / conditional-readiness-network.

Enabled broker AND buster AND readiness.enabled produces ClusterIP8443 controller Service and ingress policy. Required readiness producer namespace allows nova label; productDecisions.enabled adds prism-control in required namespace. Network reachability not authenticated producer authority.

**Defaults/precedence:** Broker/readiness/product toggles false; namespaces empty until explicit selection.

**Candidate fields:** L1 `SRC-106f245846f69452` {{- if and .Values.busterNamespaceBroker.enabled (eq .Values.agentRole "buster") .Values.busterNamespaceBroker.controller.readiness.enabled }}; L32 `SRC-9b2c776f442c14a0` kubernetes.io/metadata.name: {{ required "Ready producer namespace is required" .Values.busterNamespaceBroker.controller.readiness.producerNamespace | quote }}; L36 `SRC-2d501cff14f53787` {{- if .Values.busterNamespaceBroker.controller.productDecisions.enabled }}; L39 `SRC-ee2555acd8ecc846` kubernetes.io/metadata.name: {{ required "Product producer namespace is required" .Values.busterNamespaceBroker.controller.productDecisions.producerNamespace | quote }}

**Unknown:** CNI plus TLS/audience/SA/signature native joins unproved.

### charts/kubeclaw/templates/pvc.yaml

2 candidate(s); SHA256 `315dfd8674eb45996769d61323f268bbb77e33b48ee138f8dd227b8761343fa9`.

**Author/class:** Helm persistence and role / persistence-sync-order.

Config/workspace PVC independently enabled with keep/Prune=false/Delete=false. Role prism adds sync-wave3; accessModes selected, class omitted if empty. Does not expire data.

**Defaults/precedence:** both enabled RWO config10Gi/workspace20Gi; class empty, role nova.

**Candidate fields:** L11 `SRC-e6142f939d54c545` {{- if eq .Values.agentRole "prism" }}; L37 `SRC-153d0e1d6f157586` {{- if eq .Values.agentRole "prism" }}

**Unknown:** Actual storage/Argo behavior and durability unproved.

### charts/kubeclaw/templates/rbac.yaml

6 candidate(s); SHA256 `45525f90703f76d3dbcfb67290599359b6366025bd6fdc77040c27d85da6f5e9`.

**Author/class:** Broker lease flags and canonical release SA / conditional-api-authority.

Broker AND (buster role OR leaseClient.enabled); create SA additionally required. Lease Role CR CRUD/watch/status get plus deployments get/list/watch/services get/list in release ns. verificationRead adds cluster pod get/list/watch and named tailscale IngressClass get; separate operator ns Role GET exactly named OAuth Secret. Real secret read grant, not zero secret authority.

**Defaults/precedence:** flags false; operator ns tailscale/OAuth operator-oauth; create=false suppresses chart grants, not external grants.

**Candidate fields:** L2 `SRC-581c36e0efa472c5` leaseClient effective enabled; L3 `SRC-a226014eba4c849d` verificationRead effective enabled; L4 `SRC-c9f18e6ad7622aee` lease role create-SA gate; L47 `SRC-7dd0dfa97a2a5361` verification role create-SA gate; L81 `SRC-7c5366d15546f65a` verificationRead.tailscaleOperatorNamespace; L82 `SRC-8dded0f8a638779d` verificationRead.tailscaleOAuthSecretName

**Unknown:** Whole effective principal/external bindings and namespace/Secret existence unproved.

### charts/kubeclaw/templates/secret.yaml

3 candidate(s); SHA256 `33a2926486d301371ffc741826079277a2a48daddbabe209d2b466f44c19a01f`.

**Author/class:** Inline credential values or existingSecret references / conditional-secret-value-emitter.

Per-key inline token only without corresponding existingSecret; Discord also enabled. Shared Opaque generated gateway Secret only if any key selected. ExistingSecret wins helper name/key. Base64 encoding is not encryption.

**Defaults/precedence:** Inline values empty; existingSecret empty; key defaults gatewayToken/litellmApiKey/discordToken; no Secret bytes read.

**Candidate fields:** L15 `SRC-3ffcbdfb6f7da73c` auth.token -> gatewayToken; L18 `SRC-82a36227e267f9cd` litellm.apiKey -> litellmApiKey; L21 `SRC-d1199c275c9f717f` discord.token -> discordToken

**Unknown:** Actual Secret identity/revision, refresh/rotation and bootstrap boundaries unproved.

### charts/kubeclaw/templates/service-extra-nodeports.yaml

2 candidate(s); SHA256 `19a2c1d76de9c77a291036042a8d92b9c9f4df7d8b990d7e669217c98b1fcd17`.

**Author/class:** Helm service.extraPorts / additional-network-exposure.

Each truthy nodePort with main type not NodePort emits separate NodePort Service fullname-name truncated63, TCP port/targetPort/nodePort. Does not expose gateway automatically.

**Defaults/precedence:** extraPorts[]; main ClusterIP; kubeclaw values.schema.json absent.

**Candidate fields:** L1 `SRC-70b75982645d1867` {{- range .Values.service.extraPorts }}; L2 `SRC-c8137aca810ff62a` {{- if and .nodePort (ne $.Values.service.type "NodePort") }}

**Unknown:** Kubernetes validation/allocation/collision and actual reachability unproved.

### charts/kubeclaw/templates/service.yaml

11 candidate(s); SHA256 `76a347213feffadad635311cc89fdbfb896c6a3f800e8e92528ec9efee280cc2`.

**Author/class:** Helm service values / service-routing.

Main type, gateway port/targetPort; bridge truthy gate TCP target bridge; explicit nodePorts only NodePort and int>0; extras TCP use entry name/port/targetPort and nodePort when NodePort and truthy. Instance labels select pods not a process principal.

**Defaults/precedence:** ClusterIP; gateway18789 target gateway; bridge enabled18790; nodePorts0; extras[]. No kubeclaw values schema.

**Candidate fields:** L8 `SRC-c4d47f62da003864` service.type; L13 `SRC-806b1511602a77b7` service.gatewayPort; L14 `SRC-aef6d93c7aba06c4` service.gatewayTargetPort; L16 `SRC-dc738a39beb76ab8` gateway NodePort gate; L17 `SRC-db9d6a49527b7d4e` service.nodePort; L19 `SRC-f2189412eedfd554` service.bridgeEnabled; L21 `SRC-95edc6d7b83eaa1e` service.bridgePort; L24 `SRC-edb0b9baf433425e` bridge NodePort gate; L25 `SRC-a16a38d1b1f88844` service.bridgeNodePort; L28 `SRC-2e75e7c775406d1a` service.extraPorts; L33 `SRC-c56126c89453dff2` extra.nodePort gate

**Unknown:** Actual listeners, native validation/port allocation and reachability unproved.

### charts/kubeclaw/templates/serviceaccount.yaml

2 candidate(s); SHA256 `7b7b2e4ba4dc139f6d4953fa242ed70ea20de090bbe30287215f5c7f1349a13f`.

**Author/class:** Helm create/automount / principal-identity.

create emits canonical agent-role SA release namespace; automount defaultfalse. Deployment selects it and repeats automount only when create. createfalse not proof inherited/defaultSA has no authority.

**Defaults/precedence:** create false/automount false; projected tokens independent.

**Candidate fields:** L1 `SRC-5f9ddf3532c43704` {{- if .Values.serviceAccount.create -}}; L9 `SRC-5c2f9d3ee43ec8fb` automountServiceAccountToken: {{ .Values.serviceAccount.automount | default false }}

**Unknown:** Native principal, projected token and all effective grants unproved.

### charts/kubeclaw/values.yaml

1 candidate(s); SHA256 `e5bcd61acfd50636130f3d4ebbfb6377d14762ae7f9dac6c8da37caff70436b1`.

**Author/class:** Helm agent.model primary/fallbacks / chart-model-route-default.

Renders model primary and ordered fallback routes; GPT6-astra special branches. Deployment synchronizes managed route/catalog/policy to persistent config, not unconditional old-config preservation.

**Defaults/precedence:** primary openai/gpt-5.6-sol fallback [openai/gpt-5.5], selected Helm values override.

**Candidate fields:** L211 `SRC-8444cce4182b20be` agent.model primary and fallback list

**Unknown:** Actual provider/model availability/runtime route unobserved; not product advice.

### charts/prism/templates/_product-decisions.tpl

1 candidate(s); SHA256 `bf5fb46a70cc33359e8cb08011c36ebdf27ca195960d4911ff49fc92ed1eee2c`.

**Author/class:** control.productDecisions and tailscale / conditional-authority-topology-guard.

Enabled requires tailscale.enabled, separate signing Secret, explicit issuer/origin/revision/signing/controller/CA/audience and nonempty trimmed operators. Emits signing Secret and projected controller CA/audience token. Requirement alone not observed ingress authentication.

**Defaults/precedence:** productDecisions false, tailscale true, tokenexpiration600; authority fields empty.

**Candidate fields:** L4 `SRC-b6eecd6d74bd72d8` {{- if not .Values.tailscale.enabled -}}{{ fail "Product decisions require the authenticated Tailscale Studio ingress" }}{{- end -}}

**Unknown:** Actual signing revision/Tailscale/ingress auth/controller native effect unproved.

### charts/prism/templates/_swarm-config.tpl

1 candidate(s); SHA256 `e044387aa75a3f784ccd2a0d0f30d91f6e69b7e07e663ab2cc005417bff7265a`.

**Author/class:** Component bundle owner fields / obsolete-author-rejection.

Presence old control.maximumWorkerResponseBytes/nativeWorkerDispatchTimeoutMs fails even empty. Correct authors prism-execution.settings.maximumResultBytes and prism-control.settings.dispatchTimeoutMs. Other moved fields reject; Studio URL restricted canonical service8080 origins.

**Defaults/precedence:** No obsolete fallback/merge, whole kubeclaw.swarmConfig components.

**Candidate fields:** L5 `SRC-9dd6ec29d7fb8552` {{- fail "Control result limit belongs to prism-execution.config.json settings.maximumResultBytes; dispatch timeout belongs to prism-control.config.json settings.dispatchTimeoutMs" -}}

**Unknown:** Full canonical role/profile/schema/runtime generation joins open.

### charts/prism/values.schema.json

4 candidate(s); SHA256 `7588db4e045bc4d52c1b46b4bbffeac238f12c9bd074b71aa9592c4ed24589c3`.

**Author/class:** Checked-in schema with selected Helm values / chart-schema-bound.

Four candidate numeric bounds per row; root additionalProperties false but not all nested sections closed. Schema has no defaults, template and runtime relations distinct.

**Defaults/precedence:** Selected Helm overlays over packaged values; schema no default.

**Candidate fields:** L152 `SRC-798ca7ce75ef3ff9` control.productDecisions.tokenExpirationSeconds; L300 `SRC-f5742a25dee07f1d` worker.terminationGracePeriodSeconds; L322 `SRC-84a61ea381a00ff6` ingestion.quarantineTtlMs; L502 `SRC-a94186a55ce2431a` backup.maximumDurationSeconds

**Unknown:** Actual schema validation not executed; complete component/profile/runtime joins open.

### skills/buster/engine/test-gates/preparation-config.ts

17 candidate(s); SHA256 `f2b088c3fef62010e6d867f6610ccc2392fdb7d6fa6be2bd43ad8e320d099835`.

**Author/class:** Environment, root-controlled runtime JSON, preparation component settings / production-native-startup-reader.

Productive via native-parent.ts despite test-gates path. Required native pool file/runtime identity, capacity memory/tasks/scopes covers settings, digest sha25664lowerhex; trusted launcher/node/sandbox checks. Bounded root config ancestors/root-owned regular singlelink no-writable nofollow JSON object. Runtime names env for Ed25519 public key; nonempty trusted authority; fixed state/runtime roots. SWARM_CONFIG absolute normalized with real/lexical root ancestors checks.

**Defaults/precedence:** Required native env/config no fallback; fixed runtime /run/kubeclaw-buster/config/runtime.json and state /var/lib/buster-v2/plan-jobs/runtime /var/lib/buster-v2/runs.

**Candidate fields:** L15 `SRC-629f4ce41bb89fee` BUSTER_NATIVE_POOL_POLICY_FILE; L19 `SRC-9848c97c9319cd1d` pool memory/tasks relation; L20 `SRC-be24b2094a6da316` pool active scopes relation; L21 `SRC-26b849bed2e1ac82` BUSTER_ENGINE_CONTENT_DIGEST; L22 `SRC-3b38fdd30b9a8036` engine digest validation; L29 `SRC-8845bb2071984c12` sourceAttestationPublicKeyEnvironmentVariable; L30 `SRC-6a45c343c830ad4a` trustedSourceAuthority; L31 `SRC-fabc811c00c0d5a8` publickey env lookup; L32 `SRC-4535ebc89579c7b7` Ed25519 publickey validation; L35 `SRC-b40d099b9dfb2dd4` fixed runtime.stateRoot/runtimeRoot; L46 `SRC-526d02216524240a` root config ancestor trust; L51 `SRC-e05b38090f34ff81` root config file/size trust; L55 `SRC-790ac7e299c2d55a` runtime JSON object validation; L62 `SRC-072db49d45d6ec00` SWARM_CONFIG entry; L63 `SRC-e75cae6fdcc63e28` absolute normalized SWARM_CONFIG; L69 `SRC-9cf8ad491c1f3a5c` swarm ancestor ownership/mode; L75 `SRC-545ecfc86f0702cf` swarm file ownership/mode

**Unknown:** Actual root ownership/executable/pool/node/key authority unobserved.

### skills/buster/engine/test-gates/preparation-supervisor.ts

7 candidate(s); SHA256 `2a0c6e615d2b156ffad8be308613c7b16fa83daf8faf9ef393cc6e81b701f8ad`.

**Author/class:** Native parent settings/policy / production-native-supervision.

Requires supervisor authority/root swarm, settings/native config, root-owned normalized source root. Store/journal caps selected; recovery/import/ledger before ready. setpriv uid/gid1000 groups1000,1002 spawns process.execPath remote-plan-cli config fixed runtime JSON, inherited process.env, fd3 pipe. exit0/SIGTERM succeed; other reject; shutdown fences/kills.

**Defaults/precedence:** No provider/HTTP runtime imported privileged parent; sourceRoot /var/lib/buster-v2/native-sources. test-gates directory not test-only classification.

**Candidate fields:** L24 `SRC-7d21714bd9c0c3c0` requireRootBusterSettings; L25 `SRC-c9a3ee1856722184` loadBusterPreparationSettings; L26 `SRC-5a86d88ea3024390` nativeBusterPreparationConfig; L28 `SRC-b694464d9ec1e726` sourceRoot directory/rootmode; L29 `SRC-e3e643f388dc0cb0` sourceRoot realpath; L59 `SRC-91910217b57b4275` child config/stdio/env; L69 `SRC-caccd385c4e2c876` child success exit/signal

**Unknown:** Native authority/recovery execution and installed runtime generation unobserved.

### skills/common/plugins/openclaw-agent-observer/src/config.ts

12 candidate(s); SHA256 `1617f4937214a1b601b66d2525309a780c9202e54666a4ac3ff9135e3216297c`.

**Author/class:** Merged plugin config then environment / production-plugin-config-normalization.

config[key] !==undefined wins env even null/empty. Registration then service then hook merge later defined wins. True strings1,true,yes,on,enabled; requiredBoolean missing/null/empty rejects, other strings false. Strings String(value??empty).trim. Positive integer Number+integer>0 no safeinteger upper; optional port1..65535; signed integer hookPriority. redisTls absentfalse; isolation raw; maxEventBytes canonical required positiveinteger <=5242880 (5MiB).

**Defaults/precedence:** Required enabled/caps/hooks no default; optional Redis connection absent; buster chart fixed config plus Redis env. Manifest number/boolean types differ coercion code.

**Candidate fields:** L35 `SRC-b18d453192c636f1` bool absent fallback; L41 `SRC-61e79582dd58b5de` requiredBoolean absent error; L48 `SRC-2277817f41b02170` string trimming; L49 `SRC-5f059f14d9cf8e7b` empty string absent; L53 `SRC-37abb9b52cba9698` positiveInteger absent error; L57 `SRC-1704d79e49a8b060` positiveInteger Number domain; L64 `SRC-369080fae9e19cd9` port absent optional; L66 `SRC-2f8da6752cb54f5b` port1..65535; L73 `SRC-e02ba762a0c275a4` signed integer absent error; L89 `SRC-94c57fcae240f9a7` config-defined beats env; L92 `SRC-bbedb31ad3136731` production config resolver; L116 `SRC-d712743f85c8d350` process.env exposure

**Unknown:** Generated contract checkout absent, sync-contract copies canonical source; installed dist and Redis/TLS/isolation native joins open.

### skills/prism/openclaw-plugin/index.mjs

1 candidate(s); SHA256 `97a30daa0a042f2cd9416746caffe9207828dd9a587e3a6c3e8de481f5d0640e`.

**Author/class:** execute context.config.controlUrl then env then localhost / registered-plugin-http-consumer.

Two registered tools POST absolute paths; truthy configUrl then PRISM_CONTROL_URL then localhost28080; leading paths replace base path. No fetch timeout/credential header here; response.json catch error status, non2xx throws value.error or status. Manifest coding profile metadata not code authorization.

**Defaults/precedence:** default http://127.0.0.1:28080, chart prism config same. Request schemas closed except document/evidence; exactly3designs, expectedRevision>=1.

**Candidate fields:** L18 `SRC-863fc05ab283fecf` if (!response.ok) throw new Error(value.error || `Prism control returned HTTP ${response.status}`);

**Unknown:** Gateway/profile enforcement, actual context config and control-side auth/fence native joins unproved.

## Remaining substantive joins

- Full canonical author/role/component/profile/schema and alias joins across inventories
- Actual installed selected module/image/node/provider/native generation identities
- Concrete role-specific A/B cases and future executable effect/rejection oracles
- Whole principal/grant/Secret-revision/live-input/recovery boundaries
- Parent consolidated C0 independent review and concrete implementation authorization

## Execution boundary

No runtime/schema/provider/native tests, actual credential reads, network/API/deployment or production/test/schema/canonical mutations. Source reads and evidence-only assembly.

## Evidence consistency observation

124 unique original IDs/bodies, all24 original source-file hashes agree with baseline. 619 source/consumer pin occurrences match nonblank exact current lines/hashes;51 recorded file identities rechecked after assembly. This consistency check is not semantic/global acceptance.
