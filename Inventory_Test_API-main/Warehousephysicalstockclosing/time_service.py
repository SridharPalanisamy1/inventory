from __future__ import annotations

import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import httpx
from fastapi import HTTPException


LIVE_DATE_URL = (
    os.getenv("NEXT_PUBLIC_LIVEDATE_URL")
    or os.getenv("LIVE_DATE_URL")
    or "https://yenerp.com/liveapi/datetime"
)

IST = ZoneInfo("Asia/Kolkata")
REQUEST_TIMEOUT_SECONDS = float(os.getenv("LIVE_DATE_TIMEOUT_SECONDS", "8"))
MAX_DRIFT_SECONDS = int(os.getenv("LIVE_DATE_MAX_DRIFT_SECONDS", "600"))
VALIDATE_DRIFT = os.getenv("LIVE_DATE_VALIDATE_DRIFT", "true").lower() in {
    "1",
    "true",
    "yes",
    "on",
}


def _parse_live_datetime(current_date: str, current_time: str) -> datetime:
    raw_value = f"{current_date.strip()} {current_time.strip()}".strip()
    formats = (
        "%d-%m-%Y %I:%M %p",
        "%d-%m-%Y %I:%M:%S %p",
        "%d-%m-%Y %H:%M",
        "%d-%m-%Y %H:%M:%S",
        "%Y-%m-%d %I:%M %p",
        "%Y-%m-%d %I:%M:%S %p",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
    )

    for date_format in formats:
        try:
            local_value = datetime.strptime(raw_value, date_format)
            return local_value.replace(tzinfo=IST).astimezone(timezone.utc)
        except ValueError:
            continue

    raise ValueError(f"Unsupported live date/time format: {raw_value}")


async def get_live_utc_datetime() -> datetime:
    try:
        async with httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT_SECONDS,
            headers={"Cache-Control": "no-cache"},
        ) as client:
            response = await client.get(LIVE_DATE_URL)
            response.raise_for_status()
            payload = response.json()

        live_datetime = _parse_live_datetime(
            str(payload.get("current_date") or ""),
            str(payload.get("current_time") or ""),
        )
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Unable to obtain valid live date/time: {exc}",
        ) from exc

    if VALIDATE_DRIFT:
        server_datetime = datetime.now(timezone.utc)
        drift_seconds = abs((server_datetime - live_datetime).total_seconds())

        if drift_seconds > MAX_DRIFT_SECONDS:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Live-date service returned stale or future time. "
                    f"live={live_datetime.isoformat()}, "
                    f"server={server_datetime.isoformat()}, "
                    f"driftSeconds={int(drift_seconds)}"
                ),
            )

    return live_datetime