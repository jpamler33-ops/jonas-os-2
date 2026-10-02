FROM node:22-bookworm-slim
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Release-critical root modules copied by the wildcard below. Keep this list
# explicit so the institutional pre-merge packaging gate can verify coverage:
# operational-readiness.mjs persistence-contracts.mjs institutional-forecast-runtime.mjs
# forecast-input-adapter.mjs forecast-science-adapter.mjs forecast-contract.mjs
# forecast-product.mjs scientific-core.mjs institutional-admission.mjs
# institutional-forecast-issuance.mjs research-trace.mjs institutional-audit-binding.mjs
# forecast-candidate-lab.mjs model-promotion-ladder.mjs model-candidate-registry.mjs
# model-release-binding.mjs model-governance-audit.mjs
COPY *.mjs *.js ./
COPY forecast-runtime ./forecast-runtime
COPY science-runtime ./science-runtime
COPY expansion-runtime ./expansion-runtime

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
RUN npm run test:forecast-lightweight
RUN npm run test:autolearn
RUN npm run test:shadow-worker
RUN npm run test:competition
RUN npm run test:feature-research
RUN npm run test:data-plane
RUN npm run test:data-lineage
RUN npm run test:epistemic
RUN npm run test:promotion-review
RUN npm run test:historical-migration
RUN npm run test:historical-proposal-gate
RUN npm run test:claim-assumption
RUN npm run test:forecast-claim-sidecar
RUN npm run test:claim-assumption-evaluator
RUN npm run test:forecast-thesis-declarations
RUN npm run test:forecast-thesis-revisions
RUN npm run test:assumption-stability
RUN npm run test:biggj-living-research
RUN npm run test:biggj-validation
RUN npm run test:research-protocols
RUN npm run test:research-reviews
RUN npm run test:research-episodes
RUN npm run test:research-factory
RUN npm run test:research-leverage
RUN npm run test:experience
RUN npm run test:rulebook
RUN npm run test:market-science
RUN npm run test:channel-ops
RUN npm run test:autonomous-operator
RUN npm run test:governance-triage
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
ENV TCX_PARALLEL_STRATEGY_WORLDS_FILE=/data/tcx-parallel-strategy-worlds.json
ENV TCX_BIGGJ_DISCOVERY_LEDGER_FILE=/data/tcx-biggj-discovery-ledger.json
ENV TCX_INDICATOR_EVOLUTION_FILE=/data/tcx-indicator-evolution.json
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
ENV TCX_BIGGJ_EPISTEMIC_FILE=/data/tcx-biggj-epistemic-ledger.json
ENV TCX_AUTONOMOUS_RESEARCH_FACTORY_FILE=/data/tcx-autonomous-research-training-factory.json
ENV TCX_AUTONOMOUS_RESEARCH_FACTORY_REFRESH_MS=60000
ENV TCX_AUTONOMOUS_OPERATOR_FILE=/data/tcx-biggj-autonomous-operator.json
ENV TCX_AUTONOMOUS_OPERATOR_MS=60000
ENV TCX_REPLICA_COUNT=1

USER node
CMD ["node", "--expose-gc", "biggj-runtime-v2.mjs"]
