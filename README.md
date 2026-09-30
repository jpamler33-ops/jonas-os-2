# TCX Telegram · Railway

Telegram Live-Market UI for TCX v2. Execution remains **SHADOW_ONLY** and there is no order-execution path.

## Features

- Coin buttons and `/coin SYMBOL`
- Binance public live market data with endpoint fallback
- 1m / 5m / 15m / 1h views
- Favorites
- One-shot price alerts
- Persistent favorites + alerts through `/data/tcx-state.json`
- Atomic state writes and corrupt-state recovery
- Health endpoint at `/health`

## Railway

Required variable:

```text
TCX_TELEGRAM_BOT_TOKEN=<BotFather token>
```

For durable favorites and alerts, attach a Railway **Volume** to this service and mount it at:

```text
/data
```

The container already defaults to:

```text
TCX_STATE_FILE=/data/tcx-state.json
```

Keep the service at **1 replica** while using the file-backed state store and Telegram long polling.

Optional variables:

```text
TCX_TELEGRAM_REFRESH_MS=10000
TCX_TELEGRAM_ALERT_CHECK_MS=15000
TCX_EPISODE_SWEEP_MS=300000
TCX_EPISODE_FILE=/data/tcx-episodes.json
TCX_AUDIT_LEDGER_FILE=/data/tcx-audit-ledger.jsonl
TCX_MARKET_FABRIC_FILE=/data/tcx-market-events.jsonl
TCX_RELEASE_REGISTRY_FILE=/data/tcx-release-registry.jsonl
TCX_SHADOW_OMS_FILE=/data/tcx-shadow-oms.json
TCX_SHADOW_WATCH_MS=10000
TCX_SHADOW_LATENCY_MS=120
TCX_SHADOW_MAKER_FEE_BPS=10
TCX_SHADOW_TAKER_FEE_BPS=10
TCX_SHADOW_HIDDEN_QUEUE_BUFFER_PCT=0.15
TCX_SOR_MAX_BOOK_AGE_MS=15000
TCX_SOR_BINANCE_FEE_BPS=10
TCX_SOR_OKX_FEE_BPS=10
TCX_SOR_KRAKEN_FEE_BPS=10
TCX_VENUE_QUALITY_MEMORY_FILE=/data/tcx-venue-quality-memory.json
TCX_VQM_WATCH_MS=15000
TCX_VQM_MARKOUT_MAX_LAG_MS=45000
TCX_VQM_MIN_SAMPLES=12
TCX_VQM_MIN_TOXICITY_SAMPLES=30
TCX_VQM_HALF_LIFE_DAYS=30
TCX_INSTITUTIONAL_MARKET_MAX_AGE_MS=15000
TCX_OKX_REST_BASE=https://www.okx.com
TCX_KRAKEN_REST_BASE=https://api.kraken.com
TCX_TELEGRAM_ALLOWED_CHATS=123456789
TCX_TELEGRAM_SYMBOLS=BTCUSDT,ETHUSDT,SOLUSDT,...
```

## Commands

- `/start`
- `/coin BTC`
- `/favorites`
- `/alert BTC 70000`
- `/alerts`
- `/clearalerts`
- `/help`

## Safety / epistemics

Market data is OBSERVED. The compact Telegram TCX view does not promote telemetry to causal mechanism truth. Trading action remains **ABSTAIN / SHADOW_ONLY**.

## TCX Chart Engine v1

- `/chart BTC 5m` sends a real candlestick PNG generated inside the bot.
- Chart timeframes: 1m, 5m, 15m, 1h, 4h.
- Overlays: EMA20, EMA50, nearest swing support/resistance and confirmed swing pivots.
- `/memory BTC` compares the current mechanism/state telemetry with matured historical episodes.
- `/structure BTC` restores the legacy 4H / 1H / 15m / 5m structure concept as a DERIVED research layer.
- HH / HL / LH / LL and break/retest states are descriptive heuristics, not causal mechanism truth.
- Active candles may be shown visually, but all structure/EMA/pivot/break-retest calculations use only candles whose close time is <= availableAt.
- Execution remains ABSTAIN / SHADOW_ONLY.

## TCX Chart Engine v2

