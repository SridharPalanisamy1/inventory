# test_bug.py - Run this ANYWHERE (no server needed!)
import json
from datetime import datetime

def _json_default(o):
    if isinstance(o, str):
        return o
    return str(o)

def safe_json_dumps(v):
    try:
        return json.dumps(v, default=_json_default, ensure_ascii=False)
    except Exception:
        return str(v)

def normalize_history_value(v, ch_type, mixed=False):
    """EXACT copy from your script"""
    if mixed:
        if v is None:
            return None
        return safe_json_dumps(v)

    if "Array" in ch_type:
        # DEBUG: Print type, value, and length to trace array handling
        print("===================================")
        print("TYPE:", type(v))
        print("VALUE:", v)
        print("LENGTH:", len(v) if isinstance(v, list) else "NOT LIST")
        print("===================================")

        if v is None:
            return []
        if not isinstance(v, list):
            return [safe_json_dumps(v)]
        out = []
        for x in v:
            if x is None:
                continue
            if isinstance(x, datetime):
                out.append(x.strftime("%Y-%m-%d %H:%M:%S.") + f"{x.microsecond // 1000:03d}")
            elif isinstance(x, (dict, list)):
                out.append(safe_json_dumps(x))
            else:
                out.append(str(x))

        # DEBUG: Show output before returning
        print("OUTPUT:", out)
        print("OUTPUT LENGTH:", len(out))
        print("===================================\n")
        return out

    if v is None:
        return None
    return str(v)


# ==================== TEST CASES ====================
print("=" * 60)
print("TEST 1: Your actual data (5 items)")
print("=" * 60)
your_data = ['MIXTURE ITEMS', 'BM SPL BOX COOKIES', 'BM SPL BOX COOKIES', 'COLOUR COOKIES BOX', 'BREAD']
result1 = normalize_history_value(your_data, "Array(String)")
print(f"✅ Result has {len(result1)} items: {result1}\n")

print("=" * 60)
print("TEST 2: Single item (edge case)")
print("=" * 60)
single_item = ['MIXTURE ITEMS']
result2 = normalize_history_value(single_item, "Array(String)")
print(f"✅ Result has {len(result2)} items: {result2}\n")

print("=" * 60)
print("TEST 3: Not a list (string instead of list)")
print("=" * 60)
not_a_list = "MIXTURE ITEMS"
result3 = normalize_history_value(not_a_list, "Array(String)")
print(f"✅ Result has {len(result3)} items: {result3}\n")

print("=" * 60)
print("TEST 4: List with None values")
print("=" * 60)
with_none = ['ITEM1', None, 'ITEM3', None, 'ITEM5']
result4 = normalize_history_value(with_none, "Array(String)")
print(f"✅ Result has {len(result4)} items: {result4}\n")

print("=" * 60)
print("TEST 5: Empty list")
print("=" * 60)
empty = []
result5 = normalize_history_value(empty, "Array(String)")
print(f"✅ Result has {len(result5)} items: {result5}\n")

# ==================== VERDICT ====================
print("\n" + "=" * 60)
print("🔍 CONCLUSION:")
print("=" * 60)
if len(result1) == 5:
    print("✅ FUNCTION IS PERFECT - Bug is NOT in normalize_history_value()")
    print("\n📍 BUG LOCATION: clickhouse_connect.insert() OR ClickHouse itself")
    print("\n💡 NEXT STEP:")
    print("   1. Check ClickHouse column type: DESCRIBE TABLE your_table")
    print("   2. Test manual insert in ClickHouse console")
    print("   3. Or add debug print BEFORE ch.insert() line in your script")
else:
    print("❌ FUNCTION HAS BUG - It's losing data!")
    print(f"   Expected 5 items, got {len(result1)}")
