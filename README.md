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
