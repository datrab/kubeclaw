FROM docker.io/library/node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY --chown=node:node package.json server.js ./
COPY --chown=node:node src ./src

USER node

EXPOSE 3000

CMD ["npm", "start"]
