# core/search.py
# ─────────────────────────────────────────────────────────────────────────────
# One shared search rule for every inventory dropdown / picker (outlets + warehouse).
#
#   * The query is split on ANY whitespace. Leading / trailing / repeated spaces
#     never change the result:  "egg", "egg ", " egg  " are all the same search.
#   * Every word must be found somewhere in the option (name or id), in any order,
#     anywhere inside a word ("contains", not "starts with"):
#         "masala"      -> "Chicken Masala", "Masala Powder", "Egg Masala"
#         "egg puffs"   -> "Egg Puffs (Bakery)", "Puffs Egg"
#   * Case, accents and punctuation are ignored ("sub-blen" == "Sub Blen").
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List, Optional, Sequence


def tokenize_search(value: Optional[str]) -> List[str]:
    """Split user input into words. str.split() also swallows NBSP / tabs / repeats."""
    text = unicodedata.normalize("NFKC", str(value or ""))
    return [t for t in text.split() if t]


def _compact(value: Any) -> str:
    """lower-case, strip accents, drop everything except letters/digits."""
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).lower()
    return re.sub(r"[\W_]+", "", text, flags=re.UNICODE)


def _compact_tokens(search: Optional[str]) -> List[str]:
    return [c for c in (_compact(t) for t in tokenize_search(search)) if c]


def matches_search(search: Optional[str], *texts: Any) -> bool:
    """True when EVERY word of `search` is contained in name/id (any order)."""
    tokens = _compact_tokens(search)
    if not tokens:
        return True
    haystack = "|".join(_compact(t) for t in texts if t)
    return bool(haystack) and all(tok in haystack for tok in tokens)


def search_rank(search: Optional[str], name: Any, option_id: Any = "") -> int:
    """Lower = better. exact < starts-with < word-starts-with < contains."""
    tokens = _compact_tokens(search)
    if not tokens:
        return 0

    query = "".join(tokens)
    name_c, id_c = _compact(name), _compact(option_id)

    if name_c == query:
        return 0
    if name_c.startswith(query):
        return 1
    if id_c == query:
        return 2
    if id_c.startswith(query):
        return 3

    words = [_compact(w) for w in re.split(r"[\s\-/()]+", str(name or ""))]
    if all(any(w.startswith(tok) for w in words if w) for tok in tokens):
        return 4
    return 9


def mongo_token_query(search: Optional[str], fields: Sequence[str]) -> Dict[str, Any]:
    """
    Mongo filter: every word must match (escaped, case-insensitive) in at least
    one of `fields`. Returns {} for an empty search, so it is safe to merge.
    """
    tokens = tokenize_search(search)
    if not tokens or not fields:
        return {}
    return {
        "$and": [
            {"$or": [{f: {"$regex": re.escape(tok), "$options": "i"}} for f in fields]}
            for tok in tokens
        ]
    }


def and_queries(*queries: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Combine filters without clobbering each other's $and / $or keys."""
    parts = [q for q in queries if q]
    if not parts:
        return {}
    return parts[0] if len(parts) == 1 else {"$and": parts}