from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import requests

SYMBOL = "BTCUSDT"
EMA_FAST = 20
EMA_SLOW = 50
PIVOT_WINDOW = 2
RETEST_TOL = 0.0012
STOP_BUFFER = 0.0005
MIN_RR = 2.0
BINANCE_BASES = ["https://data-api.binance.vision", "https://api.binance.com"]
TIMEFRAMES = {"5m": 260, "15m": 260, "1h": 260, "4h": 260}


@dataclass
class Candle:
    t: int
    o: float
    h: float
    l: float
    c: float
    v: float


@dataclass
class Pivot:
    i: int
    price: float
    kind: str


def ema(values: List[float], period: int) -> List[float]:
    if not values:
        return []
    a = 2.0 / (period + 1.0)
    out = [values[0]]
    for value in values[1:]:
        out.append(a * value + (1.0 - a) * out[-1])
    return out


def pivots(candles: List[Candle], window: int = PIVOT_WINDOW) -> List[Pivot]:
    out: List[Pivot] = []
    for i in range(window, len(candles) - window):
        c = candles[i]
        hs = [candles[j].h for j in range(i-window, i+window+1)]
        ls = [candles[j].l for j in range(i-window, i+window+1)]
        if c.h == max(hs) and hs.count(c.h) == 1:
            out.append(Pivot(i, c.h, "H"))
        if c.l == min(ls) and ls.count(c.l) == 1:
            out.append(Pivot(i, c.l, "L"))
    return sorted(out, key=lambda x: x.i)


def market_trend(candles: List[Candle]) -> str:
    ps = pivots(candles)
    highs = [p for p in ps if p.kind == "H"][-2:]
    lows = [p for p in ps if p.kind == "L"][-2:]
    if len(highs) < 2 or len(lows) < 2:
        return "NEUTRAL"
    if highs[-1].price > highs[-2].price and lows[-1].price > lows[-2].price:
        return "BULLISH"
    if highs[-1].price < highs[-2].price and lows[-1].price < lows[-2].price:
        return "BEARISH"
    return "NEUTRAL"


def bias_score(trends: Dict[str, str]) -> int:
    score = 0
    for tf, weight in (("4h", 2), ("1h", 2), ("15m", 1)):
        if trends[tf] == "BULLISH":
            score += weight
        elif trends[tf] == "BEARISH":
            score -= weight
    return score


def nearest_levels(candles: List[Candle], price: float) -> Tuple[Optional[float], Optional[float]]:
    ps = pivots(candles[-120:])
    lows = sorted({p.price for p in ps if p.kind == "L" and p.price < price}, reverse=True)
    highs = sorted({p.price for p in ps if p.kind == "H" and p.price > price})
    return (lows[0] if lows else None, highs[0] if highs else None)


def last_structure(candles: List[Candle]) -> Dict[str, Optional[float]]:
    ps = pivots(candles[-100:])
    highs = [p.price for p in ps if p.kind == "H"]
    lows = [p.price for p in ps if p.kind == "L"]
    out: Dict[str, Optional[float]] = {
        "last_high": None,
        "prev_high": None,
        "last_low": None,
        "prev_low": None,
    }
    if highs:
        out["last_high"] = highs[-1]
    if len(highs) > 1:
        out["prev_high"] = highs[-2]
    if lows:
        out["last_low"] = lows[-1]
    if len(lows) > 1:
        out["prev_low"] = lows[-2]
    return out


