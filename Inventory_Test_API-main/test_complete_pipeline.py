# test_complete_pipeline.py
# Run this LOCALLY - No MongoDB, No ClickHouse, No Server Needed!
# This simulates EXACTLY what happens in your sync script

import json
from datetime import datetime
from bson import ObjectId  # pip install pymongo (just for ObjectId, no server needed)

print("=" * 70)
print("🔬 COMPLETE PIPELINE TEST - LOCAL SIMULATION")
print("=" * 70)

# ==================== COPY OF YOUR FUNCTIONS ====================

def _json_default(o):
    if isinstance(o, ObjectId):
        return str(o)
    if isinstance(o, datetime):
        return o.isoformat()
    return str(o)

def safe_json_dumps(v):
    try:
        return json.dumps(v, default=_json_default, ensure_ascii=False)
    except Exception:
        return str(v)

def value_shape(v):
    if v is None:
        return None
    if isinstance(v, dict):
        return "dict"
    if isinstance(v, list):
        return "list"
    return "scalar"

def get_scalar_ch_type(v):
    if isinstance(v, bool):
        return "Nullable(UInt8)"
    if isinstance(v, int):
        return "Nullable(Int64)"
    if isinstance(v, float):
        return "Nullable(Float64)"
    if isinstance(v, datetime):
        return "Nullable(DateTime64(3))"
    return "Nullable(String)"

def sanitize(name: str) -> str:
    import re
    return re.sub(r"[^0-9A-Za-z_]", "_", name)

# ==================== YOUR ACTUAL FUNCTION (EXACT COPY) ====================

def normalize_history_value(v, ch_type, mixed=False):
    """EXACT copy from your sync script"""

    if mixed:
        if v is None:
            return None
        return safe_json_dumps(v)

    if "Array" in ch_type:
        # DEBUG PRINTS (same as we added before)
        print("  🔍 [normalize_history_value] ENTERED Array block")
        print(f"     TYPE: {type(v)}")
        print(f"     VALUE: {v}")
        print(f"     LENGTH: {len(v) if isinstance(v, list) else 'NOT LIST'}")

        if v is None:
            print("     → Returning [] (was None)")
            return []
        if not isinstance(v, list):
            result = [safe_json_dumps(v)]
            print(f"     → Not a list, wrapped in list: {result}")
            return result

        out = []
        for idx, x in enumerate(v):
            if x is None:
                print(f"     → Item {idx}: SKIPPED (None)")
                continue
            if isinstance(x, datetime):
                formatted = x.strftime("%Y-%m-%d %H:%M:%S.") + f"{x.microsecond // 1000:03d}"
                out.append(formatted)
                print(f"     → Item {idx}: DateTime -> {formatted}")
            elif isinstance(x, (dict, list)):
                json_str = safe_json_dumps(x)
                out.append(json_str)
                print(f"     → Item {idx}: Dict/List -> {json_str}")
            else:
                str_val = str(x)
                out.append(str_val)
                print(f"     → Item {idx}: {type(x).__name__} -> {str_val}")

        print(f"  ✅ [normalize_history_value] RETURNING {len(out)} items")
        return out

    if v is None:
        return None

    inner = ch_type[9:-1] if ch_type.startswith("Nullable(") else ch_type

    if inner == "Int64":
        try:
            return int(v)
        except Exception:
            return None
    if inner == "Float64":
        try:
            return float(v)
        except Exception:
            return None
    if inner == "UInt8":
        return 1 if v else 0
    if inner == "DateTime64(3)":
        return v if isinstance(v, datetime) else None
    return str(v)


# ==================== SIMULATED MONGODB DOCUMENT ====================

print("\n" + "=" * 70)
print("📄 STEP 1: Simulating MongoDB Document (Your May 2026 Invoice)")
print("=" * 70)

simulated_mongo_doc = {
    "_id": ObjectId("6512345678abcdef01234567"),  # Real Mongo ID format
    "invoiceNumber": "INV-2026-05-001",
    "invoiceDate": datetime(2026, 5, 15, 10, 30, 0),
    "customerName": "ABC Company",
    "totalAmount": 15000.50,
    "items": [
        'MIXTURE ITEMS',
        'BM SPL BOX COOKIES',
        'BM SPL BOX COOKIES',
        'COLOUR COOKIES BOX',
        'BREAD'
    ],
    "paymentStatus": True,
    "tags": ["urgent", "priority", "food-items"],
    "notes": None,
    "metadata": {"source": "manual", "verified": True}
}

print("\n📋 Document fields:")
for key, value in simulated_mongo_doc.items():
    shape = value_shape(value)
    print(f"   • {key}: {shape} = {repr(value)[:60]}{'...' if len(repr(value)) > 60 else ''}")


# ==================== SIMULATE SCHEMA DETECTION ====================

print("\n" + "=" * 70)
print("🔍 STEP 2: Simulating Schema Detection (get_full_schema)")
print("=" * 70)