- labeled HH / HL / LH / LL swing tags
- support and resistance zones
- BRK and RT markers for closed-candle break/retest heuristics
- EMA20 and EMA50
- volume panel
- multi-timeframe bias strip
- local regime strip
- orderbook flow and liquidity strip
- RIFT pressure proxy derived from spread, depth imbalance, realized range and relative volume

The RIFT pressure proxy is explicitly `DERIVED_HEURISTIC`. It is not a causal mechanism posterior. Mechanism status remains `NOT_IDENTIFIED`; trading action remains `ABSTAIN / SHADOW_ONLY`.


## TCX Chart Engine v3 · Mechanism Episode Memory

The bot now builds a point-in-time episode memory on Railway.

Each canonical 5m episode stores:

- MTF bias and local trend
- regime
- liquidity class and spread
- order-book flow and depth imbalance
- RIFT pressure proxy
- ATR/range, realized volatility and relative volume
- EMA separation and normalized support/resistance distance
- break/retest state
- timestamp, availableAt, source/version provenance
- explicit epistemic labels

Sampling uses a fixed cadence plus event-driven captures. Serial near-duplicates are reduced so a long stress episode cannot dominate memory simply because it lasted many bars.

After future candles have actually closed, episodes receive neutral realized outcomes at:

- 15m (3 × 5m bars)
- 1h (12 × 5m bars)
- 3h (36 × 5m bars)

Outcomes store end return, maximum rise, maximum fall and realized range. A continuity guard refuses to mature an episode if the required immediate future bars are missing.

Similarity is state/mechanism-telemetry-first, not chart-shape-first. The Telegram command:

```text
/memory BTC
```

shows robust summaries for the nearest matured same-symbol episodes. It does not output a win probability, buy/sell recommendation or causal mechanism claim.

Memory persists at:

```text
/data/tcx-episodes.json
```

The existing Railway volume mounted at `/data` therefore preserves both favorites/alerts and the episode database.

Epistemic boundary:

```text
Current market inputs: OBSERVED
Structure / regime / RIFT pressure: DERIVED_HEURISTIC
Historical outcomes: OBSERVED_POST_EPISODE
Mechanism posterior: NOT_IDENTIFIED
Trading action: ABSTAIN / SHADOW_ONLY
```


## TCX Mechanism Transition Lattice (MTL) v1

MTL is a research layer above Episode Memory. It does not add another indicator. It decomposes the current point-in-time state into pressure channels and asks how similar historical mechanism/state configurations transitioned into later configurations.

Current channels:

- LIQUIDITY_STRESS
- FORCED_FLOW
- REFLEXIVE_ALIGNMENT
- BOUNDARY_COMPRESSION
- ABSORPTION
- CASCADE_RISK

The engine also computes:

- modality coverage
- contradiction score
- novelty versus memory
- transition entropy
- transition coherence
- empirical successor-state distributions at 15m / 1h / 3h
- an identifiability gate

Telegram:

```text
/engine BTC
```

Important: the current deployment uses one Binance provider with multiple modalities (OHLCV, order book, volume/structure). These are not independent witnesses. Therefore MTL may support a mechanism hypothesis, but its causal status remains `NOT_IDENTIFIED`. It cannot enter `IDENTIFIABILITY_REVIEW` until a genuinely independent witness is available.

MTL is observational research infrastructure. It outputs no buy/sell instruction and remains `ABSTAIN / SHADOW_ONLY`.


## TCX Independent Witness Network v1

The mechanism stack now queries independent spot venues at engine time:

- Binance is the primary telemetry source.
- OKX is a same-quote `USDT` order-book witness.
- Kraken is an independent `USD` order-book witness.

Public order books are normalized to a common witness schema containing:

- bid / ask / mid
- spread in bps
- top-depth notional imbalance
- publication timestamp
- availableAt
- venue/source provenance

The witness audit rejects stale snapshots and excessive capture skew before they can contribute. It then measures:

- flow-direction agreement
- liquidity-class agreement
- same-quote price agreement
- cross-quote price agreement with an explicit USD-vs-USDT caveat
- cross-venue contradiction flags
- freshness
- total witness agreement

Strict `independentWitnessSatisfied` requires at least two usable external venues, at least one same-quote witness, same-quote price agreement, sufficient flow agreement and sufficient aggregate agreement.

