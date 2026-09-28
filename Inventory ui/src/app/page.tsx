"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { loginSuccess } from "@/features/authSlice";
import { getApiErrorMessage } from "@/components/Inventory/shared/apiError";

const LOGIN_API_URL = process.env.NEXT_PUBLIC_MASTER_LOGIN_URL || "https://yenerp.com/masteradminapi/login/";


const useLogin = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const dispatch = useDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();

  const safeNextPath = useMemo(() => {
    const next = searchParams.get("next");
    if (!next) return "/yen-inventory";
    if (!next.startsWith("/") || next.startsWith("//")) {
      return "/yen-inventory";
    }
    return next;
  }, [searchParams]);

  const handleLogin = useCallback(async () => {
    if (isSubmitting || isSuccess) return;
    const cleanUsername = username.trim();

    if (!cleanUsername || !password.trim()) {
      setError("Please provide your access credentials.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await axios.post(LOGIN_API_URL, {
        username: cleanUsername,
        password,
      });

      const accessToken = response.data?.access_token;
      if (!accessToken) {
        setError("Invalid server response.");
        setIsSubmitting(false);
        return;
      }

      dispatch(loginSuccess({ username: cleanUsername, token: accessToken }));
      localStorage.setItem("username", cleanUsername);
      // Trigger the convergence + full-screen success takeover
      setIsSuccess(true);

      // Allow the animation to play fully before routing
      setTimeout(() => {
        router.replace(safeNextPath);
      }, 2400);
    } catch (err) {
      let errorMessage = getApiErrorMessage(err, "Authentication failed.");
      if (axios.isAxiosError(err) && err.response) {
        if (err.response.status === 400 || err.response.status === 401) {
          errorMessage = "Access denied. Invalid credentials.";
        }
      }
      setError(errorMessage);
      setIsSubmitting(false);
    }
  }, [username, password, isSubmitting, isSuccess, dispatch, router, safeNextPath]);

  return {
    username,
    setUsername,
    password,
    setPassword,
    isSubmitting,
    isSuccess,
    error,
    handleLogin,
  };
};

/* ------------------------------------------------------------------ */
/* Reusable floating-label input                                       */
/* ------------------------------------------------------------------ */

interface FloatingInputProps {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  disabled: boolean;
  icon: React.ReactNode;
  rightElement?: React.ReactNode;
  focusedField: string | null;
  setFocusedField: (v: string | null) => void;
}

