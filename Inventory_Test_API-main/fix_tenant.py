import os
import re

base_dir = r"d:\YEN ERP - INVENTORY\YEN -IN BM\Inventory api"
modules = ["OutletInventory", "OutletInventoryVariance", "WarehouseInventory", "WarehouseInventoryVariance"]

for mod in modules:
    file_path = os.path.join(base_dir, mod, "routes.py")
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        # Replace occurrences of: "tenantId": var_name,
        content = re.sub(r'\"tenantId\":\s*([^,\n]+?)(?:\s+or\s+\"\")?,', r'"tenantId": \1 or "",', content)
        
        # Replace occurrences of: "idempotencyKey": var_name,
        content = re.sub(r'\"idempotencyKey\":\s*([^,\n]+?)(?:\s+or\s+\"\")?,', r'"idempotencyKey": \1 or "",', content)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Fixed {file_path}")
