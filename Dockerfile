FROM node:22-bookworm-slim
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY bot.mjs storage-maintenance.mjs opportunity-allocator.mjs strategy-edge-decay.mjs evidence-promotion-gate.mjs shadow-leverage-risk.mjs portfolio-risk-brain.mjs pit-correlation-engine.mjs leverage-counterfactual-lab.mjs tcx-proof-system.mjs tail-risk-bootstrap.mjs independent-proof-auditor.mjs rolling-walk-forward.mjs shadow-policy-freeze.mjs frozen-policy-oos-accumulator.mjs trade-lifecycle-v2.mjs setup-performance-memory.mjs exit-learning-v2.mjs state-store.mjs market-structure.mjs chart-renderer.mjs biggj-visual-intelligence.mjs chart-intelligence.mjs market-xray-view.mjs liquidation-confluence-view.mjs structure-event-radar.mjs forecast-chart-overlay.mjs flow-radar-view.mjs forecast-accuracy-view.mjs superchart-intel.mjs intelligence-terminal.mjs cognitive-core.mjs scientific-brain.mjs world-model-foundation.mjs final-foundation-pack.mjs mission-control.mjs dashboard-state.mjs episode-memory.mjs mechanism-transition-engine.mjs independent-witness-network.mjs institutional-kernel.mjs audit-ledger-rotation.mjs market-data-fabric.mjs market-fabric-rotation.mjs market-fabric-archive.mjs market-fabric-cold-store.mjs market-fabric-cold-tier.mjs market-fabric-cold-replay.mjs deterministic-replay.mjs runtime-release-registry.mjs observability.mjs operational-readiness.mjs persistence-contracts.mjs persistence-smoke.mjs chaos-engineering.mjs shadow-oms.mjs streaming-json-persistence.mjs autonomous-shadow-trader.mjs biggj-trading-policy.mjs event-shadow-trade-gate.mjs shadow-portfolio-ledger.mjs shadow-capital-academy.mjs biggj-trading-academy.mjs shadow-training-supervisor.mjs strategy-evidence-engine.mjs shadow-trade-quality-learner.mjs mandatory-shadow-discovery.mjs trade-discovery-diagnostics.mjs shadow-coverage-curriculum.mjs learned-challenger-engine.mjs shadow-regime-brain.mjs adversarial-stress-lab.mjs shadow-strategy-league.mjs portfolio-brain.mjs multi-venue-shadow-sor.mjs venue-quality-memory.mjs execution-research-lab.mjs telegram-product-ui.mjs telegram-chat-lifecycle.mjs alert-engine.mjs evidence-history.mjs state-validity.mjs research-lifecycle.mjs market-data-provider.mjs telegram-command-router.mjs telegram-read-command-handlers.mjs telegram-mutation-command-handlers.mjs telegram-update-dispatcher.mjs telegram-ui-runtime.mjs discord-telegram-bridge.mjs discord-component-ids.mjs discord-serial-dedupe-queue.mjs biggj-discord-observability.mjs autonomous-research-training-factory.mjs biggj-research-leverage-engine.mjs biggj-experience-center.mjs biggj-mobile-webapp.mjs biggj-public-news-provider.mjs official-intel-sources.mjs biggj-channel-operations.mjs biggj-german-translation.mjs biggj-rulebook.mjs biggj-autonomous-operator.mjs biggj-governance-triage.mjs ./

COPY research-data-plane.mjs research-data-plane-adapters.mjs research-feature-catalog.mjs research-source-contracts.mjs research-data-governance.mjs research-dependency-graph.mjs research-coverage-doctor.mjs research-trace.mjs scientific-validity.mjs scientific-core.mjs institutional-admission.mjs institutional-forecast-issuance.mjs institutional-forecast-runtime.mjs forecast-cold-archive.mjs institutional-audit-binding.mjs forecast-input-adapter.mjs forecast-science-adapter.mjs forecast-contract.mjs forecast-product.mjs forecast-candidate-lab.mjs forecast-learning-center.mjs forecast-hypothesis-generator.mjs forecast-shadow-competition.mjs forecast-shadow-evaluation-client.mjs forecast-shadow-evaluation-worker.mjs forecast-experiment-governor.mjs forecast-feature-research.mjs research-intelligence-features.mjs research-provider-fanout.mjs model-promotion-ladder.mjs model-candidate-registry.mjs model-promotion-review-service.mjs model-release-binding.mjs model-governance-audit.mjs tcx-research-os-contract.mjs biggj-capability-map.mjs biggj-skill-dependency-graph.mjs biggj-skill-tree.mjs biggj-living-research-runtime.mjs biggj-research-validation-harness.mjs biggj-research-protocol-compiler.mjs biggj-research-review-queue.mjs biggj-research-episode-resolver.mjs biggj-historical-idea-catalog.mjs biggj-historical-idea-migration.mjs biggj-historical-proposal-research-gate.mjs claim-assumption-graph.mjs forecast-claim-assumption-sidecar.mjs claim-assumption-research-evaluator.mjs forecast-thesis-declarations.mjs forecast-thesis-revision-memory.mjs forecast-assumption-stability.mjs ./

