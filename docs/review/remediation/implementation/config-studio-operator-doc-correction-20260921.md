# Studio operator-document correction

During subsequent CONFIG work, the central operator guide still instructed
operators to retain Studio's `PORT` authority, and had no Studio settings section.
That contradicted the implemented role loader. The discovery inventory also
still said 24 migrated Prism fields and Studio review pending. The earlier
source/host review does not make those stale operator statements correct.

The operator guide now documents all three actual `operator.prism.studio` fields,
authored values and schema bounds, startup snapshot behavior, rejected former
environment/Helm keys, the chart's restricted Control Service origins, stable
Service ports, external secret and installation asset inputs, and outstanding
image/deployment gates. The proxy timer starts after the incoming request body
has been read; it covers the upstream request and streamed response, not the
incoming body or completion of a Control job. Configuration ownership and the
inventory now describe the same current slice: 27 Prism settings, with remaining
Buster/Nova/platform/host migration still open.

Checks were read-only comparisons against the maintained Studio role loader,
proxy, shared schema, canonical author JSON, Helm helper/Service/workload/policy
templates and image definition. Relative links in the three edited documents
resolve to existing repository targets, and scoped `git diff --check` passes.
This documentation correction introduces no behavior change or new image/test
result. The [fresh independent document review](independent-studio-doc-correction-20260921.md)
is accepted, including the corrected three-role image-gate description. Its source
binding precedes subsequent Buster admission changes; full CONFIG and F-DOC remain open.
