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
Fuer iPhone-Push reicht jetzt ein Repository-Secret:
- TELEGRAM_BOT_TOKEN

Nach dem Erstellen des Telegram-Bots einmal den Bot-Chat oeffnen und **/start** senden. Der Bot erkennt deine Chat-ID dann automatisch.

Bei normalen 5-Minuten-Laeufen wird Telegram nur bei einem bestaetigten LONG/SHORT-Setup gesendet. Wenn du den GitHub-Workflow manuell startest, sendet er einmal den aktuellen Status als Testnachricht.

## Sicherheitsgrenze
Der Bot erzeugt nur technische Paper-Signale. Er fuehrt keine Trades aus und hat aktuell keinen automatischen News-/Makro-Kalenderfilter.
