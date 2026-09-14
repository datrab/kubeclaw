#!/usr/bin/env bash
set -euo pipefail

# Extract existing, digest-pinned upstream binaries; no runtime image rebuild.
destination="${RUNNER_TEMP:?}/reliability-services"
mkdir -p "$destination/bin"
qdrant_image="$(node -p 'require("./versions.json").infrastructure.qdrant')"
redis_image="$(node -p 'require("./versions.json").infrastructure.redis')"
containers=()
cleanup() {
  for container in "${containers[@]}"; do docker rm -f "$container" >/dev/null; done
}
trap cleanup EXIT
for image in "$qdrant_image" "$redis_image"; do
  [[ "$image" =~ @sha256:[a-f0-9]{64}$ ]] || { echo 'Digest-pinned service image required' >&2; exit 1; }
  docker pull "$image"
done
container="$(docker create "$qdrant_image")"; containers+=("$container")
docker cp "$container:/qdrant/qdrant" "$destination/bin/qdrant"
container="$(docker create "$redis_image")"; containers+=("$container")
docker cp "$container:/opt/bitnami" "$destination/bitnami"
# The selected Redis may target a newer glibc than ubuntu-latest. Use its own
# loader and libraries, without replacing any libraries on the CI host.
docker cp -L "$container:/lib64/ld-linux-x86-64.so.2" "$destination/redis-loader"
docker cp -L "$container:/usr/lib" "$destination/redis-system-libs"
for program in redis-server redis-cli redis-check-rdb redis-check-aof; do
  test -x "$destination/bitnami/redis/bin/$program"
  {
    printf '#!/usr/bin/env bash\n'
    printf 'exec %q --library-path %q %q "$@"\n' "$destination/redis-loader" \
      "$destination/redis-system-libs:$destination/bitnami/common/lib:$destination/bitnami/redis/lib" \
      "$destination/bitnami/redis/bin/$program"
  } > "$destination/bin/$program"
  chmod 0755 "$destination/bin/$program"
done
"$destination/bin/qdrant" --version
"$destination/bin/redis-server" --version
"$destination/bin/redis-cli" --version
{
  echo "ARCHVIEWER_TEST_NGINX=$(command -v nginx)"
  echo "REDIS_SOURCE_SERVER=$(command -v redis-server)"
  echo "REDIS_SERVER=$destination/bin/redis-server"
  echo "QDRANT_TEST_BINARY=$destination/bin/qdrant"
} >> "${GITHUB_ENV:?}"
