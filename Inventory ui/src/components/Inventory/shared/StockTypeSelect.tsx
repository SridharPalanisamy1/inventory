"use client";

import React, { useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import CollapsibleFilter from "../physcialstockvarience/ui/collabsfiler";
import {
  OutletStockType,
  saveOutletStockType,
  selectOutletStockType,
  setOutletStockType,
} from "../../../features/yen_inventory/outletStockTypeSlice";

const OPTIONS = [
  { label: "FG", value: "FG" },
  { label: "RM", value: "RM" },
];

interface StockTypeSelectProps {
  disabled?: boolean;
}

/** FG / RM switch. Sits before the Branch dropdown on the outlet screens. */
const StockTypeSelect: React.FC<StockTypeSelectProps> = ({ disabled = false }) => {
  const dispatch = useDispatch();
  const stockType = useSelector(selectOutletStockType);

  const handleChange = useCallback(
    (value: string | string[]) => {
      const next: OutletStockType = (Array.isArray(value) ? value[0] : value) === "RM" ? "RM" : "FG";
      if (next === stockType) return;
      // save first: API helpers read the saved value when the screen reloads
      saveOutletStockType(next);
      dispatch(setOutletStockType(next));
    },
    [dispatch, stockType]
  );

  const options = useMemo(() => OPTIONS, []);

  return (
    <CollapsibleFilter
      title="Type"
      options={options}
      selectedOptions={stockType}
      onChange={handleChange}
      onClear={() => undefined}
      inputType="single-select"
      showRemoveOption={false}
      showSelectedCount={false}
      displayLabel={stockType}
      disabled={disabled}
    />
  );
};

export default React.memo(StockTypeSelect);