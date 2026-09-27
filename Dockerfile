FROM node:22-bookworm-slim
WORKDIR /app

COPY package.json ./

COPY bot.mjs state-store.mjs market-structure.mjs chart-renderer.mjs dashboard-state.mjs episode-memory.mjs mechanism-transition-engine.mjs independent-witness-network.mjs institutional-kernel.mjs market-data-fabric.mjs deterministic-replay.mjs runtime-release-registry.mjs observability.mjs operational-readiness.mjs persistence-contracts.mjs chaos-engineering.mjs shadow-oms.mjs portfolio-brain.mjs multi-venue-shadow-sor.mjs venue-quality-memory.mjs execution-research-lab.mjs telegram-product-ui.mjs alert-engine.mjs evidence-history.mjs state-validity.mjs research-lifecycle.mjs market-data-provider.mjs telegram-command-router.mjs telegram-read-command-handlers.mjs telegram-mutation-command-handlers.mjs telegram-ui-runtime.mjs ./

COPY research-trace.mjs scientific-validity.mjs scientific-core.mjs institutional-admission.mjs institutional-forecast-issuance.mjs institutional-forecast-runtime.mjs institutional-audit-binding.mjs forecast-input-adapter.mjs forecast-science-adapter.mjs forecast-contract.mjs forecast-product.mjs forecast-candidate-lab.mjs model-promotion-ladder.mjs model-candidate-registry.mjs model-release-binding.mjs model-governance-audit.mjs ./

COPY forecast-runtime ./forecast-runtime
COPY science-runtime ./science-runtime
COPY expansion-runtime ./expansion-runtime
COPY telegram-product-ui.test.mjs forecast-product.test.mjs telegram-ui-runtime.test.mjs ./

RUN npm run check
RUN npm run test:ui
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
ENV TCX_FORECAST_RUNTIME_FILE=/data/tcx-forecast-runtime.json
ENV TCX_REPLICA_COUNT=1

USER node
CMD ["node", "bot.mjs"]
