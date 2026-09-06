FROM node:22.23.2-bookworm-slim AS tools
ARG TARGETARCH=amd64
ARG KUBECTL_VERSION=v1.34.1
ARG HELM_VERSION=v3.19.0
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /downloads
RUN curl -fsSLo kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl" \
    && curl -fsSLo kubectl.sha256 "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl.sha256" \
    && echo "$(cat kubectl.sha256)  kubectl" | sha256sum -c - \
    && curl -fsSLo helm.tar.gz "https://get.helm.sh/helm-${HELM_VERSION}-linux-${TARGETARCH}.tar.gz" \
    && curl -fsSLo helm.sha256 "https://get.helm.sh/helm-${HELM_VERSION}-linux-${TARGETARCH}.tar.gz.sha256sum" \
    && echo "$(cut -d ' ' -f1 helm.sha256)  helm.tar.gz" | sha256sum -c - \
    && tar -xzf helm.tar.gz && mv "linux-${TARGETARCH}/helm" helm && chmod 0755 kubectl helm

FROM node:22.23.2-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
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
