# Reference

Status: current
Audience: operator, developer

## Purpose

This section collects source-backed reference material for values, environment, config, artifacts, Redis, telemetry, process-boundary exits, Buster tasks, and verification commands.

## References

- [CLI](cli.md)
- [Helm values](helm-values.md)
- [Environment variables](environment-variables.md)
- [Secrets](secrets.md)
- [OpenClaw config](openclaw-config.md)
- [Swarm config](swarm-config.md)
- [Progress JSON](progress-json.md)
- [Status and artifacts](status-and-artifacts.md)
- [Redis streams](redis-streams.md)
- [Telemetry events](telemetry-events.md)
- [Observability sinks](observability-sinks.md)
- [Process exits](exit-codes.md)
- [Test suites](test-suites.md)
- [Linting rules](linting-rules.md)
- [Buster task config](buster-task-config.md)
- [Verification commands](verification-commands.md)

## Generated Reference Coverage

Exact CLI flags, Helm values, secrets, environment variables, and verification commands are generated from repository sources. Other reference pages are source-backed manual references whose automation opportunities are tracked separately from current behavior.

Current generated reference pages:

- `cli.md`
- `helm-values.md`
- `environment-variables.md`
- `secrets.md`
- `verification-commands.md`

Remaining generation opportunities:

- Partially generate `openclaw-config.md`, `swarm-config.md`, and `progress-json.md` from config files and runtime schema sources.
- Generate `status-and-artifacts.md`, `redis-streams.md`, `telemetry-events.md`, and `observability-sinks.md` from runtime constants, telemetry schema, tests, and plugin observer sources.
- Generate `exit-codes.md`, `test-suites.md`, `linting-rules.md`, and `buster-task-config.md` from pipeline constants, Buster suites, lint tooling, task validation, and verification tests.
