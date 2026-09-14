#!/usr/bin/env bash
set -euo pipefail

# CI host checks shared by PR images and immutable published candidates.
role="${1:?role required}"
image="${2:?image reference required}"
case "$role" in
  nova|prism-agent|buster-gateway)
    version="$(node -p 'require("./versions.json").openclaw.version')"
    docker run --rm --network none --user 0 --entrypoint bash \
      -v "$PWD/scripts/check-role-image.sh:/check-role-image.sh:ro" \
      "$image" /check-role-image.sh "$role" "$version"
    docker run --rm --network none --entrypoint bash \
      -v "$PWD/scripts/check-role-image.sh:/check-role-image.sh:ro" \
      "$image" /check-role-image.sh "$role" "$version" runtime
    ;;
  buster-runtime)
    # Nested rootless BuildKit runs only in a disposable CI proof container.
    sudo tee /etc/apparmor.d/kubeclaw-ci-build-proof >/dev/null <<'PROFILE'
abi <abi/4.0>,
include <tunables/global>
profile kubeclaw-ci-build-proof flags=(unconfined) {
  userns,
}
PROFILE
    sudo apparmor_parser -r /etc/apparmor.d/kubeclaw-ci-build-proof
    registry="$(node -p 'require("./versions.json").automation.testRegistry')"
    trap 'docker logs proof-registry; docker rm -f proof-registry' EXIT
    docker run -d --name proof-registry -p 127.0.0.1:5000:5000 "$registry"
    docker run --rm --privileged --security-opt apparmor=kubeclaw-ci-build-proof \
      --network host --entrypoint bash \
      -v "$PWD/tests/verification/deployment/check-buster-build.sh:/proof.sh:ro" \
      "$image" /proof.sh
    ;;
  namespace-controller|archviewer|prism-control|prism-studio|prism-worker|prism-ingestion)
    # These Dockerfiles execute their acceptance gates during the build.
    docker image inspect "$image" >/dev/null
    ;;
  *) echo "Unknown runtime role: $role" >&2; exit 2 ;;
esac
