#!/usr/bin/env bash
set -euo pipefail

# CI host checks shared by PR images and immutable published candidates.
role="${1:?role required}"
image="${2:?image reference required}"
case "$role" in
  nova|prism-agent|buster-gateway)
    version="$(node -p 'require("./versions.json").openclaw.version')"
    logs="$(mktemp -d)"
    containers=()
    pids=()
    cleanup() {
      for container in "${containers[@]}"; do docker rm -f "$container" >/dev/null 2>&1 || true; done
      rm -rf "$logs"
    }
    trap cleanup EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    # Each proof has its own writable container layer. Plugin installation and
    # tooling/runtime checks share no state, but every result remains required.
    for mode in plugins tools runtime; do
      container="kubeclaw-proof-${role}-$$-${mode}"
      containers+=("$container")
      (
        start=$SECONDS
        user=()
        if [[ "$mode" != runtime ]]; then user=(--user 0); fi
        status=0
        docker run --rm --pull never --name "$container" --network none "${user[@]}" --entrypoint bash \
          -v "$PWD/scripts/check-role-image.sh:/check-role-image.sh:ro" \
          "$image" /check-role-image.sh "$role" "$version" "$mode" >"$logs/$mode.log" 2>&1 || status=$?
        printf 'IMAGE_PROOF role=%s mode=%s seconds=%s status=%s\n' "$role" "$mode" "$((SECONDS-start))" "$status" >>"$logs/$mode.log"
        exit "$status"
      ) &
      pids+=("$!")
    done
    status=0
    for pid in "${pids[@]}"; do if ! wait "$pid"; then status=1; fi; done
    for mode in plugins tools runtime; do
      printf '::group::%s %s proof\n' "$role" "$mode"
      cat "$logs/$mode.log"
      printf '::endgroup::\n'
    done
    if (( status != 0 )); then exit "$status"; fi
    ;;
  buster-runtime)
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
  namespace-controller|archviewer|prism-control|prism-studio|prism-worker|prism-ingestion)
    # These Dockerfiles execute their acceptance gates during the build.
    docker image inspect "$image" >/dev/null
    ;;
  *) echo "Unknown runtime role: $role" >&2; exit 2 ;;
esac