Commands:

```text
/witness BTC
/engine BTC
```

MTL receives the witness report. A strict multi-venue witness can move a sufficiently supported hypothesis to `IDENTIFIABILITY_REVIEW`, but never to causal truth. Even then:

```text
Causal status: NOT_IDENTIFIED
Trading action: ABSTAIN / SHADOW_ONLY
```

Cross-venue agreement is evidence against a venue-local artifact; it is not proof of a causal mechanism.


## TCX Institutional Kernel v1

TCX now has a fail-closed institutional control plane around the research stack.

### Data Quality Firewall

Every institutional engine run audits:

- positive bid / ask / price
- crossed-book detection
- timestamp and `availableAt` validity
- primary-data freshness
- spread and imbalance bounds
- witness-report validity
- MTL invariant bounds

### Hard invariants

The institutional kernel rejects any engine result that violates:

```text
execution = SHADOW_ONLY
action = ABSTAIN
causalStatus = NOT_IDENTIFIED
canExecute = false
```

These are code-level invariants, not UI labels.

### Safety state machine

```text
NORMAL
  |
  +-- soft data/witness/research issue --> DEGRADED
  |
  +-- stale/invalid primary data
  +-- invalid engine invariant
  +-- audit-ledger failure
            |
            v
         SAFE_STOP
```

`SAFE_STOP` disables institutional research acceptance. Execution remains disabled in every state.

### Deterministic Research Envelope

Every `/engine SYMBOL` run creates a canonical research envelope containing:

- symbol and `availableAt`
- primary-market snapshot and provenance
- independent-witness summary
- MTL candidate/gate/evidence metrics
- safety state and reasons
- engine/kernel versions
- immutable configuration hash
- deterministic input hash
- deterministic envelope hash

### Tamper-evident audit ledger

Research envelopes are persisted to:

```text
/data/tcx-audit-ledger.jsonl
```

Every ledger record contains:

- monotonically increasing sequence number
- previous record hash
- payload hash
- record hash

This forms a SHA-256 hash chain. Historical modification, deletion/reordering inside the chain, payload mutation, or sequence corruption is detected by integrity verification.

A corrupted/unreadable ledger does not silently reset. The service can remain available for diagnostics, but the institutional control plane enters `SAFE_STOP`.

Telegram:

```text
/audit
/engine BTC
```

`/audit` reports ledger health, sequence, tail hash and replay-integrity status for the latest research envelope.

### Replay boundary

The stored envelope is designed to answer:

> What information did TCX have at that exact point in time, under which configuration and engine versions?

It does not claim that later code will reproduce identical market outcomes. Reproducibility refers to the recorded research input/state and deterministic envelope integrity.

No order-execution path exists in this repository.


## TCX Event-Sourced Market Data Fabric v1

TCX now persists market knowledge as an immutable event stream at:

```text
/data/tcx-market-events.jsonl
```

The fabric stores:

- `PRIMARY_MARKET`
- `WITNESS_CONSENSUS`
- `CANDLE_CLOSE`

Each event contains:

- sequence number
- previous event hash
- source and stream key
- stable source-event id
- eventTime
- availableAt
- ingestedAt
- payload hash
- event hash

The chain is SHA-256 verified on startup and by `/fabric`.

### Point-in-time rule

A historical candle fetched today does **not** inherit its historical close time as knowledge availability.

Example:

```text
candle closeTime = 2026-09-20 12:05
TCX first ingests it = 2026-09-27 15:10

eventTime   = 2026-09-20 12:05
availableAt = 2026-09-27 15:10
```

Therefore a replay for 2026-09-20 cannot see information TCX only acquired on 2026-09-27.

Repeated identical provider rows are deduplicated. If a provider later corrects the same source event with different content, the correction is appended with its later `availableAt` instead of rewriting history.

Telegram:

```text
/fabric
/replay BTC
/replay BTC 2026-09-27T14:30:00Z
```

## TCX Deterministic Replay Engine v1

Replay reconstructs the information set using only events satisfying:

```text
event.availableAt <= requested asOf
```

It currently reconstructs:

- latest primary market observation known by `asOf`
- latest witness consensus known by `asOf`
- 4h / 1h / 15m / 5m candles known by `asOf`