def find_break_retest(c: List[Candle], side: str) -> Optional[dict]:
    n = len(c)
    if n < 40:
        return None

    for b in range(max(20, n - 9), n - 1):
        history = c[max(0, b - 16):b]
        if len(history) < 10:
            continue

        if side == "LONG":
            level = max(x.h for x in history)
            if c[b].c <= level:
                continue
            if (c[b].c - level) / level < 0.00015:
                continue

            for r in range(b + 1, min(n, b + 7)):
                touched = c[r].l <= level * (1 + RETEST_TOL)
                held = c[r].c >= level * (1 - RETEST_TOL)
                if touched and held and c[-1].c >= level:
                    return {
                        "side": side,
                        "level": level,
                        "break_i": b,
                        "retest_i": r,
                        "retest_low": c[r].l,
                    }
        else:
            level = min(x.l for x in history)
            if c[b].c >= level:
                continue
            if (level - c[b].c) / level < 0.00015:
                continue

            for r in range(b + 1, min(n, b + 7)):
                touched = c[r].h >= level * (1 - RETEST_TOL)
                held = c[r].c <= level * (1 + RETEST_TOL)
                if touched and held and c[-1].c <= level:
                    return {
                        "side": side,
                        "level": level,
                        "break_i": b,
                        "retest_i": r,
                        "retest_high": c[r].h,
                    }

    return None


def rr(entry: float, stop: float, target: float, side: str) -> float:
    risk = (entry - stop) if side == "LONG" else (stop - entry)
    reward = (target - entry) if side == "LONG" else (entry - target)
    if risk <= 0 or reward <= 0:
        return 0.0
    return reward / risk


def evaluate(data: Dict[str, List[Candle]]) -> dict:
    trends = {tf: market_trend(candles) for tf, candles in data.items()}
    score = bias_score(trends)
    c5 = data["5m"]
    price = c5[-1].c
    closes = [x.c for x in c5]
    e20 = ema(closes, EMA_FAST)[-1]
    e50 = ema(closes, EMA_SLOW)[-1]
    support, resistance = nearest_levels(data["15m"], price)
    structure = last_structure(c5)

    reasons = [
        f"4H={trends['4h']}",
        f"1H={trends['1h']}",
        f"15m={trends['15m']}",
        f"5m={trends['5m']}",
        f"Bias-Score={score}",
        f"EMA20={e20:.2f}",
        f"EMA50={e50:.2f}",
    ]

    long_pattern = find_break_retest(c5, "LONG")
    short_pattern = find_break_retest(c5, "SHORT")

    if long_pattern and score >= 1 and price >= min(e20, e50):
        entry = price
        swing_lows = [p.price for p in pivots(c5[-80:]) if p.kind == "L" and p.price < entry]
        base_stop = max(swing_lows[-3:] or [long_pattern["retest_low"]])
        base_stop = min(base_stop, long_pattern["retest_low"])
        stop = base_stop * (1 - STOP_BUFFER)

        if resistance and resistance > entry:
            target = resistance
            ratio = rr(entry, stop, target, "LONG")
            if ratio >= MIN_RR:
                return {
                    "decision": "LONG SETUP",
                    "side": "LONG",
                    "entry": entry,
                    "stop": stop,
                    "target": target,
                    "rr": ratio,
                    "breakout_level": long_pattern["level"],
                    "support": support,
                    "resistance": resistance,
                    "trends": trends,
                    "bias_score": score,
                    "ema20": e20,
                    "ema50": e50,
                    "structure": structure,
                    "reasons": reasons + [
                        "Break + Candle-Close + Retest erkannt",
                        f"CRV={ratio:.2f} >= {MIN_RR}",
                    ],
                    "warning": "Technisches Signal, keine Kursgarantie. Kein automatischer News-Filter.",
                }
            reasons.append(f"Long abgelehnt: CRV {ratio:.2f} < {MIN_RR}")
        else:
            reasons.append("Long abgelehnt: kein klares 15m-Ziel oberhalb")

    if short_pattern and score <= -1 and price <= max(e20, e50):
        entry = price
        swing_highs = [p.price for p in pivots(c5[-80:]) if p.kind == "H" and p.price > entry]
        base_stop = min(swing_highs[-3:] or [short_pattern["retest_high"]])
        base_stop = max(base_stop, short_pattern["retest_high"])
        stop = base_stop * (1 + STOP_BUFFER)

        if support and support < entry:
            target = support
            ratio = rr(entry, stop, target, "SHORT")
            if ratio >= MIN_RR:
                return {
                    "decision": "SHORT SETUP",
                    "side": "SHORT",
                    "entry": entry,
                    "stop": stop,
                    "target": target,
                    "rr": ratio,
                    "breakout_level": short_pattern["level"],
                    "support": support,
                    "resistance": resistance,
                    "trends": trends,
                    "bias_score": score,
                    "ema20": e20,
                    "ema50": e50,
                    "structure": structure,
                    "reasons": reasons + [
                        "Breakdown + Candle-Close + Retest erkannt",
                        f"CRV={ratio:.2f} >= {MIN_RR}",
                    ],
                    "warning": "Technisches Signal, keine Kursgarantie. Kein automatischer News-Filter.",
                }
            reasons.append(f"Short abgelehnt: CRV {ratio:.2f} < {MIN_RR}")
        else:
            reasons.append("Short abgelehnt: kein klares 15m-Ziel unterhalb")

    if long_pattern:
        reasons.append("Long-Muster vorhanden, aber Filter nicht komplett erfuellt")
    if short_pattern:
        reasons.append("Short-Muster vorhanden, aber Filter nicht komplett erfuellt")
    if not long_pattern and not short_pattern:
        reasons.append("Kein frischer Break + Retest in den letzten 5m-Kerzen")

    return {
        "decision": "WAIT / NO TRADE",
        "side": None,
        "entry": None,
        "stop": None,
        "target": None,
        "rr": None,
        "breakout_level": None,
        "support": support,
        "resistance": resistance,
        "trends": trends,
        "bias_score": score,
        "ema20": e20,
        "ema50": e50,
        "structure": structure,
        "reasons": reasons,
        "warning": "Technisches Regelwerk; kein automatischer News-Filter und keine echten Orders.",
    }


