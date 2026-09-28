"use client";

import React from "react";

interface PhysicalStockInputProps {
  value: string | number;
  inputRef?: (el: HTMLInputElement | null) => void;
  onChange: (value: string, event: React.ChangeEvent<HTMLInputElement>) => void;
  onFocusZeroToEmpty?: boolean;
  onFocusEmpty?: () => void;
  onEnterNext?: () => void;
  widthClassName?: string;
}

export default function PhysicalStockInput({
  value,
  inputRef,
  onChange,
  onFocusZeroToEmpty = true,
  onFocusEmpty,
  onEnterNext,
  widthClassName = "w-[86px]",
}: PhysicalStockInputProps) {
  return (
    <input
      ref={inputRef}
      value={value}
      inputMode="decimal"
      autoComplete="off"
      className={["inventory-number-input", widthClassName].join(" ")}
      onChange={(event) => {
        const nextValue = event.target.value;
        if (nextValue === "" || /^[0-9]*\.?[0-9]*$/.test(nextValue)) {
          onChange(nextValue, event);
        }
      }}
      onFocus={(event) => {
        if (onFocusZeroToEmpty && event.target.value === "0") {
          onFocusEmpty?.();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onEnterNext?.();
        }
      }}
    />
  );
}