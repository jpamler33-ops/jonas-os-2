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
