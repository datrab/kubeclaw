# Buster test judgment protocol

Owns the deterministic post-suite evidence envelope, task/attempt correlation,
strict PASS/FAIL verdict parser, contradiction checks, result reduction, and
immutable verdict evidence. It never accepts an agent-provided stage result.

The stage invokes `test.plan.execute` first and accepts only its
digest-bound receipt as objective evidence. It then invokes `runtime.dispatch`
for Buster's reasoning verdict. The suite worker, BuildKit, Kubernetes/browser
tools, cancellation, cleanup, and job receipts remain isolated in the Buster
runtime provider; the pipeline core sees only the two neutral capabilities.
