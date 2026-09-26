from __future__ import annotations

import json
import os
import statistics
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import websocket

import bot as core
from macro_guard import macro_lock_status

WS_URL = "wss://stream.binance.com:9443/ws/btcusdt@kline_1m"
LIVE_STATE_FILE = Path("live_state.json")

RADAR = 0.0060
PREPARE = 0.0035
GET_READY = 0.0015
CHASE_DISTANCE = 0.0020
RETEST_TOUCH = core.RETEST_TOL
FAST_1M_RANGE = 0.0025
FAST_VOLUME_RATIO = 2.0
HEARTBEAT_SECONDS = 12 * 60 * 60


def load_state() -> dict:
    try:
        return json.loads(LIVE_STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(state: dict) -> None:
    LIVE_STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def telegram_token() -> str:
    raw = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    for line in raw.splitlines():
        compact = line.replace(" ", "").strip()
        if ":" in compact and compact.split(":", 1)[0].isdigit():
            return compact
    return ""


def send_text(text: str) -> bool:
    token = telegram_token()
    if not token:
        return False
    chat = core._telegram_chat_id(token)
    if not chat:
        return False
    try:
        r = core.requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat, "text": text},
            timeout=10,
        )
        return r.status_code == 200
    except Exception:
        return False


def fmt_pct(x: float) -> str:
    return f"{x * 100:.2f}%"


