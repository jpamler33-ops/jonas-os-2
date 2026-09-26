from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from zoneinfo import ZoneInfo

import requests
from icalendar import Calendar

BLS_ICS = "https://www.bls.gov/schedule/news_release/bls.ics"
ET = ZoneInfo("America/New_York")

# Offizieller FOMC-Zeitplan; Statement bei regulaeren Sitzungen am 2. Tag um 14:00 ET.
FOMC_DECISIONS = [
    (2026, 10, 28),
    (2026, 12, 9),
    (2027, 1, 27),
    (2027, 3, 17),
    (2027, 4, 28),
    (2027, 6, 9),
    (2027, 7, 28),
    (2027, 9, 15),
    (2027, 10, 27),
    (2027, 12, 8),
]

HIGH_IMPACT_BLS = (
    "Consumer Price Index",
    "Employment Situation",
    "Producer Price Index",
    "Employment Cost Index",
)

PRE_MINUTES = 30
POST_MINUTES = 15
_CACHE: dict = {"fetched_at": None, "events": []}


@dataclass
class MacroEvent:
    name: str
    when_utc: datetime
    source: str


def _as_aware(value) -> Optional[datetime]:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=ET)
        return value
    return None


def _load_bls_events() -> List[MacroEvent]:
    now = datetime.now(timezone.utc)
    fetched = _CACHE.get("fetched_at")
    if isinstance(fetched, datetime) and now - fetched < timedelta(hours=6):
        return list(_CACHE.get("events", []))

    try:
        r = requests.get(BLS_ICS, timeout=12, headers={"User-Agent": "BTCSignalBot/1.0"})
        r.raise_for_status()
        cal = Calendar.from_ical(r.content)
        events: List[MacroEvent] = []
        for component in cal.walk("VEVENT"):
            summary = str(component.get("summary") or "")
            if not any(key.lower() in summary.lower() for key in HIGH_IMPACT_BLS):
                continue
            dt = _as_aware(component.decoded("dtstart"))
            if not dt:
                continue
            events.append(
                MacroEvent(
                    name=summary,
                    when_utc=dt.astimezone(timezone.utc),
                    source="BLS",
                )
            )
        _CACHE["fetched_at"] = now
        _CACHE["events"] = events
        return events
    except Exception:
        return list(_CACHE.get("events", []))


def _fomc_events() -> List[MacroEvent]:
    out: List[MacroEvent] = []
    for y, m, d in FOMC_DECISIONS:
        local = datetime(y, m, d, 14, 0, tzinfo=ET)
        out.append(MacroEvent("FOMC policy statement", local.astimezone(timezone.utc), "Federal Reserve"))
    return out


def upcoming_events(now: Optional[datetime] = None, horizon_hours: int = 48) -> List[MacroEvent]:
    now = now or datetime.now(timezone.utc)
    end = now + timedelta(hours=horizon_hours)
    events = _load_bls_events() + _fomc_events()
    return sorted([e for e in events if now - timedelta(hours=1) <= e.when_utc <= end], key=lambda e: e.when_utc)


def macro_lock_status(now: Optional[datetime] = None) -> dict:
    now = now or datetime.now(timezone.utc)
    events = upcoming_events(now, horizon_hours=48)

    active = None
    next_event = events[0] if events else None
    for e in events:
        start = e.when_utc - timedelta(minutes=PRE_MINUTES)
        end = e.when_utc + timedelta(minutes=POST_MINUTES)
        if start <= now <= end:
            active = e
            break

    def pack(e: Optional[MacroEvent]) -> Optional[dict]:
        if not e:
            return None
        minutes = int(round((e.when_utc - now).total_seconds() / 60))
        return {
            "name": e.name,
            "source": e.source,
            "when_utc": e.when_utc.isoformat(),
            "minutes": minutes,
        }

    return {
        "active": active is not None,
        "pre_minutes": PRE_MINUTES,
        "post_minutes": POST_MINUTES,
        "event": pack(active),
        "next_event": pack(next_event),
    }
