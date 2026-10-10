/** KubeClaw-owned BusterNamespaceLease receiver contracts.
 * Source-derived expectations, not admission or live-controller results.
 * The schema index below preserves every owned boundary, including status.
 */
const revision = 'be78787633d774e9fd2a2ff401311499a555156d';
const source=(path,start,end,claim)=>({url:`https://github.com/datrab/kubeclaw/blob/${revision}/${path}#L${start}-L${end}`,claim});
const main=(a,b,claim)=>source('cmd/buster-namespace-controller/main.go',a,b,claim);
const lifecycle=(a,b,claim)=>source('cmd/buster-namespace-controller/demo-readiness-lifecycle.go',a,b,claim);
const evidenceFor={
 request:[main(251,316,'Reconcile normalizes the namespace, handles deletion and legacy access, validates the spec and compares its immutable digest.'),main(1598,1635,'Validation checks TTL, cleanup policy, access, credentials and copied-secret allowlist; the digest excludes purpose and exposure.')],
 access:[source('charts/kubeclaw/templates/buster-namespace-controller.yaml',24,67,'Actual deployed deployer ClusterRole permits workload lifecycle plus Secret get/list; tester has core reads and Job lifecycle. Controller binds these ClusterRoles.'),main(964,990,'ensureNamespaceAccess binds allowed subject groups to existing mode ClusterRoles rather than creating namespaceRole helper rules.'),main(1043,1070,'RoleBinding defaults roleRef.kind to ClusterRole; dedicated credentials explicitly select Role.'),main(1072,1099,'accessRequests validates the ServiceAccount/mode pair against the operator allowlist and deduplicates exact pairs.')],
 credentials:[main(1101,1175,'credentialRequest requires allowed readers, all workload-capable subjects, deliverable keys and an existing-mode deployer.'),source('cmd/buster-namespace-controller/demo-credentials.go',15,119,'Credential reconciliation persists creation intent before generating an immutable Secret; unresolved prior creation cannot silently rotate credentials.')],
 exposure:[main(1199,1232,'Exposure requires final-preview or committed retention, selects retained exposureSpec after readiness and derives service, hostname, port and path.'),source('cmd/buster-namespace-controller/exposure-generation.go',21,64,'Exposure mutations reread current identity and lineage, reserve a mutation claim and patch only an authorized ingress with a resource version.'),lifecycle(164,185,'The mutation claim is persisted and reread; an unresolved claim blocks readiness.')],
 readiness:[source('cmd/buster-namespace-controller/demo-readiness.go',202,280,'Readiness commit checks identity, expiry, replay, unresolved exposure and recent verified observation; it commits v2 state by resource-version CAS and verifies persistence.'),source('cmd/buster-namespace-controller/demo-readiness-sources.go',53,103,'Committed readiness verification checks live namespace, exact ingress route, generated Secret provenance and current lease identity.'),source('cmd/buster-namespace-controller/demo-retention.go',14,50,'Stored historical v1 has implicit seven days; v2 requires bounded retentionSeconds and valid timestamp arithmetic.')],
 product:[source('cmd/buster-namespace-controller/demo-product.go',163,196,'Product envelopes require a canonical base64 Ed25519 signature, configured issuer/actor, exact subject, valid action and short validity window.'),source('cmd/buster-namespace-controller/demo-product.go',198,248,'Replay uses decisionId and payloadDigest; expiry follows exact linked extensions independently of list-map order.'),source('cmd/buster-namespace-controller/demo-product.go',260,330,'Product decisions append a receipt under resource-version CAS, preserve accept expiry and verify the persisted result.')],
 proof:[source('cmd/buster-namespace-controller/demo-credentials.go',121,158,'Generated proof checks immutable Secret UID/version, annotations, owner labels, exact encoded keys and digest matching recorded creation intent and prior source.')],
 conditions:[main(662,672,'Provisioning publishes separate NamespaceReady, AccessReady, SecretsReady, CredentialsReady and ExposureReady conditions.'),main(1663,1671,'leaseCondition writes type, True/False status, reason and current transition time.')],
 security:[main(543,592,'Runtime security requires verified image/manifest inputs, reads live resources and owner labels, bounds findings and digests findings and counts.'),main(415,466,'Findings are deterministically sorted and bounded by count and serialized bytes with explicit omitted counts.')],
 status:[lifecycle(82,125,'Status mutations reread UID, generation, deletion, owner and readiness/product history; use resource-version CAS; protect terminal state and exposure claims.'),main(594,672,'Provisioning reports namespace Ready independently from optional credential and exposure availability.')],
};
const purposes={
 namespaceName:'Requested namespace name, normalized by the controller before ownership checks.',namespacePrefix:'Requested namespace prefix from the configured allowed list.',runId:'Immutable spec trace value written by the fixture and included in the accepted spec digest; the controller does not use it for namespace labels or compare it with readiness runId.',project:'Immutable project trace value written by the fixture and included in the accepted spec digest; the controller does not use it for namespace ownership labels.',purpose:'Selects pretest, gate or final-preview behavior; only final-preview requests exposure before retained readiness.',access:'Atomic list of requested ServiceAccount access grants.',subject:'Namespace/ServiceAccount identity for an access grant.',mode:'Access role or credential source mode, selected by its containing contract.',cleanupPolicy:'Fixture release policy; TTL still bounds the namespace lifetime.',ttlSeconds:'Initial lifetime from Kubernetes lease creation, subject to operator default and maximum.',serviceName:'Service identity used for internal URL or preview routing.',servicePort:'Service port used for internal URL or preview routing.',serviceTargetPort:'Workload target port selected for the lease-scoped Buster E2E egress policy; the controller does not create the workload Service from this value.',verifiedImage:'Digest-pinned tested image used by runtime security and readiness verification.',manifestDigest:'Digest of the tested manifest, bound to readiness and runtime security.',secretsToCopy:'Names of operator-approved source Secrets copied into the leased namespace.',testCredentials:'Dedicated deliverable credential request and reader grants.',keys:'Set of deliverable Secret keys; generated mode permits exactly username and password.',readers:'Set of ServiceAccount subjects allowed to read the dedicated credential Secret.',secretName:'Exact dedicated credential Secret name.',exposure:'Desired preview routing input before readiness ownership transfers.',provider:'Selects disabled exposure or Tailscale ingress.',hostname:'Preview hostname selected for the ingress.',path:'HTTP route path, defaulting to / in the controller.',phase:'Controller observation phase for the containing lifecycle or security snapshot.',createdAt:'Lease metadata.creationTimestamp converted to UTC; current UTC time is the fallback if timestamp parsing fails. This is not a namespace preparation measurement.',internalUrl:'Calculated cluster-local Service URL; this string does not prove endpoint reachability.',previewUrl:'Observed ingress URL; readiness verifies the live route separately.',exposurePhase:'Observed preview state, independent of namespace phase.',exposureOwner:'Current owner identifier used to fence preview operations.',exposureGeneration:'Generation bound to the exposure intent or committed readiness.',exposureHostname:'Observed hostname for the preview.',credentialsRef:'Reference to the dedicated deliverable Secret; never the credential bytes.',credentialsAvailable:'Whether the requested credential keys are present and valid.',exposureMutation:'Persisted in-flight exposure reservation that blocks readiness commitment.',id:'Identifier of an exposure reservation or runtime security finding.',startedAt:'Start time of the exposure reservation; no automatic timeout takeover is established.',demoProduct:'Append-only signed human product-decision history bound to committed readiness.',leaseUID:'Kubernetes lease UID binding this status record to one resource incarnation.',readyDigest:'Digest identifying the committed readiness subject.',decisions:'List-map of immutable human decision receipts keyed by decisionId.',action:'Human accept or extend action.',state:'Resulting readiness or product-decision state.',generation:'Lease generation to which the human decision applies.',decisionId:'Stable UUID used for product-decision idempotency.',leaseName:'Name of the lease targeted by the decision.',actorId:'Allowed human actor identified by the signed decision.',issuer:'Configured issuer of the signed decision.',payloadDigest:'Digest of the signed decision payload or delivered readiness payload.',appliedAt:'Controller timestamp for applying a human decision.',previousExpiry:'Exact predecessor deadline used to link an extension.',expiresAt:'Deadline stored for the containing lease, readiness or product decision.',envelope:'Signed product envelope preserved as decision evidence.',schemaVersion:'Version discriminator of the containing persisted contract.',payload:'Canonical base64 signed product-decision bytes.',signature:'Canonical base64 Ed25519 signature of the product envelope.',demoReadiness:'Committed verified demo handoff and retention record.',requestId:'Readiness producer request identity.',namespace:'Namespace bound to generated credentials or committed readiness.',sourceRevision:'Source revision of the verified candidate.',immutableImage:'Tested immutable image in readiness or runtime security.',secretUID:'UID of the actual immutable generated credential Secret.',url:'Verified preview URL recorded at readiness commitment.',previousOwner:'Exposure owner before the readiness handoff.',owner:'Owner identifier after the readiness handoff.',retentionSeconds:'Explicit v2 post-readiness retention duration; historical v1 omits it.',requestDigest:'Digest used to detect unchanged or changed readiness replay.',candidateDigest:'Digest of the tested candidate.',decisionDigest:'Digest of the test-gate decision.',resultDigest:'Digest of the test result or bounded runtime security observation.',credentialDigest:'Digest binding exact generated credential content without publishing bytes.',readyAt:'Controller timestamp at verified readiness commitment.',exposureSpec:'Snapshot of the verified exposure route retained after ownership transfer.',receipt:'Accepted Discord delivery evidence bound to the readiness handoff.',accepted:'Required true delivery-acceptance marker.',status:'Condition truth value or successful Discord HTTP status, depending on the parent.',target:'Discord delivery destination.',messageId:'Discord message identity.',deliveryId:'Delivery identity for replay consistency.',generatedCredentialIntent:'Pre-creation credential digest and identity, persisted before Secret creation.',generatedCredentials:'Verified provenance of the actual immutable generated Secret.',secretResourceVersion:'Observed resource version of the generated Secret.',specDigest:'Accepted spec digest excluding purpose and exposure.',conditions:'List-map of separate controller conditions keyed by type.',type:'Condition identity used as its list-map key.',reason:'Machine-readable explanation for a condition truth value.',lastTransitionTime:'Timestamp written when the controller constructs this condition.',message:'Controller explanation for the containing observation.',runtimeSecurity:'Bounded observation of live namespace resources against verified inputs.',observedAt:'Timestamp of the runtime security observation.',podCount:'Number of observed Pods.',serviceCount:'Number of observed Services.',totalFindingCount:'Full number of findings before truncation.',omittedFindingCount:'Number of findings excluded from the published bounded list.',findings:'Bounded runtime security findings; absence is not proof of a clean runtime.',severity:'Severity assigned to a runtime security finding.',resource:'Resource identity associated with a finding.',spec:'Desired bounded namespace request.',statusRoot:'Controller-owned observed state, written through the status subresource.',apiVersion:'Configured served API group/version used to select the lease endpoint.',kind:'BusterNamespaceLease resource identity.',metadata:'Standard Kubernetes ObjectMeta handled by the API server, with lease identity and fencing annotations.',root:'Namespaced lease resource connecting a bounded request to controller observations.'
};
const schemaIndex = [
 ["$",{"x-kubernetes-validations":[{"rule":"!has(oldSelf.status) || !has(oldSelf.status.demoProduct) || (has(self.status) && has(self.status.demoProduct))","message":"recorded human product decisions cannot be removed"}],"type":"object","observedSchemaKeywords":["properties","type","x-kubernetes-validations"]},34],
 ["$.apiVersion",{"type":"string","observedSchemaKeywords":["type"]},36],
 ["$.kind",{"type":"string","observedSchemaKeywords":["type"]},36],
 ["$.metadata",{"type":"object","observedSchemaKeywords":["type"]},36],
 ["$.spec",{"type":"object","x-kubernetes-validations":[{"rule":"self.namespaceName == oldSelf.namespaceName","message":"namespaceName is immutable"},{"rule":"has(self.namespacePrefix) == has(oldSelf.namespacePrefix) && (!has(self.namespacePrefix) || self.namespacePrefix == oldSelf.namespacePrefix)","message":"namespacePrefix is immutable"},{"rule":"has(self.runId) == has(oldSelf.runId) && (!has(self.runId) || self.runId == oldSelf.runId)","message":"runId is immutable"},{"rule":"has(self.project) == has(oldSelf.project) && (!has(self.project) || self.project == oldSelf.project)","message":"project is immutable"},{"rule":"has(self.access) == has(oldSelf.access) && (!has(self.access) || self.access == oldSelf.access)","message":"access is immutable"},{"rule":"has(self.serviceName) == has(oldSelf.serviceName) && (!has(self.serviceName) || self.serviceName == oldSelf.serviceName)","message":"serviceName is immutable"},{"rule":"has(self.servicePort) == has(oldSelf.servicePort) && (!has(self.servicePort) || self.servicePort == oldSelf.servicePort)","message":"servicePort is immutable"},{"rule":"has(self.serviceTargetPort) == has(oldSelf.serviceTargetPort) && (!has(self.serviceTargetPort) || self.serviceTargetPort == oldSelf.serviceTargetPort)","message":"serviceTargetPort is immutable"},{"rule":"has(self.verifiedImage) == has(oldSelf.verifiedImage) && (!has(self.verifiedImage) || self.verifiedImage == oldSelf.verifiedImage)","message":"verifiedImage is immutable"},{"rule":"has(self.manifestDigest) == has(oldSelf.manifestDigest) && (!has(self.manifestDigest) || self.manifestDigest == oldSelf.manifestDigest)","message":"manifestDigest is immutable"},{"rule":"has(self.cleanupPolicy) == has(oldSelf.cleanupPolicy) && (!has(self.cleanupPolicy) || self.cleanupPolicy == oldSelf.cleanupPolicy)","message":"cleanupPolicy is immutable"},{"rule":"has(self.ttlSeconds) == has(oldSelf.ttlSeconds) && (!has(self.ttlSeconds) || self.ttlSeconds == oldSelf.ttlSeconds)","message":"ttlSeconds is immutable"},{"rule":"has(self.secretsToCopy) == has(oldSelf.secretsToCopy) && (!has(self.secretsToCopy) || self.secretsToCopy == oldSelf.secretsToCopy)","message":"secretsToCopy is immutable"},{"rule":"has(self.testCredentials) == has(oldSelf.testCredentials) && (!has(self.testCredentials) || self.testCredentials == oldSelf.testCredentials)","message":"testCredentials is immutable"}],"required":["namespaceName","cleanupPolicy"],"observedSchemaKeywords":["properties","required","type","x-kubernetes-validations"]},40],
 ["$.spec.access",{"type":"array","minItems":1,"maxItems":8,"x-kubernetes-list-type":"atomic","observedSchemaKeywords":["items","maxItems","minItems","type","x-kubernetes-list-type"]},86],
 ["$.spec.access[]",{"type":"object","required":["subject","mode"],"observedSchemaKeywords":["properties","required","type"]},86],
 ["$.spec.access[].mode",{"type":"string","enum":["deployer","tester"],"observedSchemaKeywords":["enum","type"]},97],
 ["$.spec.access[].subject",{"type":"string","pattern":"^[a-z0-9]([-a-z0-9]*[a-z0-9])?/[a-z0-9]([-a-z0-9]*[a-z0-9])?$","observedSchemaKeywords":["pattern","type"]},94],
 ["$.spec.cleanupPolicy",{"type":"string","enum":["delete","retain"],"observedSchemaKeywords":["enum","type"]},119],
 ["$.spec.exposure",{"type":"object","observedSchemaKeywords":["properties","type"]},161],
 ["$.spec.exposure.hostname",{"type":"string","pattern":"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$","observedSchemaKeywords":["pattern","type"]},167],
 ["$.spec.exposure.path",{"type":"string","maxLength":1024,"pattern":"^/(?:[^/?#\\r\\n][^?#\\r\\n]*)?$","observedSchemaKeywords":["maxLength","pattern","type"]},176],
 ["$.spec.exposure.provider",{"type":"string","enum":["off","tailscale-ingress"],"observedSchemaKeywords":["enum","type"]},164],
 ["$.spec.exposure.serviceName",{"type":"string","observedSchemaKeywords":["type"]},170],
 ["$.spec.exposure.servicePort",{"type":"integer","minimum":1,"maximum":65535,"observedSchemaKeywords":["maximum","minimum","type"]},172],
 ["$.spec.manifestDigest",{"type":"string","pattern":"^sha256:[a-f0-9]{64}$","observedSchemaKeywords":["pattern","type"]},116],
 ["$.spec.namespaceName",{"type":"string","pattern":"^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$","observedSchemaKeywords":["pattern","type"]},72],
 ["$.spec.namespacePrefix",{"type":"string","enum":["test"],"observedSchemaKeywords":["enum","type"]},75],
 ["$.spec.project",{"type":"string","observedSchemaKeywords":["type"]},81],
 ["$.spec.purpose",{"type":"string","enum":["pretest","gate","final-preview"],"observedSchemaKeywords":["enum","type"]},83],
 ["$.spec.runId",{"type":"string","observedSchemaKeywords":["type"]},79],
 ["$.spec.secretsToCopy",{"type":"array","observedSchemaKeywords":["items","type"]},126],
 ["$.spec.secretsToCopy[]",{"type":"string","pattern":"^[A-Za-z0-9._-]+$","observedSchemaKeywords":["pattern","type"]},126],
 ["$.spec.serviceName",{"type":"string","pattern":"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$","observedSchemaKeywords":["pattern","type"]},101],
 ["$.spec.servicePort",{"type":"integer","minimum":1,"maximum":65535,"observedSchemaKeywords":["maximum","minimum","type"]},104],
 ["$.spec.serviceTargetPort",{"type":"integer","minimum":1,"maximum":65535,"observedSchemaKeywords":["maximum","minimum","type"]},108],
 ["$.spec.testCredentials",{"type":"object","x-kubernetes-validations":[{"rule":"self.mode != 'generate' || !has(self.keys) || (size(self.keys) == 2 && self.keys.exists(k, k == 'username') && self.keys.exists(k, k == 'password'))","message":"generated credentials can only use username and password keys"},{"rule":"self.mode != 'existing' || (has(self.keys) && size(self.keys) > 0)","message":"existing credentials require at least one key"}],"required":["mode","secretName","readers"],"observedSchemaKeywords":["properties","required","type","x-kubernetes-validations"]},131],
 ["$.spec.testCredentials.keys",{"type":"array","maxItems":16,"x-kubernetes-list-type":"set","observedSchemaKeywords":["items","maxItems","type","x-kubernetes-list-type"]},153],
 ["$.spec.testCredentials.keys[]",{"type":"string","pattern":"^[A-Za-z0-9._-]+$","observedSchemaKeywords":["pattern","type"]},153],
 ["$.spec.testCredentials.mode",{"type":"string","enum":["generate","existing"],"observedSchemaKeywords":["enum","type"]},139],
 ["$.spec.testCredentials.readers",{"type":"array","minItems":1,"maxItems":8,"x-kubernetes-list-type":"set","observedSchemaKeywords":["items","maxItems","minItems","type","x-kubernetes-list-type"]},145],
 ["$.spec.testCredentials.readers[]",{"type":"string","pattern":"^[a-z0-9]([-a-z0-9]*[a-z0-9])?/[a-z0-9]([-a-z0-9]*[a-z0-9])?$","observedSchemaKeywords":["pattern","type"]},145],
 ["$.spec.testCredentials.secretName",{"type":"string","pattern":"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$","observedSchemaKeywords":["pattern","type"]},142],
 ["$.spec.ttlSeconds",{"type":"integer","minimum":60,"maximum":86400,"observedSchemaKeywords":["maximum","minimum","type"]},122],
 ["$.spec.verifiedImage",{"type":"string","maxLength":2048,"pattern":"^[A-Za-z0-9.-]+(:[0-9]{1,5})?/[a-z0-9]+([._/-][a-z0-9]+)*@sha256:[a-f0-9]{64}$","observedSchemaKeywords":["maxLength","pattern","type"]},112],
 ["$.status",{"type":"object","observedSchemaKeywords":["properties","type"]},183],
 ["$.status.conditions",{"type":"array","x-kubernetes-list-type":"map","x-kubernetes-list-map-keys":["type"],"observedSchemaKeywords":["items","type","x-kubernetes-list-map-keys","x-kubernetes-list-type"]},509],
 ["$.status.conditions[]",{"type":"object","required":["type","status","reason","lastTransitionTime"],"observedSchemaKeywords":["properties","required","type"]},509],
 ["$.status.conditions[].lastTransitionTime",{"type":"string","format":"date-time","observedSchemaKeywords":["format","type"]},519],
 ["$.status.conditions[].reason",{"type":"string","observedSchemaKeywords":["type"]},518],
 ["$.status.conditions[].status",{"type":"string","enum":["True","False","Unknown"],"observedSchemaKeywords":["enum","type"]},517],
 ["$.status.conditions[].type",{"type":"string","observedSchemaKeywords":["type"]},516],
 ["$.status.createdAt",{"type":"string","format":"date-time","observedSchemaKeywords":["format","type"]},190],
 ["$.status.credentialsAvailable",{"type":"boolean","observedSchemaKeywords":["type"]},213],
 ["$.status.credentialsRef",{"type":"string","nullable":true,"observedSchemaKeywords":["nullable","type"]},210],
 ["$.status.demoProduct",{"type":"object","required":["leaseUID","readyDigest","decisions"],"x-kubernetes-validations":[{"rule":"self.leaseUID == oldSelf.leaseUID && self.readyDigest == oldSelf.readyDigest","message":"product history remains bound to its committed ready subject"}],"observedSchemaKeywords":["properties","required","type","x-kubernetes-validations"]},226],
 ["$.status.demoProduct.decisions",{"type":"array","maxItems":128,"x-kubernetes-list-type":"map","x-kubernetes-list-map-keys":["decisionId"],"x-kubernetes-validations":[{"rule":"oldSelf.all(old, self.exists(entry, entry.decisionId == old.decisionId))","message":"human decision history is append-only"}],"observedSchemaKeywords":["items","maxItems","type","x-kubernetes-list-map-keys","x-kubernetes-list-type","x-kubernetes-validations"]},241],
 ["$.status.demoProduct.decisions[]",{"type":"object","x-kubernetes-validations":[{"rule":"self == oldSelf","message":"an existing human decision receipt is immutable"}],"required":["schemaVersion","decisionId","payloadDigest","action","leaseName","leaseUID","readyDigest","generation","actorId","issuer","appliedAt","previousExpiry","expiresAt","state","envelope"],"observedSchemaKeywords":["properties","required","type","x-kubernetes-validations"]},241],
 ["$.status.demoProduct.decisions[].action",{"type":"string","enum":["accept","extend"],"maxLength":6,"observedSchemaKeywords":["enum","maxLength","type"]},260],
 ["$.status.demoProduct.decisions[].actorId",{"type":"string","minLength":1,"maxLength":1024,"observedSchemaKeywords":["maxLength","minLength","type"]},286],
 ["$.status.demoProduct.decisions[].appliedAt",{"type":"string","format":"date-time","maxLength":35,"observedSchemaKeywords":["format","maxLength","type"]},302],
 ["$.status.demoProduct.decisions[].decisionId",{"type":"string","minLength":36,"maxLength":36,"pattern":"^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$","observedSchemaKeywords":["maxLength","minLength","pattern","type"]},273],
 ["$.status.demoProduct.decisions[].envelope",{"type":"object","required":["schemaVersion","payload","signature"],"observedSchemaKeywords":["properties","required","type"]},314],
 ["$.status.demoProduct.decisions[].envelope.payload",{"type":"string","maxLength":10924,"observedSchemaKeywords":["maxLength","type"]},322],
 ["$.status.demoProduct.decisions[].envelope.schemaVersion",{"type":"string","enum":["demo-product-decision-envelope.v1"],"maxLength":33,"observedSchemaKeywords":["enum","maxLength","type"]},318],
 ["$.status.demoProduct.decisions[].envelope.signature",{"type":"string","minLength":88,"maxLength":88,"observedSchemaKeywords":["maxLength","minLength","type"]},325],
 ["$.status.demoProduct.decisions[].expiresAt",{"type":"string","format":"date-time","maxLength":35,"observedSchemaKeywords":["format","maxLength","type"]},310],
 ["$.status.demoProduct.decisions[].generation",{"type":"integer","format":"int64","minimum":1,"maximum":9007199254740991,"observedSchemaKeywords":["format","maximum","minimum","type"]},268],
 ["$.status.demoProduct.decisions[].issuer",{"type":"string","minLength":1,"maxLength":1024,"observedSchemaKeywords":["maxLength","minLength","type"]},290],
 ["$.status.demoProduct.decisions[].leaseName",{"type":"string","minLength":1,"maxLength":1024,"observedSchemaKeywords":["maxLength","minLength","type"]},278],
 ["$.status.demoProduct.decisions[].leaseUID",{"type":"string","minLength":1,"maxLength":1024,"observedSchemaKeywords":["maxLength","minLength","type"]},282],
 ["$.status.demoProduct.decisions[].payloadDigest",{"type":"string","pattern":"^sha256:[a-f0-9]{64}$","maxLength":71,"observedSchemaKeywords":["maxLength","pattern","type"]},294],
 ["$.status.demoProduct.decisions[].previousExpiry",{"type":"string","format":"date-time","maxLength":35,"observedSchemaKeywords":["format","maxLength","type"]},306],
 ["$.status.demoProduct.decisions[].readyDigest",{"type":"string","pattern":"^sha256:[a-f0-9]{64}$","maxLength":71,"observedSchemaKeywords":["maxLength","pattern","type"]},298],
 ["$.status.demoProduct.decisions[].schemaVersion",{"type":"string","enum":["demo-product-decision-receipt.v1"],"maxLength":32,"observedSchemaKeywords":["enum","maxLength","type"]},256],
 ["$.status.demoProduct.decisions[].state",{"type":"string","enum":["accepted","extended"],"maxLength":8,"observedSchemaKeywords":["enum","maxLength","type"]},264],
 ["$.status.demoProduct.leaseUID",{"type":"string","minLength":1,"maxLength":1024,"observedSchemaKeywords":["maxLength","minLength","type"]},233],
 ["$.status.demoProduct.readyDigest",{"type":"string","pattern":"^sha256:[a-f0-9]{64}$","maxLength":71,"observedSchemaKeywords":["maxLength","pattern","type"]},237],
 ["$.status.demoReadiness",{"type":"object","x-kubernetes-validations":[{"rule":"(self.schemaVersion == 'demo-readiness.v1' && !has(self.retentionSeconds)) || (self.schemaVersion == 'demo-readiness.v2' && has(self.retentionSeconds))","message":"v2 readiness requires retentionSeconds; historical v1 has implicit seven days"},{"rule":"self.schemaVersion == oldSelf.schemaVersion","message":"committed readiness schema version is immutable"}],"required":["schemaVersion","state","requestId","requestDigest","readyAt","expiresAt","leaseUID","owner","previousOwner","exposureGeneration","exposureSpec","receipt"],"observedSchemaKeywords":["properties","required","type","x-kubernetes-validations"]},329],
 ["$.status.demoReadiness.candidateDigest",{"type":"string","pattern":"^sha256:[a-f0-9]{64}$","observedSchemaKeywords":["pattern","type"]},392],
 ["$.status.demoReadiness.credentialDigest",{"type":"string","pattern":"^sha256:[a-f0-9]{64}$","observedSchemaKeywords":["pattern","type"]},404],
 ["$.status.demoReadiness.decisionDigest",{"type":"string","pattern":"^sha256:[a-f0-9]{64}$","observedSchemaKeywords":["pattern","type"]},395],
 ["$.status.demoReadiness.expiresAt",{"type":"string","format":"date-time","observedSchemaKeywords":["format","type"]},410],
 ["$.status.demoReadiness.exposureGeneration",{"type":"integer","format":"int64","minimum":1,"observedSchemaKeywords":["format","minimum","type"]},413],
 ["$.status.demoReadiness.exposureSpec",{"type":"object","observedSchemaKeywords":["properties","type"]},417],
 ["$.status.demoReadiness.exposureSpec.hostname",{"type":"string","maxLength":1024,"observedSchemaKeywords":["maxLength","type"]},426],
 ["$.status.demoReadiness.exposureSpec.path",{"type":"string","maxLength":1024,"observedSchemaKeywords":["maxLength","type"]},429],
 ["$.status.demoReadiness.exposureSpec.provider",{"type":"string","enum":["tailscale-ingress"],"observedSchemaKeywords":["enum","type"]},420],
 ["$.status.demoReadiness.exposureSpec.serviceName",{"type":"string","maxLength":1024,"observedSchemaKeywords":["maxLength","type"]},423],
 ["$.status.demoReadiness.exposureSpec.servicePort",{"type":"integer","minimum":1,"maximum":65535,"observedSchemaKeywords":["maximum","minimum","type"]},432],
 ["$.status.demoReadiness.immutableImage",{"type":"string","minLength":1,"maxLength":1024,"observedSchemaKeywords":["maxLength","minLength","type"]},364],
 ["$.status.demoReadiness.leaseUID",{"type":"string","minLength":1,"maxLength":1024,"observedSchemaKeywords":["maxLength","minLength","type"]},360],
 ["$.status.demoReadiness.manifestDigest",{"type":"string","pattern":"^sha256:[a-f0-9]{64}$","observedSchemaKeywords":["pattern","type"]},401],
 ["$.status.demoReadiness.namespace",{"type":"string","minLength":1,"maxLength":253,"observedSchemaKeywords":["maxLength","minLength","type"]},348],
 ["$.status.demoReadiness.owner",{"type":"string","minLength":1,"maxLength":1024,"observedSchemaKeywords":["maxLength","minLength","type"]},380],
 ["$.status.demoReadiness.previousOwner",{"type":"string","minLength":1,"maxLength":1024,"observedSchemaKeywords":["maxLength","minLength","type"]},376],
 ["$.status.demoReadiness.readyAt",{"type":"string","format":"date-time","observedSchemaKeywords":["format","type"]},407],
 ["$.status.demoReadiness.receipt",{"type":"object","required":["schemaVersion","accepted","target","status","messageId","deliveryId","payloadDigest"],"observedSchemaKeywords":["properties","required","type"]},436],
 ["$.status.demoReadiness.receipt.accepted",{"type":"boolean","enum":[true],"observedSchemaKeywords":["enum","type"]},443],
 ["$.status.demoReadiness.receipt.deliveryId",{"type":"string","minLength":1,"maxLength":1024,"observedSchemaKeywords":["maxLength","minLength","type"]},458],
 ["$.status.demoReadiness.receipt.messageId",{"type":"string","minLength":1,"maxLength":1024,"observedSchemaKeywords":["maxLength","minLength","type"]},454],
 ["$.status.demoReadiness.receipt.payloadDigest",{"type":"string","pattern":"^sha256:[a-f0-9]{64}$","observedSchemaKeywords":["pattern","type"]},462],
 ["$.status.demoReadiness.receipt.schemaVersion",{"type":"string","enum":["discord-delivery-receipt.v1"],"observedSchemaKeywords":["enum","type"]},440],
 ["$.status.demoReadiness.receipt.status",{"type":"integer","minimum":200,"maximum":299,"observedSchemaKeywords":["maximum","minimum","type"]},446],
 ["$.status.demoReadiness.receipt.target",{"type":"string","minLength":1,"maxLength":1024,"observedSchemaKeywords":["maxLength","minLength","type"]},450],
 ["$.status.demoReadiness.requestDigest",{"type":"string","pattern":"^sha256:[a-f0-9]{64}$","observedSchemaKeywords":["pattern","type"]},389],
 ["$.status.demoReadiness.requestId",{"type":"string","minLength":1,"maxLength":1024,"observedSchemaKeywords":["maxLength","minLength","type"]},344],
 ["$.status.demoReadiness.resultDigest",{"type":"string","pattern":"^sha256:[a-f0-9]{64}$","observedSchemaKeywords":["pattern","type"]},398],
 ["$.status.demoReadiness.retentionSeconds",{"type":"integer","format":"int64","minimum":1,"maximum":9223372036,"observedSchemaKeywords":["format","maximum","minimum","type"]},384],
 ["$.status.demoReadiness.runId",{"type":"string","minLength":1,"maxLength":1024,"observedSchemaKeywords":["maxLength","minLength","type"]},352],
 ["$.status.demoReadiness.schemaVersion",{"type":"string","enum":["demo-readiness.v1","demo-readiness.v2"],"observedSchemaKeywords":["enum","type"]},338],
 ["$.status.demoReadiness.secretUID",{"type":"string","minLength":1,"maxLength":1024,"observedSchemaKeywords":["maxLength","minLength","type"]},368],
 ["$.status.demoReadiness.sourceRevision",{"type":"string","minLength":1,"maxLength":1024,"observedSchemaKeywords":["maxLength","minLength","type"]},356],
 ["$.status.demoReadiness.state",{"type":"string","enum":["ready-for-acceptance"],"observedSchemaKeywords":["enum","type"]},341],
 ["$.status.demoReadiness.url",{"type":"string","minLength":1,"maxLength":1024,"observedSchemaKeywords":["maxLength","minLength","type"]},372],
 ["$.status.expiresAt",{"type":"string","observedSchemaKeywords":["type"]},521],
 ["$.status.exposureGeneration",{"type":"integer","format":"int64","minimum":0,"observedSchemaKeywords":["format","minimum","type"]},203],
 ["$.status.exposureHostname",{"type":"string","nullable":true,"observedSchemaKeywords":["nullable","type"]},207],
 ["$.status.exposureMutation",{"type":"object","nullable":true,"required":["id","startedAt"],"observedSchemaKeywords":["nullable","properties","required","type"]},215],
 ["$.status.exposureMutation.id",{"type":"string","pattern":"^[a-f0-9]{48}$","observedSchemaKeywords":["pattern","type"]},220],
 ["$.status.exposureMutation.startedAt",{"type":"string","format":"date-time","observedSchemaKeywords":["format","type"]},223],
 ["$.status.exposureOwner",{"type":"string","observedSchemaKeywords":["type"]},201],
 ["$.status.exposurePhase",{"type":"string","observedSchemaKeywords":["type"]},199],
 ["$.status.generatedCredentialIntent",{"type":"object","required":["leaseUID","namespace","secretName","credentialDigest"],"observedSchemaKeywords":["properties","required","type"]},465],
 ["$.status.generatedCredentialIntent.credentialDigest",{"type":"string","pattern":"^sha256:[a-f0-9]{64}$","observedSchemaKeywords":["pattern","type"]},478],
 ["$.status.generatedCredentialIntent.leaseUID",{"type":"string","minLength":1,"observedSchemaKeywords":["minLength","type"]},469],
 ["$.status.generatedCredentialIntent.namespace",{"type":"string","minLength":1,"observedSchemaKeywords":["minLength","type"]},472],
 ["$.status.generatedCredentialIntent.secretName",{"type":"string","minLength":1,"observedSchemaKeywords":["minLength","type"]},475],
 ["$.status.generatedCredentials",{"type":"object","required":["schemaVersion","leaseUID","secretUID","secretResourceVersion","namespace","secretName","credentialDigest"],"observedSchemaKeywords":["properties","required","type"]},481],
 ["$.status.generatedCredentials.credentialDigest",{"type":"string","pattern":"^sha256:[a-f0-9]{64}$","observedSchemaKeywords":["pattern","type"]},503],
 ["$.status.generatedCredentials.leaseUID",{"type":"string","minLength":1,"observedSchemaKeywords":["minLength","type"]},488],
 ["$.status.generatedCredentials.namespace",{"type":"string","minLength":1,"observedSchemaKeywords":["minLength","type"]},497],
 ["$.status.generatedCredentials.schemaVersion",{"type":"string","enum":["generated-demo-credential-source.v1"],"observedSchemaKeywords":["enum","type"]},485],
 ["$.status.generatedCredentials.secretName",{"type":"string","minLength":1,"observedSchemaKeywords":["minLength","type"]},500],
 ["$.status.generatedCredentials.secretResourceVersion",{"type":"string","minLength":1,"observedSchemaKeywords":["minLength","type"]},494],
 ["$.status.generatedCredentials.secretUID",{"type":"string","minLength":1,"observedSchemaKeywords":["minLength","type"]},491],
 ["$.status.internalUrl",{"type":"string","nullable":true,"observedSchemaKeywords":["nullable","type"]},193],
 ["$.status.message",{"type":"string","observedSchemaKeywords":["type"]},523],
 ["$.status.namespaceName",{"type":"string","observedSchemaKeywords":["type"]},188],
 ["$.status.phase",{"type":"string","observedSchemaKeywords":["type"]},186],
 ["$.status.previewUrl",{"type":"string","nullable":true,"observedSchemaKeywords":["nullable","type"]},196],
 ["$.status.runtimeSecurity",{"type":"object","required":["phase"],"observedSchemaKeywords":["properties","required","type"]},525],
 ["$.status.runtimeSecurity.findings",{"type":"array","maxItems":4096,"observedSchemaKeywords":["items","maxItems","type"]},557],
 ["$.status.runtimeSecurity.findings[]",{"type":"object","required":["id","severity","message","resource"],"observedSchemaKeywords":["properties","required","type"]},557],
 ["$.status.runtimeSecurity.findings[].id",{"type":"string","maxLength":256,"observedSchemaKeywords":["maxLength","type"]},563],
 ["$.status.runtimeSecurity.findings[].message",{"type":"string","maxLength":4096,"observedSchemaKeywords":["maxLength","type"]},565],
 ["$.status.runtimeSecurity.findings[].resource",{"type":"string","maxLength":512,"observedSchemaKeywords":["maxLength","type"]},566],
 ["$.status.runtimeSecurity.findings[].severity",{"type":"string","enum":["critical","high","medium","low","info"],"observedSchemaKeywords":["enum","type"]},564],
 ["$.status.runtimeSecurity.immutableImage",{"type":"string","maxLength":2048,"observedSchemaKeywords":["maxLength","type"]},537],
 ["$.status.runtimeSecurity.manifestDigest",{"type":"string","pattern":"^sha256:[a-f0-9]{64}$","observedSchemaKeywords":["pattern","type"]},534],
 ["$.status.runtimeSecurity.message",{"type":"string","observedSchemaKeywords":["type"]},555],
 ["$.status.runtimeSecurity.observedAt",{"type":"string","format":"date-time","observedSchemaKeywords":["format","type"]},531],
 ["$.status.runtimeSecurity.omittedFindingCount",{"type":"integer","minimum":0,"observedSchemaKeywords":["minimum","type"]},552],
 ["$.status.runtimeSecurity.phase",{"type":"string","enum":["Observed","Unavailable"],"observedSchemaKeywords":["enum","type"]},528],
 ["$.status.runtimeSecurity.podCount",{"type":"integer","minimum":0,"observedSchemaKeywords":["minimum","type"]},540],
 ["$.status.runtimeSecurity.resultDigest",{"type":"string","pattern":"^sha256:[a-f0-9]{64}$","observedSchemaKeywords":["pattern","type"]},546],
 ["$.status.runtimeSecurity.serviceCount",{"type":"integer","minimum":0,"observedSchemaKeywords":["minimum","type"]},543],
 ["$.status.runtimeSecurity.totalFindingCount",{"type":"integer","minimum":0,"observedSchemaKeywords":["minimum","type"]},549],
 ["$.status.specDigest",{"type":"string","pattern":"^sha256:[a-f0-9]{64}$","observedSchemaKeywords":["pattern","type"]},506]
];
const byPath=new Map(schemaIndex.map(([path,contract])=>[path,contract]));
function family(path){
 if(path.startsWith('$.status.demoProduct'))return 'product';
 if(path.startsWith('$.status.demoReadiness'))return 'readiness';
 if(path.startsWith('$.status.generatedCredential'))return 'proof';
 if(path.startsWith('$.status.runtimeSecurity'))return 'security';
 if(path.startsWith('$.status.conditions'))return 'conditions';
 if(path.startsWith('$.spec.testCredentials'))return 'credentials';
 if(path.startsWith('$.spec.access'))return 'access';
 if(path.startsWith('$.spec.exposure')||/^\$\.status\.exposure/.test(path))return 'exposure';
 if(path.startsWith('$.status'))return 'status';
 return 'request';
}
const effects={
 request:'Admission validates the declared request. The controller validates operator policy before provisioning; immutable spec changes require a new lease. purpose and exposure are excluded from the accepted-spec digest and support preview transitions.',
 access:'Only exact operator-allowed subject/mode pairs receive lease-local grants; duplicate pairs are collapsed by the controller. The deployed tester ClusterRole reads core workload state and manages Jobs. The deployed deployer ClusterRole manages workload resources including ServiceAccounts, PVCs and StatefulSets, and reads namespace Secrets with get/list. Dedicated credential grants do not remove those wider deployer Secret reads.',
 credentials:'Generated mode creates an immutable dedicated Secret; existing mode waits for a deployer to populate the dedicated Secret. Every workload-capable access subject must be included among credential readers. A copied Secret cannot share this name.',
 exposure:'Before readiness, purpose and exposure can change the preview intent. After valid readiness, routing comes from committed exposureSpec. Current UID, generation, owner, predecessor lineage and mutation reservation fence ingress changes; the ingress UID/version fences deletion.',
 readiness:'The authenticated readiness endpoint verifies current lease, recent observation, namespace ownership, exact ingress route, generated Secret provenance and delivery evidence. Committed v2 retention replaces initial TTL; replay must match the original digest and live source. A schema-valid status object alone does not establish readiness.',
 product:'Use the authenticated signed-decision endpoint, not manual status edits. accept appends a receipt without changing expiry; extend adds a validated linked deadline. Existing receipts and their ready subject cannot change or disappear. The controller resolves linked deadlines independently of array order.',
 proof:'The controller persists intent before generating credentials and establishes provenance from the actual immutable Secret. A missing Secret after recorded intent is unresolved, not permission to create replacement credentials. Same-name replacement or changed digest fails provenance.',
 conditions:'Conditions describe separate namespace, access, copied-secret, credential and exposure observations. phase Ready can coexist with CredentialsReady=False or ExposureReady=False. Condition keys are type; list order is not lifecycle order.',
 security:'The controller periodically reads live namespace resources when verifiedImage and manifestDigest exist. It reports Observed findings or Unavailable inputs. Finding count and byte truncation are explicit. This observation does not prove absence of every security issue or authorize readiness.',
 status:'Only authorized status writers can mutate observations. Controller status writes use identity and resource-version compare-and-swap and refuse superseded readiness/product history, terminal transitions or another exposure claim. Namespace phase and optional delivery readiness remain distinct.',
};
function cases(f){
 const out={
 request:[['immutable-request-change','An accepted authority-bearing spec member changes','CRD transition validation rejects its mutation; the accepted digest also rejects unsupported changes. purpose and exposure have a separate mutable path.'],['legacy-empty-access','A legacy admitted lease has no access entries','Reconcile does not provision new work; it removes legacy runner access only for an owned namespace and waits for TTL or deletion.']],
 access:[['unlisted-subject-mode','The ServiceAccount exists but its requested mode is not operator-allowed','accessRequests rejects it; existence or Kubernetes RBAC alone does not grant product trust.']],
 credentials:[['reader-excludes-deployer','A workload-capable lease subject is absent from readers','credentialRequest rejects the request.'],['existing-without-writer','existing mode requests keys without a deployer grant','credentialRequest rejects it.'],['generated-key-variant','generate mode requests keys other than exactly username and password','CRD CEL and controller reject the variant.']],
 exposure:[['superseded-exposure','Lease UID, readiness/product state, owner, generation or predecessor lineage changes before the mutation','The current-intent check returns an error before authorized ingress mutation.'],['unresolved-reservation','A persisted exposureMutation remains while readiness is requested','Readiness returns DEMO_READY_EXPOSURE_OPERATION_UNRESOLVED; startedAt alone grants no takeover.']],
 readiness:[['retention-v1-v2','Stored schema is historical v1 without retentionSeconds or v2 with retentionSeconds','v1 uses 604800 seconds; v2 requires its explicit valid value. v2 omission fails CEL and stored-retention verification.'],['changed-ready-replay','A new request differs from the committed request digest','Controller rejects changed replay or receipt conflict; it does not overwrite committed readiness.'],['commit-response-uncertain','A readiness write response or its persisted reread cannot establish the committed result','Controller returns DEMO_READY_COMMIT_UNCERTAIN; reread through the trusted status route before retrying the same request.']],
 product:[['remove-or-rewrite-decision','An update removes a prior decisionId or changes a persisted receipt','CRD list-map CEL rejects removal or mutation; the root rule also prevents removing demoProduct.'],['same-id-new-payload','An existing decisionId is replayed with another payload digest','Controller returns DEMO_PRODUCT_REPLAY_CHANGED.'],['extension-order','Persisted list-map entries are reordered but form one exact expiry chain','productDeadline follows previousExpiry links, not array order; duplicate or disconnected links fall back to the base deadline.']],
 proof:[['same-name-secret-replacement','A generated Secret name exists with a different UID from recorded provenance','generatedCredentialProof rejects the replacement.'],['crash-after-intent','Intent was recorded but the source Secret is absent on restart','Reconciliation reports unresolved creation and does not silently rotate credentials.']],
 conditions:[['namespace-ready-with-pending-exposure','Namespace/access/copy provisioning completed but preview exposure is pending','phase is Ready while ExposureReady is False; check the separate condition and exposure observation.']],
 security:[['missing-verified-input','verifiedImage or manifestDigest is empty','Runtime security returns Unavailable with a message, not an empty clean finding proof.'],['bounded-findings','The complete finding set exceeds the publication limits','Only bounded findings are published with totalFindingCount and omittedFindingCount.']],
 status:[['stale-status-transition','UID, generation, deletion state, readiness/product history or owner changed since observation','patchLeaseStatus rejects the superseded transition.'],['same-namespace-not-ready','Namespace exists but provisioning has not completed','Do not infer lease readiness from existence; controller publishes status after its provisioning sequence.']],
 };
 return out[f].map(([name,condition,sourceOutcome])=>({name,condition,sourceOutcome}));
}
function make([fieldPath,contract,line],apiVersion,lookup=byPath){
 const f=family(fieldPath),item=fieldPath.endsWith('[]');
 const leaf=fieldPath.split('.').at(-1).replace(/\[\]$/,'');
 const parent=item?fieldPath.slice(0,-2):fieldPath.slice(0,fieldPath.lastIndexOf('.'));
 const required=!item&&(lookup.get(parent)?.required??[]).includes(leaf);
 const constraints=Object.entries(contract).filter(([k])=>!['observedSchemaKeywords','type','description'].includes(k));
 const conditions=[effects[f],...constraints.map(([k,v])=>`Owned schema ${k}: ${JSON.stringify(v)}.`)];
 const omission=item?'No item exists; no zero-valued item is created.':required?'With its immediate parent present, omission fails the owned required-member contract.':`The owned schema has no default for this member. If its parent is absent, this child is not read; ${fieldPath.startsWith('$.status')?'absence is no controller observation':'the named controller branch determines the fallback or rejection'}.`;
 const empty=contract.type==='object'?`{} must still satisfy required members ${JSON.stringify(contract.required??[])} and applicable CEL rules.`:contract.type==='array'?`[] contains no entries; minItems ${contract.minItems??0}, list semantics and the named controller conditions apply.`:contract.type==='string'?`An empty string must satisfy minLength ${contract.minLength??0}, pattern and enum when declared; it is not an omitted member.`:`The explicit ${contract.type==='boolean'?'false':'zero'} value must satisfy the declared enum or numeric minimum; it is not an omitted member.`;
 const purpose=fieldPath==='$'?purposes.root:fieldPath==='$.status'?purposes.statusRoot:purposes[leaf];
 if(!purpose)throw new Error(`BUSTER_PURPOSE_UNAUTHORED: ${fieldPath}`);
 const record={kind:'BusterNamespaceLease',fieldPath,authoritySelector:{apiVersion,kind:'BusterNamespaceLease',fieldPath},purpose,receiver:`KubeClaw-owned CRD admission and ${f} controller receiver.`,operationScope:fieldPath.startsWith('$.status')?'Authorized status-subresource updates and controller rereads; ordinary main-resource create/update does not author controller status. Required-child cases assume a present immediate parent. Merge patch null removes a member before subsequent validation.':'Lease create or spec update on the configured namespaced CRD endpoint, then controller reconciliation. Required-child cases assume a present immediate parent. Patch/apply ownership semantics require the matching Kubernetes operation contract.',omitted:omission,nullValue:contract.nullable?'The schema explicitly permits null here. Controller map/string helpers treat absent observations or nil objects as unavailable; null does not establish readiness. Merge patch null removes the member.':'The owned schema does not declare nullable. Null is not an accepted typed value: nonnullable structural pruning and required/CEL validation determine whether the member is removed or the request fails. It does not supply an explicit empty typed value.',emptyValue:empty,invalidValue:`Incompatible types and violated owned pattern, enum, range, required, collection or CEL constraints cannot establish an admitted lease. Even schema-valid input can fail the ${f} receiver checks described below.`,changeImpact:effects[f],crossFieldConditions:conditions,cases:cases(f),evidence:[source('charts/kubeclaw/templates/buster-namespace-lease-crd.yaml',line,Math.min(569,line+5),'Owned schema declaration for '+fieldPath),...evidenceFor[f]],qualificationLimits:['Pinned local source establishes these expected branches; no live Kubernetes admission, DNS, Tailscale, credential delivery or controller restart was executed by this module.','Schema validity is distinct from operator policy, authenticated readiness verification and successful persistence. This record does not accept a user-authored readiness or human decision merely because it has the correct shape.','Unknown fields, patch/apply ownership and standard ObjectMeta are API-server responsibilities; this owned schema inventory does not fabricate metadata children.']};
 return specialize(record,contract,apiVersion);
}
export function busterLeaseReceiverContracts(apiVersion='kubeclaw.forgestack.ai/v1alpha1', boundaries=null){
 if(typeof apiVersion!=='string'||!apiVersion.includes('/'))throw new Error('BUSTER_LEASE_API_IDENTITY_INVALID');
 const input=boundaries===null?schemaIndex:boundaries.map(row=>{
  const original=schemaIndex.find(([path])=>path===row.fieldPath);
  if(!original)throw new Error(`BUSTER_OWNED_BOUNDARY_UNAUTHORED: ${row.fieldPath}`);
  return [row.fieldPath,row.contract,row.line??original[2]];
 });
 if(new Set(input.map(([path])=>path)).size!==schemaIndex.length||input.length!==schemaIndex.length)
  throw new Error('BUSTER_OWNED_BOUNDARY_SET_DRIFT');
 const lookup=new Map(input.map(([path,contract])=>[path,contract]));
 return input.map(row=>make(row,apiVersion,lookup));
}

