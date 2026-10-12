# Docker context contract

Run from the repository root with Go 1.22 or newer:

```sh
go -C scripts/tests/docker-context test -count=1 -v ./...
```

This isolated test module uses the official Moby `ignorefile.ReadAll` parser and
`patternmatcher.MatchesOrParentMatches` matcher, pinned in go.mod/go.sum. It reads
the current root `.dockerignore` and every `docker/Dockerfile.*`, discovers
explicit local COPY sources, and requires them to exist and enter the context.
Current Dockerfiles use simple, unquoted, single-line COPY instructions. The test
fails on unsupported local COPY syntax so future syntax changes require an
explicit parser extension. Stage-to-stage COPY and whole-context `COPY .` do not
identify additional specific required local inputs.

Protected-path cases use hypothetical file names evaluated by the real matcher;
they never create secrets. Five separate mutations remove the new lock input
allow rules and require the corresponding COPY input to become unavailable.

This proves the ignore contract for explicit COPY inputs and the listed protected
paths. It does not build an image, inspect the complete Docker context archive,
validate Dockerfile execution, or prove browser/Trivy runtime functionality.
