#!/usr/bin/env bash
set -Eeuo pipefail

NAMESPACE="${NAMESPACE:-kubeclaw}"
PRISM_NAMESPACE="${PRISM_NAMESPACE:-$NAMESPACE}"
NOVA_DEPLOYMENT="${NOVA_DEPLOYMENT:-agent-nova}"
BUSTER_DEPLOYMENT="${BUSTER_DEPLOYMENT:-agent-buster}"
PRISM_CONTROL_DEPLOYMENT="${PRISM_CONTROL_DEPLOYMENT:-prism-control}"
PRISM_WORKER_DEPLOYMENT="${PRISM_WORKER_DEPLOYMENT:-prism-worker}"
TRUST_DOMAIN="${WORKER_TRUST_DOMAIN:-kubeclaw.internal}"
PULL_SECRET="${PRISM_IMAGE_PULL_SECRET_NAME:-ghcr-secret}"
RUN_ID="worker-trust-$(date +%s)-${RANDOM}"

command -v kubectl >/dev/null || { echo "kubectl is required" >&2; exit 1; }
kubectl get csidriver csi.spiffe.io >/dev/null

cleanup() {
  kubectl delete job,serviceaccount "$RUN_ID-prism" -n "$PRISM_NAMESPACE" \
    --ignore-not-found --wait=false >/dev/null 2>&1 || true
  kubectl delete job,serviceaccount "$RUN_ID-buster" -n "$NAMESPACE" \
    --ignore-not-found --wait=false >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_for_deployment() {
  kubectl rollout status "deployment/$2" -n "$1" --timeout=5m >/dev/null
}

node_in() {
  local namespace="$1" deployment="$2" container="$3" source="$4"
  shift 4
  kubectl exec -n "$namespace" "deployment/$deployment" -c "$container" -- \
    node -e "$source" "$@"
}

assert_proxy_get() {
  local namespace="$1" deployment="$2" container="$3" url="$4"
  node_in "$namespace" "$deployment" "$container" \
    'const response=await fetch(process.argv[1]);if(!response.ok)throw new Error(`unexpected status ${response.status}`);' \
    "$url"
}

assert_direct_mtls_rejected() {
  local namespace="$1" deployment="$2" container="$3" host="$4" port="$5" path="$6"
  node_in "$namespace" "$deployment" "$container" '
    import https from "node:https";
    const [host,port,path]=process.argv.slice(1);
    const result=await new Promise((resolve)=>{
      const request=https.get({host,port:Number(port),path,rejectUnauthorized:false,timeout:5000},
        (response)=>{response.resume();resolve({rejected:false,status:response.statusCode});});
      request.on("error",()=>resolve({rejected:true}));
      request.on("timeout",()=>{request.destroy();resolve({rejected:true});});
    });
    if(!result.rejected)throw new Error(`direct connection unexpectedly returned ${result.status}`);
  ' "$host" "$port" "$path"
}

assert_svid_loaded() {
  local namespace="$1" deployment="$2" container="$3" expected="$4"
  node_in "$namespace" "$deployment" "$container" '
    const expected=process.argv[1];
    const response=await fetch("http://127.0.0.1:9901/certs");
    if(!response.ok)throw new Error(`Envoy cert endpoint returned ${response.status}`);
    const evidence=await response.text();
    if(!evidence.includes(expected))throw new Error(`SVID not loaded for ${expected}`);
  ' "$expected"
}

for item in \
  "$NAMESPACE:$NOVA_DEPLOYMENT" \
  "$NAMESPACE:$BUSTER_DEPLOYMENT" \
  "$PRISM_NAMESPACE:$PRISM_CONTROL_DEPLOYMENT" \
  "$PRISM_NAMESPACE:$PRISM_WORKER_DEPLOYMENT"; do
  wait_for_deployment "${item%%:*}" "${item#*:}"
done

assert_svid_loaded "$NAMESPACE" "$NOVA_DEPLOYMENT" kubeclaw \
  "spiffe://$TRUST_DOMAIN/ns/$NAMESPACE/sa/agent-nova"
assert_svid_loaded "$NAMESPACE" "$BUSTER_DEPLOYMENT" kubeclaw \
  "spiffe://$TRUST_DOMAIN/ns/$NAMESPACE/sa/agent-buster"
assert_svid_loaded "$PRISM_NAMESPACE" "$PRISM_CONTROL_DEPLOYMENT" control \
  "spiffe://$TRUST_DOMAIN/ns/$PRISM_NAMESPACE/sa/prism-control"
assert_svid_loaded "$PRISM_NAMESPACE" "$PRISM_WORKER_DEPLOYMENT" worker \
  "spiffe://$TRUST_DOMAIN/ns/$PRISM_NAMESPACE/sa/prism-worker"

assert_proxy_get "$NAMESPACE" "$NOVA_DEPLOYMENT" kubeclaw http://127.0.0.1:28891/healthz
assert_proxy_get "$NAMESPACE" "$NOVA_DEPLOYMENT" kubeclaw http://127.0.0.1:28080/health
assert_proxy_get "$PRISM_NAMESPACE" "$PRISM_CONTROL_DEPLOYMENT" control http://127.0.0.1:18081/health
assert_proxy_get "$PRISM_NAMESPACE" "$PRISM_WORKER_DEPLOYMENT" worker http://127.0.0.1:18080/health

node_in "$NAMESPACE" "$NOVA_DEPLOYMENT" kubeclaw '
  import {createHash,randomUUID} from "node:crypto";
  const projectId=`worker-trust-${randomUUID()}`;
  const architectureContent={schema:"kubeclaw.architecture.v1",title:"Worker Trust acceptance",
    audience:["operator"],surfaces:["web"],journeys:["verify trust"],states:["default"],constraints:["none"]};
  const bytes=JSON.stringify(architectureContent);
  const digest=`sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const response=await fetch("http://127.0.0.1:28080/v1/dispatch",{method:"POST",headers:{
    "content-type":"application/json","idempotency-key":projectId,
    "x-forwarded-client-cert":"URI=spiffe://forged.invalid/ns/forged/sa/forged"},body:JSON.stringify({
      request:{schema:"prism.design-request.v1",projectId,architecture:{artifactId:`artifact:${digest}`,
        contentDigest:digest,revision:1},architectureContent},idempotencyKey:projectId})});
  if(response.status!==202)throw new Error(`Nova to Prism dispatch returned ${response.status}: ${await response.text()}`);
'

assert_direct_mtls_rejected "$NAMESPACE" "$NOVA_DEPLOYMENT" kubeclaw \
  "agent-buster.$NAMESPACE.svc.cluster.local" 18891 /healthz
assert_direct_mtls_rejected "$NAMESPACE" "$NOVA_DEPLOYMENT" kubeclaw \
  "prism-control-internal.$PRISM_NAMESPACE.svc.cluster.local" 8443 /health

nova_image="$(kubectl get deployment "$NOVA_DEPLOYMENT" -n "$NAMESPACE" -o jsonpath='{.spec.template.spec.containers[?(@.name=="kubeclaw")].image}')"
nova_envoy="$(kubectl get deployment "$NOVA_DEPLOYMENT" -n "$NAMESPACE" -o jsonpath='{.spec.template.spec.containers[?(@.name=="worker-trust-proxy")].image}')"
prism_image="$(kubectl get deployment "$PRISM_CONTROL_DEPLOYMENT" -n "$PRISM_NAMESPACE" -o jsonpath='{.spec.template.spec.containers[?(@.name=="control")].image}')"
prism_envoy="$(kubectl get deployment "$PRISM_CONTROL_DEPLOYMENT" -n "$PRISM_NAMESPACE" -o jsonpath='{.spec.template.spec.containers[?(@.name=="worker-trust-proxy")].image}')"
for image in "$nova_image" "$nova_envoy" "$prism_image" "$prism_envoy"; do
  [[ -n "$image" ]] || { echo "required deployed image reference is empty" >&2; exit 1; }
done

kubectl create serviceaccount "$RUN_ID-prism" -n "$PRISM_NAMESPACE"
kubectl apply -n "$PRISM_NAMESPACE" -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata: { name: $RUN_ID-prism }
spec:
  backoffLimit: 0
  template:
    metadata: { labels: { app: prism-test-runner, kubeclaw.dev/worker-trust: "true" } }
    spec:
      serviceAccountName: $RUN_ID-prism
      automountServiceAccountToken: false
      imagePullSecrets: [{ name: $PULL_SECRET }]
      restartPolicy: Never
      initContainers:
        - name: worker-trust-proxy
          restartPolicy: Always
          image: $prism_envoy
          args: ["-c", "/etc/kubeclaw-worker-trust/runner.yaml", "--service-cluster", "worker-trust-denied-prism"]
          securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ["ALL"] } }
          volumeMounts:
            - { name: worker-trust-envoy, mountPath: /etc/kubeclaw-worker-trust, readOnly: true }
            - { name: spiffe-workload-api, mountPath: /run/spire/sockets, readOnly: true }
            - { name: tmp, mountPath: /tmp }
      containers:
        - name: verifier
          image: $prism_image
          command: ["node", "-e", "const expected='spiffe://$TRUST_DOMAIN/ns/$PRISM_NAMESPACE/sa/$RUN_ID-prism';let loaded=false;for(let i=0;i<60;i+=1){try{const text=await(await fetch('http://127.0.0.1:9901/certs')).text();if(text.includes(expected)){loaded=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}if(!loaded)throw new Error('wrong Prism SVID was not issued');let accepted=false;try{const response=await fetch('http://127.0.0.1:18443/health',{headers:{'x-forwarded-client-cert':'URI=spiffe://$TRUST_DOMAIN/ns/$PRISM_NAMESPACE/sa/prism-test-runner'}});accepted=response.ok;}catch{}if(accepted)throw new Error('wrong Prism identity was accepted');"]
          securityContext: { runAsNonRoot: true, allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ["ALL"] } }
      volumes:
        - { name: worker-trust-envoy, configMap: { name: prism-worker-trust, defaultMode: 0444 } }
        - { name: spiffe-workload-api, csi: { driver: csi.spiffe.io, readOnly: true } }
        - { name: tmp, emptyDir: { sizeLimit: 64Mi } }
EOF

kubectl create serviceaccount "$RUN_ID-buster" -n "$NAMESPACE"
kubectl apply -n "$NAMESPACE" -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata: { name: $RUN_ID-buster }
spec:
  backoffLimit: 0
  template:
    metadata:
      labels: { app.kubernetes.io/name: kubeclaw, app.kubernetes.io/component: nova, kubeclaw.dev/worker-trust: "true" }
    spec:
      serviceAccountName: $RUN_ID-buster
      automountServiceAccountToken: false
      imagePullSecrets: [{ name: ghcr-secret }]
      restartPolicy: Never
      initContainers:
        - name: worker-trust-proxy
          restartPolicy: Always
          image: $nova_envoy
          args: ["-c", "/etc/kubeclaw-worker-trust/envoy.yaml", "--service-cluster", "worker-trust-denied-buster"]
          securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ["ALL"] } }
          volumeMounts:
            - { name: worker-trust-envoy, mountPath: /etc/kubeclaw-worker-trust, readOnly: true }
            - { name: spiffe-workload-api, mountPath: /run/spire/sockets, readOnly: true }
            - { name: tmp, mountPath: /tmp }
      containers:
        - name: verifier
          image: $nova_image
          command: ["node", "-e", "const expected='spiffe://$TRUST_DOMAIN/ns/$NAMESPACE/sa/$RUN_ID-buster';let loaded=false;for(let i=0;i<60;i+=1){try{const text=await(await fetch('http://127.0.0.1:9901/certs')).text();if(text.includes(expected)){loaded=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}if(!loaded)throw new Error('wrong Buster SVID was not issued');let accepted=false;try{const response=await fetch('http://127.0.0.1:28891/healthz',{headers:{'x-forwarded-client-cert':'URI=spiffe://$TRUST_DOMAIN/ns/$NAMESPACE/sa/agent-nova'}});accepted=response.ok;}catch{}if(accepted)throw new Error('wrong Buster identity was accepted');"]
          securityContext: { runAsNonRoot: true, allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ["ALL"] } }
      volumes:
        - { name: worker-trust-envoy, configMap: { name: $NOVA_DEPLOYMENT-worker-trust, defaultMode: 0444 } }
        - { name: spiffe-workload-api, csi: { driver: csi.spiffe.io, readOnly: true } }
        - { name: tmp, emptyDir: { sizeLimit: 64Mi } }
EOF

for job in "$RUN_ID-prism:$PRISM_NAMESPACE" "$RUN_ID-buster:$NAMESPACE"; do
  name="${job%%:*}"; namespace="${job#*:}"
  if ! kubectl wait -n "$namespace" --for=condition=complete "job/$name" --timeout=5m; then
    kubectl logs -n "$namespace" "job/$name" --all-containers=true || true
    exit 1
  fi
done

printf '{"ok":true,"schemaVersion":"worker-trust-cluster-e2e.v1","cluster":"%s","namespace":"%s","prismNamespace":"%s","positivePaths":["nova-buster","nova-prism","prism-control-worker","prism-worker-control"],"negativePaths":["buster-plaintext","prism-plaintext","buster-wrong-svid","prism-wrong-svid","forwarded-certificate-spoof"]}\n' \
  "$(kubectl config current-context)" "$NAMESPACE" "$PRISM_NAMESPACE"