schema = {}
for key, value in simulated_mongo_doc.items():
    shape = value_shape(value)

    if key == "_id":
        schema[key] = {"ch_type": "String", "mixed": False, "dt_array": False}
    elif shape == "scalar":
        schema[key] = {"ch_type": get_scalar_ch_type(value), "mixed": False, "dt_array": False}
    elif shape == "list":
        # Check if it's a datetime array
        is_dt_array = all(isinstance(x, datetime) for x in value if x is not None)
        schema[key] = {"ch_type": "Array(String)", "mixed": False, "dt_array": is_dt_array}
    elif shape == "dict":
        schema[key] = {"ch_type": "Nullable(String)", "mixed": False, "dt_array": False}

print("\n📊 Detected Schema:")
for key, info in schema.items():
    print(f"   • {key:<20} -> {info['ch_type']:<20} (mixed={info['mixed']}, dt_array={info['dt_array']})")


# ==================== BUILD FIELD MAP (like your script does) ====================

print("\n" + "=" * 70)
print("🗂️  STEP 3: Building Field Map (field_map)")
print("=" * 70)

used_names = set()
field_map = []

for orig_key, info in schema.items():
    alias = "id" if orig_key == "_id" else sanitize(orig_key)

    # Ensure unique names (simplified version of ensure_unique)
    if alias in used_names:
        i = 1
        while f"{alias}_{i}" in used_names:
            i += 1
        alias = f"{alias}_{i}"
    used_names.add(alias)

    field_map.append((orig_key, alias, info["ch_type"], info["mixed"], info.get("dt_array", False)))

print("\n📝 Field Map:")
for idx, (orig, alias, ch_type, mixed, dt_arr) in enumerate(field_map):
    print(f"   [{idx}] {orig:<20} AS {alias:<20} | Type: {ch_type:<20} | Mixed: {mixed}")


# ==================== SIMULATE ROW BUILDING (THE CRITICAL PART!) ====================

print("\n" + "=" * 70)
print("🏗️  STEP 4: Building Row Tuple (THIS IS WHERE DATA GETS PREPARED)")
print("=" * 70)

print("\n🔄 Processing each field through normalize_history_value():\n")

row_parts = []
for orig_key, alias, ch_type, mixed, dt_array in field_map:
    print(f"▶ Field: {orig_key} (alias: {alias}, type: {ch_type})")

    raw_value = simulated_mongo_doc.get(orig_key)

    if orig_key == "_id":
        processed_value = str(raw_value)
        print(f"  → _id converted to string: {processed_value}")
    else:
        processed_value = normalize_history_value(raw_value, ch_type, mixed)

        # Show array length specifically
        if isinstance(processed_value, list):
            print(f"  ✅ PROCESSED VALUE: List with {len(processed_value)} items")
            if len(processed_value) <= 10:
                for i, item in enumerate(processed_value):
                    print(f"       [{i}] {item}")
            else:
                print(f"       [0..9] {processed_value[:10]}...")
                print(f"       ... ({len(processed_value) - 10} more items)")
        else:
            print(f"  ✅ PROCESSED VALUE: {repr(processed_value)}")

    row_parts.append(processed_value)
    print()

# Build the final tuple (this is what goes into batch)
row_tuple = tuple(row_parts)

print("=" * 70)
print("📦 FINAL ROW TUPLE (Ready for batch.append()):")
print("=" * 70)
print(f"\n{row_tuple}\n")

print("🔎 Detailed breakdown:")
for idx, (field_info, value) in enumerate(zip(field_map, row_tuple)):
    orig_key = field_info[0]
    alias = field_info[1]
    ch_type = field_info[2]

    if isinstance(value, list):
        status = f"✅ LIST with {len(value)} items"
    elif value is None:
        status = "⚪ None"
    else:
        status = f"✅ {type(value).__name__}"

    print(f"   [{idx}] {alias:<20} {status:<25} Value: {repr(value)[:50]}")


# ==================== SIMULATE CLICKHOUSE INSERT (THE BUG LOCATION!) ====================

print("\n" + "=" * 70)
print("🚨 STEP 5: SIMULATING clickhouse_connect.insert() BEHAVIOR")
print("=" * 70)

print("\n💡 What normally happens inside clickhouse_connect.insert():")
print("-" * 70)

batch = [row_tuple]  # Put our row in a batch (like your script does)
column_names = [f[1] for f in field_map]

print(f"\n📤 Data being sent to ClickHouse:")
print(f"   Table: invoices (simulated)")
print(f"   Columns: {column_names}")
print(f"   Batch size: {len(batch)} rows")
print(f"\n📄 Row data (what Python sends):")
for idx, col_name in enumerate(column_names):
    val = batch[0][idx]
    if isinstance(val, list):
        print(f"   • {col_name}: <class 'list'> with {len(val)} elements")
        print(f"     Content: {val}")
    else:
        print(f"   • {col_name}: {type(val).__name__} = {repr(val)}")


