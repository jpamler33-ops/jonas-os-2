FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY bot.mjs state-store.mjs market-structure.mjs chart-renderer.mjs dashboard-state.mjs episode-memory.mjs mechanism-transition-engine.mjs independent-witness-network.mjs institutional-kernel.mjs market-data-fabric.mjs deterministic-replay.mjs runtime-release-registry.mjs observability.mjs chaos-engineering.mjs shadow-oms.mjs multi-venue-shadow-sor.mjs venue-quality-memory.mjs execution-research-lab.mjs telegram-product-ui.mjs alert-engine.mjs evidence-history.mjs state-validity.mjs research-lifecycle.mjs market-data-provider.mjs telegram-command-router.mjs ./
RUN mkdir -p /data && chown -R node:node /data /app
ENV NODE_ENV=production
ENV TCX_STATE_FILE=/data/tcx-state.json
ENV TCX_EPISODE_FILE=/data/tcx-episodes.json
ENV TCX_EVIDENCE_HISTORY_FILE=/data/tcx-evidence-history.json
ENV TCX_AUDIT_LEDGER_FILE=/data/tcx-audit-ledger.jsonl
ENV TCX_MARKET_FABRIC_FILE=/data/tcx-market-events.jsonl
ENV TCX_RELEASE_REGISTRY_FILE=/data/tcx-release-registry.jsonl
ENV TCX_SHADOW_OMS_FILE=/data/tcx-shadow-oms.json
ENV TCX_VENUE_QUALITY_MEMORY_FILE=/data/tcx-venue-quality-memory.json
USER node
CMD ["node", "bot.mjs"]
