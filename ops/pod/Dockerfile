# Version defaults are generated from versions.json; run npm run versions:sync.
ARG OPS_NODE_BASE=node:24.21.0-alpine3.24@sha256:be80f76cf40ec8e42b9bec49f60a55e0660f30af58d3e5a25530785b30ea67e2
ARG OPS_TOOLS_GO_BASE=golang:1.26.9-alpine3.24@sha256:cdfd4fe2da6b225d8b40c6b7a105736e548e83ff56d5d8f9394446eeb5eb84e0

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

FROM ${OPS_TOOLS_GO_BASE} AS helm-build
ARG TARGETARCH=amd64
ARG HELM_VERSION=v3.22.0
ARG OPS_HELM_SOURCE_SHA256=02a324971cb708b7d32ab751772fb765b81df6d3e93c0c3e845b3f5baaf80c65
ARG OPS_HELM_GIT_COMMIT=144ca65f8501953fa8b41cd1d37c7223051c85b7
ENV GOTOOLCHAIN=local
WORKDIR /src
RUN wget -O source.tar.gz "https://codeload.github.com/helm/helm/tar.gz/refs/tags/${HELM_VERSION}" \
    && printf '%s  source.tar.gz\n' "$OPS_HELM_SOURCE_SHA256" | sha256sum -c - \
    && tar -xzf source.tar.gz --strip-components=1 && rm source.tar.gz
RUN attempt=1; until GODEBUG=http2client=0 timeout 180 go mod download; do \
      if [ "$attempt" -ge 3 ]; then exit 1; fi; \
      sleep "$((attempt * 5))"; attempt="$((attempt + 1))"; \
    done
RUN k8s_version="$(GOPROXY=off go list -f '{{.Version}}' -m k8s.io/client-go)" \
    && k8s_minor="${k8s_version#v0.}" && k8s_minor="${k8s_minor%%.*}" \
    && GOPROXY=off CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} go build -mod=readonly -trimpath \
      -ldflags "-w -s -X helm.sh/helm/v3/internal/version.version=${HELM_VERSION} -X helm.sh/helm/v3/internal/version.gitCommit=${OPS_HELM_GIT_COMMIT} -X helm.sh/helm/v3/internal/version.gitTreeState=clean -X helm.sh/helm/v3/pkg/lint/rules.k8sVersionMajor=1 -X helm.sh/helm/v3/pkg/lint/rules.k8sVersionMinor=${k8s_minor} -X helm.sh/helm/v3/pkg/chartutil.k8sVersionMajor=1 -X helm.sh/helm/v3/pkg/chartutil.k8sVersionMinor=${k8s_minor}" \
      -o /out/helm ./cmd/helm

FROM ${OPS_NODE_BASE}
ARG OPS_NPM_TAR_VERSION=7.5.21
ARG OPS_NPM_BRACE_VERSION=5.0.12
ARG OPS_NPM_HTTP_CACHE_VERSION=4.3.0
ARG OPS_NPM_UNDICI_VERSION=6.28.1
ARG OPS_NPM_IP_VERSION=10.3.1
RUN apk upgrade --no-cache \
    && apk add --no-cache bash ca-certificates git openssh-client jq curl python3 tini ripgrep netcat-openbsd \
    && node -e 'const fs=require("fs"),p="/usr/local/lib/node_modules/npm/package.json",v=JSON.parse(fs.readFileSync(p));delete v.devDependencies;fs.writeFileSync(p,JSON.stringify(v));' \
    && npm install --prefix /usr/local/lib/node_modules/npm --omit=dev --ignore-scripts --no-audit --no-fund --save-exact \
      "tar@${OPS_NPM_TAR_VERSION}" "brace-expansion@${OPS_NPM_BRACE_VERSION}" \
      "http-cache-semantics@${OPS_NPM_HTTP_CACHE_VERSION}" "undici@${OPS_NPM_UNDICI_VERSION}" \
      "ip-address@${OPS_NPM_IP_VERSION}"
WORKDIR /opt/codex
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force \
    && ln -s /opt/codex/node_modules/.bin/codex /usr/local/bin/codex \
    && codex --version && codex remote-control --help
COPY --from=helm-build /out/helm /usr/local/bin/helm
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
