# Independent approval: replay-preserving Prism architecture reader

APPROVED at the bounded reader/source scope below, pending root integration.
No overall SDK/finding or downstream Prism delivery closure.
Author source/test f8e7989df97aaaa17be53e6aef46c2fa1f33e72c;
author remote711de7d86b5fb581ed0b82077771c9169df4170a.
Independent reconciled source984bb11ba77c0767b918b15eba1e3abbd4bcc43e,
own run13-prism-reader-review. Fresh integration parent
9c5bdcb21c8fcd50fb38d2a1c4988213db2b3ecb (exact local e98d2bd9).

## Freshness and source inspection

All3,949 baseline blobs/modes/types matched freshly read remote before checkout;
all14 author delta blobs matched remote and the reconciled files byte-for-byte.
Only stage.ts plus new architecture.ts change production. Baseline archive,
SDK/transport, Operator and other source retain the freshly integrated versions.
Mandatory remote resume/register/original requirements were reread, and the
original c38779c implemented ID set independently rederived: exact47, unchanged
against partial-47-scope.json. No status was promoted here.

Independent TypeScript AST comparison confirms the exact textual arguments and
order of ALL five context.invoke calls match the archived original stage:
artifacts.read, runtime.dispatch, signal.wait, operator.request, artifacts.write.
The original get_json payload/operation/ordinal and separately approved runtime
dispatch wrapper are unchanged. Original fixture SHA256 is checked before use;
current dependencies resolve from this checkout without historical Git objects.

Expected reference is Core-issued: original Core validates stageResult/ArtifactRef
shape and binds its producer before exposing prior artifacts. The new helper does
not invent another ref schema; it validates accepted JSON and own encoding before
stage field access, then requires complete returned-ref equality and byte proof.
The expected own tag alone selects portable bytes. Absent tag retains precisely
the original canonicalJson verifier; unknown/present-undefined tags reject.
Required response fields must be own properties. Getter/Proxy/exotic/undefined
admission precedes field reads; inherited optional encoding is never consulted.
A malformed direct-helper expected object missing Core-required fields is outside
this precondition, not an admitted production counterexample or a demonstrated
new bypass. No broad claim about arbitrary unchecked PluginInvocationContext is
made. No owning production defect found.

## Independent executed acceptance on fresh SDK + baseline + Operator

- Original fixture matrix: 16 real registered Core/preflight/Git/ArtifactStore/
  Prism cases across original/current, portable/legacy, fixed/mixed, en/sv.
  Repaired reads reach actual HTTP503 refusal; old portable mixed readers fail
  at their original digest gate. No fake successful service result.
- 24 actual requested/accepted/completed journal-prefix replay cases. Original
  prefix bytes and request identity retained. Requested effects complete;
  completed effects reuse receipts without journal appends. Accepted uncertainty
  is separately denied by the original Core safety gate and unavailable adapter
  receipt recovery. No arbitrary registry/package-pin bypass is claimed.
- 32 native en/sv/da/tr completed-journal consumers derive expected refs from
  actual lifecycle records. Portable passes; legacy follows its unchanged
  same-/cross-locale result, with original journal bytes unchanged.
- Eight actual ArtifactStore same-byte/latest-other-owner records are returned
  by original get_json and denied by full expected-ref binding.
- Five author adversarial tests pass. Independent additional real-receipt probes
  reject proxied response, nested value, artifact and nested producer with ZERO
  get/ownKeys/getPrototypeOf trap executions.
- Original Prism plugin live-function, real wait-store and archive-integrity
  programs, owning plugin build/typecheck and configured changed-source/test lint
  pass. Freshly integrated Prism baseline contracts original programs plus all
  five actual locale/CAS/tamper tests also pass. No skips.

Commands are the original authored matrix/value scripts, npm test/build for
@kubeclaw/plugin-prism-design, npm test for @kubeclaw/prism-contracts-v1, configured
ESLint, and docs/review/evidence/run13-prism-reader-independent-identity.mjs.
Raw complete matrix: run13-prism-reader-independent-matrix.txt (16/24/32/8 rows).
Other raw: run13-prism-reader-independent-gates.json and extra-final.json.
The first matrix passed but one tool-output chunk truncated; it is transparently
retained and the whole matrix rerun with complete capture, exit0. Initial lint
issues in the reviewer-only diagnostic were corrected without changing tested
assertions or product rules; final diagnostic and lint both exit0.

## Limits and next action

The source-preflight logical ID remains incompatible with a separate downstream
Prism-service ID grammar. HTTP503 explicitly refuses work; it establishes no
service/render/browser/operator approval. Durable effect replay is real, not
whole pipeline administrative package-upgrade authorization. Existing accepted
uncertainty remains visible. These are deliberate boundaries, not substitutes
for another finding's native gate.

Root may integrate this exact independently approved reader delta only after
fresh parent/ref reconciliation and its required root checks. If later cache/run
profile integration advances the head, preserve it and repeat affected readers.
No MAIN update, CI, deployment, production change or third-party message here.
