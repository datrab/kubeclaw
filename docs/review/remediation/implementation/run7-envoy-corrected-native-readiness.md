# Envoy candidate: independently identified causes corrected

Pending final independent review; no finding or integration completion claimed.
New isolated source `608a33d68ac12573553e92c6a5161c349abc1e77` is based on
freshly verified remote `4f70d8f13e282e01d014fe82557d37c90d52cb71`, exact local
base `3ea43f497d3c18445adf89a4346718185dc5b00a`. All3773 blobs/modes/types
matched the fresh untruncated remote tree. Mandatory remote resume files,
register and original IFR25/IFR07 requirements were reread; frozen47 scope is
unchanged. Prior Envoy source was reconciled onto the now-integrated coupled
Product/controller/chart package. Prism workloads net delta changes only the
worker-trust proxy ports/probes; all new Product configuration remains intact.

The independent reviewer caught two real gaps in the earlier checkpoint; raw
before evidence is backed at `f3eb268f223090bb32d5bc3e89f9282b4008df5b`:

1. OpenSSL x509 -days -1 created a reversed validity interval, not a genuinely
   previously valid expired certificate. The native fixture now uses original
   OpenSSL CA signing with explicit notBefore two days ago and notAfter one day
   ago. Envoy /certs must show both exact serials, the expected URI SAN and a
   correctly ordered interval. The expired interval is entirely in the past.
   Readiness is asserted again after both installed contexts are confirmed, so
   transient update failures or stale certificates cannot satisfy the gate.
2. SPIFFE enabled with the chart default serviceAccount.create=false rendered
   a Pod using default while requiring a dedicated release SPIFFE identity.
   The owning ConfigMap template now rejects that unsupported combination.
   There is no chart-supported existing-name alternative: serviceaccount.yaml
   creates fullname and deployment.yaml only selects that name when create is
   true. Tests reject omitted/false create and an invented existing-SA name;
   disabled trust preserves original default behavior. Valid actual dedicated
   accounts continue to match both TLS contexts for all five consumers. The
   expected identity is never broadened to the default account.

The genuine official hash-verified Envoy1.39.0 executes all six complete native
validators on the latest combined charts, then the real filesystem SDS/mTLS
valid →wrong URI →valid →genuinely expired →valid sequence. It exits0 with
health/bootstrap200, ready200/503 as required, both installed contexts checked,
zero resumed sessions, no admin forwarding and an actual failure event.
Full untruncated output: run7-envoy-native-expiry-final.txt. Three real Helm tests,
original deployment-truth/SPIFFE checks and unchanged configured lint exit0;
output run7-envoy-chart-final.txt. No fake TLS service or generated result used.

Next: final independent native/chart review on this fresh baseline, then root
combined reconciliation before any integration. Real SPIRE gRPC/UDS renewal,
operator-delivered alarm and Kubernetes rollout/old-peer rejection are still
open. No deployment, production change, CI or third-party message was performed.
