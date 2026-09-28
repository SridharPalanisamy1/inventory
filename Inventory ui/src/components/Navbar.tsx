"use client";

import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Image from "next/image";
import { AppDispatch } from "@/redux/store";
import { fetchBusinesses, fetchPhoto, selectBusinesses } from "@/features/businessSlice";
import { logout } from "@/features/authSlice";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavbarProps {
  moduleName: string;
  username: string;
  onToggleMenu: () => void;
}

export interface Business {
  businessId: string;
  companyName: string;
  address1: string;
  address2: string;
  phoneNo: string;
  emailId: string;
  gstIn: string;
  createdDate: Date | null;
  lastupdatedDate: Date | null;
  status: string;
  randomId: string;
  imageUrl: string | null;
  isFetched: boolean;
}

export interface Photo {
  filename: string;
  id: string;
  imageUrl: string;
}

export interface BusinessPhotoState {
  businesses: Business[];
  photos: Photo[];
  loading: boolean;
  error: string | null;
  snackbarOpen: boolean;
  snackbarMessage: string;
  searchQuery: string;
  editIndex: number | null;
  dialogOpen: "none" | "edit";
  businessData: Business;
  uploadStatus: "idle" | "loading" | "succeeded" | "failed";
  uploadError: string | null;
}

export const initialState: BusinessPhotoState = {
  businesses: [],
  photos: [],
  loading: false,
  error: null,
  snackbarOpen: false,
  snackbarMessage: "",
  searchQuery: "",
  editIndex: null,
  dialogOpen: "none",
  businessData: {
    businessId: "",
    companyName: "",
    address1: "",
    address2: "",
    phoneNo: "",
    emailId: "",
    gstIn: "",
    createdDate: null,
    lastupdatedDate: null,
    status: "active",
    randomId: "",
    imageUrl: null,
    isFetched: false,
  },
  uploadStatus: "idle",
  uploadError: null,
};

// ─── Hamburger Icon ───────────────────────────────────────────────────────────

const HamburgerIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

// ─── Logout Icon ──────────────────────────────────────────────────────────────

const LogoutIcon: React.FC = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

// ─── Navbar Component ─────────────────────────────────────────────────────────

const Navbar: React.FC<NavbarProps> = ({ moduleName, onToggleMenu }) => {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const { businesses } = useSelector(selectBusinesses);
  const [fetchedBusinessIds, setFetchedBusinessIds] = useState(new Set<string>());
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);

  // ── Fetch businesses + photos ──────────────────────────────────────────────
  useEffect(() => {
    dispatch(fetchBusinesses());
  }, [dispatch]);

  useEffect(() => {
    businesses.forEach((business: Business) => {
      if (!fetchedBusinessIds.has(business.businessId)) {
        dispatch(fetchPhoto(business.businessId));
        setFetchedBusinessIds((prev) => new Set([...prev, business.businessId]));
      }
    });
  }, [businesses, fetchedBusinessIds, dispatch]);

  const handleConfirmLogout = () => {
    setIsLogoutOpen(false);
    dispatch(logout());
    router.replace("/");
  };

  return (
    <>
      {/* ─── Top Bar ──────────────────────────────────────────────────────── */}
      <header
        className="
          flex h-11 items-center w-full
          bg-white/90 backdrop-blur-sm
          border-b border-border
          px-3 gap-3
          shadow-sm
        "
      >
        {/* Hamburger */}
        <button
          onClick={onToggleMenu}
          aria-label="Toggle menu"
          className="
            h-8 w-8 flex items-center justify-center
            rounded-[8px] text-text-muted
            hover:text-text-primary hover:bg-surface-subtle
            transition-colors duration-150 shrink-0
          "
        >
          <HamburgerIcon />
        </button>

        {/* Logo */}
        <div className="shrink-0 flex items-center">
          <Image
            src="/images/blacklogo.png"
            alt="YEN ERP Logo"
            width={90}
            height={36}
            className="object-contain"
            priority
          />
        </div>

        {/* Module name — centred */}
        <div className="flex-1 flex justify-center min-w-0">
          {moduleName && (
            <span
              className="
                text-[12px] font-bold tracking-wide text-text-secondary
                uppercase truncate max-w-sm
              "
            >
              {moduleName}
            </span>
          )}
        </div>

        {/* Right side — business logo + logout */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Business logo(s) — hidden on very narrow screens to keep the topbar from overflowing */}
          {businesses.length > 0
            ? businesses.map((b: Business) => (
                <div key={b.businessId} className="hidden sm:flex h-7 w-7 overflow-hidden rounded-full border border-border bg-surface-subtle items-center justify-center">
                  {b.imageUrl ? (
                    <Image
                      src={b.imageUrl}
                      alt={b.companyName}
                      width={28}
                      height={28}
                      className="object-cover"
                      unoptimized={b.imageUrl.includes("http")}
                    />
                  ) : (
                    <span className="text-[9px] text-text-muted font-semibold">YEN</span>
                  )}
                </div>
              ))
            : null}

          {/* Logout button */}
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<LogoutIcon />}
            onClick={() => setIsLogoutOpen(true)}
            aria-label="Logout"
            className="text-text-muted hover:text-danger-600 hover:bg-danger-50"
          >
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </header>

      {/* ─── Logout Confirm Modal ──────────────────────────────────────────── */}
      <Modal
        open={isLogoutOpen}
        onClose={() => setIsLogoutOpen(false)}
        size="xs"
        title="Logout?"
        description="Your current ERP session will be closed on this device."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setIsLogoutOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" leftIcon={<LogoutIcon />} onClick={handleConfirmLogout}>
              Logout
            </Button>
          </>
        }
      />
    </>
  );
};

export default Navbar;
