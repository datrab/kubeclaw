# Version defaults are generated from versions.json; run npm run versions:sync.
ARG OPS_NODE_BASE=node:24.21.0-trixie-slim@sha256:db3ae80f5d8df06e04dabdf7b44cbf008d32de168205fa0294444aabbc08c590

FROM ${OPS_NODE_BASE} AS tools
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
ARG TARGETARCH=amd64
ARG KUBECTL_VERSION=v1.34.11
ARG HELM_VERSION=v3.22.0
ARG GH_VERSION=2.100.0
ARG GH_SHA256_AMD64=e4d4bb4498e8d007abe545b6568926793ace1b6447da598294a610018cb164be
ARG GH_SHA256_ARM64=ea4e7a581a32ccad6cc7923cb1576ac5859ba4b9a16ab22eb8f8a96e78e2e961
ARG DEBIAN_SNAPSHOT=20260914T000000Z
ARG KUBECTL_SHA256_AMD64=8efbb9435132a190920eb65a47a8c1ecf755ad85ab57a600c9bedbab460bb7a8
ARG KUBECTL_SHA256_ARM64=5b045a4712674c88a56fd98eef4285689738b7fbe8735e1b9ee3509521af5cb4
ARG HELM_SHA256_AMD64=1e4ab49e429626cf6c6958d914248b78c9730803c2751b87627e171dc800e7bb
ARG HELM_SHA256_ARM64=f14e804dfee240f55525b667488fe9adca349e63e00c9af634c0beb1421ac310
RUN printf '%s\n' \
      'Types: deb' \
      "URIs: http://snapshot.debian.org/archive/debian/${DEBIAN_SNAPSHOT}" \
      'Suites: trixie trixie-updates' 'Components: main' \
      'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' '' \
      'Types: deb' \
      "URIs: http://snapshot.debian.org/archive/debian-security/${DEBIAN_SNAPSHOT}" \
      'Suites: trixie-security' 'Components: main' \
      'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' \
      > /etc/apt/sources.list.d/debian.sources \
    && rm -f /etc/apt/sources.list \
    && printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99snapshot \
    && apt-get -o Acquire::Retries=5 -o APT::Update::Error-Mode=any update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /downloads
RUN case "$TARGETARCH" in \
      amd64) kubectl_sha="$KUBECTL_SHA256_AMD64"; helm_sha="$HELM_SHA256_AMD64"; gh_sha="$GH_SHA256_AMD64" ;; \
      arm64) kubectl_sha="$KUBECTL_SHA256_ARM64"; helm_sha="$HELM_SHA256_ARM64"; gh_sha="$GH_SHA256_ARM64" ;; \
      *) exit 1 ;; esac \
    && curl -fsSLo kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl" \
    && printf '%s  kubectl\n' "$kubectl_sha" | sha256sum -c - \
    && curl -fsSLo helm.tar.gz "https://get.helm.sh/helm-${HELM_VERSION}-linux-${TARGETARCH}.tar.gz" \
    && printf '%s  helm.tar.gz\n' "$helm_sha" | sha256sum -c - \
    && tar -xzf helm.tar.gz && mv "linux-${TARGETARCH}/helm" helm \
    && curl -fsSLo gh.tar.gz "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${TARGETARCH}.tar.gz" \
    && printf '%s  gh.tar.gz\n' "$gh_sha" | sha256sum -c - \
    && tar -xzf gh.tar.gz && mv "gh_${GH_VERSION}_linux_${TARGETARCH}/bin/gh" gh \
    && chmod 0755 kubectl helm gh

FROM ${OPS_NODE_BASE}
COPY --from=tools /etc/apt/sources.list.d/debian.sources /etc/apt/sources.list.d/debian.sources
COPY --from=tools /etc/apt/apt.conf.d/99snapshot /etc/apt/apt.conf.d/99snapshot
RUN rm -f /etc/apt/sources.list \
    && apt-get -o Acquire::Retries=5 -o APT::Update::Error-Mode=any update \
    && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends \
      ca-certificates git openssh-client jq curl python3 tini ripgrep netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/codex
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force \
    && ln -s /opt/codex/node_modules/.bin/codex /usr/local/bin/codex \
    && codex --version && codex remote-control --help
COPY --from=tools /downloads/kubectl /downloads/helm /downloads/gh /usr/local/bin/
COPY supervisor.py config.toml shell.sh /opt/codex/
RUN mkdir -p /workspace /home/node/.codex && chown node:node /workspace /home/node/.codex
ENV HOME=/home/node
USER 1000:1000
WORKDIR /workspace
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python3", "/opt/codex/supervisor.py"]
