// Maintained editorial wording, separate from retained source facts and qualifications.
export const editorialOwners = Object.freeze({
  ed25519AcceptedForm:'A non-empty Node-readable Ed25519 public key. PEM text is a supported key encoding.',
  kubernetesHostDefault:'No repository default. This consumer passes through the Kubernetes service host value when present.',
  kubernetesPortDefault:'No repository default in this consumer. It passes through the Kubernetes service port value when present.',
  originInvalid:'The loader does not parse URL structure. It compares each retained entry with the request Origin header. A match requires the same string.',
  commandEmpty:'Each empty item remains an empty string. An empty executable name cannot start a process. The selected executable controls the meaning of an empty argument.',
  capabilityAccepted:'A Linux capability name supported by the container runtime, such as `NET_ADMIN`, or `ALL` for all capabilities.',
  quantityAccepted:'A non-negative Kubernetes resource quantity for the named resource. CPU uses CPU units. Memory and ephemeral storage use bytes, with Kubernetes quantity suffixes.',
});
