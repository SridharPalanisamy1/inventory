import { configureStore } from '@reduxjs/toolkit';
import businessReducer from '@/features/businessSlice';
import outletReducer from '../features/yen_inventory/OutletPhysicalVarianceSlice'
import authReducer from '../features/authSlice';
import PhysicalStockReducer from "../features/yen_inventory/OuletePhysicalStockSlice"
import rawMaterialReducer from "../features/yen_inventory/wharehoueSlice"
import rawMaterialStoreReducer from "../features/yen_inventory/wharehoueStoreSlice"
import stockSummaryReducer from "../features/yen_inventory/ledgerrawSlice"
import stockSummaryoutletReducer from "../features/yen_inventory/ledgeroutletSlice"
import outletStockTypeReducer from "../features/yen_inventory/outletStockTypeSlice"


const store = configureStore({
  reducer: {
    auth: authReducer,
    business: businessReducer,
    data: outletReducer,
    rawMaterials: rawMaterialReducer,
    purchaseItems: rawMaterialStoreReducer,
    items: PhysicalStockReducer,
    stockSummary: stockSummaryReducer,
    stockSummaryOutlet: stockSummaryoutletReducer,
    outletStockType: outletStockTypeReducer,
  },
});


// Define the RootState type based on the store's state
export type RootState = ReturnType<typeof store.getState>;

// Define the AppDispatch type based on the store's dispatch
export type AppDispatch = typeof store.dispatch;

export default store;
