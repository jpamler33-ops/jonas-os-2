# TCX Telegram · Railway

Telegram Live-Market UI for TCX v2. This deployment surface is **SHADOW_ONLY** and contains no order execution path.

## Railway

1. Deploy this GitHub repository on Railway.
2. Set `TCX_TELEGRAM_BOT_TOKEN` in Railway Variables.
3. Keep replicas at **1** when using Telegram long polling.
4. Deploy and send `/start` to the bot.

Optional variables:

- `TCX_TELEGRAM_REFRESH_MS=10000` (minimum 5000)
- `TCX_TELEGRAM_SYMBOLS=BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,DOGEUSDT,ADAUSDT,LINKUSDT`
- `TCX_TELEGRAM_ALLOWED_CHATS=123456789` to restrict access
- `TCX_BINANCE_REST_BASE=https://api.binance.com`

Health endpoint: `/health`

## Safety / epistemics

- Market data is OBSERVED from Binance REST.
- The Telegram TCX card does not promote simple market telemetry to causal mechanism truth.
- Trading action remains `ABSTAIN / SHADOW_ONLY`.
