# TCX Telegram Product Architecture

Status: CANONICAL PRODUCT SPEC
Scope: Telegram UI / UX / product logic above the TCX research core
Execution invariant: SHADOW_ONLY
Trading action invariant: ABSTAIN
Order execution path: NONE

## 1. Product principle

TCX is not a signal bot. Telegram is the command center for transparent market intelligence.

Every market view must answer, in order:

1. What is happening now?
2. What does TCX currently infer?
3. How reliable is the evidence?
4. What contradicts the current view?
5. What would invalidate it?
6. What changed since the last snapshot?
7. Is TCX confident enough to say anything at all?

The UI must never turn DERIVED_HEURISTIC or NOT_IDENTIFIED evidence into causal truth or a trade instruction.

## 2. Existing capabilities that MUST be preserved

Current repository already contains:

- /start and coin buttons
- /coin SYMBOL
- live market updates by editing the same Telegram message
- 1m / 5m / 15m / 1h views
- Chart Engine v2 with 1m / 5m / 15m / 1h / 4h
- EMA20 / EMA50
- HH / HL / LH / LL
- support / resistance zones
- break / retest markers
- volume panel
- MTF bias
- regime
- order-book flow / liquidity
- RIFT pressure proxy
- Episode Memory
- Mechanism Transition Lattice
- Independent Witness Network (Binance / OKX / Kraken)
- Institutional Kernel
- Data Quality Firewall
- Event-Sourced Market Data Fabric
- Deterministic Replay
- Runtime Release Registry
- Observability / SLOs
- Chaos Engineering
- persistent favorites and price alerts

Do not remove or weaken these invariants while improving UX.

## 3. Canonical navigation

/start

TCX v2 · COMMAND CENTER

System: HEALTH
Mode: SHADOW_ONLY
Action: ABSTAIN
Markets: <count>

Buttons:

[ Markets ] [ TCX Radar ]
[ Watchlist ] [ Alerts ]
[ Performance ] [ System ]
[ Settings ]

### Markets

[ Crypto ]
[ Favorites ]
[ Search ]

For now Crypto is the active market class. Do not pretend unsupported asset classes are live.

### Asset list

Two columns of assets, paginated when needed.

[ BTC ] [ ETH ]
[ SOL ] [ XRP ]
...

Footer:
[ Search ] [ Favorites ]
[ Home ]

## 4. Canonical market card

BTC/USDT

PRICE
Price
24h change
Spread
24h high / low

STATE
Regime
MTF bias
Liquidity
Flow
Structure

TCX
Status: VALID / CAUTION / ABSTAIN / SAFE_STOP
Evidence quality
Witness agreement
Historical support
Novelty / OOD indicator

TIMEFRAMES
5m
15m
1h
4h

Buttons:

[ Chart ] [ TCX ]
[ Why? ] [ Regime ]
[ Memory ] [ Witness ]
[ Alert ] [ Favorite ]
[ Live ] [ Home ]

Only show a probability forecast if a future calibrated forecast module actually exists and passes its gates. Never manufacture probability from current heuristic scores.

## 5. Telegram live mode

Live mode edits the same message.

Rules:

- no message spam
- default refresh: 10 s
- pause when user changes view
- session stores active symbol, active view, interval and live state
- live update failure must not kill the bot
- repeated Telegram "message is not modified" is ignored
- show last successful update time
- show STALE if data exceeds freshness limits

## 6. TCX explanation view

The Why? view decomposes evidence, not "reasons to buy".

Sections:

SUPPORTING EVIDENCE
- structure
- liquidity
- order-book flow
- regime
- historical analogues
- independent witness agreement

CONTRADICTING EVIDENCE
- disagreement
- weak modalities
- novelty
- provider conflict
- low historical support

EPISTEMIC STATUS
- OBSERVED
- DERIVED_HEURISTIC
- NOT_IDENTIFIED
- ABSTAIN / SHADOW_ONLY

## 7. What-would-change-my-mind view

This is a first-class TCX product feature.

Display:

CURRENT STATE
- current regime
- structure state
- liquidity state
- flow state

FLIP CONDITIONS
- structure break
- liquidity reversal
- witness disagreement
- regime transition
- data quality degradation
- excessive novelty / OOD

