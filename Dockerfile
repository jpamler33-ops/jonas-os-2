FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY bot.mjs state-store.mjs market-structure.mjs chart-renderer.mjs dashboard-state.mjs episode-memory.mjs mechanism-transition-engine.mjs ./
RUN mkdir -p /data && chown -R node:node /data /app
ENV NODE_ENV=production
ENV TCX_STATE_FILE=/data/tcx-state.json
ENV TCX_EPISODE_FILE=/data/tcx-episodes.json
USER node
CMD ["node", "bot.mjs"]
