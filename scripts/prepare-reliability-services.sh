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
for program in redis-server redis-cli; do
  {
    printf '#!/usr/bin/env bash\n'
    printf 'export LD_LIBRARY_PATH=%q\n' "$destination/bitnami/common/lib:$destination/bitnami/redis/lib"
    printf 'exec %q "$@"\n' "$destination/bitnami/redis/bin/$program"
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
