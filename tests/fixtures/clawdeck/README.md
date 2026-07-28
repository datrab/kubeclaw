# ClawDeck Pipeline Fixtures

`recorded-acp-v1/` is the immutable pipeline-owned ACP handoff bundle for
ClawDeck conformance tests.

- Source pipeline commit: `80b591d394a6cbcf4c6351f4b038186103fe9fb7`
- Bundle SHA-256: `ad6b7724922ba1ecd5fa9afc94565a81bd6cddde93705b57fd93fbcf4fa84d08`
- Hash algorithm: `sha256-path-content-v1`
- Recorded scenario: two overlapping ACP sessions
- ACP tool-call capability: unavailable (`ACP_TOOL_EVENTS_NOT_EXPOSED`)

Consumers must verify `bundle-export.json` before importing the bundle and
must reject any source commit or bundle hash mismatch.
