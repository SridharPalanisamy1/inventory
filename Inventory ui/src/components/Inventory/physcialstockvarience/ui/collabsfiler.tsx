"use client";

import React, {
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
} from "react";
import { createPortal } from "react-dom";
import { debounce } from "lodash";
import { FaTimes, FaCheck, FaChevronDown, FaSpinner, FaSearch } from "react-icons/fa";
import useOnClickOutside from "./useonclik";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const RE_CLEAN = /[^\p{L}\p{N}\s._\-\/&()]/gu;
const RE_SPACES = /\s+/g;
const RE_DIACRITICS = /[\u0300-\u036f]/g;
const RE_NON_ALPHANUM = /[^\p{L}\p{N}]/gu;
// Matches "Butter Jam (Mix Jam)" -> main: "Butter Jam", group: "Mix Jam"
const RE_LABEL_GROUP = /^(.+?)\s*\(([^()]+)\)\s*$/;

const cleanTypingSearch = (value: string): string =>
  String(value || "")
    .replace(RE_CLEAN, "")
    .replace(RE_SPACES, " ")
    .replace(/^\s+/, "");

const cleanApiSearch = (value: string): string =>
  cleanTypingSearch(value).trim();

const normalizeForCompare = (value: unknown): string =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(RE_DIACRITICS, "")
    .replace(RE_NON_ALPHANUM, "");

/** "Butter Jam (Mix Jam)" -> { main: "Butter Jam", group: "Mix Jam" } */
const parseOptionLabel = (label: string): { main: string; group: string | null } => {
  const match = RE_LABEL_GROUP.exec(label);
  if (match) {
    return { main: match[1].trim(), group: match[2].trim() };
  }
  return { main: label, group: null };
};

function getScrollParents(el: HTMLElement | null): (HTMLElement | Window)[] {
  const parents: (HTMLElement | Window)[] = [window];
  let node = el?.parentElement;

  while (node) {
    const { overflow, overflowY, overflowX } = getComputedStyle(node);
    if (/auto|scroll/.test(overflow + overflowY + overflowX)) {
      parents.push(node);
    }
    node = node.parentElement;
  }

  return parents;
}

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface Option {
  label: string;
  value: string;
}

interface CollapsibleFilterProps {
  title: string;
  options?: Option[];
  selectedOptions: string[] | string | null;
  onChange: (selectedOptions: string[] | string) => void;
  onClear: () => void;
  onScrollBottom?: () => void;
  onSearch?: (searchTerm: string) => void;
  inputType: "multi-select" | "single-select" | "date";
  isMulti?: boolean;
  loading?: boolean;
  searchValue?: string;
  showSelectedCount?: boolean;
  showRemoveOption?: boolean;
  restrictToTodayOnly?: boolean;
  displayLabel?: string;
  disabled?: boolean;
  statusLabel?: string;
  loadingText?: string;
  linked?: boolean;
}

const SEARCH_DEBOUNCE_MS = 160;
const SCROLL_BOTTOM_THRESHOLD = 48;

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

