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
- `/structure BTC` restores the legacy 4H / 1H / 15m / 5m structure concept as a DERIVED research layer.
- HH / HL / LH / LL and break/retest states are descriptive heuristics, not causal mechanism truth.
- Active candles may be shown visually, but all structure/EMA/pivot/break-retest calculations use only candles whose close time is <= availableAt.
- Execution remains ABSTAIN / SHADOW_ONLY.