The resulting state receives a deterministic replay hash and a future-leakage audit.

Every institutional Research Envelope is now bound to the current Market Data Fabric sequence and tail hash. This creates a verifiable relationship:

```text
Market Event Chain
      ↓
Fabric seq + tail hash
      ↓
Research Envelope
      ↓
Institutional Audit Ledger
```

If the Market Data Fabric chain is corrupted or unreadable, the Institutional Kernel enters `SAFE_STOP`.

The current replay reconstructs the point-in-time information state. Re-running all historical strategy/engine code versions from archived binaries/configuration is a separate later layer.

Execution remains disabled: `ABSTAIN / SHADOW_ONLY`.


## TCX Runtime Release & Configuration Registry v1

Every running TCX deployment now computes an immutable runtime release manifest from the actual source files inside the container.

The manifest hashes:

- `bot.mjs`
- persistence/state modules
- structure/chart/dashboard modules
- Episode Memory
- MTL
- Independent Witness Network
- Institutional Kernel
- Market Data Fabric
- Deterministic Replay
- Release Registry itself
- `package.json`

Each component is SHA-256 hashed. TCX also hashes the institutional configuration and records safe deployment metadata such as an available Git commit SHA.

Secrets and arbitrary environment variables are **not** copied into the registry.

Persistent registry:

```text
/data/tcx-release-registry.jsonl
```

Each unique runtime release receives:

- deterministic `releaseId`
- manifest hash
- registry sequence
- previous-record hash
- record hash

Identical deployments deduplicate to the same release record. Source-code or institutional-config changes create a new release ID.

Telegram:

```text
/release
```

Research Envelopes now bind together:

```text
Market Data Fabric seq/tail
        +
Runtime Release ID
Release Registry seq/tail
        +
Research inputs/config
        ↓
Research Envelope hash
        ↓
Institutional Audit Ledger
```

Release Registry corruption is a hard Institutional Kernel failure and produces `SAFE_STOP`.

This closes a major reproducibility gap: TCX can identify not only which data was known at a point in time, but also which exact hashed runtime release processed it.

Execution remains disabled: `ABSTAIN / SHADOW_ONLY`.


## TCX Institutional Observability & Chaos Engineering v1

TCX now measures operational quality rather than only reporting that the process is alive.

### Observability

Runtime telemetry includes:

- provider call count
- provider success/failure rate
- provider latency mean / p50 / p95 / p99 / max
- institutional engine latency
- safety-state transitions
- evidence-strength distribution
- novelty distribution
- contradiction distribution
- witness-agreement distribution
- primary-data age
- recent scoped errors

Telegram:

```text
/obs
```

The observability layer derives SLO breaches for:

- low provider success rate
- excessive provider p95 latency
- excessive engine/operation p95 latency

Metrics are bounded in memory so monitoring itself cannot grow without limit.

### Synthetic Chaos Harness

Telegram:

```text
/chaos
/chaos PRIMARY_STALE
```

The chaos harness is side-effect-free with respect to real markets, provider calls, orders, the Market Data Fabric and current market state. It exercises the actual Institutional Kernel using synthetic fixtures.

Current scenarios include:

- healthy baseline
- stale primary market data
- crossed order book
- future timestamp / clock-skew style failure
- invalid order-book imbalance
- OKX + Kraken outage
- cross-venue disagreement
- engine execution-mode violation
- engine action invariant violation
- causal-status violation
- Audit Ledger corruption
- Market Data Fabric corruption
- Release Registry corruption
- simultaneous multi-system failure

Expected behavior is asserted per scenario:

```text
soft witness failure -> DEGRADED
hard primary/integrity/invariant failure -> SAFE_STOP
canExecute -> always FALSE
execution -> always SHADOW_ONLY
```

Chaos reports can be written to the Institutional Audit Ledger when that ledger is healthy.

Both `observability.mjs` and `chaos-engineering.mjs` are included in the deterministic Runtime Release hash, so changes to monitoring or failure-test logic create a new release identity.


## TCX Shadow OMS & Exchange Microstructure Simulator v1

TCX now contains a persistent, execution-disabled Shadow Order Management System.

Commands:

