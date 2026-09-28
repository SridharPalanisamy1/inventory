"""
core/cache.py
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Callable, Dict, Optional

# ── TTL configuration (seconds) ──────────────────────────────────────────────
CACHE_TTL_MAP: Dict[str, int] = {
    "category_map": 300,  # 5 min  — changes rarely
    "subcategory_map": 300,
    "uom_precision": 600,  # 10 min — almost never changes
    "location_list": 120,
}
_DEFAULT_TTL = 60


class _CacheSlot:
    __slots__ = ("value", "expires_at", "lock")

    def __init__(self) -> None:
        self.value: Any = None
        self.expires_at: float = 0.0
        self.lock: asyncio.Lock = asyncio.Lock()

    def is_valid(self) -> bool:
        return self.value is not None and time.monotonic() < self.expires_at


class ProcessCache:
    """
    Single-process async TTL cache.
    Usage:
        value = await ProcessCache.get_or_set("uom_precision", loader_coro, ttl=600)
    """

    _slots: Dict[str, _CacheSlot] = {}
    _meta_lock: asyncio.Lock = asyncio.Lock()

    @classmethod
    async def _get_slot(cls, key: str) -> _CacheSlot:
        if key not in cls._slots:
            async with cls._meta_lock:
                if key not in cls._slots:  # double-check after lock
                    cls._slots[key] = _CacheSlot()
        return cls._slots[key]

    @classmethod
    async def get_or_set(
        cls,
        key: str,
        loader: Callable,
        ttl: Optional[int] = None,
    ) -> Any:
        slot = await cls._get_slot(key)

        if slot.is_valid():
            return slot.value

        async with slot.lock:
            if slot.is_valid():  # another coroutine may have filled it
                return slot.value

            value = await loader()
            slot.value = value
            slot.expires_at = time.monotonic() + (
                ttl or CACHE_TTL_MAP.get(key, _DEFAULT_TTL)
            )
            return value

    @classmethod
    async def invalidate(cls, key: str) -> None:
        slot = cls._slots.get(key)
        if slot:
            async with slot.lock:
                slot.value = None
                slot.expires_at = 0.0

    @classmethod
    async def invalidate_all(cls) -> None:
        for key in list(cls._slots):
            await cls.invalidate(key)


class RequestCache:
    """
    Zero-overhead per-request memo store.
    Attach to FastAPI Request.state once; discard at response time.

    Usage:
        rc = RequestCache()
        val = await rc.get_or_set("dispatch_map", loader)
    """

    __slots__ = ("_store",)

    def __init__(self) -> None:
        self._store: Dict[str, Any] = {}

    async def get_or_set(self, key: str, loader: Callable) -> Any:
        if key not in self._store:
            self._store[key] = await loader()
        return self._store[key]

    def get(self, key: str, default: Any = None) -> Any:
        return self._store.get(key, default)

    def set(self, key: str, value: Any) -> None:
        self._store[key] = value
