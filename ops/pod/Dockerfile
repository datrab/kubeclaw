# Version defaults are generated from versions.json; run npm run versions:sync.
ARG OPS_NODE_BASE=node:22.23.2-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5

FROM ${OPS_NODE_BASE} AS tools
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
ARG TARGETARCH=amd64
ARG KUBECTL_VERSION=v1.34.1
ARG HELM_VERSION=v3.19.0
ARG DEBIAN_SNAPSHOT=20260901T000000Z
ARG KUBECTL_SHA256_AMD64=7721f265e18709862655affba5343e85e1980639395d5754473dafaadcaa69e3
ARG KUBECTL_SHA256_ARM64=420e6110e3ba7ee5a3927b5af868d18df17aae36b720529ffa4e9e945aa95450
ARG HELM_SHA256_AMD64=a7f81ce08007091b86d8bd696eb4d86b8d0f2e1b9f6c714be62f82f96a594496
ARG HELM_SHA256_ARM64=440cf7add0aee27ebc93fada965523c1dc2e0ab340d4348da2215737fc0d76ad
RUN printf '%s\n' \
      'Types: deb' \
      "URIs: http://snapshot.debian.org/archive/debian/${DEBIAN_SNAPSHOT}" \
      'Suites: bookworm bookworm-updates' 'Components: main' \
      'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' '' \
      'Types: deb' \
      "URIs: http://snapshot.debian.org/archive/debian-security/${DEBIAN_SNAPSHOT}" \
      'Suites: bookworm-security' 'Components: main' \
      'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' \
      > /etc/apt/sources.list.d/debian.sources \
    && rm -f /etc/apt/sources.list \
    && printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99snapshot \
    && apt-get -o Acquire::Retries=5 -o APT::Update::Error-Mode=any update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /downloads
RUN case "$TARGETARCH" in \
      amd64) kubectl_sha="$KUBECTL_SHA256_AMD64"; helm_sha="$HELM_SHA256_AMD64" ;; \
      arm64) kubectl_sha="$KUBECTL_SHA256_ARM64"; helm_sha="$HELM_SHA256_ARM64" ;; \
      *) exit 1 ;; esac \
    && curl -fsSLo kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl" \
    && printf '%s  kubectl\n' "$kubectl_sha" | sha256sum -c - \
    && curl -fsSLo helm.tar.gz "https://get.helm.sh/helm-${HELM_VERSION}-linux-${TARGETARCH}.tar.gz" \
    && printf '%s  helm.tar.gz\n' "$helm_sha" | sha256sum -c - \
    && tar -xzf helm.tar.gz && mv "linux-${TARGETARCH}/helm" helm && chmod 0755 kubectl helm

FROM ${OPS_NODE_BASE}
COPY --from=tools /etc/apt/sources.list.d/debian.sources /etc/apt/sources.list.d/debian.sources
COPY --from=tools /etc/apt/apt.conf.d/99snapshot /etc/apt/apt.conf.d/99snapshot
RUN rm -f /etc/apt/sources.list \
    && apt-get -o Acquire::Retries=5 -o APT::Update::Error-Mode=any update && apt-get install -y --no-install-recommends \
      ca-certificates git openssh-client gh jq curl python3 tini ripgrep netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/codex
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force \
    && ln -s /opt/codex/node_modules/.bin/codex /usr/local/bin/codex \
    && codex --version && codex remote-control --help
COPY --from=tools /downloads/kubectl /downloads/helm /usr/local/bin/
COPY supervisor.py config.toml shell.sh /opt/codex/
RUN mkdir -p /workspace /home/node/.codex && chown node:node /workspace /home/node/.codex
ENV HOME=/home/node
USER 1000:1000
WORKDIR /workspace
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python3", "/opt/codex/supervisor.py"]
