# Container build provider

`kubeclaw.container-build@1` builds one container image. It pushes the image to
the operator-owned local registry and returns a digest reference. It does not
deploy the image, use Kubernetes, open a port, or check application health.

Projects select one build definition: a repository Dockerfile or the immutable
`node-static@1` template. The project can select a platform, target, and bounded
non-secret build arguments. The Buster operator owns the BuildKit endpoint,
registry endpoint, repository prefix, and registry credentials.

The provider passes only when Buster reads the pushed registry manifest and
proves that its SHA-256 digest equals the digest returned by BuildKit.
