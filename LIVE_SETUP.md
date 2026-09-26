# LIVE-RADAR – kostenlose 24/7 Version

## Was diese Version macht
- Binance BTCUSDT WebSocket dauerhaft offen
- Live-Fruehwarnungen zwischen den 5m-Candles
- RADAR -> PREPARE -> GET READY -> BREAK LAEUFT
- 5m-Close bleibt Pflicht fuer bestaetigte Breakouts
- Retest-Touch Warnung
- DO NOT CHASE Warnung
- Fast-Market Warnung ueber 1m Range + Volumen
- 4H / 1H / 15m / 5m Regelwerk aus bot.py
- Telegram
- Makro-Lock: offizielle BLS-Termine + FOMC-Entscheidungen
- GitHub Actions bleibt als Backup bestehen
- keine Echtgeldorders

## Oracle Always-Free VM
Empfehlung: Ubuntu VM erstellen. Danach per SSH anmelden und:

```bash
git clone https://github.com/jpamler33-ops/jonas-os-2.git
cd jonas-os-2
chmod +x deploy/install_oracle.sh
./deploy/install_oracle.sh
```

Danach:

```bash
sudo nano /opt/btc-signalbot/.env
```

Dort nur:

```
TELEGRAM_BOT_TOKEN=DEIN_NEUER_TOKEN
```

speichern und:

```bash
sudo systemctl restart btc-live-bot
sudo systemctl status btc-live-bot
journalctl -u btc-live-bot -f
```

## Wichtig
Das System ist ein regelbasierter Signal-/Paper-Bot. Es fuehrt keine Orders aus. Live-Warnungen vor einem 5m-Close sind nur Vorbereitung; ein Entry wird erst nach den definierten Bestaetigungsregeln freigegeben.
