# Agent observability bridge contract v1

This package is the neutral, versioned wire contract between the OpenClaw agent observer and pipeline ingestion. The observer produces these records; the pipeline validates and promotes them into the canonical telemetry contract under `contracts/telemetry/v1`.

The package contains no OpenClaw hooks, Redis client, pipeline lifecycle logic, or telemetry projections. Breaking wire changes require a new versioned contract directory.

Validation first checks the whole event iteratively, before recursive field
validation. The maximum JSON depth is 256 (event root at depth 0); the node
budget is 2,621,440 serialized value occurrences, derived from the existing
5 MiB absolute event limit and minimum array-element encoding. Shared acyclic
references count once per occurrence; cycles and enumerable accessors are
rejected. Excess complexity returns `ok: false`; the assert API preserves its
`AgentObservabilityContractError`. No content is truncated. Byte-size checking
remains the separate existing transport/`checkPayloadSize` responsibility.
The extension sync script copies this admission check with the contract source.
