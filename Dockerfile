FROM node:22-bookworm-slim
WORKDIR /app

COPY package.json ./

COPY bot.mjs storage-maintenance.mjs state-store.mjs market-structure.mjs chart-renderer.mjs dashboard-state.mjs episode-memory.mjs mechanism-transition-engine.mjs independent-witness-network.mjs institutional-kernel.mjs market-data-fabric.mjs deterministic-replay.mjs runtime-release-registry.mjs observability.mjs operational-readiness.mjs persistence-contracts.mjs persistence-smoke.mjs chaos-engineering.mjs shadow-oms.mjs autonomous-shadow-trader.mjs shadow-portfolio-ledger.mjs shadow-capital-academy.mjs shadow-training-supervisor.mjs strategy-evidence-engine.mjs shadow-trade-quality-learner.mjs mandatory-shadow-discovery.mjs trade-discovery-diagnostics.mjs shadow-coverage-curriculum.mjs learned-challenger-engine.mjs shadow-regime-brain.mjs adversarial-stress-lab.mjs shadow-strategy-league.mjs portfolio-brain.mjs multi-venue-shadow-sor.mjs venue-quality-memory.mjs execution-research-lab.mjs telegram-product-ui.mjs alert-engine.mjs evidence-history.mjs state-validity.mjs research-lifecycle.mjs market-data-provider.mjs telegram-command-router.mjs telegram-read-command-handlers.mjs telegram-mutation-command-handlers.mjs telegram-update-dispatcher.mjs telegram-ui-runtime.mjs ./

COPY research-data-plane.mjs research-data-plane-adapters.mjs research-feature-catalog.mjs research-source-contracts.mjs research-data-governance.mjs research-dependency-graph.mjs research-trace.mjs scientific-validity.mjs scientific-core.mjs institutional-admission.mjs institutional-forecast-issuance.mjs institutional-forecast-runtime.mjs institutional-audit-binding.mjs forecast-input-adapter.mjs forecast-science-adapter.mjs forecast-contract.mjs forecast-product.mjs forecast-candidate-lab.mjs forecast-learning-center.mjs forecast-hypothesis-generator.mjs forecast-shadow-competition.mjs forecast-shadow-evaluation-client.mjs forecast-shadow-evaluation-worker.mjs forecast-experiment-governor.mjs forecast-feature-research.mjs model-promotion-ladder.mjs model-candidate-registry.mjs model-release-binding.mjs model-governance-audit.mjs ./

COPY forecast-runtime ./forecast-runtime
COPY science-runtime ./science-runtime
COPY expansion-runtime ./expansion-runtime
COPY market-data-fabric.test.mjs autonomous-shadow-trader.test.mjs shadow-portfolio-ledger.test.mjs shadow-capital-academy.test.mjs shadow-training-supervisor.test.mjs strategy-evidence-engine.test.mjs shadow-trade-quality-learner.test.mjs mandatory-shadow-discovery.test.mjs trade-discovery-diagnostics.test.mjs forecast-history-cap.test.mjs shadow-coverage-curriculum.test.mjs forecast-revision-tracker-memory.test.mjs learned-challenger-engine.test.mjs shadow-regime-brain.test.mjs adversarial-stress-lab.test.mjs shadow-strategy-league.test.mjs shadow-oms.test.mjs portfolio-brain.test.mjs telegram-read-command-handlers.test.mjs telegram-update-dispatcher.test.mjs research-data-plane.test.mjs research-data-plane-adapters.test.mjs research-data-governance.test.mjs research-dependency-graph.test.mjs telegram-product-ui.test.mjs forecast-product.test.mjs telegram-ui-runtime.test.mjs institutional-forecast-runtime.test.mjs forecast-contract.test.mjs forecast-input-adapter.test.mjs forecast-learning-center.test.mjs scientific-validity.test.mjs forecast-candidate-lab.test.mjs forecast-hypothesis-generator.test.mjs forecast-shadow-competition.test.mjs forecast-shadow-evaluation-client.test.mjs forecast-experiment-governor.test.mjs forecast-feature-research.test.mjs expansion-runtime/derivatives-public-provider.test.mjs expansion-runtime/liquidation-public-stream.test.mjs expansion-runtime/onchain-research-provider.test.mjs expansion-runtime/wallet-cohort-public-provider.test.mjs expansion-runtime/verified-entity-registry.test.mjs expansion-runtime/entity-flow-engine.test.mjs ./

RUN npm run check
RUN npm run test:auto-shadow
RUN npm run test:portfolio
RUN npm run test:academy
RUN npm run test:training
RUN npm run test:league
RUN npm run test:discovery
RUN npm run test:learning-v2
RUN npm run test:learning-v3
RUN npm run test:learning-v4
RUN npm run test:coverage
RUN npm run test:stability
RUN npm run test:telegram-resilience
RUN npm run test:ui
RUN npm run test:intel
RUN npm run test:forecast-core
RUN npm run test:autolearn
RUN npm run test:shadow-worker
RUN npm run test:competition
RUN npm run test:feature-research
RUN npm run test:data-plane
RUN npm run test:data-lineage
RUN mkdir -p /data && chown -R node:node /data /app

ENV NODE_ENV=production
ENV TCX_STATE_FILE=/data/tcx-state.json
ENV TCX_EPISODE_FILE=/data/tcx-episodes.json
ENV TCX_EVIDENCE_HISTORY_FILE=/data/tcx-evidence-history.json
ENV TCX_AUDIT_LEDGER_FILE=/data/tcx-audit-ledger.jsonl
ENV TCX_MARKET_FABRIC_FILE=/data/tcx-market-events.jsonl
ENV TCX_RELEASE_REGISTRY_FILE=/data/tcx-release-registry.jsonl
ENV TCX_SHADOW_OMS_FILE=/data/tcx-shadow-oms.json
ENV TCX_SHADOW_PORTFOLIO_FILE=/data/tcx-shadow-portfolio.json
ENV TCX_STRATEGY_LEAGUE_FILE=/data/tcx-strategy-league.json
ENV TCX_VENUE_QUALITY_MEMORY_FILE=/data/tcx-venue-quality-memory.json
ENV TCX_FORECAST_RUNTIME_FILE=/data/tcx-forecast-runtime.json
ENV TCX_SHADOW_COMPETITION_FILE=/data/tcx-shadow-competition.json
ENV TCX_EXPERIMENT_GOVERNOR_FILE=/data/tcx-experiment-governor.json
ENV TCX_FEATURE_RESEARCH_FILE=/data/tcx-feature-research.json
ENV TCX_ENTITY_REGISTRY_FILE=/data/tcx-entity-registry.json
ENV TCX_ENTITY_FLOW_MEMORY_FILE=/data/tcx-entity-flow-memory.json
ENV TCX_RESEARCH_DATA_PLANE_FILE=/data/tcx-research-data-plane.jsonl
ENV TCX_RESEARCH_DATA_PLANE_MAX_MEMORY_RECORDS=8000
ENV TCX_RESEARCH_DATA_PLANE_WARN_BYTES=125829120
ENV TCX_RESEARCH_DATA_PLANE_HARD_BYTES=167772160
ENV TCX_RESEARCH_GOVERNANCE_FILE=/data/tcx-research-governance.json
ENV TCX_REPLICA_COUNT=1

USER node
CMD ["node", "bot.mjs"]
