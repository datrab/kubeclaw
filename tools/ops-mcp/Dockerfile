# Version defaults are generated from versions.json; run npm run versions:sync.
ARG OPS_MCP_NODE_BASE=node:22.23.2-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32

FROM ${OPS_MCP_NODE_BASE}

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

COPY src ./src
RUN node --check src/server.mjs

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    NODE_EXTRA_CA_CERTS=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt

USER 1000:1000
EXPOSE 8080

CMD ["node", "src/server.mjs"]

