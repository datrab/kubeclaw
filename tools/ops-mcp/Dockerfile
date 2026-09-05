FROM quay.io/cilium/cilium:v1.20.1@sha256:ae9ea21f7427fe24bc6ea7247eb552157a1b0a431744045d3f641545ca71d11b AS cilium-tools

FROM node:22.23.2-alpine3.24

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts \
    && npm cache clean --force

COPY src ./src
COPY --from=cilium-tools /usr/bin/hubble /usr/local/bin/hubble
RUN /usr/local/bin/hubble version >/dev/null

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    HUBBLE_BIN=/usr/local/bin/hubble \
    HUBBLE_SERVER=hubble-relay.cilium.svc.cluster.local:4245 \
    NODE_EXTRA_CA_CERTS=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt

USER node
EXPOSE 8080

CMD ["node", "src/server.mjs"]