```text
/oms
/shadow BTC BUY 100 MARKET
/shadow BTC BUY 100 LIMIT 65000
/shadoworders
/shadoworders BTC
/shadowcancel ORDER_ID
```

Hard capabilities:

```text
execution = SHADOW_ONLY
canExecuteLive = false
exchangeOrderAdapter = false
networkOrderSubmission = false
```

No authenticated exchange order endpoint exists in this runtime. Exchange access used by the OMS is limited to public market-data GET requests.

### Market / marketable-limit simulation

The simulator captures:

1. decision-time L2 order book,
2. configured decision-to-arrival latency,
3. arrival-time L2 order book,
4. visible-book walk across up to 100 price levels.

It measures:

- partial fills,
- VWAP / average fill price,
- slippage versus arrival mid,
- spread crossing,
- latency move,
- configurable taker-fee assumption,
- visible-depth exhaustion.

If observed L2 depth is insufficient, the remaining intent is **not** fabricated as filled.

### Passive limit simulation

Non-marketable limit orders use a conservative price-time queue proxy:

- visible quantity at the exact price level,
- configurable hidden-liquidity buffer,
- explicit queue uncertainty,
- aggregate public trade prints for queue depletion,
- only aggressor-side trades capable of reaching the order price may consume queue or generate maker fills.

The simulator does not treat a candle touching a price as proof of a fill.

If no aggregate-trade cursor is available, the order is degraded rather than retroactively inventing fills.

### Adverse-selection markouts

Terminal fills are marked against future observed mid prices at:

- 1 minute,
- 5 minutes,
- 15 minutes.

For each horizon TCX stores a signed markout and adverse-selection value in basis points.

### Persistence and audit

Persistent Shadow OMS state:

```text
/data/tcx-shadow-oms.json
```

Placement, fill changes, cancellation and markout updates are written to the Institutional Audit Ledger when it is healthy.

`shadow-oms.mjs` is included in the Runtime Release Registry, so any change to queue, fill, slippage or fee logic creates a new release identity.

The Telegram product UI module is also now included in both the Railway image and Runtime Release hash.


## TCX Alerts v2

Telegram now supports persistent edge-triggered research alerts in addition to one-shot price alerts.

Commands:

```text
/alert BTC 70000
/alertregime BTC
/alertstructure BTC
/alertwitness BTC 75
/alertmemory BTC 8
/alertsafety BTC
/alertcombo BTC
/alerts
/clearalerts
```

The market card alert button also exposes preset buttons for regime changes, structure changes, witness agreement, memory support, safety-state changes and the composite research-evidence gate.

Alert semantics:

- threshold alerts are edge-triggered and re-arm after the condition becomes false
- cooldown suppresses rapid repeat notifications
- fingerprints deduplicate unchanged states
- state-change alerts establish a baseline before firing
- alert state persists in `TCX_STATE_FILE`
- legacy schema-v1 price alerts migrate automatically to Alerts v2
- alert notifications never imply order execution

### TCX Radar v2

Radar v2 reuses the same research context used by Alerts v2 and shows, per market:

- institutional safety state
- regime
- independent-witness agreement
- historical transition support
- novelty
- contradiction

Radar is explicitly not a "best trade" ranking. It is an evidence-coverage and system-state view.

Execution remains:

```text
ABSTAIN / SHADOW_ONLY
canExecute = false
```


## TCX Evidence Diagnostics v1

TCX now keeps a persistent research-evidence history per market and exposes it directly in the Telegram market card:

- `🧩 Evidence` — current disagreement map and evidence diagnostics
- `📜 History` — recent persistent evidence snapshots
- `/evidence BTC`
- `/history BTC`

The Disagreement Map keeps research layers separate instead of averaging incompatible quantities into a fake probability:

- structure
- multi-timeframe bias
- order-book flow
- independent witness network
- episode/transition memory
- MTL research engine
- institutional safety state

The Evidence Index is a bounded diagnostic score built from measured witness agreement, historical support, novelty, engine evidence strength, contradiction and research safety. It is explicitly:

```text
DERIVED_RESEARCH_DIAGNOSTIC_NOT_PROBABILITY
```

It is **not** a price probability, win probability or trading instruction.

Evidence trend states:

```text
BASELINE
RISING
STABLE
DECAYING
CONFLICTED
```

