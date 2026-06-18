FROM docker.io/library/node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY --chown=node:node package.json ./

COPY --chown=node:node server.js ./server.js
COPY --chown=node:node src ./src

EXPOSE 3000

USER node

CMD ["npm", "start"]