Do not present these as guaranteed price levels unless such a level comes from deterministic existing structure logic.

## 8. TCX Radar

Purpose: identify markets with usable information, not "best trades".

Each asset row:

Symbol
System status
Data quality
Witness agreement
Historical support
Novelty
Regime
State-change intensity

Filters:

- healthy only
- high witness agreement
- sufficient memory support
- low novelty
- regime
- high state change

No ranking labelled "best trade", "top pick" or equivalent.

## 9. Watchlist

Watchlist is a fast multi-asset state board.

Per asset:

Symbol
Price
24h
Regime
MTF bias
Liquidity
TCX status
last material change

Actions:

[ Open ]
[ Compare ]
[ Alerts ]

## 10. Compare mode

Compare up to 4 markets.

Rows:

- regime
- MTF bias
- structure
- liquidity
- flow
- witness agreement
- historical support
- novelty
- data quality
- TCX status

No winner label.

## 11. Alerts v2

Existing one-shot price alert is preserved.

Add TCX-native conditional alerts:

PRICE
- price above / below

STRUCTURE
- break detected
- retest detected
- structure state changes

REGIME
- regime changes

DATA
- stale provider
- provider conflict
- safety state changes
- SAFE_STOP

WITNESS
- agreement rises above threshold
- contradiction rises above threshold

MEMORY
- support becomes sufficient
- novelty exceeds threshold

COMPOSITE
A logical AND expression over supported conditions.

Alert engine requirements:

- cooldown
- debounce
- deduplication
- last-fired fingerprint
- expiration
- enable / disable
- quiet mode
- audit trail

## 12. Forecast lifetime / state lifetime

Any future forecast or inference snapshot gets:

generatedAt
validUntil
stateFingerprint
stateDrift

If current state differs materially from stateFingerprint:

EXPIRED / INVALIDATED

Do not continue showing stale inference as current.

## 13. Conviction history

Track changes in evidence strength over time without converting it into a trade instruction.

Example states:

RISING
STABLE
DECAYING
CONFLICTED

Inputs can include:

- MTL coherence
- witness agreement
- memory support
- novelty
- contradiction score
- regime stability

The algorithm must be deterministic and auditable.

## 14. Disagreement map

Show each research layer independently:

Structure
Dashboard / RIFT
Memory
MTL
Witness
Data Quality

For each:

supportive / neutral / contradictory / unavailable

Never average incompatible epistemic quantities into a fake probability.

## 15. Data Quality / Safety UX

Canonical user-visible statuses:

VALID
CAUTION
ABSTAIN
SAFE_STOP
DATA_STALE
OUT_OF_DISTRIBUTION
INSUFFICIENT_SUPPORT
PROVIDER_CONFLICT

SAFE_STOP is visually dominant.

If the system is not healthy, the UI must explain exactly which gate failed.

## 16. System health screen

Show:

TCX core
Telegram
Binance
OKX
Kraken
state store
episode memory
audit ledger
market fabric
release registry

Metrics:

provider latency
freshness
error rate
active sessions
last successful institutional run
safety state
ledger integrity
release/config fingerprint

## 17. Performance screen

Only show metrics that are actually measured.

Current / future sections:

DATA QUALITY
- provider uptime
- freshness
- failed requests

MEMORY
- episode count
- matured episode count
- continuity rejection count

RESEARCH
- witness agreement distribution
- MTL support distribution
- novelty distribution
- safety-state frequency

FORECASTS
Only after a calibrated forecast engine exists:
- Brier score
- calibration buckets
- coverage
- abstention rate
- horizon metrics

Avoid generic "win rate" as the primary scientific metric.

## 18. Replay UX

Replay existing deterministic PIT infrastructure in Telegram.

Flow:

[ Replay ]
-> choose asset
-> choose recent timestamp
-> show reconstructed state
-> Next
-> Previous

Replay labels must clearly distinguish what TCX knew at that timestamp from information that became available later.

## 19. UI detail modes

SIMPLE
- price
- status
- regime
- MTF bias
- key warning
- chart

ADVANCED
- structure
- liquidity
- flow
- memory
- witness
- MTL

