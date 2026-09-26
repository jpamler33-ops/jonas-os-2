#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/jpamler33-ops/jonas-os-2.git"
APP="/opt/btc-signalbot"

sudo apt-get update
sudo apt-get install -y git python3 python3-venv

if [ ! -d "$APP/.git" ]; then
  sudo git clone "$REPO" "$APP"
else
  sudo git -C "$APP" pull --ff-only
fi

sudo chown -R ubuntu:ubuntu "$APP"
cd "$APP"
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

if [ ! -f .env ]; then
  echo "TELEGRAM_BOT_TOKEN=PASTE_YOUR_TOKEN_HERE" > .env
  chmod 600 .env
  echo
  echo "WICHTIG: $APP/.env bearbeiten und Telegram-Token einsetzen."
fi

sudo cp deploy/btc-live-bot.service /etc/systemd/system/btc-live-bot.service
sudo systemctl daemon-reload
sudo systemctl enable btc-live-bot.service

echo
echo "Nach dem Token-Eintrag starten mit:"
echo "sudo systemctl restart btc-live-bot"
echo "Logs:"
echo "journalctl -u btc-live-bot -f"
