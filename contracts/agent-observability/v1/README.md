# Agent observability bridge contract v1

This package is the neutral, versioned wire contract between the OpenClaw agent observer and pipeline ingestion. The observer produces these records; the pipeline validates and promotes them into the canonical telemetry contract under `contracts/telemetry/v1`.

The package contains no OpenClaw hooks, Redis client, pipeline lifecycle logic, or telemetry projections. Breaking wire changes require a new versioned contract directory.