const CollapsibleFilter: React.FC<CollapsibleFilterProps> = ({
  title,
  options = [],
  selectedOptions,
  onChange,
  onClear,
  onScrollBottom,
  onSearch,
  inputType,
  isMulti = false,
  loading = false,
  searchValue = "",
  showSelectedCount = true,
  showRemoveOption = true,
  restrictToTodayOnly,
  displayLabel,
  disabled = false,
  statusLabel,
  loadingText = "Loading related options...",
  linked = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const [searchInput, setSearchInput] = useState<string>("");
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 280,
  });

  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const latestSearchRef = useRef<string>("");
  const lastSentSearchRef = useRef<string>("");
  const ignoreExternalSearchSyncRef = useRef(false);
  const selectedLabelMapRef = useRef<Map<string, string>>(new Map());
  const mountedRef = useRef(true);
  const onSearchRef = useRef(onSearch);
  const searchGenRef = useRef(0);
  const hasScrolledToBottomRef = useRef(false);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  useEffect(() => {
    hasScrolledToBottomRef.current = false;
  }, [options]);

  useOnClickOutside(panelRef, () => setIsOpen(false), buttonRef);

  useEffect(() => {
    if (isOpen) {
      const frame = requestAnimationFrame(() => setPanelVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    setPanelVisible(false);
  }, [isOpen]);

  /* ---------------------------- options ---------------------------- */

  const safeOptions = useMemo(
    () =>
      (Array.isArray(options) ? options : [])
        .filter((option): option is Option => Boolean(option?.value))
        .map((option) => ({
          value: String(option.value),
          label: option.label ? String(option.label) : String(option.value),
        })),
    [options]
  );

  const selectedValues = useMemo(
    () =>
      (
        Array.isArray(selectedOptions)
          ? selectedOptions
          : selectedOptions
            ? [selectedOptions]
            : []
      )
        .filter(
          (value): value is string =>
            value !== null && value !== undefined && value !== ""
        )
        .map((value) => String(value)),
    [selectedOptions]
  );

  const hasSelection = selectedValues.length > 0;

  useEffect(() => {
    const map = selectedLabelMapRef.current;
    const kept = new Map<string, string>();

    selectedValues.forEach((value) => {
      const fromOptions = safeOptions.find((option) => option.value === value);
      kept.set(value, fromOptions?.label ?? map.get(value) ?? value);
    });

    selectedLabelMapRef.current = kept;
  }, [safeOptions, selectedValues]);

  const selectedOptionObjects = useMemo(() => {
    return selectedValues.map((value) => {
      const currentOption = safeOptions.find((option) => option.value === value);
      const cachedLabel = selectedLabelMapRef.current.get(value);

      return {
        value,
        label: currentOption?.label || cachedLabel || value,
      };
    });
  }, [safeOptions, selectedValues]);

  /* ------------------------- positioning ---------------------------- */

  const updateDropdownPosition = useCallback(() => {
    if (!buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    // const minWidth = Math.max(240, rect.width);
    // const maxWidth = Math.min(420, viewportWidth - 24);
    // const width = Math.min(minWidth, maxWidth);
    // repalce the part 7 8 1
    const width = Math.max(rect.width, 320);

    // Viewport-relative (no scrollX/scrollY) since the panel is position: fixed.
    const left = Math.min(Math.max(12, rect.left), Math.max(12, viewportWidth - width - 12));

    const spaceBelow = viewportHeight - rect.bottom - 16;
    const maxHeight = Math.max(160, Math.min(280, spaceBelow));

    // setDropdownPosition({
    //   top: rect.bottom + 6,
    //   left,
    //   width,
    //   maxHeight,
    // });
    // replace the part 7 8 1
    setDropdownPosition({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    updateDropdownPosition();

    const onResizeOrScroll = () => updateDropdownPosition();
    const scrollParents = getScrollParents(buttonRef.current);

    window.addEventListener("resize", onResizeOrScroll);
    scrollParents.forEach((el) => el.addEventListener("scroll", onResizeOrScroll, true));

    return () => {
      window.removeEventListener("resize", onResizeOrScroll);
      scrollParents.forEach((el) => el.removeEventListener("scroll", onResizeOrScroll, true));
    };
  }, [isOpen, updateDropdownPosition]);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      if (mountedRef.current && inputType !== "date") {
        searchInputRef.current?.focus({ preventScroll: true });
      }
    });
  }, [isOpen, inputType]);

  /* --------------------------- search -------------------------------- */

  const debouncedSearch = useMemo(
    () =>
      debounce((value: string, gen: number) => {
        const cleaned = cleanApiSearch(value);
        if (gen !== searchGenRef.current) return;
        if (cleaned === lastSentSearchRef.current) return;

        lastSentSearchRef.current = cleaned;
        latestSearchRef.current = cleaned;
        onSearchRef.current?.(cleaned);
      }, SEARCH_DEBOUNCE_MS),
    []
  );

  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);

  useEffect(() => {
    if (!isOpen) debouncedSearch.cancel();
  }, [debouncedSearch, isOpen]);

  useEffect(() => {
    if (isOpen) return;

    const timer = window.setTimeout(() => {
      const externalApiValue = cleanApiSearch(searchValue || "");
      if (!externalApiValue) ignoreExternalSearchSyncRef.current = false;
    }, 300);

    return () => window.clearTimeout(timer);
  }, [isOpen, searchValue]);

  useEffect(() => {
    if (isOpen) return;
    if (ignoreExternalSearchSyncRef.current) return;

    const externalTypingValue = cleanTypingSearch(searchValue || "");
    const externalApiValue = cleanApiSearch(searchValue || "");

    setSearchInput(externalTypingValue);
    latestSearchRef.current = externalApiValue;
    lastSentSearchRef.current = externalApiValue;
  }, [searchValue, isOpen]);

  const sendImmediateSearch = useCallback(
    (value: string) => {
      const cleaned = cleanApiSearch(value);
      debouncedSearch.cancel();
      latestSearchRef.current = cleaned;
      lastSentSearchRef.current = cleaned;
      onSearchRef.current?.(cleaned);
    },
    [debouncedSearch]
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      const cleanedTypingValue = cleanTypingSearch(raw);
      const cleanedApiValue = cleanApiSearch(cleanedTypingValue);

      ignoreExternalSearchSyncRef.current = true;
      setSearchInput(cleanedTypingValue);
      latestSearchRef.current = cleanedApiValue;

      if (cleanedApiValue === "") {
        searchGenRef.current += 1;
        sendImmediateSearch("");
        return;
      }

      debouncedSearch(cleanedTypingValue, searchGenRef.current);
    },
    [debouncedSearch, sendImmediateSearch]
  );

  const handleClearSearch = useCallback(() => {
    searchGenRef.current += 1;
    ignoreExternalSearchSyncRef.current = true;

    setSearchInput("");
    latestSearchRef.current = "";
    lastSentSearchRef.current = "";

    sendImmediateSearch("");

    requestAnimationFrame(() => {
      if (mountedRef.current) searchInputRef.current?.focus({ preventScroll: true });
    });
  }, [sendImmediateSearch]);

  /* ---------------------------- date --------------------------------- */

  const getTodayDate = useCallback(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const handleDateChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      if (!value) return;

      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return;

      if (value <= getTodayDate()) onChange(value);
    },
    [getTodayDate, onChange]
  );

  /* ------------------------- select / clear --------------------------- */

  const shouldShowRemoveIcon = useMemo(() => {
    if (inputType === "date") return false;
    if (!showRemoveOption) return false;
    return hasSelection;
  }, [inputType, showRemoveOption, hasSelection]);

  const toggleValue = useCallback(
    (option: Option) => {
      if (option.label) selectedLabelMapRef.current.set(option.value, option.label);

      if (inputType === "multi-select") {
        const exists = selectedValues.includes(option.value);
        const next = exists
          ? selectedValues.filter((value) => value !== option.value)
          : [...selectedValues, option.value];
        onChange(next);
        return;
      }

      if (inputType === "single-select") {
        onChange(option.value);

        searchGenRef.current += 1;
        ignoreExternalSearchSyncRef.current = true;
        setSearchInput("");
        latestSearchRef.current = "";
        lastSentSearchRef.current = "";
        sendImmediateSearch("");
        setIsOpen(false);
      }
    },
    [inputType, onChange, selectedValues, sendImmediateSearch]
  );

  const handleClear = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (disabled) return;

      if (inputType === "date") {
        onChange(getTodayDate());
        return;
      }

      searchGenRef.current += 1;
      ignoreExternalSearchSyncRef.current = true;

      onClear();

      setSearchInput("");
      latestSearchRef.current = "";
      lastSentSearchRef.current = "";
      sendImmediateSearch("");

      requestAnimationFrame(() => {
        if (mountedRef.current) searchInputRef.current?.focus({ preventScroll: true });
      });
    },
    [disabled, getTodayDate, inputType, onChange, onClear, sendImmediateSearch]
  );

  const handleToggle = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (disabled) return;

      setIsOpen((previous) => {
        const next = !previous;
        // Compute position synchronously, in the same tick as opening, so the
        // panel's very first paint already has the correct coordinates —
        // otherwise it briefly renders at the stale {top:0,left:0} default
        // (top-left of the screen) before the effect corrects it.
        if (next) updateDropdownPosition();
        return next;
      });
    },
    [disabled, updateDropdownPosition]
  );

  /* ------------------------- infinite scroll --------------------------- */

  const handleListScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (loading || hasScrolledToBottomRef.current || !onScrollBottom) return;

      const el = event.currentTarget;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;

      if (distanceFromBottom < SCROLL_BOTTOM_THRESHOLD) {
        hasScrolledToBottomRef.current = true;
        onScrollBottom();
      }
    },
    [loading, onScrollBottom]
  );

  /* ---------------------------- filtering ------------------------------ */

  const filteredOptions = useMemo(() => {
    const compareSearch = normalizeForCompare(cleanApiSearch(searchInput));
        // Every typed word must be found somewhere in the label/value (any order),
    // so "masala" finds "Chicken Masala" and "egg " behaves exactly like "egg".
    const searchTokens = cleanApiSearch(searchInput)
      .split(/\s+/)
      .map(normalizeForCompare)
      .filter(Boolean);

    const rankOption = (option: Option) => {
      const label = normalizeForCompare(option.label);
      const value = normalizeForCompare(option.value);

      if (!compareSearch) return 0;
      if (label === compareSearch) return 0;
      if (label.startsWith(compareSearch)) return 1;
      if (value === compareSearch) return 2;
      if (value.startsWith(compareSearch)) return 3;
      return 99;
    };

    const unselectedOptions = safeOptions
      .filter((option) => {
        if (selectedValues.includes(option.value)) return false;
        if (!compareSearch) return true;

       const haystack = `${normalizeForCompare(option.label)}|${normalizeForCompare(option.value)}`;
        return searchTokens.every((token) => haystack.includes(token));
      })
      .sort((a, b) => {
        const rankDiff = rankOption(a) - rankOption(b);
        if (rankDiff !== 0) return rankDiff;
        return normalizeForCompare(a.label).localeCompare(normalizeForCompare(b.label));
      });

    return [...selectedOptionObjects, ...unselectedOptions];
  }, [safeOptions, searchInput, selectedOptionObjects, selectedValues]);

  /* ----------------------------- display -------------------------------- */

  const displayText = useMemo(() => {
    if (loading && disabled) return "Updating...";

    if (hasSelection && inputType === "date") {
      return displayLabel || String(selectedOptions || title);
    }

    if (hasSelection && inputType === "single-select") {
      return displayLabel || selectedOptionObjects[0]?.label || title;
    }

    if (hasSelection && inputType === "multi-select") {
      const count = Array.isArray(selectedOptions) ? selectedOptions.length : 1;
      return showSelectedCount ? `${title} (${count})` : title;
    }

    return title;
  }, [
    disabled,
    displayLabel,
    hasSelection,
    inputType,
    loading,
    selectedOptionObjects,
    selectedOptions,
    showSelectedCount,
    title,
  ]);

  /* ------------------------- trigger button classes ---------------------- */

  const triggerClasses = useMemo(() => {
    const base =
      "flex h-[36px] w-full min-w-0 items-center justify-between gap-2 rounded-xl border px-3 text-[13px] font-medium transition-all duration-200";

    if (disabled && loading) {
      return `${base} cursor-wait border-border bg-surface-subtle text-text-disabled`;
    }
    if (disabled) {
      return `${base} cursor-not-allowed border-border bg-surface-subtle text-text-disabled`;
    }
    if (isOpen) {
      return `${base} cursor-pointer border-brand-400 bg-white text-text-primary shadow-[0_0_0_3px_rgba(var(--brand-500-rgb),0.1)]`;
    }
    if (hasSelection) {
      return `${base} cursor-pointer border-brand-200 bg-brand-50/50 font-semibold text-brand-900 hover:border-brand-300`;
    }
    if (linked) {
      return `${base} cursor-pointer border-dashed border-border bg-white text-text-muted hover:border-text-disabled hover:bg-surface-subtle`;
    }
    return `${base} cursor-pointer border-border bg-white text-text-secondary hover:border-border hover:bg-surface-subtle`;
  }, [disabled, hasSelection, isOpen, linked, loading]);

  const iconColorClass = useMemo(() => {
    if (disabled) return "text-text-disabled";
    if (hasSelection || isOpen) return "text-brand-500";
    return "text-text-muted";
  }, [disabled, hasSelection, isOpen]);

  /* ------------------------------ render --------------------------------- */

  const renderOptionRow = (option: Option) => {
    const { main, group } = parseOptionLabel(option.label);
    const isSelected = selectedValues.includes(option.value);

    return (
      <div
        key={option.value}
        role="option"
        aria-selected={isSelected}
        onClick={() => toggleValue(option)}
        className={`flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left transition-all ${isSelected
          ? "bg-brand-50 text-brand-900"
          : "hover:bg-surface-subtle text-text-primary"
          } cursor-pointer`}
      >
        <div className="flex items-center justify-between gap-2">
          {/* <span
            // className={`min-w-0 flex-1 truncate text-[13px] leading-tight ${isSelected ? "font-bold" : "font-medium"
            //   }`}
            // replace the part 7 8 1
            className={`flex-1 break-words whitespace-normal text-[13px] leading-5 ${isSelected ? "font-bold" : "font-medium"
              }`}
          >
            {main}
          </span> */}
          {/* repalce the part 7 8 1 */}
          <span
            title={main}
            className={`min-w-0 flex-1 truncate text-[13px] leading-tight ${isSelected ? "font-bold" : "font-medium"
              }`}
          >
            {main}
          </span>

          {isSelected && <FaCheck className="h-3 w-3 flex-shrink-0 text-brand-500" />}
        </div>

        {group && (
          <span className={`ml-auto max-w-[75%] truncate text-[10px] font-semibold ${isSelected ? "text-brand-500/70" : "text-text-muted"}`}>
            {group}
          </span>
        )}
      </div>
    );
  };

  const renderDropdownContent = () => {
    if (inputType === "date") {
      const today = getTodayDate();

      if (restrictToTodayOnly) {
        return (
          <input
            type="date"
            value={today}
            readOnly
            disabled
            className="w-full cursor-not-allowed rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-400 outline-none"
          />
        );
      }

      return (
        <input
          type="date"
          value={typeof selectedOptions === "string" ? selectedOptions : ""}
          onChange={handleDateChange}
          max={today}
          className="w-full rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800 outline-none ring-1 ring-transparent transition-all focus:bg-white focus:ring-1 focus:ring-slate-300"
        />
      );
    }

    return (
      <div className="flex max-h-full flex-col">
        {/* search box */}
        <div className="mb-2 flex items-center gap-2 px-1 pb-2 border-b border-slate-100 transition-all focus-within:border-slate-300">
          <FaSearch className="h-3 w-3 flex-shrink-0 text-text-muted" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchInput}
            onChange={handleInputChange}
            placeholder={`Search ${title.toLowerCase()}`}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-disabled font-medium"
          />
          {loading && <FaSpinner className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-text-muted" />}
          {!loading && searchInput && (
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                handleClearSearch();
              }}
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-border hover:text-text-primary transition-colors"
              title="Clear search"
              aria-label="Clear search"
            >
              <FaTimes className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* options list */}
        <div
          ref={listRef}
          onScroll={handleListScroll}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:thin]"
          style={{ maxHeight: dropdownPosition.maxHeight - 44 }}
          role="listbox"
        >
          {filteredOptions.length === 0 && !loading && (
            <div className="px-2.5 py-6 text-center text-xs font-medium text-slate-400">
              {searchInput ? "No matching options" : "No options"}
            </div>
          )}

          {filteredOptions.map(renderOptionRow)}

          {loading && (
            <div className="flex items-center justify-center gap-1.5 px-2.5 py-3 text-[11px] font-semibold text-slate-400">
              <FaSpinner className="h-3 w-3 animate-spin" />
              {loadingText}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="relative w-full min-w-0 max-w-full flex-1"
      style={{ zIndex: isOpen ? 9999 : 1 }}
    >
      <div
        ref={buttonRef}
        onClick={handleToggle}
        className={triggerClasses}
        title={loading && disabled ? loadingText : statusLabel || String(displayText)}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate leading-tight">
          {hasSelection && (
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-500" />
          )}
          <span className="truncate">{displayText}</span>
        </span>

        <div className={`flex flex-shrink-0 items-center gap-1.5 ${iconColorClass}`}>
          {loading && !disabled && <FaSpinner className="h-3 w-3 animate-spin" />}

          {shouldShowRemoveIcon && (
            <FaTimes
              onClick={handleClear}
              title="Clear"
              className="h-3 w-3 cursor-pointer text-slate-400 hover:text-red-500"
            />
          )}

          <FaChevronDown
            className={`h-2.5 w-2.5 transition-transform duration-150 ${isOpen ? "rotate-180" : "rotate-0"
              }`}
          />
        </div>
      </div>

      {isOpen &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              top: dropdownPosition.top + 4,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              maxHeight: dropdownPosition.maxHeight,
              zIndex: 999999,
            }}
            className={`overflow-hidden rounded-xl border border-border bg-white p-2 shadow-2xl transition-all duration-200 ease-out ${panelVisible ? "translate-y-0 opacity-100 scale-100" : "-translate-y-2 opacity-0 scale-95"
              }`}
          >
            {renderDropdownContent()}
          </div>,
          document.body
        )}
    </div>
  );
};

export default React.memo(CollapsibleFilter);