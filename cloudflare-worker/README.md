# Cloudflare Live Radar

This folder is the free, always-on Cloudflare version of the BTC radar.

## Cloudflare import settings
- Repository: `jpamler33-ops/jonas-os-2`
- Root directory: `cloudflare-worker`
- Build command: leave empty
- Deploy command: `npx wrangler deploy`
- Production branch: `main`

After the first deployment, add this as an encrypted secret in Cloudflare:
- `TELEGRAM_BOT_TOKEN`

Optional:
- `TELEGRAM_CHAT_ID`

Then open:
- `https://<your-worker>.workers.dev/start`

You should receive a Telegram message saying that the live radar is online.

## Endpoints
- `/start` starts/reconnects the Binance WebSocket
- `/status` shows current stored context/state
- `/health` health check

## Architecture
Cloudflare Durable Object keeps the BTCUSDT 1m Binance WebSocket alive and stores alert state.
A 5-minute Cron trigger refreshes 5m/15m/1h/4h context and reconnects if needed.
GitHub Actions remains the independent backup scanner.