def next_5m_seconds(ts_ms: int) -> int:
    sec = ts_ms // 1000
    next_close = ((sec // 300) + 1) * 300
    return max(0, int(next_close - sec))


def alert_once(state: dict, key: str, text: str, cooldown: int = 0) -> None:
    now = int(time.time())
    sent = state.setdefault("sent", {})
    last = int(sent.get(key, 0) or 0)
    if last and (cooldown <= 0 or now - last < cooldown):
        return
    if send_text(text):
        sent[key] = now
        save_state(state)


def stage_key(stage: str, side: str, level: float) -> str:
    bucket = int(round(level / 25.0) * 25)
    return f"{stage}|{side}|{bucket}"


def current_direction(context: dict, price: float) -> tuple[Optional[str], Optional[float], Optional[float]]:
    score = context.get("bias_score", 0)
    resistance = context.get("resistance")
    support = context.get("support")
    if score >= 1 and isinstance(resistance, (int, float)):
        return "LONG", float(resistance), (float(resistance) - price) / price
    if score <= -1 and isinstance(support, (int, float)):
        return "SHORT", float(support), (price - float(support)) / price
    return None, None, None


def refresh_context(state: dict, reason: str) -> tuple[dict, dict]:
    data = core.Market().all()
    raw = core.evaluate(data)
    lifecycle = core.apply_state_logic(raw, data, state.setdefault("core_state", {}))

    macro = macro_lock_status()
    lifecycle["macro"] = macro

    if macro.get("active") and lifecycle.get("decision") in (
        "LONG SETUP",
        "SHORT SETUP",
        "PREPARE LONG",
        "PREPARE SHORT",
        "RETEST WATCH LONG",
        "RETEST WATCH SHORT",
    ):
        e = macro.get("event") or {}
        lifecycle["decision"] = "MACRO LOCK"
        lifecycle["stage"] = "NO NEW ENTRY"
        lifecycle["action"] = "Keinen neuen Trade starten. Erst nach dem Makro-Fenster neu bewerten."
        lifecycle["warning"] = f"{e.get('name', 'High-impact event')} in/seit {e.get('minutes', '?')} Min."

    key = core.alert_key(lifecycle)
    if key != state.get("last_core_alert_key") and lifecycle.get("decision") != "WAIT / NO TRADE":
        state["last_core_alert_key"] = key
        lifecycle["_notify"] = True
        core.send_telegram(lifecycle)
    else:
        lifecycle["_notify"] = False

    core.update_state_after_result(lifecycle, state.setdefault("core_state", {}), data)
    state["context"] = {
        "result": raw,
        "refreshed_at": int(time.time()),
        "reason": reason,
    }
    save_state(state)
    return raw, data


def maybe_macro_warning(state: dict) -> None:
    status = macro_lock_status()
    event = status.get("event")
    nxt = status.get("next_event")

    if status.get("active") and event:
        key = f"macro-lock|{event.get('name')}|{event.get('when_utc')}"
        alert_once(
            state,
            key,
            (
                "BTC — MACRO LOCK\n"
                f"{event.get('name')} ({event.get('source')})\n"
                f"Zeit: {event.get('when_utc')}\n"
                "AKTION: Keine neuen Entries. Technische Setups nur beobachten und nach dem Lock neu bewerten."
            ),
            cooldown=3600,
        )
    elif nxt and 0 < int(nxt.get("minutes", 99999)) <= 120:
        key = f"macro-early|{nxt.get('name')}|{nxt.get('when_utc')}"
        alert_once(
            state,
            key,
            (
                "BTC — MAKRO VORWARNUNG\n"
                f"{nxt.get('name')} ({nxt.get('source')})\n"
                f"In ca. {nxt.get('minutes')} Minuten.\n"
                "AKTION: Offene technische Setups im Blick behalten; 30 Min. vorher startet der Entry-Lock."
            ),
            cooldown=3600,
        )


def live_radar(state: dict, context: dict, k: dict) -> None:
    price = float(k["c"])
    high = float(k["h"])
    low = float(k["l"])
    volume = float(k["v"])
    ts_ms = int(k["T"])
    countdown = next_5m_seconds(ts_ms)

    side, level, signed_dist = current_direction(context, price)
    if side and level and signed_dist is not None:
        crossed = signed_dist <= 0
        dist = abs(signed_dist)

        if not crossed:
            if dist <= GET_READY:
                stage = "GET READY"
            elif dist <= PREPARE:
                stage = "PREPARE"
            elif dist <= RADAR:
                stage = "RADAR"
            else:
                stage = ""

            if stage:
                key = stage_key(stage, side, level)
                alert_once(
                    state,
                    key,
                    (
                        f"BTC — {stage} {side}\n"
                        f"Preis: {price:,.2f}\n"
                        f"Relevantes Level: {level:,.2f}\n"
                        f"Abstand: {dist*100:.2f}%\n"
                        f"Naechster 5m-Close in ca. {countdown//60}:{countdown%60:02d} Min.\n"
                        "AKTION: Noch kein Entry. Auf Candle-Close und danach Retest warten."
                    ),
                )

        else:
            key = stage_key("BREAK IN PROGRESS", side, level)
            alert_once(
                state,
                key,
                (
                    f"BTC — {side} BREAK LAEUFT\n"
                    f"Live-Preis: {price:,.2f}\n"
                    f"Break-Level: {level:,.2f}\n"
                    f"5m-Close in ca. {countdown//60}:{countdown%60:02d} Min.\n"
                    "AKTION: Nicht vor dem Close springen. Break ist intrabar noch nicht bestaetigt."
                ),
            )
            extension = abs(price - level) / level
            if extension >= CHASE_DISTANCE:
                alert_once(
                    state,
                    stage_key("DO NOT CHASE", side, level),
                    (
                        f"BTC — DO NOT CHASE {side}\n"
                        f"Preis bereits {extension*100:.2f}% hinter dem Break-Level.\n"
                        "AKTION: Nicht hinterherlaufen. Retest oder neues Setup abwarten."
                    ),
                )

    armed_side = state.get("core_state", {}).get("watch_side")
    armed_level = state.get("core_state", {}).get("watch_level")
    armed_stage = state.get("core_state", {}).get("last_stage", "")
    if armed_stage in ("ARMED LONG", "ARMED SHORT") and isinstance(armed_level, (int, float)):
        touch = abs(price - armed_level) / armed_level <= RETEST_TOUCH
        if touch:
            side2 = "LONG" if armed_stage == "ARMED LONG" else "SHORT"
            alert_once(
                state,
                stage_key("RETEST TOUCH", side2, armed_level),
                (
                    f"BTC — RETEST TOUCH {side2}\n"
                    f"Live-Preis: {price:,.2f}\n"
                    f"Retest-Level: {armed_level:,.2f}\n"
                    f"5m-Close in ca. {countdown//60}:{countdown%60:02d} Min.\n"
                    "AKTION: Jetzt beobachten. Noch auf Bestaetigung warten."
                ),
            )

    one_min_range = (high - low) / price if price else 0.0
    vols = state.get("closed_1m_volumes", [])
    median = statistics.median(vols[-30:]) if len(vols) >= 10 else 0.0
    ratio = volume / median if median > 0 else 0.0
    minute_bucket = ts_ms // 60000
    if one_min_range >= FAST_1M_RANGE and ratio >= FAST_VOLUME_RATIO:
        alert_once(
            state,
            f"fast|{minute_bucket}",
            (
                "BTC — FAST MARKET\n"
                f"Aktuelle 1m-Range: {one_min_range*100:.2f}%\n"
                f"Live-Volumen: ca. {ratio:.1f}x Median\n"
                "AKTION: Kein FOMO-Entry. Close + Struktur + Retest abwarten."
            ),
        )


def run() -> None:
    state = load_state()
    context, _ = refresh_context(state, "startup")
    maybe_macro_warning(state)

    alert_once(
        state,
        "live-online",
        "BTC LIVE-RADAR ONLINE\nLive-WebSocket aktiv. 5m-Close bleibt Pflicht fuer bestaetigte Setups.",
        cooldown=24 * 60 * 60,
    )

    def on_message(ws, message: str) -> None:
        nonlocal context
        try:
            payload = json.loads(message)
            k = payload.get("k") or {}
            if not k:
                return

            live_radar(state, context, k)

            now = int(time.time())
            last_hb = int(state.get("last_live_heartbeat", 0) or 0)
            if now - last_hb >= HEARTBEAT_SECONDS:
                if send_text("BTC LIVE-RADAR — SYSTEM OK\nWebSocket laeuft und ueberwacht weiter."):
                    state["last_live_heartbeat"] = now
                    save_state(state)

            if bool(k.get("x")):
                vols = state.setdefault("closed_1m_volumes", [])
                vols.append(float(k["v"]))
                del vols[:-60]
                save_state(state)
                maybe_macro_warning(state)

                close_dt = datetime.fromtimestamp(int(k["T"]) / 1000, tz=timezone.utc)
                if (close_dt.minute + 1) % 5 == 0:
                    time.sleep(2)
                    context, _ = refresh_context(state, "5m_close")
        except Exception as exc:
            print(f"live message error: {type(exc).__name__}")

    def on_error(ws, error) -> None:
        print("websocket error; reconnecting")

    def on_close(ws, status_code, msg) -> None:
        print("websocket closed; reconnecting")

    while True:
        try:
            app = websocket.WebSocketApp(
                WS_URL,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close,
            )
            app.run_forever(ping_interval=20, ping_timeout=10)
        except Exception:
            pass
        time.sleep(5)


if __name__ == "__main__":
    run()
