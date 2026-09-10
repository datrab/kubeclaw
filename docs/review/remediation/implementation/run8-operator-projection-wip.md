# Operator request projection: incomplete source checkpoint

INCOMPLETE / NOT APPROVED / DO NOT INTEGRATE. Finding PCR-OBS-002 remains open.
Author source freeze `e2e5199db687bf912b7436cda087ad0e60db0a5d` extends the
run7 design/prerequisite on fresh remote a43aa256. Root authorized this bounded
original consumer implementation after independent design review ea8ba7.

Implemented so far: original RecordStore transition supplies a cloned actual
locked record view to its synchronous authorization callback; original operator
delivery consumers understand a versioned JSON-v1 duplicate-payload projection,
preserve original candidate digest semantics and validate retained exact receipt.
Projected failDelivery fallback without transport payload validates request.payload
through the owning original parser/codec. Legacy full-record behavior and v1
handoff refusal are unchanged. Canonical lint and shared/Nova types passed.
Original genuine Core prerequisite still passes (one POST, wait then approved).

NOT IMPLEMENTED OR PROVED: final original Core/wait causal operator authority,
manual command, real projection acceptance, stale complete/fail interleavings,
separate-process fences/kill cleanup, tamper matrix, net-byte quota release.
Consumer source is checkpointed early for independent review; no authorization
to integrate this incomplete slice is implied. Root and reviewer have exact SHA.

Pre-freeze lint complexity errors were corrected by focused original helper
extraction, no policy changes. Invoking original plugin live-function.test.ts
from repository root failed because its documented path resolution requires
plugin cwd; the original `npm test --prefix skills/common/plugins/operator-messaging`
invocation is the proper regression, not a workaround or source change.

Next action: complete original Core/wait causal selection and manual atomic
retirement path, then genuine fixture-based positives, negatives and races;
repeat original Core fixture after upcoming SDK changes before independent
approval. No record closure, deployment or CI run in this checkpoint.