COPY forecast-runtime ./forecast-runtime
COPY science-runtime ./science-runtime
COPY expansion-runtime ./expansion-runtime
COPY audit-ledger-rotation.test.mjs market-data-fabric.test.mjs market-fabric-cold-store.test.mjs market-fabric-cold-tier.test.mjs market-fabric-cold-replay.test.mjs autonomous-shadow-trader.test.mjs event-shadow-trade-gate.test.mjs shadow-portfolio-ledger.test.mjs shadow-capital-academy.test.mjs biggj-trading-academy.test.mjs shadow-training-supervisor.test.mjs strategy-evidence-engine.test.mjs shadow-trade-quality-learner.test.mjs mandatory-shadow-discovery.test.mjs trade-discovery-diagnostics.test.mjs forecast-history-cap.test.mjs shadow-coverage-curriculum.test.mjs forecast-revision-tracker-memory.test.mjs forecast-lightweight-runtime-diagnostics.test.mjs learned-challenger-engine.test.mjs shadow-regime-brain.test.mjs adversarial-stress-lab.test.mjs shadow-strategy-league.test.mjs streaming-json-persistence.test.mjs shadow-oms.test.mjs portfolio-brain.test.mjs telegram-read-command-handlers.test.mjs telegram-update-dispatcher.test.mjs research-data-plane.test.mjs research-data-plane-adapters.test.mjs research-data-governance.test.mjs research-dependency-graph.test.mjs research-coverage-doctor.test.mjs telegram-product-ui.test.mjs telegram-chat-lifecycle.test.mjs discord-telegram-bridge.test.mjs biggj-discord-observability.test.mjs chart-renderer.test.mjs biggj-visual-intelligence.test.mjs chart-intelligence.test.mjs market-xray-view.test.mjs liquidation-confluence-view.test.mjs structure-event-radar.test.mjs forecast-chart-overlay.test.mjs flow-radar-view.test.mjs forecast-accuracy-view.test.mjs superchart-intel.test.mjs intelligence-terminal.test.mjs cognitive-core.test.mjs scientific-brain.test.mjs world-model-foundation.test.mjs final-foundation-pack.test.mjs mission-control.test.mjs forecast-product.test.mjs telegram-ui-runtime.test.mjs institutional-forecast-runtime.test.mjs forecast-cold-archive.test.mjs forecast-contract.test.mjs forecast-input-adapter.test.mjs forecast-learning-center.test.mjs scientific-validity.test.mjs forecast-candidate-lab.test.mjs forecast-hypothesis-generator.test.mjs forecast-shadow-competition.test.mjs forecast-shadow-evaluation-client.test.mjs forecast-experiment-governor.test.mjs forecast-feature-research.test.mjs research-intelligence-features.test.mjs research-provider-fanout.test.mjs model-promotion-ladder.test.mjs model-candidate-registry.test.mjs model-promotion-review-service.test.mjs expansion-runtime/derivatives-public-provider.test.mjs expansion-runtime/liquidation-public-stream.test.mjs expansion-runtime/onchain-research-provider.test.mjs expansion-runtime/wallet-cohort-public-provider.test.mjs expansion-runtime/verified-entity-registry.test.mjs expansion-runtime/entity-flow-engine.test.mjs ./

COPY biggj-historical-idea-migration.test.mjs biggj-historical-proposal-research-gate.test.mjs claim-assumption-graph.test.mjs forecast-claim-assumption-sidecar.test.mjs claim-assumption-research-evaluator.test.mjs forecast-thesis-declarations.test.mjs forecast-thesis-revision-memory.test.mjs forecast-assumption-stability.test.mjs biggj-living-research-runtime.test.mjs biggj-living-research-integration.test.mjs biggj-research-validation-harness.test.mjs biggj-research-protocol-compiler.test.mjs biggj-research-review-queue.test.mjs biggj-research-episode-resolver.test.mjs autonomous-research-training-factory.test.mjs biggj-research-leverage-engine.test.mjs biggj-experience-center.test.mjs biggj-mobile-webapp.test.mjs official-intel-sources.test.mjs biggj-public-news-provider.test.mjs biggj-channel-operations.test.mjs biggj-german-translation.test.mjs biggj-rulebook.test.mjs biggj-rulebook-enforcement.test.mjs discord-command-center.test.mjs biggj-autonomous-operator.test.mjs biggj-governance-triage.test.mjs institutional-forecast-issuance.test.mjs ./

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
ENV TCX_AUTONOMOUS_RESEARCH_FACTORY_FILE=/data/tcx-autonomous-research-training-factory.json
ENV TCX_AUTONOMOUS_RESEARCH_FACTORY_REFRESH_MS=60000
ENV TCX_AUTONOMOUS_OPERATOR_FILE=/data/tcx-biggj-autonomous-operator.json
ENV TCX_AUTONOMOUS_OPERATOR_MS=60000
ENV TCX_REPLICA_COUNT=1

USER node
CMD ["node", "bot.mjs"]