RESEARCH
- provenance
- availableAt
- novelty
- contradiction
- support diagnostics
- audit / PIT metadata

Default: SIMPLE.

## 20. Settings

Persistent per Telegram chat/user:

default symbol
default timeframe
detail mode
live refresh preference
alert quiet mode
timezone
watchlist
notification categories

Never store Telegram bot token or provider secrets in state files.

## 21. Product data contract

Telegram UI should consume one normalized object instead of directly coupling screens to providers.

MarketViewModel:

{
  schemaVersion,
  symbol,
  generatedAt,
  market: {
    price,
    change24hPct,
    bid,
    ask,
    spreadBps,
    high24h,
    low24h,
    quoteVolume
  },
  state: {
    regime,
    mtfBias,
    structure,
    liquidity,
    flow,
    pressure
  },
  evidence: {
    witnessAgreement,
    witnessUsable,
    memorySupport,
    novelty,
    contradiction,
    dataQuality
  },
  safety: {
    status,
    reasons,
    execution,
    action,
    canExecute
  },
  provenance: {
    timestamp,
    availableAt,
    source,
    version
  }
}

Hard invariant:

execution === "SHADOW_ONLY"
action === "ABSTAIN"
canExecute === false

## 22. Callback naming

Use stable namespaces:

home
markets
market:<symbol>
market:<symbol>:refresh
live:<symbol>:on
live:<symbol>:off
tf:<symbol>:<interval>
chart:<symbol>:<interval>
tcx:<symbol>
why:<symbol>
regime:<symbol>
memory:<symbol>
engine:<symbol>
witness:<symbol>
replay:<symbol>
watchlist
favorite:<symbol>:toggle
alerts
alert:<symbol>:new
system
performance
settings

Keep callback data under Telegram limits.

## 23. Code architecture target

Do not keep expanding bot.mjs forever.

Target:

telegram/
  router.mjs
  callbacks.mjs
  session-store.mjs
  view-model.mjs
  keyboards.mjs
  views/
    home.mjs
    market.mjs
    tcx.mjs
    why.mjs
    radar.mjs
    watchlist.mjs
    alerts.mjs
    system.mjs
    performance.mjs

core/
  remains independent of Telegram

The Telegram layer must never become the source of research truth.

## 24. Persistence target

Existing file persistence is acceptable while running one Railway replica.

Future persistent entities:

users
settings
watchlists
alerts
alert_events
ui_sessions
market_snapshots
research_snapshots
system_events

Do not scale Railway replicas while critical mutable state remains a single local-volume JSON file.

## 25. Security / resilience

Required:

- allowed-chat whitelist support
- secret-only bot token
- rate limiting
- callback validation
- symbol allowlist
- timeout on provider calls
- provider circuit breaker
- retry with capped backoff
- dedupe updates
- safe parsing of commands
- fail-closed safety state
- audit log
- no token / secret logging

## 26. Implementation order

P0
- canonical /start command center
- normalized MarketViewModel
- market card redesign
- navigation consistency
- SIMPLE / ADVANCED / RESEARCH mode foundations

P1
- Why?
- What would change my mind?
- System status
- structured safety explanations

P2
- TCX Radar
- Watchlist state board
- Compare mode

P3
- Alerts v2
- cooldown / debounce / dedupe
- composite conditions

P4
- Conviction history
- Disagreement map
- forecast/state lifetime

P5
- Replay UI
- Performance UI
- calibration UI when real forecasts exist

P6
- modularize bot.mjs into telegram/* without altering core invariants

## 27. Definition of done

The Telegram product is "ready" when:

- /start requires no command knowledge
- the user can reach any important state within <= 3 taps
- live mode edits one message
- every claim has a visible epistemic status
- every unsafe/weak-data condition fails closed
- ABSTAIN is a normal first-class state
- provider conflict is visible
- stale data is visible
- no UI path implies order execution
- callbacks are deterministic
- core remains independent of Telegram
- state survives Railway restart where persistence is promised
- tests cover keyboards, callbacks, state transitions, alerts, safety explanations and stale-data behavior

This file is the canonical Telegram/product contract for parallel TCX development.
