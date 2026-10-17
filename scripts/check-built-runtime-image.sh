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
    # Actual installed role readback and parent/child selection, before native tools.
    docker run --rm --network none --entrypoint sh \
      -v "$PWD/tests/verification/deployment/buster-swarm-image.mjs:/buster-image-proof.mjs:ro" \
      "$image" -c 'mkdir -p /run/pipeline-delivery; cp -a /opt/buster-image-tools/baked-delivery/. /run/pipeline-delivery/; exec node /buster-image-proof.mjs'
    # Exercise ownership handoff with exactly the restricted supervisor caps.
    docker run --rm --network none --cap-drop ALL \
      --cap-add CHOWN --cap-add SETUID --cap-add SETGID --cap-add SETPCAP \
      --entrypoint node \
      -v "$PWD/tests/verification/deployment/buster-cgroup-ownership.mjs:/cgroup-proof.mjs:ro" \
      "$image" /cgroup-proof.mjs
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
  prism-worker|prism-control|prism-studio|prism-ingestion)
    # Verify the installed root-owned package, image generation and this exact
    # caller's receipt as the real non-root runtime user. No source-tree fallback.
    docker run --rm --network none --entrypoint node \
      -v "$PWD/tests/verification/deployment/prism-swarm-image.mjs:/swarm-proof.mjs:ro" \
      "$image" /swarm-proof.mjs "$role"
    if [[ "$role" == prism-studio ]]; then
      docker run --rm --network none --entrypoint node \
        -e PRISM_STUDIO_IMAGE_PROOF=/opt/prism-studio-proof \
        -v "$PWD/skills/prism/tests/studio-service.test.mts:/opt/prism-studio-tests/studio-service.test.mts:ro" \
        -v "$PWD/skills/prism/tests/studio-canonical-image.mts:/opt/prism-studio-tests/studio-canonical-image.mts:ro" \
        -v "$PWD/skills/prism/tests/fixtures/studio-service.mts:/opt/prism-studio-tests/fixtures/studio-service.mts:ro" \
        "$image" --test --test-concurrency=1 /opt/prism-studio-tests/studio-service.test.mts /opt/prism-studio-tests/studio-canonical-image.mts
    fi
    ;;
  namespace-controller|archviewer)
    # These Dockerfiles execute their acceptance gates during the build.
    docker image inspect "$image" >/dev/null
    ;;
  *) echo "Unknown runtime role: $role" >&2; exit 2 ;;
esac