Persistent storage defaults to:

```text
/data/tcx-evidence-history.json
```

The history writer serial-deduplicates unchanged states at short intervals and retains bounded per-symbol history.

Execution remains:

```text
Action: ABSTAIN
Execution: SHADOW_ONLY
canExecute: false
```

## Multi-Venue Shadow Smart Order Router

TCX also contains a separate **simulation-only** multi-venue Smart Order Router research layer.

The router can inspect read-only market books from supported venues and simulate route allocation, venue quality, liquidity fragmentation and execution diagnostics. It does not expose live-exchange trading credentials or a live order path.

Telegram commands and market-card entry points expose Shadow SOR route/status research where available.

Hard boundary:

```text
LIVE_EXECUTION = DISABLED
SHADOW_ONLY = TRUE
```

The Railway image, CI syntax checks and runtime release manifest include the Shadow SOR module so deployed runtime identity matches the source being tested.


## TCX Multi-Venue Shadow Smart Order Router v1

TCX now contains a counterfactual multi-venue execution router.

Telegram:

```text
/sor BTC BUY 100
/sor BTC SELL 100
/sorstatus BTC
```

The router is hard-locked to:

```text
execution = SHADOW_ONLY
canExecuteLive = false
exchangeOrderAdapter = false
networkOrderSubmission = false
```

### Venue set

Current public order-book adapters:

- Binance Spot · USDT · routable
- OKX Spot · USDT · routable
- Kraken Spot · USD · observed, but excluded from USDT routing until a point-in-time quote-basis normalization exists

TCX never silently treats USD and USDT as identical.

### Routing objective

SOR works at the marginal L2 price-level level instead of selecting one venue by top-of-book alone.

For each eligible visible level it considers:

- observed public L2 price
- visible quantity
- configured fee assumption
- observed book-fetch latency as a deterministic tie-break
- venue toxicity only when a minimum amount of markout evidence exists

For BUY simulations, lower fee-adjusted marginal cost is consumed first.
For SELL simulations, higher fee-adjusted marginal proceeds are consumed first.

The output reports:

- route split by venue
- aggregate fill ratio
- average fill price
- visible-depth exhaustion
- fee assumptions
- slippage versus the consolidated same-quote reference mid
- all-in basis-point cost
- fragmentation HHI
- effective venue count
- comparison with the best full-fill single-venue counterfactual
- excluded/unavailable venues and exact reasons
- deterministic route hash
- Institutional Audit Ledger record

### Quote integrity

A venue with a different quote currency receives an explicit exclusion such as:

```text
QUOTE_MISMATCH_USD_VS_USDT
```

A stale or invalid book is also excluded rather than repaired or invented.

### Venue toxicity

The SOR contains an evidence-gated toxicity hook. A toxicity penalty is not applied merely because a venue has a name or reputation.

It requires sufficient empirical future-markout evidence. Until that threshold is met:

```text
NOT_APPLIED_INSUFFICIENT_EVIDENCE
```

This prevents unmeasured venues from receiving invented execution penalties.

### Epistemic status

```text
Venue books: OBSERVED_PUBLIC_L2
Fees: ASSUMED_CONFIG
Toxicity: MODELLED_FROM_MARKOUT_EVIDENCE only when supported
Route: COUNTERFACTUAL_SHADOW_SIMULATION
Real exchange order submission: NONE
```

Every SOR report can be written to the Institutional Audit Ledger and `multi-venue-shadow-sor.mjs` is included in the Runtime Release hash.


## TCX Venue Quality Memory v1

TCX now learns execution quality from its own Shadow SOR history without enabling live execution.

Persistent state:

```text
/data/tcx-venue-quality-memory.json
```

Telegram:

```text
/venuequality BTC BUY 1000
/vqm BTC SELL 5000
```

### What is learned

Each SOR run stores a per-venue counterfactual observation for **every venue with an observed book**, not only the venue chosen by the router.

Context dimensions:

- venue
- symbol
- side
- notional size bucket
- market regime
- liquidity state
- pressure band

Metrics:

- counterfactual fill ratio
- visible-book slippage
- all-in cost
- fee assumption
- public-book fetch latency
- router selection share
- 1m / 5m / 15m same-venue future markouts
- adverse selection

