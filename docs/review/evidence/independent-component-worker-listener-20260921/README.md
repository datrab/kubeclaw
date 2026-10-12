# Independent combined review harness preparation

Historical preparation: the initial plan was `ready: false`; the final combined freeze enabled execution. Run2 has now executed components (562/562), Buster (18/18), and release modules (31/32); its actual source/dependency/tool drift is empty. The original release-images fixture omitted the new canonical component schema. That failed run is retained; remaining checks and the corrected full release-images module require a separately bound continuation. No combined acceptance is claimed.
The two authors must first reconcile and freeze actual shared source, tests and
symlink targets. Root must then assign the exclusive runtime slot. The original
Buster admission implementation is prior authored baseline, not fresh review of
that old slice by its author.

The selected modules were assembled from inspected production consumers and
maintained commands, not by launching either author's runner. Release-image
originals are included because the changed shared release configuration helper
is part of their real consumer path. Duplicated modules between component and
listener lists run once. Before execution the final wildcard roster must match
this explicit roster, new cases must be added, and exact expected case inventory,
mutant commands and touched lint scope must be frozen.

Required binding:

1. Record all relevant source files, modes, symlink text and resolved target
   identities before and after. Preserve the dirty source patch and actual new
   source snapshots. Bind dependency files under node_modules, excluding unrelated
   cache artifacts, and bind the selected GNU tool root explicitly.
2. Record actual Node/Helm/Git/shell executables, tool versions, the proot/flock/tar
   paths and their supporting libraries. Node loader tracing records actual
   loaded files and detects a runtime dependency outside the planned closure.
3. Run under the established real GNU flock and tar bindings, one suite at a
   time, with the original module deadlines/assertions. Capture raw TAP, command,
   elapsed time and exit code; independently compare expected versus actual case
   names/counts, including skips/cancellations. Never accept wrapper exit alone.
4. Test copies must have independent regular file inodes and canonical paths for
   every bundle/schema/helper/template that a case mutates. A separate reviewer
   filesystem write guard rejects writes through an alias or hardlink to protected
   source inputs before they occur; pre/post manifests remain the independent
   protection against mutations outside that guard. This is test-fixture hygiene,
   not a security sandbox or production filesystem isolation claim. Direct FileHandle/fd APIs, external tools or deliberately changed child environments may bypass these diagnostic wrappers; full source binding and explicit fixture inode checks remain mandatory.
5. Preserve and classify all failures. Integration5–7 cannot supply final A2
   acceptance after the alias incident. Final originals run on the restored,
   combined port/component source. Earlier 537/18/7 counts are checkpoints only.

Required private controls include missing/schema-invalid fields, wrong valid
owner, moving generation, reintroduced legacy authors, three executor process
limits, omitted single-owner rollout hash, missing archive component, structural
Docker COPY loss, and restored Worker listener/probe/Service/Envoy/policy ports.
Counterprobes must reach their intended boundaries and retain real positives.
An existing maintained negative case may provide a suitable direct observation,
but source regex checks never replace actual HTTP/Helm/kernel/image effects.

The acceptance report will keep each criterion's implementation, local result,
prepared operational gate and actually executed live result separate. In
particular a real HTTP server with modeled native startup cannot complete WL3's
actual worker entrypoint criterion, and a Docker COPY source oracle is not a
successful image build.
