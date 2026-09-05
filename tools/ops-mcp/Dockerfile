FROM node:22.23.2-alpine3.24

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

USER node
EXPOSE 8080

CMD ["node", "src/server.mjs"]
