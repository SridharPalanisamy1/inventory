"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../redux/store";
import { hydrateAuth, logout, logoutThisTabOnly } from "@/features/authSlice";
import SideMenu from "../components/SideMenu";
import Navbar from "../components/Navbar";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  AUTH_LOGOUT_EVENT_KEY,
  AUTH_STORAGE_KEY,
  ActiveModuleLock,
  broadcastLogoutOtherTabs,
  claimModuleLock,
  forceClaimModuleLock,
  getTabSessionId,
  readStoredAuth,
  refreshModuleLock,
  releaseModuleLock,
} from "@/lib/auth-storage";

// ─── Constants ────────────────────────────────────────────────────────────────

const SIDEBAR_OPEN_WIDTH   = 56;   // collapsed icon-only width
const SIDEBAR_CLOSED_WIDTH = 0;

// ─── Conflict Warning Icon ────────────────────────────────────────────────────

const ConflictIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-warning-500">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

// ─── ClientLayout ─────────────────────────────────────────────────────────────

const ClientLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router   = useRouter();
  const pathname = usePathname();
  const dispatch = useDispatch();

  const isLoginPage = pathname === "/" || pathname === "/login";
  const [authLoaded, setAuthLoaded] = useState(false);
  const [blockedLock, setBlockedLock] = useState<ActiveModuleLock | null>(null);

  const isLoggedIn = useSelector((state: RootState) => state.auth.isLoggedIn);
  const username   = useSelector((state: RootState) => state.auth.username);

  const [isMenuOpen, setIsMenuOpen] = useState(true);

  // ── Derive module name from pathname ────────────────────────────────────────
  const selectedModule = useMemo(() => {
    if (!pathname) return "";
    if (pathname.startsWith("/yen-inventory/OutletsInventoryManagement"))  return "Outlets Inventory Management";
    if (pathname.startsWith("/yen-inventory/WarehouseInventoryManagement")) return "Warehouse Inventory Management";
    return pathname.split("/")[1] || "";
  }, [pathname]);

  const activeModuleKey = useMemo(() => {
    if (!pathname || isLoginPage) return "";
    if (pathname.startsWith("/yen-inventory/OutletsInventoryManagement"))  return "outlets-inventory";
    if (pathname.startsWith("/yen-inventory/WarehouseInventoryManagement")) return "warehouse-inventory";
    if (pathname.startsWith("/yen-inventory")) return "yen-inventory";
    return "";
  }, [isLoginPage, pathname]);

  const sidebarWidth = isLoggedIn && !isLoginPage && isMenuOpen
    ? SIDEBAR_OPEN_WIDTH
    : SIDEBAR_CLOSED_WIDTH;

  // ── Hydrate auth from localStorage ─────────────────────────────────────────
  useEffect(() => {
    const stored = readStoredAuth();
    if (stored) {
      dispatch(hydrateAuth({ username: stored.username, token: stored.token }));
    } else {
      dispatch(logout());
    }
    setAuthLoaded(true);
  }, [dispatch]);

  // ── Auth-based routing ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoaded) return;
    const stored = readStoredAuth();
    if (isLoggedIn && !stored) { dispatch(logout()); router.replace("/"); return; }
    if (!isLoggedIn && !isLoginPage) {
      router.replace(`/?next=${encodeURIComponent(pathname || "/yen-inventory")}`);
      return;
    }
    if (isLoggedIn && isLoginPage) {
      router.replace("/yen-inventory/OutletsInventoryManagement/OutletPhysicalStockModification");
    }
  }, [authLoaded, dispatch, isLoggedIn, isLoginPage, router, pathname]);

  // ── Session watchdog ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoaded || !isLoggedIn) return;
    const id = window.setInterval(() => {
      if (!readStoredAuth()) { dispatch(logout()); router.replace("/"); }
    }, 30_000);
    return () => window.clearInterval(id);
  }, [authLoaded, dispatch, isLoggedIn, router]);

  // ── Module lock ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoaded || !isLoggedIn || !activeModuleKey || !username) {
      setBlockedLock(null);
      return;
    }
    const claim = claimModuleLock(activeModuleKey, username);
    if (claim.status === "blocked") { setBlockedLock(claim.lock); return; }
    setBlockedLock(null);
    const id = window.setInterval(() => {
      const refreshed = refreshModuleLock(activeModuleKey, username);
      if (!refreshed) {
        setBlockedLock({ moduleKey: activeModuleKey, ownerId: "", username, updatedAt: Date.now() });
      }
    }, 5_000);
    return () => { window.clearInterval(id); releaseModuleLock(activeModuleKey); };
  }, [activeModuleKey, authLoaded, isLoggedIn, username]);

  // ── Cross-tab logout listener ───────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === AUTH_STORAGE_KEY && e.newValue === null) {
        dispatch(logoutThisTabOnly()); router.replace("/"); return;
      }
      if (e.key !== AUTH_LOGOUT_EVENT_KEY || !e.newValue) return;
      try {
        const p = JSON.parse(e.newValue) as { ownerId?: string };
        if (p.ownerId && p.ownerId === getTabSessionId()) return;
      } catch { /* ignore */ }
      dispatch(logoutThisTabOnly()); router.replace("/");
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [dispatch, router]);

  // ── Persist menu state (skip stored "open" on narrow screens — start collapsed) ──
  useEffect(() => {
    const isNarrow = window.matchMedia("(max-width: 767px)").matches;
    if (isNarrow) { setIsMenuOpen(false); return; }
    try {
      const stored = localStorage.getItem("isMenuOpen");
      if (stored !== null) setIsMenuOpen(JSON.parse(stored));
    } catch { setIsMenuOpen(true); }
  }, []);

  useEffect(() => {
    try { localStorage.setItem("isMenuOpen", JSON.stringify(isMenuOpen)); } catch { /* ignore */ }
  }, [isMenuOpen]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleMenuClick = (item: { path: string; text: string }) => router.push(item.path);
  const handleTakeOver  = () => {
    if (!activeModuleKey || !username) return;
    broadcastLogoutOtherTabs();
    forceClaimModuleLock(activeModuleKey, username);
    setBlockedLock(null);
  };
  const handleStayOut = () => { dispatch(logoutThisTabOnly()); router.replace("/"); };

  // ── Loading / redirect splash ────────────────────────────────────────────────
  if (!authLoaded)              return <div className="w-screen h-dvh bg-white" />;
  if (isLoggedIn && isLoginPage) return <div className="w-screen h-dvh bg-surface-muted" />;

  return (
    <div
      className="h-dvh w-screen overflow-hidden bg-surface-muted"
      style={{
        "--app-sidebar-width":  `${sidebarWidth}px`,
        "--app-topbar-height":  "44px",
      } as React.CSSProperties}
    >
      {/* Sidebar */}
      {isLoggedIn && !isLoginPage && isMenuOpen && (
        <aside
          className="fixed left-0 top-0 bottom-0 z-[1200]"
          style={{ width: SIDEBAR_OPEN_WIDTH }}
        >
          <SideMenu onMenuClick={handleMenuClick} activePath={pathname || ""} />
        </aside>
      )}

      {/* Main content area */}
      <section
        className="h-dvh min-w-0 overflow-hidden transition-[padding] duration-200"
        style={{ paddingLeft: sidebarWidth }}
      >
        {/* Topbar */}
        {isLoggedIn && !isLoginPage && (
          <div className="sticky top-0 z-[1100] w-full" style={{ height: "var(--app-topbar-height)" }}>
            <Navbar
              moduleName={selectedModule}
              username={username || ""}
              onToggleMenu={() => setIsMenuOpen((p) => !p)}
            />
          </div>
        )}

        {/* Page content */}
        <main
          className="min-w-0 overflow-hidden bg-surface-muted"
          style={{
            height: isLoggedIn && !isLoginPage
              ? "calc(100dvh - var(--app-topbar-height))"
              : "100dvh",
          }}
        >
          <div className="h-full min-w-0 overflow-hidden px-1">
            {children}
          </div>
        </main>
      </section>

      {/* ─── Module Already Open Dialog ─────────────────────────────────────── */}
      <Modal
        open={Boolean(blockedLock)}
        disableClose
        size="xs"
        title={
          <span className="flex items-center gap-2">
            <ConflictIcon />
            Module already open
          </span>
        }
        description="This module is already open in another tab. Do you want to logout the previous tab and continue here?"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={handleStayOut}>
              No, go back
            </Button>
            <Button variant="primary" size="sm" onClick={handleTakeOver}>
              Yes, continue here
            </Button>
          </>
        }
      />
    </div>
  );
};

export default ClientLayout;
