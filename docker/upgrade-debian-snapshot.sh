#!/bin/sh
set -eu
# Upgrade inherited Node-image OS packages against the same immutable snapshot
# as the other Debian runtimes. JavaScript package managers stay absent from Node
# services; this changes OS packages, not the application dependency graph.
snapshot="$1"
printf '%s\n' \
  'Types: deb' \
  "URIs: http://snapshot.debian.org/archive/debian/${snapshot}" \
  'Suites: bookworm bookworm-updates' \
  'Components: main' \
  'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' \
  '' \
  'Types: deb' \
  "URIs: http://snapshot.debian.org/archive/debian-security/${snapshot}" \
  'Suites: bookworm-security' \
  'Components: main' \
  'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' \
  > /etc/apt/sources.list.d/debian.sources
rm -f /etc/apt/sources.list
printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99snapshot
apt-get -o Acquire::Retries=5 -o APT::Update::Error-Mode=any update
# The slim Node base has no system CA bundle. Bootstrap it through the signed
# Debian archive (signature and package hashes stay mandatory), then use TLS.
apt-get -o Acquire::Retries=5 install -y --no-install-recommends ca-certificates
sed -i 's|http://snapshot.debian.org|https://snapshot.debian.org|g' /etc/apt/sources.list.d/debian.sources
apt-get -o Acquire::Retries=5 upgrade -y --no-install-recommends
rm -rf /var/lib/apt/lists/*
