# BTC Trading Signal Bot v0.3

Regelbasierter **Paper-/Signal-Bot** fuer das gemeinsam definierte Trading-System.

## System
- 4H = Kontext
- 1H = Marktstruktur
- 15m = Setup / Support / Resistance
- 5m = Entry-Ausloeser
- HH / HL / LH / LL ueber Swing-Pivots
- Breakout/Breakdown nur nach geschlossener Kerze
- Retest muss halten bzw. scheitern
- EMA20 / EMA50 nur als Zusatzfilter
- Signal nur bei CRV >= 2.0
- keine echten Orders

## Ausgabe
Alle ca. 5 Minuten schreibt GitHub Actions eine Summary mit:
- 4H / 1H / 15m / 5m Trend
- Bias-Score
- 15m Support / Resistance
- EMA20 / EMA50
- letztes Swing High / Low
- LONG SETUP / SHORT SETUP / WAIT
- Entry, Stop, Ziel, CRV
- Begruendung, welche Regeln erfuellt oder abgelehnt wurden

## Telegram optional
Repository-Secrets:
- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID

Ohne diese Secrets laeuft der Bot trotzdem. Telegram wird nur bei einem bestaetigten LONG/SHORT-Setup gesendet.

## Sicherheitsgrenze
Der Bot erzeugt nur technische Paper-Signale. Er fuehrt keine Trades aus und hat aktuell keinen automatischen News-/Makro-Kalenderfilter.
