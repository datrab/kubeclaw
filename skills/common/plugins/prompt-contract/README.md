# Prompt Contract

`@kubeclaw/prompt-contract` is a dependency-only library. It has no runtime
registration, capabilities, configuration, effects, or lifecycle authority.

It provides a deterministic, size-bounded task envelope for agent-backed
plugins. Domain instructions and response semantics remain owned by the stage
package that uses them.

The library rejects values that JSON would otherwise silently erase or mutate,
including cycles, non-finite numbers, sparse arrays, class instances,
prototype-sensitive keys, and unsupported values.

At the reviewed repository baseline this library has no production consumer; it
remains an unregistered library. Inputs must contain only enumerable own string
data properties. Accessors, proxies, symbol or hidden properties and additional
array properties are rejected without executing accessors or proxy traps. The
same checks apply to the envelope input and guidance before copying or mapping.
Existing ordinary JSON envelope output and size/depth/entry limits are unchanged.
The byte limit is checked after serialization, so it is not a peak-memory bound
for an already allocated oversized string.