This avoids training only on the router's own winners.

### Point-in-time markout integrity

Future markouts have strict capture windows.

If TCX misses a horizon because the process was offline or the venue book was unavailable, it records:

```text
MISSED_CAPTURE_WINDOW
```

It never uses a much later current price as a fake historical 1m/5m/15m markout.

### Hierarchical evidence

VQM starts with the most specific matching segment and falls back only when sample support is insufficient:

```text
venue + symbol + side + size + regime + liquidity
→ venue + symbol + side + size + regime
→ venue + symbol + side + size
→ venue + symbol + side
→ venue + side
→ venue global
```

The reported scope and sample count remain visible.

### Toxicity feedback into SOR

Venue toxicity is derived only from matured 5-minute adverse-selection observations.

Default gate:

```text
minimum matured 5m observations = 30
```

Below the gate:

```text
NOT_APPLIED_INSUFFICIENT_EVIDENCE
toxicity penalty = 0
```

Above the gate, adverse-selection evidence is recency weighted and shrunk toward zero before it can influence future Shadow SOR routes.

New observations from the current route are appended **after** the route has been computed, preventing same-run self-feedback.

### Epistemic boundary

```text
L2 book: OBSERVED
single-venue fill: COUNTERFACTUAL SHADOW SIMULATION
future venue mid: OBSERVED only inside valid capture window
quality memory: EMPIRICAL SHADOW EXECUTION MEMORY
causal status: NOT_IDENTIFIED
live execution: DISABLED
```

Corrupt VQM state disables learned penalties and further learning; it does not fabricate memory or silently repair history. Base observed-book Shadow SOR can continue without the learned penalty.


## TCX Research Validity

TCX 2.5 now fingerprints the research state behind each evidence snapshot and tracks whether that view is still reusable.

Each fingerprint contains quantized research state across:

- regime
- multi-timeframe bias
- local structure and structure key
- liquidity and flow
- witness agreement / contradiction
- historical support and novelty
- engine evidence / contradiction / gate
- institutional safety state

The fingerprint intentionally does not treat every small tick as a new state. Continuous inputs are quantized before hashing, while the anchor price is retained separately for drift measurement.

Research-view lifecycle:

```text
VALID
STALE
DRIFTED
EXPIRED
INVALIDATED
```

Default semantics:

- `VALID` — view can be reused without refresh
- `STALE` — refresh recommended because of age
- `DRIFTED` — enough state dimensions changed that the old view should not be reused
- `EXPIRED` — time-to-live exceeded even if the market appears similar
- `INVALIDATED` — hard break such as a structure / MTF directional flip, SAFE_STOP, entry into STRESS, strong witness contradiction, or a major engine-contradiction break

Default thresholds:

```text
staleAfter = 10 minutes
expireAfter = 30 minutes
driftThreshold = 0.28
```

They can be overridden with:

```text
TCX_RESEARCH_VALIDITY_STALE_MS
TCX_RESEARCH_VALIDITY_EXPIRE_MS
TCX_RESEARCH_VALIDITY_DRIFT_THRESHOLD
```

Telegram:

```text
/validity BTC
```

The market card also exposes `⏱ Validity`.

Evidence History stores the fingerprint plus the latest lifecycle assessment. Radar, Watchlist and Compare surface the current validity state so an old analysis is not silently treated as current.

Hard invariant:

```text
Research validity != trade probability
canExecute = false
Execution = SHADOW_ONLY
```


## TCX Execution Research Lab v1

TCX now evaluates the quality of the Shadow SOR policy using accumulated Venue Quality Memory.

Telegram:

```text
/executionlab BTC
/executionlab BTC BUY
/erl BTC SELL
```

The lab evaluates execution quality, not PnL and not trade direction.

### Policy vs baseline

Each historical Shadow SOR route is compared against full-fill single-venue counterfactuals from the same point-in-time venue-book snapshot.

Single-venue benchmark cost is normalized against the same consolidated reference mid as the multi-venue route.

Metrics include:

- policy all-in execution cost in bps
- policy fill ratio
- execution-cost edge vs best comparable single venue
- positive-edge share
- 95% interval on mean execution-cost edge

A positive execution edge means lower simulated execution cost than the comparable single-venue baseline. It is not a trading-return claim.