class Market:
    def __init__(self):
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": "JonasTradingSignalBot/0.3"})

    def get(self, path: str, params: dict):
        last = None
        for base in BINANCE_BASES:
            try:
                r = self.s.get(base + path, params=params, timeout=12)
                r.raise_for_status()
                return r.json()
            except Exception as e:
                last = e
        raise RuntimeError(f"Marktdaten nicht erreichbar: {last}")

    def candles(self, interval: str, limit: int) -> List[Candle]:
        raw = self.get(
            "/api/v3/klines",
            {"symbol": SYMBOL, "interval": interval, "limit": limit},
        )
        rows = [
            Candle(
                int(k[0]),
                float(k[1]),
                float(k[2]),
                float(k[3]),
                float(k[4]),
                float(k[5]),
            )
            for k in raw
        ]
        return rows[:-1]

    def all(self) -> Dict[str, List[Candle]]:
        return {tf: self.candles(tf, limit) for tf, limit in TIMEFRAMES.items()}


def fmt(x: Optional[float]) -> str:
    return "—" if x is None else f"{x:,.2f}"


def markdown(result: dict) -> str:
    s = result["structure"]
    rr_text = "—" if result["rr"] is None else f"{result['rr']:.2f}"

    lines = [
        "# BTC Trading Signal Bot",
        "",
        f"**Zeit (UTC):** {datetime.now(timezone.utc).isoformat(timespec='seconds')}",
        f"**Entscheidung:** `{result['decision']}`",
        "",
        "## Multi-Timeframe",
        f"- 4H: **{result['trends']['4h']}**",
        f"- 1H: **{result['trends']['1h']}**",
        f"- 15m: **{result['trends']['15m']}**",
        f"- 5m: **{result['trends']['5m']}**",
        f"- Bias-Score: **{result['bias_score']}**",
        "",
        "## Levels",
        f"- 15m Support: **{fmt(result['support'])}**",
        f"- 15m Resistance: **{fmt(result['resistance'])}**",
        f"- EMA20 (5m): **{fmt(result['ema20'])}**",
        f"- EMA50 (5m): **{fmt(result['ema50'])}**",
        f"- letztes Swing High: **{fmt(s['last_high'])}**",
        f"- letztes Swing Low: **{fmt(s['last_low'])}**",
        "",
        "## Trade-Plan",
        f"- Seite: **{result['side'] or '—'}**",
        f"- Break-Level: **{fmt(result['breakout_level'])}**",
        f"- Entry: **{fmt(result['entry'])}**",
        f"- Stop: **{fmt(result['stop'])}**",
        f"- Ziel: **{fmt(result['target'])}**",
        f"- CRV: **{rr_text}**",
        "",
        "## Regelpruefung",
    ]

    lines += [f"- {r}" for r in result["reasons"]]
    lines += [
        "",
        "## Sicherheitsgrenze",
        f"- {result['warning']}",
        "- **Keine echten Orders.**",
        "",
    ]
    return "\n".join(lines)


