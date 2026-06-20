FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache openssh-client bash curl gzip docker-cli

# Native module build deps (better-sqlite3, bcrypt) — python3/make/g++ for node-gyp
RUN apk add --no-cache --virtual .build-deps python3 make g++

COPY package*.json ./
RUN npm ci --only=production

# Drop build toolchain to keep the image small (native .node binaries are already compiled)
RUN apk del .build-deps

COPY . .

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "server.js"]
