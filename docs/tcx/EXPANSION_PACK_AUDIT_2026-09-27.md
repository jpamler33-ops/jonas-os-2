# TCX V3 Expansion Pack Integration Audit — 2026-09-27

Status: CANONICAL INTEGRATION REVIEW
Target branch: `integration/tcx-institutional-v3`
Input package: `TCX_V3_EXPANSION_PACK_INSERTABLE_2026-09-27(1).zip`
Package version: `3.0.0-alpha.insertable.1`

## Package verification

The uploaded package was unpacked and verified before integration.

```text
node scripts/verify-pack.mjs
PASS
files: 36
modules: 30
execution: SHADOW_ONLY
liveExecution: false

node --test tests/*.test.mjs
9/9 PASS
0 FAIL
```

Package invariants are compatible with TCX:
- SHADOW_ONLY
- no live order credentials/path
- point-in-time intent
- immutable forecast intent
- champion/challenger promotion intent
- ABSTAIN / WAIT / UNKNOWN as first-class states

The pack is useful as an expansion candidate, but it is intentionally broad and many modules are too shallow to become institutional-canonical unchanged.

## Merge rule

Do not copy the package wholesale.

Every capability is classified as one of:
- KEEP MASTER
- ADAPT INTO INSTITUTIONAL V3
- REWRITE
- DEFER
- DEPRECATE AS DUPLICATE

## Component disposition

| Expansion component | Decision | Reason |
|---|---|---|
| `forecast-ledger` | KEEP MASTER | Research Trace + institutional issuance + audit binding already provide stronger immutable forecast/outcome identity |
| `pattern-memory` | KEEP MASTER | Episode Memory is canonical and already integrated into PIT research |
| `ghost-portfolio` | KEEP MASTER | Shadow OMS / SOR / Venue Quality Memory / ERL are stronger canonical simulation stack |
| `science-gates` | KEEP MASTER | Scientific Validity Core + Admission Gate + Alpha.30 guards are stronger and fail-closed |
| `self-improvement` | REWRITE LATER | Current simple expectancy/PF promotion is insufficient; use audited Promotion Ladder with PIT/OOS/science gates |
| `world-state` | KEEP MASTER / ADAPT FIELDS ONLY | Research Envelope + state validity + institutional kernel own canonical state truth |
| `tcx-expansion-orchestrator` | DEPRECATE AS PARALLEL ORCHESTRATOR | Would create a second product/research control plane |
| `contracts` | KEEP MASTER | Institutional contracts, hashing and epistemic rules already canonical |
| `host-adapter` | DEFER | Current modular provider/router architecture already supplies host boundaries |
| `event-bus` | DEFER | No need to introduce a second orchestration mechanism before measured need |
| `strategy-lab` | DEFER / REWRITE | Built-in BUY/SELL heuristics and exploration policy are not institutionally validated |
| `liquidity-intelligence` | ADAPT | Useful unique microstructure diagnostic, but visible-book evidence must not be treated as durable intent |
| `source-intelligence` | ADAPT | Useful for X/news/source reliability if resolved evidence and PIT are enforced |
| `event-impact` | ADAPT | Useful empirical post-outcome memory when maturity/PIT and epistemic typing are enforced |
| `narrative-engine` | DEFER / REWRITE | Current weighted heuristic scores need calibration/evidence lineage before canonical use |
| `market-psychology` | DEFER / REWRITE | Heuristic latent-state labels should remain research-only until validated |
| `meme-intelligence` | DEFER AS SEPARATE PIPELINE | Safety/potential separation is good, but requires contract/on-chain provenance and real rug-veto data |
| `trader-intelligence` | DEFER | Requires on-chain identity/entity-resolution and survivorship-bias controls |
| `future-intelligence` | DEFER AS SLOW RESEARCH | Useful long-horizon research concept; separate from market forecast truth |
| `opportunity-discovery` | DEFER / REWRITE | Composite score must not become disguised forecast probability |
| `portfolio-brain` | ADAPT LATER | Useful for shadow portfolio concentration/factor gates, not live execution |
| `reflexivity-energy` | DEFER / REWRITE | Heuristic composite needs empirical validation before use |
| `research-prioritizer` | ADAPT LATER | Useful internal research queue after core integration debt is resolved |
| `causal-graph` | ADAPT LATER AS HYPOTHESIS GRAPH ONLY | Must never imply causal identification |
| `counterfactual-lab` | KEEP CONCEPT / REWRITE | Forecast counterfactual service already exists; execution regret needs shadow-only causal-safe semantics |
| `x-stream-adapter` | DEFER | No live X data connector is part of current canonical data plane |

## Immediate promoted expansion work

The first expansion capabilities to stage are deliberately narrow:

1. Source Intelligence
   - resolved-event reliability only
   - duplicate/future/unresolved blocking
   - reliability separated from influence
   - no source popularity = reliability assumption

2. Event Impact Memory
   - empirical post-outcome reaction distributions
   - outcome maturity required
   - PIT-only evidence
   - explicit sample/support sufficiency
   - no causal claim

3. Liquidity Intelligence
   - observed order-book diagnostics
   - visible liquidity labelled as non-binding/possibly transient
   - evidence type kept explicit
   - no fake breakout probability

These are useful inputs to the existing TCX architecture without creating a competing master.

## Explicitly rejected shortcuts

Do not:
- convert opportunity/narrative/psychology scores into forecast probability
- let expansion strategy code bypass Institutional Admission
- run separate Ghost Portfolio execution alongside Shadow OMS as another truth
- use self-improvement to mutate production code or thresholds silently
- treat wallet/source popularity as skill/reliability without resolved outcomes
- treat visible order-book walls as committed liquidity
- treat causal graph edges as causal truth
- merge an autonomous expansion orchestrator around the existing control plane

## Integration sequence

```text
Expansion Pack
   ↓
capability audit
   ↓
institutional rewrites/adapters only
   ↓
PIT + epistemic + fail-closed tests
   ↓
Scientific / Admission compatibility
   ↓
Runtime Release Registry
   ↓
Research Trace / audit binding where applicable
   ↓
product surface only after green CI
```

## Definition of success

The expansion pack is considered integrated when its useful unique ideas have been absorbed into TCX without:
- duplicate sources of truth
- duplicate execution simulators
- competing orchestrators
- uncalibrated probabilities
- hidden self-modification
- future leakage
- loss of release/audit identity
