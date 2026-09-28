# ERP Migration Notes

## Excluded Dummy Modules

The following modules are explicitly excluded from ERP deep-conversion planning in this repository:

- `allrestaurants`
- `paymode`

Status:

- Dummy modules
- Delete later
- Do not use as reference patterns
- Do not spend additional cleanup or optimization effort on them

## Repo-Scoped Reality Check

This repository snapshot contains inventory UI modules only. The following requested ERP modules were not found in the current codebase and therefore cannot be deep-converted from this repo alone:

- `production entry`
- `dispatch`
- `sales order`
- `invoices itemwise`
- `invoices orderwise`
- `sales summary / day-end`
- `wastage`
- `warehouse return`
- `item transfer`
- `purchase order`
- `GRN`
- `AP invoice`
- `outgoing payment`
- `outstanding`
- `petty cash`
- `service report`
- `raw material`
- `birthday cake`
- `item date`
- `debit note`

These remain pending until their actual source modules are present in the workspace.

## Real Production Modules Present In This Repo

Only the following production modules are currently available for deep conversion in this repository:

1. `WarehouseInventoryManagement/stockModification`
2. `WarehouseInventoryManagement/storeStockModification`
3. `WarehouseInventoryManagement/ledger`
4. `OutletsInventoryManagement/OutletPhysicalStockModification`
5. `OutletsInventoryManagement/OutletPhysicalStockVarianceModification`
6. `OutletsInventoryManagement/ledger`

## Re-ranked Deep-Conversion Roadmap

Ranking criteria:

- business importance
- cleanup value
- performance risk
- migration risk

Repo-scoped ranking:

1. `WarehouseInventoryManagement/storeStockModification`
   - Highest workflow complexity
   - Heavy state duplication
   - Approval and table orchestration risk
2. `OutletsInventoryManagement/OutletPhysicalStockVarianceModification`
   - Large page with mixed business and UI logic
   - Approval flow and pagination complexity
3. `WarehouseInventoryManagement/stockModification`
   - High business importance
   - Import/export and edit flow complexity
4. `OutletsInventoryManagement/OutletPhysicalStockModification`
   - Similar cleanup need with lower risk than variance flows
5. `WarehouseInventoryManagement/ledger`
   - Medium business importance
   - Good conversion candidate with lower contract risk
6. `OutletsInventoryManagement/ledger`
   - Similar to warehouse ledger, but less central than stock-modification workflows

## Recommended Next Module

Repo-scoped recommendation after the current pass:

- `WarehouseInventoryManagement/storeStockModification`

Reason:

- strongest cleanup payoff
- highest concentration of orchestration debt
- still safer than attempting absent ERP modules or `AP invoice`
