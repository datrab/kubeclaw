# Version defaults are generated from versions.json; run npm run versions:sync.
ARG OPS_NODE_BASE=node:24.21.0-alpine3.24@sha256:be80f76cf40ec8e42b9bec49f60a55e0660f30af58d3e5a25530785b30ea67e2
ARG OPS_TOOLS_GO_BASE=golang:1.26.10-alpine3.24@sha256:9ce231b28998b32e116927c61aa5c406183061d4f3f2d61b292c88e7f6bdf7ca

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

# Rebuild the unchanged Helm release with the centrally patched Go toolchain.
FROM ${OPS_TOOLS_GO_BASE} AS helm-build
ARG TARGETARCH=amd64
ARG HELM_VERSION=v3.22.1
ARG HELM_SOURCE_SHA256=f0e596af707e2e5c0411d1dd314264450fd68fa484c87fb9fdf1c3beed4323b9
ENV GOTOOLCHAIN=local
WORKDIR /src
RUN apk add --no-cache make \
    && wget -O source.tar.gz "https://codeload.github.com/helm/helm/tar.gz/refs/tags/${HELM_VERSION}" \
    && printf '%s  source.tar.gz\n' "$HELM_SOURCE_SHA256" | sha256sum -c - \
    && tar -xzf source.tar.gz --strip-components=1 && rm source.tar.gz
RUN attempt=1; until GODEBUG=http2client=0 timeout 180 go mod download; do \
      if [ "$attempt" -ge 3 ]; then exit 1; fi; \
      sleep "$((attempt * 5))"; attempt="$((attempt + 1))"; \
    done
# Use upstream's version and Kubernetes default linker flags, without a .git checkout.
RUN GOPROXY=off CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} \
    make build GOFLAGS=-mod=readonly VERSION="${HELM_VERSION}" \
      GIT_TAG="${HELM_VERSION}" GIT_COMMIT= GIT_DIRTY=clean

FROM ${OPS_NODE_BASE}
ARG OPS_NPM_TAR_VERSION=7.5.21
ARG OPS_NPM_BRACE_VERSION=5.0.11
ARG OPS_NPM_IP_VERSION=10.3.1
ARG OPS_NPM_UNDICI_VERSION=6.28.1
ARG OPS_NPM_CACHE_SEMANTICS_VERSION=4.3.0
RUN apk upgrade --no-cache \
    && apk add --no-cache bash ca-certificates git openssh-client jq curl python3 tini ripgrep netcat-openbsd \
    && node -e 'const fs=require("fs"),p="/usr/local/lib/node_modules/npm/package.json",v=JSON.parse(fs.readFileSync(p));delete v.devDependencies;fs.writeFileSync(p,JSON.stringify(v));' \
    && npm install --prefix /usr/local/lib/node_modules/npm --omit=dev --ignore-scripts --no-audit --no-fund --save-exact \
      "tar@${OPS_NPM_TAR_VERSION}" "brace-expansion@${OPS_NPM_BRACE_VERSION}" "ip-address@${OPS_NPM_IP_VERSION}" \
      "undici@${OPS_NPM_UNDICI_VERSION}" "http-cache-semantics@${OPS_NPM_CACHE_SEMANTICS_VERSION}"
WORKDIR /opt/codex
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force \
    && ln -s /opt/codex/node_modules/.bin/codex /usr/local/bin/codex \
    && codex --version && codex remote-control --help
COPY --from=helm-build /src/bin/helm /usr/local/bin/helm
COPY --from=helm-build /src/LICENSE /usr/local/share/licenses/helm/LICENSE
COPY --from=kubectl-build /out/kubectl /usr/local/bin/kubectl
COPY --from=gh-build /out/gh /usr/local/bin/gh
COPY --from=gh-build /src/LICENSE /usr/local/share/licenses/gh/LICENSE
COPY kubectl-build/LICENSE /usr/local/share/licenses/kubectl/LICENSE
COPY supervisor.py policy-supervisor.py runtime_policy.py config.toml shell.sh /opt/codex/
RUN mkdir -p /workspace /home/node/.codex && chown node:node /workspace /home/node/.codex
ENV HOME=/home/node
USER 1000:1000
WORKDIR /workspace
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["python3", "/opt/codex/supervisor.py"]
