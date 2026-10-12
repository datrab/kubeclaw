# Component bundle: independent generation probes

Three independently authored probes pass against the current loader:

1. Replacing the real `..data` symlink after the entry descriptor is read
   returns exactly the previously loaded complete old snapshot. A subsequent
   load sees the new generation and its changed Studio port.
2. Removing a component in the already selected physical generation rejects
   with `ENOENT` instead of borrowing a file from another generation.
3. Changing an already read component while later components are read rejects
   with `SWARM_CONFIG_CHANGED`.

[Probe source](../../evidence/config-component-generation-independent-20260921/generation.test.mjs),
[raw output](../../evidence/config-component-generation-independent-20260921/generation.txt)
and [result with source comparison](../../evidence/config-component-generation-independent-20260921/result.json)
retain the actual 3/3 run. The reviewer is different from the component-loader
author. A temporary synchronous `readFileSync` hook fixes the interleaving;
file contents, open descriptors, symlink replacement, deletion, mutations and
all loader validation are real. No production hook or simulated ConfigMap
object is introduced. These are local filesystem semantics, not a Kubernetes
deployment or an adversarial ABA proof.

The bounded before/after identities cover loader/schema/component files, the
probe and Node and show no drift. They are not the full transitive source/tool
binding required for final component acceptance. Original consumer regressions,
packaging, semantic mutants, final DOC and full independent review remain open.