def _telegram_chat_id(token: str) -> Optional[str]:
    configured = os.getenv("TELEGRAM_CHAT_ID", "").strip()
    if configured:
        return configured

    try:
        r = requests.get(
            f"https://api.telegram.org/bot{token}/getUpdates",
            timeout=10,
        )
        if r.status_code != 200:
            print(f"Telegram getUpdates fehlgeschlagen (HTTP {r.status_code}).")
            return None
        payload = r.json()
    except Exception:
        print("Telegram getUpdates technisch fehlgeschlagen.")
        return None
    updates = payload.get("result", [])

    for update in reversed(updates):
        msg = update.get("message") or update.get("edited_message") or {}
        chat = msg.get("chat") or {}
        chat_id = chat.get("id")
        if chat_id is not None:
            return str(chat_id)

    return None


def send_telegram(result: dict) -> None:
    raw = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    token = ""
    for line in raw.splitlines():
        compact = line.replace(" ", "").strip()
        if ":" in compact and compact.split(":", 1)[0].isdigit():
            token = compact
            break
    if not token:
        return

    chat = _telegram_chat_id(token)
    if not chat:
        print("Telegram: noch kein Chat gefunden. Oeffne den Bot in Telegram und sende /start.")
        return

    manual_test = (os.getenv("GITHUB_EVENT_NAME", "") == "workflow_dispatch" or os.getenv("FORCE_TELEGRAM_TEST", "") == "1")
    is_signal = result["decision"] in ("LONG SETUP", "SHORT SETUP")

    if not is_signal and not manual_test:
        return

    rr_text = "—" if result["rr"] is None else f"{result['rr']:.2f}"
    heading = "TEST / AKTUELLER STATUS" if manual_test and not is_signal else result["decision"]

    text = (
        f"BTC SIGNALBOT — {heading}\n"
        f"Status: {result['decision']}\n"
        f"Entry: {fmt(result['entry'])}\n"
        f"Stop: {fmt(result['stop'])}\n"
        f"Target: {fmt(result['target'])}\n"
        f"CRV: {rr_text}\n"
        f"4H/1H/15m/5m: "
        f"{result['trends']['4h']} / {result['trends']['1h']} / "
        f"{result['trends']['15m']} / {result['trends']['5m']}\n"
        "Paper-Signal nach festem Regelwerk; keine automatische Order."
    )

    try:
        r = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat, "text": text},
            timeout=10,
        )
        if r.status_code == 200:
            print("Telegram-Nachricht erfolgreich gesendet.")
        else:
            print(f"Telegram sendMessage fehlgeschlagen (HTTP {r.status_code}).")
    except Exception:
        print("Telegram sendMessage technisch fehlgeschlagen.")


def self_test() -> None:
    vals = [1, 2, 3, 4, 5]
    assert len(ema(vals, 3)) == 5
    assert abs(rr(100, 90, 120, "LONG") - 2.0) < 1e-9
    assert abs(rr(100, 110, 80, "SHORT") - 2.0) < 1e-9

    xs = [
        Candle(0,10,11,9,10,1),
        Candle(1,10,12,9.5,11,1),
        Candle(2,11,15,10,14,1),
        Candle(3,14,13,9.8,11,1),
        Candle(4,11,12,9.7,10,1),
    ]
    assert any(p.kind == "H" and p.i == 2 for p in pivots(xs, 2))
    print("Self-test OK")


def main() -> int:
    if "--self-test" in sys.argv:
        self_test()
        return 0

    data = Market().all()
    result = evaluate(data)
    md = markdown(result)

    print(md)

    summary = os.getenv("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(md + "\n")

    with open("latest_status.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    send_telegram(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