const kubernetesRevision='66452049f3d692768c39c797b21b793dce80314e';
const k=(path,start,end,claim)=>({url:`https://github.com/kubernetes/kubernetes/blob/${kubernetesRevision}/${path}#L${start}-L${end}`,claim});
const crdServerEvidence=[
 k('staging/src/k8s.io/apiextensions-apiserver/pkg/registry/customresource/strategy.go',145,198,'CRD create clears supplied status with a status subresource; ordinary update preserves stored status and increments generation on nonmetadata change.'),
 k('staging/src/k8s.io/apiextensions-apiserver/pkg/registry/customresource/status_strategy.go',65,92,'Status preparation preserves the old object and replaces only submitted status with managed-fields handling.'),
 k('staging/src/k8s.io/apiextensions-apiserver/pkg/apiserver/customresource_handler.go',1406,1470,'CRD schema coercion preserves root identity/ObjectMeta while coercing metadata and pruning unknown fields and nonnullable nulls.'),
];
function specialize(r,c,apiVersion){
 r.evidence.push(...crdServerEvidence);
 const p=r.fieldPath;
 if(p==='$.apiVersion'||p==='$.kind'){
  const value=p==='$.kind'?'BusterNamespaceLease':apiVersion;
  r.evidence.shift();
  r.evidence.push(source('charts/kubeclaw/templates/buster-namespace-lease-crd.yaml',9,23,'Configured namespaced CRD identity and enabled status subresource.'));
  r.receiver='Kubernetes unstructured CRD serializer and exact endpoint TypeMeta validator.';
  r.omitted=p==='$.kind'?'Unstructured decoding requires actual body kind and reports MissingKind. Endpoint defaults for typed built-ins do not supply CRD body kind.':'Missing body apiVersion does not satisfy the exact served CRD endpoint group/version requirement.';
  r.nullValue='Null does not supply the exact required body identity string.';
  r.emptyValue='An empty identity does not satisfy the exact CRD endpoint TypeMeta requirement.';
  r.invalidValue=`The body must declare ${value}; a non-string or mismatched identity fails decoding or endpoint validation.`;
  r.changeImpact='Select the configured served endpoint through discovery and use its exact identity; changing the string alone does not migrate the resource.';
  r.crossFieldConditions=[`Declare apiVersion ${apiVersion} and kind BusterNamespaceLease.`, 'The fixture constructs its lease body from configured group/version. Its ordinary wait and release commands use the bare resource kind, so multiple installed groups need separate client-discovery qualification.'];
  r.cases=[{name:'missing-custom-kind',condition:'Body kind is absent at the served CRD endpoint.',sourceOutcome:'Unstructured decoding requires actual body kind, independently of typed built-in default identity.'},{name:'configured-custom-identity',condition:`Both body identity fields match ${apiVersion} and BusterNamespaceLease.`,sourceOutcome:'TypeMeta can pass; metadata, schema, authorization and controller policy remain separate.'}];
  r.evidence.push(k('staging/src/k8s.io/apimachinery/pkg/runtime/serializer/json/json.go',164,190,'Unstructured decoding rereads actual body identity and requires kind.'),k('staging/src/k8s.io/apiextensions-apiserver/pkg/registry/customresource/validator.go',115,133,'CRD TypeMeta requires exact body kind and group/version.'),source('skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts',692,709,'Fixture renders configured group/version and dry-runs before apply.'));
 }
 if(p==='$.metadata'){
  r.evidence.shift();
  r.receiver='Kubernetes CRD ObjectMeta coercion, common REST metadata validation and KubeClaw lease identity checks.';
  r.operationScope='Standard root ObjectMeta on a namespaced CRD request; the CRD schema does not declare a child metadata schema.';
  r.omitted='Without metadata the request has no authored name or namespace; server scope/name validation still applies. Server-generated UID and resourceVersion establish stored identity.';
  r.nullValue='Null does not establish a valid named lease identity. ObjectMeta coercion and REST validation apply.';
  r.emptyValue='{} supplies no name; creation needs a name or valid generateName and the endpoint namespace.';
  r.invalidValue='Malformed typed metadata fails incoming ObjectMeta coercion; identity, scope and immutable metadata validation are independent of the owned CRD schema.';
  r.changeImpact='Name reuse creates a different UID. resourceVersion fences writes; generation and exposure owner/predecessor annotations fence controller intent. Do not remove the controller finalizer before owned cleanup is proved.';
  r.crossFieldConditions=['Use the canonical standard Kubernetes ObjectMeta reference for metadata children and operation-specific create/update/apply/delete semantics. This boundary is opaqueObjectMeta, not a fabricated owned properties list.','The controller requires exact lease UID ownership labels on its namespace and uses resource-version preconditions for mutations.'];
  r.cases=[{name:'same-name-new-uid',condition:'A deleted lease name is reused with a new UID.',sourceOutcome:'Controller ownership and status checks do not treat the replacement as the old lease.'},{name:'stale-resource-version',condition:'A mutation uses an outdated observed resourceVersion.',sourceOutcome:'Conditional writes conflict; reread current identity and state before retry.'}];
  r.evidence.push(main(799,809,'Namespace ownership labels include the current lease UID.'),lifecycle(147,162,'Finalizer removal rereads UID, deletion timestamp and resource version.'),k('staging/src/k8s.io/apiextensions-apiserver/pkg/apiserver/schema/objectmeta/coerce.go',62,110,'Incoming root metadata is decoded as standard ObjectMeta with the configured malformed-field policy.'),k('staging/src/k8s.io/apiextensions-apiserver/pkg/registry/customresource/validator.go',46,74,'CRD validation separately validates standard ObjectMeta.'));
 }
 const fallback={
 '$.spec.ttlSeconds':'When omitted, the controller uses configured defaultTTL (shipped 7200 seconds). This is a runtime fallback, not a CRD schema default.',
 '$.spec.namespacePrefix':'Omission is permitted by the schema; actual normalized namespace must still satisfy controller allowed-prefix checks.',
 '$.spec.access':'Although schema-optional, omission enters the legacy no-new-work branch; it does not grant default access.',
 '$.spec.testCredentials':'Omission requests no dedicated credentials; controller returns credentialsRef null and credentialsAvailable false.',
 '$.spec.testCredentials.keys':'Generated mode defaults missing keys to username/password; existing mode requires at least one deliverable key by CEL and controller validation.',
 '$.spec.exposure':'Omission gives provider off; no preview is created unless retained readiness supplies a committed route.',
 '$.spec.exposure.provider':'Omission selects off before readiness; retained readiness selects its exposureSpec.',
 '$.spec.exposure.servicePort':'Omission uses 80 in previewExposureSpec; spec.servicePort does not override this preview port.',
 '$.spec.exposure.serviceName':'Omission falls back to spec.serviceName, then app; the result is normalized to a DNS label.',
 '$.spec.exposure.hostname':'Omission derives namespaceName-serviceName and normalizes it to a DNS label.',
 '$.spec.exposure.path':'Omission selects / in the controller. An explicit empty string fails the served CRD pattern; the controller empty-string branch is a defensive fallback for absent or legacy data, not an admitted empty-value default.',
 '$.spec.purpose':'Omission uses pretest in exposure selection; final-preview is needed for preview creation before readiness.',
 '$.spec.secretsToCopy':'Omission copies no source Secrets; it does not select all operator-approved names.',
 '$.spec.servicePort':'Omission uses exposure.servicePort then 80 for an internal URL, but Buster E2E egress policy requires a declared valid servicePort.',
 '$.spec.serviceTargetPort':'Omission falls back to servicePort in the Buster E2E egress policy; differing target and service ports are both allowed TCP destination ports.',
 '$.status.demoReadiness.retentionSeconds':'Historical v1 must omit this field and uses 604800 seconds. v2 requires it; there is no stored-v2 omission default.',
 };
 if(fallback[p])r.omitted=fallback[p];
 if(p==='$.spec.runId'||p==='$.spec.project'){
  r.changeImpact='This optional trace field is immutable and contributes to leaseSpecDigest because only purpose and exposure are excluded. The fixture writes it into spec, but the controller has no direct spec.runId or spec.project consumer in namespace labels or readiness-source comparison.';
  r.crossFieldConditions.push('Owner labels derive lease name, UID, purpose and metadata scope, not spec.runId or spec.project. Authenticated readiness stores its own request runId without comparing it to spec.runId.');
  r.evidence.push(main(1765,1781,'ownerLabels uses lease name/UID, purpose and metadata scope rather than spec trace values.'),main(1624,1635,'The spec digest removes purpose and exposure; any present trace fields remain digested.'),source('skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts',692,700,'Fixture writes runId from leaseName and project from its validated payload.'),source('cmd/buster-namespace-controller/demo-readiness.go',250,256,'Committed readiness stores request r.RunID independently of spec.runId.'));
 }
 if(p==='$.status.demoReadiness.runId'){
  r.purpose='Run identity supplied by the authenticated readiness request and persisted in committed readiness; it is not copied from spec.runId.';
  r.crossFieldConditions.push('The readiness producer supplies r.RunID; controller validation requires a valid request run identity but does not compare it to spec.runId.');
  r.evidence.push(source('cmd/buster-namespace-controller/demo-readiness.go',66,79,'Ready request validation checks the producer run identity.'),source('cmd/buster-namespace-controller/demo-readiness.go',250,256,'Readiness state stores r.RunID rather than the spec trace field.'));
 }
 if(p==='$.status.createdAt'){
  r.changeImpact='Provisioning publishes the controller createdAt helper result: lease metadata.creationTimestamp parsed as RFC3339 and converted to UTC, with current UTC time on parse failure. This observation does not measure namespace creation or preparation duration.';
  r.crossFieldConditions.push('The fixture requires a valid returned createdAt timestamp and uses it plus requested retention for its expiry fallback when status.expiresAt is not a string.');
  r.evidence.push(source('skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts',721,726,'Fixture validates status.createdAt and derives its expiry fallback from that timestamp.'),main(674,680,'createdAt parses lease metadata.creationTimestamp; parse failure returns current UTC time.'),main(636,646,'Provisioning publishes createdAt from the helper.'));
 }
 if(p==='$.spec.exposure.path'){
  r.emptyValue='An explicit empty string fails the served owned CRD leading-slash pattern. Omission can reach the controller / fallback; the controller empty-string branch also handles absent or legacy data defensively.';
  r.crossFieldConditions.push('The server dry-run applies the owned CRD pattern before reconciliation. A defensive controller fallback does not make an explicit empty string admissible.');
 }
 if(p==='$.spec'||p==='$')r.crossFieldConditions.push('The root schema does not require spec; an absent spec does not provision a usable lease because reconciliation rejects the missing normalized namespace.');
 if(p==='$.status.conditions[].lastTransitionTime')r.changeImpact+=' The implementation writes time.Now when constructing conditions; it does not preserve an earlier timestamp solely because truth stayed unchanged.';
 if(p==='$.spec.access'||p.startsWith('$.spec.access[')){r.qualificationLimits.push('BUSTER_RBAC_HELPER_CHART_DIVERGENCE: namespaceRole in main.go is not the effective chart ClusterRole. Its unit test excludes Secrets and has broader tester verbs; it cannot prove the deployed chart permission contract.');}
 if(p==='$.spec.serviceTargetPort'||p==='$.spec.servicePort'){r.crossFieldConditions.push('Buster E2E egress selects TCP target port plus Service port when different, only to the owned namespace and explicitly labelled kubeclaw/e2e-target Pods. Controller does not create the workload Service from these fields.');r.evidence.push(main(858,906,'Lease-scoped Buster E2E egress derives target-port fallback, both distinct ports and exact namespace UID/target-Pod selectors.'));}
 return r;
}

export const receiverContracts=busterLeaseReceiverContracts();
