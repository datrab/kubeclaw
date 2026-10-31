#!/bin/sh
set -eu
snapshot="$1"
printf '%s\n' \
  'Types: deb' \
  "URIs: https://snapshot.debian.org/archive/debian/$snapshot" \
  'Suites: bookworm bookworm-updates' \
  'Components: main' \
  'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' \
  '' \
  'Types: deb' \
  "URIs: https://snapshot.debian.org/archive/debian-security/$snapshot" \
  'Suites: bookworm-security' \
  'Components: main' \
  'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' \
  > /etc/apt/sources.list.d/debian.sources
rm -f /etc/apt/sources.list
printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99snapshot
apt-get -o Acquire::Retries=5 -o APT::Update::Error-Mode=any update
apt-get -o Acquire::Retries=5 install -y --no-install-recommends libseccomp-dev pkg-config
rm -rf /var/lib/apt/lists/*