const FloatingInput: React.FC<FloatingInputProps> = ({
  id,
  label,
  type,
  value,
  onChange,
  onKeyDown,
  disabled,
  icon,
  rightElement,
  focusedField,
  setFocusedField,
}) => {
  const active = Boolean(value) || focusedField === id;

  return (
    <div className="relative mb-5">
      <div
        className={`pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 transition-all duration-200 ${
          active ? "text-blue-600" : "text-slate-400"
        }`}
      >
        {icon}
      </div>

      <label
        htmlFor={id}
        className={`pointer-events-none absolute font-medium transition-all duration-200 ${
          active
            ? "left-3 -top-2 text-[11px] font-semibold text-blue-600 bg-white px-1.5"
            : "left-[42px] top-1/2 -translate-y-1/2 text-[13px] text-slate-500"
        }`}
      >
        {label}
      </label>

      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocusedField(id)}
        onBlur={() => setFocusedField(null)}
        onKeyDown={onKeyDown}
        className="h-12 w-full rounded-[10px] border border-slate-200 bg-transparent pl-[42px] pr-4 text-[14px] text-slate-900 outline-none transition-all duration-200 focus:border-blue-600 focus:shadow-[0_0_0_3px_rgba(37,99,235,0.1)]"
      />

      {rightElement && (
        <div className="absolute right-[14px] top-1/2 -translate-y-1/2">{rightElement}</div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Main component                                                       */
/* ------------------------------------------------------------------ */

const Login: React.FC = () => {
  const {
    username,
    setUsername,
    password,
    setPassword,
    isSubmitting,
    isSuccess,
    error,
    handleLogin,
  } = useLogin();

  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isSubmitting) {
      handleLogin();
    }
  };

  const formInner = (
    <>
      <header className="mb-8 flex items-center gap-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-[14px] font-extrabold text-white">
          Y
        </div>
        <span className="text-[20px] font-bold tracking-tight text-slate-900">YEN ERP</span>
      </header>

      <h1 className="mb-6 text-[21px] font-semibold text-slate-900">Secure Authorization</h1>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700 [animation:shake_0.4s_ease-in-out]">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="shrink-0">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          {error}
        </div>
      )}

      <form
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          handleLogin();
        }}
      >
        <FloatingInput
          id="username"
          label="User ID"
          type="text"
          value={username}
          onChange={setUsername}
          onKeyDown={handleKeyDown}
          disabled={isSubmitting || isSuccess}
          focusedField={focusedField}
          setFocusedField={setFocusedField}
          icon={
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          }
        />

        <FloatingInput
          id="password"
          label="Security Key"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={setPassword}
          onKeyDown={handleKeyDown}
          disabled={isSubmitting || isSuccess}
          focusedField={focusedField}
          setFocusedField={setFocusedField}
          icon={
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          }
          rightElement={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-slate-400 transition-colors hover:text-slate-700"
            >
              {showPassword ? (
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M3 3l18 18"
                  />
                </svg>
              ) : (
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              )}
            </button>
          }
        />

        <button
          type="submit"
          disabled={isSubmitting || isSuccess}
          className="mt-2 flex h-12 w-full items-center justify-center rounded-[10px] bg-blue-600 text-[14px] font-semibold text-white transition-all duration-200 hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(37,99,235,0.25)] disabled:opacity-70"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
              </svg>
              Authenticating...
            </span>
          ) : (
            "Establish Connection"
          )}
        </button>
      </form>
    </>
  );

  return (
    <>
      {/* Custom keyframes Tailwind doesn't ship out of the box */}
      <style jsx global>{`
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-60px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(60px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes gridDrift {
          from { background-position: 0 0; }
          to { background-position: 40px 40px; }
        }
        @keyframes overlayReveal {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes floatUp {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes drawCheck {
          from { stroke-dashoffset: 1; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
      `}</style>

      <main className="relative min-h-screen w-full overflow-hidden bg-slate-50 p-4 font-sans sm:p-8">
        <div className="flex min-h-screen w-full items-center justify-center">
          {/* ===== Desktop / tablet layout (side-by-side panels) ===== */}
          <div className="relative hidden h-[540px] w-full max-w-5xl items-center lg:flex">
            {/* Blue CRT-style panel */}
            <aside
              className={`absolute right-0 h-full overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-2xl shadow-blue-900/20 [animation:slideInRight_0.8s_cubic-bezier(0.16,1,0.3,1)_forwards] ${
                isSuccess
                  ? "w-[62%] scale-95 opacity-0 transition-all duration-500 ease-out"
                  : "w-[62%] opacity-100 transition-all duration-500 ease-out"
              }`}
            >
              <div className="absolute inset-0 opacity-20 [animation:gridDrift_6s_linear_infinite] [background-image:linear-gradient(rgba(255,255,255,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.4)_1px,transparent_1px)] [background-size:40px_40px]" />
              <div className="relative z-10 flex h-full flex-col justify-center px-16 pl-[26%]">
                <h2 className="mb-4 text-4xl font-bold leading-tight tracking-tight">
                  Precision Stock Control.
                </h2>
                <p className="max-w-xs text-[15px] leading-relaxed text-white/90">
                  Lightweight, high-speed warehouse telemetry and real-time inventory synchronization.
                </p>
              </div>
            </aside>

            {/* Form card */}
            <section
              className={`absolute left-0 z-20 w-[420px] rounded-2xl border border-white/80 bg-white p-12 shadow-[0_20px_40px_-15px_rgba(15,23,42,0.15)] [animation:slideInLeft_0.8s_cubic-bezier(0.16,1,0.3,1)_forwards] ${
                isSuccess
                  ? "scale-95 opacity-0 transition-all duration-500 ease-out"
                  : "opacity-100 transition-all duration-500 ease-out"
              }`}
            >
              {formInner}
            </section>
          </div>

          {/* ===== Mobile layout (stacked, panel hidden) ===== */}
          <div className="w-full max-w-md lg:hidden">
            <section
              className={`rounded-2xl border border-white/80 bg-white p-8 shadow-[0_20px_40px_-15px_rgba(15,23,42,0.15)] transition-all duration-400 ease-out ${
                isSuccess ? "scale-95 opacity-0" : "opacity-100"
              }`}
            >
              {formInner}
            </section>
          </div>
        </div>

        {/* ===== Full-screen success takeover (all breakpoints) ===== */}
        {isSuccess && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-gradient-to-br from-blue-600 to-blue-800 [animation:overlayReveal_0.6s_cubic-bezier(0.16,1,0.3,1)_forwards]">
            <div className="absolute inset-0 opacity-20 [animation:gridDrift_6s_linear_infinite] [background-image:linear-gradient(rgba(255,255,255,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.4)_1px,transparent_1px)] [background-size:40px_40px]" />

            <div className="relative z-10 flex flex-col items-center px-6 text-center [animation:floatUp_0.6s_cubic-bezier(0.16,1,0.3,1)_0.25s_both]">
              <div className="relative mb-8 grid h-24 w-24 place-items-center">
                <span className="absolute inset-0 animate-ping rounded-full border-2 border-white/40 [animation-duration:1.8s]" />
                <span className="absolute inset-0 animate-ping rounded-full border-2 border-white/25 [animation-delay:0.35s] [animation-duration:1.8s]" />
                <div className="relative grid h-20 w-20 place-items-center rounded-full border-2 border-white/50 bg-white/15 shadow-[0_0_30px_rgba(255,255,255,0.15)]">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 13l4 4L19 7"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pathLength="1"
                      strokeDasharray="1"
                      strokeDashoffset="1"
                      style={{ animation: "drawCheck 0.5s cubic-bezier(0.16,1,0.3,1) 0.55s forwards" }}
                    />
                  </svg>
                </div>
              </div>

              <h2 className="mb-2 text-3xl font-bold tracking-tight text-white">Verified Successfully</h2>
              <p className="text-[15px] text-white/85">Admin Login Confirmed. Redirecting...</p>
            </div>
          </div>
        )}
      </main>
    </>
  );
};

export default Login;