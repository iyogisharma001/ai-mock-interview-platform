FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 4000
# The server launches sandbox containers through the host's Docker socket (mounted by compose).
CMD ["node", "src/index.js"]
