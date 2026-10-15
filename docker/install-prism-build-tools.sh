#!/bin/sh
set -eu
: "${DEBIAN_SNAPSHOT:?pinned Debian snapshot required}"
printf '%s\n' \
  'Types: deb' \
  "URIs: http://snapshot.debian.org/archive/debian/${DEBIAN_SNAPSHOT}" \
  'Suites: bookworm bookworm-updates' \
  'Components: main' \
  'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' \
  '' 'Types: deb' \
  "URIs: http://snapshot.debian.org/archive/debian-security/${DEBIAN_SNAPSHOT}" \
  'Suites: bookworm-security' 'Components: main' \
  'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' \
  > /etc/apt/sources.list.d/debian.sources
printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99snapshot
apt-get update
apt-get install -y --no-install-recommends gcc libc6-dev
rm -rf /var/lib/apt/lists/*
