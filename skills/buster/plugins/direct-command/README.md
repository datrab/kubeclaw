# Direct Command Test Provider

This provider runs one declared test program without a shell. It is the generic
unit-test provider for Phase 8.

The project gives an operator catalog name, an argument array, and an optional
project subdirectory. Buster maps the catalog name to one approved executable.
The child process receives only the declared environment plus `CI=true`.

Use `junit-required` when the tool can create JUnit XML. Use `exit-code` only
when the tool cannot create a structured report. JUnit mode fails closed when a
declared report is missing, unsafe, malformed, oversized, or contains no cases.

Reports and optional LCOV files use exact paths relative to the configured
working directory. The provider copies them into the attempt evidence area.
It does not use wildcard paths, fetch test code, or interpret shell syntax.

See `docs/site/reference/buster-suites.md` for complete fields,
examples, result rules, trade-offs, and operator requirements.
