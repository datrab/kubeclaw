# Buster RuntimeSecurity policy

The selected full `buster-engine` component owns all host-side RuntimeSecurity inspection settings at `settings.clusterInvokers.runtimeSecurity`. Edit that component, using the [whole-file profile selection](buster-cluster-configuration.md). The eight fields are required even when the capability is disabled. Neither the runtime JSON, environment, schema nor constructor supplies missing values. A complete policy does not grant capability access: `allowedCapabilities` must separately include `kubernetes.runtime-security`.

| Field | Checked-in value | Unit and effect |
|---|---|---|
| `allowedNamespacePrefixes` | `["test"]` | Namespace must start with an entry followed by `-`. The exact entry alone is denied. |
| `maximumExecutionMs` | `300000` | Milliseconds for the entire inspection. Each command and poll uses the remaining time. Positive integer, at most 2,147,483,647. |
| `maximumOutputBytes` | `16777216` | Combined stdout and stderr bytes from each kubectl invocation; minimum 1024. This is not a manifest-file budget. |
| `pollIntervalMs` | `1000` | Delay after an unready or unacceptable observation, capped by remaining inspection time. Integer 10–10000 ms. |
| `maximumObservationAgeMs` | `10000` | Maximum accepted past age relative to the host clock. Integer from `pollIntervalMs` through 60000 ms. |
| `maximumFutureSkewMs` | `5000` | Maximum accepted future timestamp skew. Integer 0–2,147,483,647 ms; zero permits no future skew. |
| `diagnosticCodeUnits` | `1024` | Maximum JavaScript string code units included from stderr after a nonzero child exit. Positive safe integer, separate from the byte quota. |
| `executableSearchPath` | `["/usr/local/bin", "/usr/bin", "/bin"]` | Ordered absolute directories delivered as child PATH. Entries cannot contain `:` or NUL. The initial kubectl executable does not resolve through this PATH. |

Namespace prefixes are a nonempty array of nonempty strings. RuntimeSecurity inspects existing namespaces and reserves no generated-name suffix or prefix length. The request namespace retains its existing 1–63 JavaScript code-unit text check; this migration adds no DNS validator. A 50-character prefix may match a 52-character namespace, and `test-` may match `test--one`. Search-path arrays contain 1–32 entries. Numeric values must be safe integers. Direct callers provide all settings explicitly; the constructor validates and captures scalar values and copied arrays before realpath/access or manifest reads. Mutating the caller's options after construction does not change the active policy.

## Shared bindings and credentials

`clusterInvokers.shared.kubectlExecutable` and `leaseApiGroup` remain the sole executable and API-group authors. The executable resolves relative to the captured component generation if not absolute. RuntimeSecurity performs the group-qualified `busternamespaceleases.<group>` lookup; it does not introduce a separate API-version argument. The controller namespace comes only from the actual projected `clusterBindings.controllerNamespace`. Disabled cluster routes need no namespace binding; a supplied binding must still be valid.

HOME, KUBECONFIG and Kubernetes service host/port remain credential or transport inputs. Secret values do not belong in this policy. LANG and LC_ALL retain deterministic UTF-8 CLI decoding. PATH entries configure helper search without copying host PATH implicitly.

## Migration and failure handling

Remove the entire `kubernetesRuntimeSecurity` object from runtime JSON. Its presence rejects before registry/store construction, including null, empty and equivalent objects. Move its five former policy fields to the selected full component and explicitly provide future skew, diagnostic length and child PATH there. Early entrypoint validation includes the new object before runtime setup or helper launch. Retired shared environment keys continue to reject as described in the cluster configuration guide.

A request timeout is capped by `maximumExecutionMs`; an absent/noninteger request timeout uses that selected cap. No independent numeric timeout is supplied by the invoker. Expired or excessively future observations are polled until a valid matching observation arrives or the inspection deadline expires. Namespace, manifest digest, image, result digest, observation counts and exact findings accounting continue to be checked. Output exhaustion returns `KUBERNETES_RUNTIME_SECURITY_OUTPUT_LIMIT_EXCEEDED`; the resulting child abort must not relabel that cause as a timeout. Diagnostic truncation limits only the rendered error, never the underlying byte accounting.

## Verification boundary and remaining work

`npm run verify:buster:runtime-security-policy` includes real local child-process consumers, complete cluster policy regression, remote runtime configuration and the security cutover chain. The local child acts as kubectl and supplies otherwise valid, bound controller observations. This checks host policy and process invocation, not a real controller, Kubernetes admission, native isolation or deployed security acceptance. Both charts continue to validate the same complete selected file and deliver its exact bytes and checksum. Runtime evidence and independent acceptance belong to the dated implementation report; the command's presence is not a passing result.

The current invoker still reads the manifest with an unbounded `readFileSync`; the command-output quota does not cover that allocation. Its local kubectl wrapper can settle an abort/error before actual child close and lacks detached process-group ownership. Local tests separately observe each genuine child's close and use exact-owned teardown on failure; this does not prove production ownership. These resource/lifecycle issues remain open.

The security provider's request timeout default and schema bounds remain a separate pending provider-owner migration. Controller refresh cadence and finding-capacity policy retain the controller role owner. No host policy setting silently reconfigures either. Existing live security preflight and production acceptance gates remain required separately; none is satisfied by local fixtures or chart rendering.

## Full service-route regression

The maintained cluster-policy command also includes RuntimeSecurity in the shared production-route suite. It submits a signed Nova request to a runtime created by `loadProductionBusterRemotePlanRuntime`, discovers and starts a genuine provider child, and executes its capability IPC through the service/factory/invoker to a real local CLI process. Both authored profiles have passing output quotas and a separately reloaded smaller quota that must produce the exact output-limit error in the imported attempt. Route and grant denials must leave the CLI invocation count unchanged. Existing KubernetesFixture and Exposure cases remain in the same harness.

This extends the earlier helper-composition coverage; it does not turn modeled native preparation or controller responses into live evidence. The shared test owner propagates cancellation, registers runtime lifetimes, observes genuine child close and retains test roots if disposal cannot be confirmed. That is test cleanup, not production process-ownership acceptance. Prepared cases require execution on the exact integrated stand and independent evidence review before RS2 can be accepted.
