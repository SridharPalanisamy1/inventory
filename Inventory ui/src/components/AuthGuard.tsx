"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import type { RootState } from "@/redux/store";
import { readStoredAuth } from "@/lib/auth-storage";

type AuthGuardProps = {
  children: React.ReactNode;
};

const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const router = useRouter();
  const pathname = usePathname();

  const reduxAuth = useSelector((state: RootState) => state.auth);

  const [checking, setChecking] = React.useState(true);
  const [allowed, setAllowed] = React.useState(false);

  React.useEffect(() => {
    const storedAuth = readStoredAuth();

    const hasToken =
      Boolean(reduxAuth?.isLoggedIn && reduxAuth?.token) ||
      Boolean(storedAuth?.isLoggedIn && storedAuth?.token);

    if (!hasToken) {
      setAllowed(false);
      setChecking(false);

      const nextPath = pathname || "/yen-inventory";
      router.replace(`/?next=${encodeURIComponent(nextPath)}`);
      return;
    }

    setAllowed(true);
    setChecking(false);
  }, [reduxAuth?.isLoggedIn, reduxAuth?.token, pathname, router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600">
        Checking login...
      </div>
    );
  }

  if (!allowed) {
    return null;
  }

  return <>{children}</>;
};

export default AuthGuard;
