# TCX Master Merge Audit — 2026-09-27

Status: INTEGRATION-BRANCH CANONICAL AUDIT
Branch: `integration/tcx-institutional-v3`
Inputs:
- current GitHub `main`
- Forecast Specialist v2.3.1 handover/merge pack
- GitHub branch `integration/forecast-v2.3.1`
- TCX v2 Alpha.30 master merge bundle
- Producer Telegram/Product/Runtime handover

## Executive finding

The correct merge is NOT repository replacement.

Current `main` is the canonical product/runtime/institutional shell.
Forecast Specialist supplies a candidate probabilistic forecast subsystem.
Alpha.30 supplies a candidate scientific-validity / falsification subsystem.
Producer handover is mostly already represented in current main.

Target:
one TCX system with one data truth, one safety/control plane, one forecast contract and one scientific validation plane.

## Important correction to earlier handover assumptions

The old Cloudflare Market Grammar / Market World Model files are historical, not current-main runtime components.

They were removed before the current Node/Railway architecture became canonical.

Therefore they must not be treated as a second active forecast truth in the current merge.

## Forecast Specialist evidence

Uploaded v2.3.1 merge pack is not self-contained by itself. It contains the intelligence-layer delta and imports baseline forecast modules such as calibration, drift, journal, interval calibration, model performance, path engine and reliability.

The complete compiled runtime is present on GitHub branch:

`integration/forecast-v2.3.1`

Branch head at audit:
`4b04b48727f87b0abfa8991b7c4021c0597cfa6f`

The branch adds an isolated `forecast-runtime/` tree and PIT hardening to Episode Memory.

Reported specialist verification:
- TypeScript strict build: PASS
- Intelligence: 21/21
- forecast regression: 32/32
- critical guards: 55/55
- targeted total: 108/108

These are specialist-reported artifacts, not a substitute for integration-branch CI.

## Alpha.30 evidence

Alpha.30 package:
`2.0.0-alpha.30`

Independent local re-run during this audit:

```text
31/31 suites PASS
265/265 tests PASS
0 FAIL
```

Alpha.30 contains a much broader standalone platform than we should merge wholesale.
Its highest-value unique contribution is the scientific guard/falsification stack.

## Component disposition

| Capability | Master | Forecast Specialist | Alpha.30 | Decision |
|---|---|---|---|---|
| Public exchange I/O | canonical provider | adapter assumptions | legacy providers | KEEP MASTER |
| PIT event truth | Market Data Fabric + replay | local PIT history/journal | PIT fields/guards | KEEP MASTER + adapt others |
| Audit/release identity | canonical hash chains | private audit stream | local research hashes | REWRITE onto MASTER |
| Telegram product | canonical | display adapter only | dashboards | KEEP MASTER |
| Alerts | canonical v2 | none | none | KEEP MASTER |
| Episode memory | canonical | consumes history / needs 5m+4h support | separate analog memory | KEEP MASTER, extend carefully |
| Regime | current dashboard/MTL | regime-conditioned forecasting | separate regime engine | MERGE contract, not engines |
| Witness independence | venue network | consumes state | lineage/evidence independence | MERGE BOTH semantics |
| Forecast core | absent in current main | strong candidate | no equivalent canonical forecast | KEEP SPECIALIST candidate |
| Multi-horizon tri-class probabilities | absent | implemented | not canonical | KEEP SPECIALIST candidate |
| Calibration | execution calibration only | forecast calibration/Brier/ECE | scientific guard calibration | KEEP SEPARATE BY OBJECTIVE |
| Forecast intervals | absent | implemented | uncertainty primitives | KEEP SPECIALIST |
| Path scenarios | absent | implemented | world/scenario stack broader | KEEP SPECIALIST initially |
| Forecast live revision | research lifecycle exists | implemented | drift layers | MERGE into common lifecycle |
| Forecast invalidation | generic state validity | forecast-specific | scientific abstention guards | MERGE under master control plane |
| Counterfactual explanation | limited | model sensitivity | broader counterfactual engines | KEEP SPECIALIST for forecast only |
| OOD/support | novelty heuristics | local OOD | empirical/common/neighborhood support | REWRITE using Alpha guards |
| Concept stability | absent | drift proxies | strong validated guards | KEEP ALPHA |
| Specification multiverse | absent | absent | implemented | KEEP ALPHA |
| Sequential evidence | absent | drift/journal | implemented | KEEP ALPHA |
| Transportability | absent | regime/local conditioning | implemented | KEEP ALPHA |
| Dependency discovery/hypergraph | absent | no | implemented | KEEP ALPHA research-only |
| Interventional invariance | absent | no causal claim | implemented guard | KEEP ALPHA research-only |
| Scientific promotion | ad hoc | model quarantine | research/promotion concepts | REWRITE as TCX Promotion Ladder |
| Shadow execution | canonical OMS/SOR/VQM/ERL | none | separate simulator | KEEP MASTER |
| Portfolio stack | not canonical | none | large alpha subsystem | DEFER / DO NOT MERGE NOW |
| Alpha dashboards/providers | canonical alternatives exist | n/a | duplicates | DEPRECATE FOR MERGE |

## Hard architectural conclusions

### 1. Master owns truth and safety
Forecast and science modules receive normalized point-in-time inputs from master.
They may not create an independent market-data truth.

### 2. Forecast Specialist becomes a candidate forecasting engine, not a second bot
It is integrated behind an adapter and cannot directly own Telegram, execution or master audit semantics.

### 3. Alpha.30 becomes TCX Scientific Validity Core
Do not import Alpha.30 providers, dashboards, execution, portfolio or deployment stack into runtime.

Extract/adapt its scientific guards behind a narrow Research Trace contract.

### 4. Forecast probability and Evidence Index remain different types
Evidence diagnostic scores may gate or contextualize a forecast but may never be silently converted into forecast probability.

### 5. Forecast self-correction remains gated
No unrestricted online self-modification.
Updates must be versioned candidates and pass PIT / temporal OOS / scientific validation before promotion.

## Initial integration order

1. stage Forecast Specialist runtime on integration branch
2. add integration-level forecast regression tests
3. define canonical ForecastInput / ForecastOutput / ForecastAudit contracts
4. add master adapter from research state -> ForecastInput
5. make Institutional Kernel authoritative over forecast admission
6. extract Alpha.30 scientific guards into isolated science package
7. define Research Trace -> science guard adapters
8. create unified validity object combining:
   - data validity
   - research-state validity
   - forecast validity
   - scientific-support validity
9. wire product UI only after contracts/tests are stable
10. run complete root + forecast + science gates before merge to main

## Non-goals for this merge

- live order execution
- generic AI agent autonomy
- importing every Alpha.30 subsystem
- reviving removed Cloudflare architecture
- optimizing for PnL
- hiding uncertainty behind one composite score
