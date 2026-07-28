# Redis Transport

Replaceable Redis Streams providers for `transport.publish` and
`telemetry.emit`. The package owns Redis protocol, authentication, stream
trimming, atomic idempotency, bounded network I/O, cancellation, and shutdown.
Domain plugins only see capabilities and never import a Redis client.
