FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY bot.mjs ./
ENV NODE_ENV=production
USER node
CMD ["node", "bot.mjs"]
