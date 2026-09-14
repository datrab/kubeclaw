# Version defaults are generated from versions.json; run npm run versions:sync.
ARG OPS_NODE_BASE=node:24.21.0-alpine3.24@sha256:be80f76cf40ec8e42b9bec49f60a55e0660f30af58d3e5a25530785b30ea67e2
ARG OPS_TOOLS_GO_BASE=golang:1.26.8-alpine3.24@sha256:ce864e7223ac17b1775e6fd0b4c0db580c2eb50e7953a427916379e4b92a1628

FROM ${OPS_TOOLS_GO_BASE} AS gh-build
ARG TARGETARCH=amd64
ARG GH_VERSION=2.100.0
ARG GH_SOURCE_SHA256=39d5123f08a553a6fa69e46de86c22d04d97a217e03d0e6584b66d0fea50f1fe
ENV GOTOOLCHAIN=local
WORKDIR /src
RUN wget -O source.tar.gz "https://codeload.github.com/cli/cli/tar.gz/refs/tags/v${GH_VERSION}" \
    && printf '%s  source.tar.gz\n' "$GH_SOURCE_SHA256" | sha256sum -c - \
    && tar -xzf source.tar.gz --strip-components=1 && rm source.tar.gz
COPY gh-build/go.mod gh-build/go.sum ./
# Retry bounded module transfers over HTTP/1.1 after observed proxy HTTP/2 stream failures.
RUN attempt=1; until GODEBUG=http2client=0 timeout 180 go mod download; do \
      if [ "$attempt" -ge 3 ]; then exit 1; fi; \
      sleep "$((attempt * 5))"; attempt="$((attempt + 1))"; \
    done
RUN GOPROXY=off CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} go build -mod=readonly -trimpath \
    -ldflags "-X github.com/cli/cli/v2/internal/build.Version=${GH_VERSION}" -o /out/gh ./cmd/gh

FROM ${OPS_TOOLS_GO_BASE} AS kubectl-build
ARG TARGETARCH=amd64
ARG KUBECTL_VERSION=v1.34.11
ENV GOTOOLCHAIN=local
WORKDIR /src
COPY kubectl-build/ ./
# Retry bounded module transfers over HTTP/1.1 after observed proxy HTTP/2 stream failures.
RUN attempt=1; until GODEBUG=http2client=0 timeout 180 go mod download all; do \
      if [ "$attempt" -ge 3 ]; then exit 1; fi; \
      sleep "$((attempt * 5))"; attempt="$((attempt + 1))"; \
    done
RUN GOPROXY=off sh verify-version.sh "${KUBECTL_VERSION}"
RUN GOPROXY=off CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} go build -mod=readonly -trimpath \
    -ldflags "-X k8s.io/client-go/pkg/version.gitVersion=${KUBECTL_VERSION} -X k8s.io/component-base/version.gitVersion=${KUBECTL_VERSION}" \
    -o /out/kubectl .

FROM ${OPS_NODE_BASE} AS tools
ARG TARGETARCH=amd64
ARG HELM_VERSION=v3.22.0
ARG HELM_SHA256_AMD64=1e4ab49e429626cf6c6958d914248b78c9730803c2751b87627e171dc800e7bb
ARG HELM_SHA256_ARM64=f14e804dfee240f55525b667488fe9adca349e63e00c9af634c0beb1421ac310
RUN apk add --no-cache curl
WORKDIR /downloads
RUN case "$TARGETARCH" in \
      amd64) helm_sha="$HELM_SHA256_AMD64" ;; \
      arm64) helm_sha="$HELM_SHA256_ARM64" ;; \
      *) exit 1 ;; esac \
    && curl -fsSLo helm.tar.gz "https://get.helm.sh/helm-${HELM_VERSION}-linux-${TARGETARCH}.tar.gz" \
    && printf '%s  helm.tar.gz\n' "$helm_sha" | sha256sum -c - \
    && tar -xzf helm.tar.gz && mv "linux-${TARGETARCH}/helm" helm && chmod 0755 helm

FROM ${OPS_NODE_BASE}
ARG OPS_NPM_TAR_VERSION=7.5.21
ARG OPS_NPM_BRACE_VERSION=5.0.9
ARG OPS_NPM_IP_VERSION=10.3.1
RUN apk upgrade --no-cache \
    && apk add --no-cache bash ca-certificates git openssh-client jq curl python3 tini ripgrep netcat-openbsd \
    && node -e 'const fs=require("fs"),p="/usr/local/lib/node_modules/npm/package.json",v=JSON.parse(fs.readFileSync(p));delete v.devDependencies;fs.writeFileSync(p,JSON.stringify(v));' \
    && npm install --prefix /usr/local/lib/node_modules/npm --omit=dev --ignore-scripts --no-audit --no-fund --save-exact \
      "tar@${OPS_NPM_TAR_VERSION}" "brace-expansion@${OPS_NPM_BRACE_VERSION}" "ip-address@${OPS_NPM_IP_VERSION}"
WORKDIR /opt/codex
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force \
    && ln -s /opt/codex/node_modules/.bin/codex /usr/local/bin/codex \
    && codex --version && codex remote-control --help
COPY --from=tools /downloads/helm /usr/local/bin/helm
COPY --from=kubectl-build /out/kubectl /usr/local/bin/kubectl
COPY --from=gh-build /out/gh /usr/local/bin/gh
COPY --from=gh-build /src/LICENSE /usr/local/share/licenses/gh/LICENSE
COPY kubectl-build/LICENSE /usr/local/share/licenses/kubectl/LICENSE
COPY supervisor.py config.toml shell.sh /opt/codex/
RUN mkdir -p /workspace /home/node/.codex && chown node:node /workspace /home/node/.codex
ENV HOME=/home/node
USER 1000:1000
WORKDIR /workspace
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["python3", "/opt/codex/supervisor.py"]