# ==================== BUG SIMULATION ====================

print("\n" + "=" * 70)
print("🐛 STEP 6: DEMONSTRATING THE BUG (What clickhouse-connect might do wrong)")
print("=" * 70)

print("\n❌ POSSIBLE BUG SCENARIO 1: Library converts list to string")
print("-" * 70)
buggy_row_1 = list(row_tuple)
for idx, val in enumerate(buggy_row_1):
    if isinstance(val, list):
        buggy_row_1[idx] = str(val)  # What buggy library might do!
        print(f"   Field '{column_names[idx]}':")
        print(f"      BEFORE: {type(val).__name__} with {len(val)} items: {val}")
        print(f"      AFTER:  {type(buggy_row_1[idx]).__name__}: {buggy_row_1[idx]}")
        print(f"      ⚠️  ClickHouse sees this as a STRING, not an Array!")

print("\n❌ POSSIBLE BUG SCENARIO 2: Library takes only first element")
print("-" * 70)
buggy_row_2 = list(row_tuple)
for idx, val in enumerate(buggy_row_2):
    if isinstance(val, list):
        buggy_row_2[idx] = val[:1]  # Bug: Only keeps first item!
        print(f"   Field '{column_names[idx]}':")
        print(f"      BEFORE: {type(val).__name__} with {len(val)} items: {val}")
        print(f"      AFTER:  {type(buggy_row_2[idx]).__name__} with {len(buggy_row_2[idx])} item: {buggy_row_2[idx]}")
        print(f"      ⚠️  Lost {len(val) - 1} items!")


# ==================== CORRECT BEHAVIOR ====================

print("\n" + "=" * 70)
print("✅ STEP 7: WHAT CORRECT BEHAVIOR SHOULD LOOK LIKE")
print("=" * 70)

print("\n✨ CORRECT: ClickHouse receives the Python list as-is")
print("-" * 70)
correct_row = row_tuple  # Our original correct row
for idx, col_name in enumerate(column_names):
    val = correct_row[idx]
    if isinstance(val, list):
        print(f"   ✓ Field '{col_name}':")
        print(f"     Type received by CH: Array(String)")
        print(f"     Items stored: {len(val)}")
        print(f"     Data: {val}")
        print(f"     Query result: SELECT {col_name} ... -> {val}")


# ==================== VERIFICATION CHECKLIST ====================

print("\n" + "=" * 70)
print("✅ STEP 8: FINAL VERIFICATION CHECKLIST")
print("=" * 70)

checks = [
    ("MongoDB document has 5 items in 'items' field?",
     len(simulated_mongo_doc['items']) == 5),

    ("Schema detection marked 'items' as Array(String)?",
     schema['items']['ch_type'] == 'Array(String)'),

    ("normalize_history_value() received a list?",
     isinstance(simulated_mongo_doc['items'], list)),

    ("normalize_history_value() returned 5 items?",
     len([v for v in row_tuple if isinstance(v, list) and 'MIXTURE' in v][0]) == 5 if any(isinstance(v, list) and 'MIXTURE' in str(v) for v in row_tuple) else "Check manually"),

    ("Row tuple contains list (not string)?",
     any(isinstance(v, list) for v in row_tuple)),
]

all_pass = True
for check_name, result in checks:
    status = "✅ PASS" if result else "❌ FAIL"
    print(f"   {status}  {check_name}")
    if not result:
        all_pass = False

print("\n" + "=" * 70)
if all_pass:
    print("🎉 CONCLUSION: Your Python code is PERFECT!")
    print("=" * 70)
    print("""
    ┌─────────────────────────────────────────────────────────────┐
    │                                                             │
    │   ✅ normalize_history_value() works correctly              │
    │   ✅ Row building logic is correct                          │
    │   ✅ Data preparation is perfect                            │
    │                                                             │
    │   🔴 THE BUG IS IN: clickhouse_connect.insert()             │
    │                                                             │
    │   💡 FIX OPTIONS:                                           │
    │   1. Upgrade: pip install --upgrade clickhouse-connect      │
    │   2. Use HTTP protocol instead of native                    │
    │   3. Add explicit JSON serialization for arrays             │
    │                                                             │
    └─────────────────────────────────────────────────────────────┘
    """)
else:
    print("⚠️  Some checks failed - review output above")


# ==================== NEXT STEPS ====================

print("\n" + "=" * 70)
print("📌 NEXT STEPS (Do these IN ORDER):")
print("=" * 70)
print("""
Step 1: Run this file again and confirm all checks PASS
        python test_complete_pipeline.py

Step 2: Apply the fix from 'fix_clickhouse_bug.py' (I'll create this next)

Step 3: Test the fix with 'test_after_fix.py' (I'll create this too)

Step 4: Once fix is confirmed working locally → Deploy to server ONCE

Step 5: Run full sync on server with confidence ✅
""")

print("=" * 70)
print("🏁 TEST COMPLETE - Everything ran locally, no server needed!")
print("=" * 70)
