"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const COLLAPSED_W = 56;   // px — icon-only
const EXPANDED_W = 240;  // px — full labels

// ─── Menu Config ─────────────────────────────────────────────────────────────

export interface MenuItem {
  text: string;
  icon: React.ReactNode;
  subItems: string[];
  path: string;
}

// ─── Icons (inline SVG — replaces @mui/icons-material) ───────────────────────

const InventoryIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const ChevronDownIcon: React.FC<{ open: boolean }> = ({ open }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn("transition-transform duration-200 shrink-0", open && "rotate-180")}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const CloseIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const MenuIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

// ─── Menu Items ───────────────────────────────────────────────────────────────

export const menuItems: MenuItem[] = [
  {
    text: "YEN INVENTORY",
    icon: <InventoryIcon />,
    subItems: [
      "Outlets Inventory Management",
      "Warehouse Inventory Management",
    ],
    path: "/yen-inventory",
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface SideMenuProps {
  onMenuClick: (menuItem: { path: string; text: string }) => void;
  activePath: string;
}

// ─── SideMenu Component ───────────────────────────────────────────────────────

const SideMenu: React.FC<SideMenuProps> = ({ onMenuClick, activePath }) => {
  const [open, setOpen] = useState(false);
  const [subMenuOpen, setSubMenuOpen] = useState<number | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const toggleDrawer = () => setOpen((p) => !p);
  const toggleSubMenu = (idx: number) =>
    setSubMenuOpen(subMenuOpen === idx ? null : idx);

  const handleClickMenu = (item: MenuItem, idx: number) => {
    if (item.subItems.length > 0) toggleSubMenu(idx);
    onMenuClick({ path: item.path, text: item.text });
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const width = open ? EXPANDED_W : COLLAPSED_W;

  return (
    <>
      {/* Backdrop — only shown while expanded on narrow screens */}
      {open && (
        <div
          className="fixed inset-0 z-[1199] bg-slate-900/40 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
      <div
        ref={drawerRef}
        style={{ width, transition: "width 200ms cubic-bezier(0.4,0,0.2,1)" }}
        className="
          relative flex flex-col h-full overflow-hidden
          bg-slate-900 border-r border-slate-800
          shadow-xl
        "
      >
        {/* ─── Header ──────────────────────────────────────────────────────── */}
        <div
          className={cn(
            "flex items-center shrink-0 border-b border-slate-800",
            "h-11 px-3",
            open ? "justify-between" : "justify-center"
          )}
        >
          {open && (
            <Image
              src="/images/bluelogo.png"
              alt="YEN ERP"
              width={96}
              height={32}
              className="object-contain"
            />
          )}
          <button
            onClick={toggleDrawer}
            aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
            className="
            h-7 w-7 flex items-center justify-center rounded-lg
            text-slate-400 hover:text-white hover:bg-slate-700
            transition-colors duration-150 shrink-0
          "
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>

        {/* ─── Menu List ───────────────────────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 no-scrollbar">
          {menuItems.map((item, idx) => {
            const isActive = activePath?.startsWith(item.path);
            const isSubOpen = subMenuOpen === idx && open;

            return (
              <React.Fragment key={idx}>
                {/* Menu Item */}
                <button
                  onClick={() => handleClickMenu(item, idx)}
                  title={!open ? item.text : undefined}
                  className={cn(
                    "group w-full flex items-center gap-3 px-3 py-2.5",
                    "transition-colors duration-150 cursor-pointer",
                    isActive
                      ? "text-brand-400 bg-slate-800"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                  )}
                >
                  {/* Icon */}
                  <span className="shrink-0 flex flex-col items-center gap-0.5">
                    <span className={cn(
                      "transition-colors",
                      isActive ? "text-brand-400" : "text-slate-400 group-hover:text-white"
                    )}>
                      {item.icon}
                    </span>
                    {!open && (
                      <span className="text-[9px] font-bold text-center leading-none text-slate-500 group-hover:text-slate-300 max-w-[48px] truncate">
                        INV
                      </span>
                    )}
                  </span>

                  {/* Label + chevron (only when expanded) */}
                  {open && (
                    <>
                      <span className="flex-1 text-[12px] font-bold text-left whitespace-nowrap tracking-wide">
                        {item.text}
                      </span>
                      {item.subItems.length > 0 && (
                        <ChevronDownIcon open={isSubOpen} />
                      )}
                    </>
                  )}
                </button>

                {/* Sub-items (only when expanded) */}
                {open && item.subItems.length > 0 && (
                  <div
                    className="overflow-hidden transition-all duration-300 ease-in-out px-2"
                    style={{ maxHeight: isSubOpen ? item.subItems.length * 48 + 10 : 0, opacity: isSubOpen ? 1 : 0, paddingBottom: isSubOpen ? '8px' : '0px' }}
                  >
                    <div className="flex flex-col gap-1 mt-1 border-l border-slate-700 ml-4 pl-2">
                      {item.subItems.map((sub, i) => {
                        const pathEquivalent = sub.replace(/\s+/g, "");
                        const isSubActive = activePath?.toLowerCase().includes(pathEquivalent.toLowerCase());

                        return (
                          <button
                            key={i}
                            onClick={() => onMenuClick({ path: item.path, text: sub })}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11.5px] font-semibold transition-all duration-200",
                              isSubActive
                                ? "bg-brand-600 text-white shadow-md shadow-brand-900/20"
                                : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                            )}
                          >
                            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0 transition-colors", isSubActive ? "bg-white" : "bg-slate-600")} />
                            <span className="truncate text-left">{sub}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </nav>

        {/* ─── Footer ──────────────────────────────────────────────────────── */}
        {open && (
          <div className="shrink-0 border-t border-slate-800 px-3 py-2">
            <p className="text-[10px] font-medium text-slate-600 text-center">
              YEN ERP · Inventory
            </p>
          </div>
        )}
      </div>
    </>
  );
};

export default SideMenu;