### Temporal OOS

The lab uses chronological train/test separation rather than random shuffling.

Default minimum evidence:

```text
20 earlier routes
10 later OOS routes
```

It reports train/test execution-cost edge, generalization gap and OOS evidence status.

### Walk-forward stability

TCX also evaluates sequential unseen route windows.

Default:

```text
minimum historical window = 30 routes
test window = 10 routes
step = 10 routes
```

The report includes:

- number of valid folds
- mean fold execution edge
- positive-fold share
- worst fold
- best fold

### Toxicity calibration

For matured 5-minute same-venue markouts, TCX compares predicted toxicity penalty with realized adverse selection.

Diagnostics include sample count, prediction bias, MAE, RMSE, correlation and calibration buckets.

Missed markout capture windows do not enter calibration.

### Execution drift

Recent route outcomes are compared with an earlier reference window using:

- policy all-in cost
- execution edge vs single-venue baseline
- fill ratio

States:

```text
STABLE
WATCH
DRIFT
INSUFFICIENT_DRIFT_SAMPLES
```

### Segment diagnostics

Research results are decomposed by regime, order-size bucket, BUY/SELL and Venue Quality Memory active/inactive.

Segments with insufficient samples are omitted instead of being promoted to conclusions.

### Epistemic boundary

```text
Objective: EXECUTION_QUALITY_NOT_PNL
Route outcomes: COUNTERFACTUAL_SHADOW_SIMULATION
Future markouts: OBSERVED only inside valid capture windows
OOS result: DESCRIPTIVE TEMPORAL EVALUATION
Causal status: NOT_IDENTIFIED
Action: ABSTAIN
Execution: SHADOW_ONLY
```

Every manually generated Execution Research Lab report can be appended to the Institutional Audit Ledger.

`execution-research-lab.mjs` is included in the deterministic Runtime Release hash.


## TCX Runtime Architecture v2

The Telegram runtime is no longer implemented as one command / exchange-I/O monolith.

### Market Data Provider Architecture

`market-data-provider.mjs` owns external exchange I/O:

- Binance REST fallback sequence
- market ticker / book / depth requests
- closed-kline retrieval
- Shadow OMS execution books
- Binance / OKX / Kraken Shadow SOR books
- aggregate-trade cursor and pagination
- provider-level timeout, provenance, error and observability hooks
- partial multi-venue failure isolation

The provider uses dependency injection for fetch, normalizers, venue symbol mappings, clocks and telemetry. Unit tests therefore verify fallback and degraded-venue behavior without calling live exchanges.

`bot.mjs` retains research orchestration and consumes the provider through a narrow method surface.

### Telegram Command Router Architecture

Telegram commands now flow through:

```text
Telegram update
    ↓
telegram-command-router.mjs
    ↓
┌──────────────────────────────────┐
│ telegram-read-command-handlers   │
│ telegram-mutation-command-handlers│
└──────────────────────────────────┘
    ↓
domain services / views / persistence
```

`telegram-command-router.mjs` owns command parsing, bot-suffix normalization, permission gating, dispatch and error isolation.

`telegram-read-command-handlers.mjs` owns UI / research commands such as market views, charts, observability, Execution Research Lab, Venue Quality diagnostics, release / fabric / replay / audit, witness, engine, memory, evidence, history and validity.

`telegram-mutation-command-handlers.mjs` owns Shadow OMS, Shadow SOR and alert mutations. Mutable bot state is accessed through explicit getters / setters so handlers do not keep stale references after persistence reloads or array reassignment.

The old sequential `handleCommandLegacy` chain has been removed.

### Research Lifecycle Services

Research lifecycle logic remains separated into:

- `state-validity.mjs` — state fingerprints, drift, stale / expiry / hard invalidation
- `research-lifecycle.mjs` — evidence snapshot lifecycle and state-based deduplication
- `evidence-history.mjs` — persistent evidence history

### Deployment identity

All runtime modules above are included in:

- `npm run check`
- Railway Docker image
- deterministic runtime release hashing

This prevents CI/source success from diverging from the actual deployed module set.

Hard execution boundary remains:

```text
LIVE_EXECUTION = DISABLED
canExecute = false
Execution = SHADOW_ONLY
```
