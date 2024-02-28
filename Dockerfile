FROM node:20.11.1-slim

WORKDIR /usr/src/app

COPY --chown=node:node . ./

RUN mkdir -p public/uploads && chown -R node:node . && npm ci --omit=dev

USER node

CMD ["node", "app.js"]

