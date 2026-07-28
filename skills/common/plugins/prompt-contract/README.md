# Prompt Contract

`@kubeclaw/prompt-contract` is a dependency-only library. It has no runtime
registration, capabilities, configuration, effects, or lifecycle authority.

It provides a deterministic, size-bounded task envelope for agent-backed
plugins. Domain instructions and response semantics remain owned by the stage
package that uses them.

The library rejects values that JSON would otherwise silently erase or mutate,
including cycles, non-finite numbers, sparse arrays, class instances,
prototype-sensitive keys, and unsupported values.
