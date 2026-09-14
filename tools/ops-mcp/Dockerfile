# Version defaults are generated from versions.json; run npm run versions:sync.
ARG OPS_MCP_NODE_BASE=node:24.21.0-alpine3.24@sha256:be80f76cf40ec8e42b9bec49f60a55e0660f30af58d3e5a25530785b30ea67e2

ARG OPS_TOOLS_GO_BASE=golang:1.26.8-alpine3.24@sha256:ce864e7223ac17b1775e6fd0b4c0db580c2eb50e7953a427916379e4b92a1628

FROM ${OPS_TOOLS_GO_BASE} AS hubble-build
ARG TARGETARCH=amd64
ENV GOTOOLCHAIN=local
WORKDIR /src
# Keep Cilium 1.20.1's CLI, rebuilding with patched Go/gRPC/text dependencies.
COPY hubble/go.mod hubble/go.sum ./
RUN go mod download
COPY hubble/main.go hubble/LICENSE ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} go build -mod=readonly -trimpath -o /out/hubble .

FROM ${OPS_MCP_NODE_BASE}

WORKDIR /app
RUN apk upgrade --no-cache

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules /opt/yarn-* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg

COPY src ./src
COPY --from=hubble-build /out/hubble /usr/local/bin/hubble
COPY hubble/LICENSE /usr/local/share/licenses/hubble/LICENSE
RUN node --check src/server.mjs \
    && /usr/local/bin/hubble version >/dev/null

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    HUBBLE_BIN=/usr/local/bin/hubble \
    HUBBLE_SERVER=hubble-relay.cilium.svc.cluster.local:4245 \
    NODE_EXTRA_CA_CERTS=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt

USER 1000:1000
EXPOSE 8080

CMD ["node", "src/server.mjs"]
