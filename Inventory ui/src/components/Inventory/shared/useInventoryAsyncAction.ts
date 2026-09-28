"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { getApiErrorMessage } from "./apiError";

export type InventoryBusyType =
  | "loading"
  | "importing"
  | "exporting"
  | "saving"
  | "approving"
  | "deleting"
  | null;

type SnackbarSeverity = "info" | "success" | "error" | "warning";

export interface InventoryActionSnackbarState {
  open: boolean;
  message: string;
  severity: SnackbarSeverity;
  persist: boolean;
}

const defaultMessages: Record<Exclude<InventoryBusyType, null>, string> = {
  loading: "Loading inventory data...",
  importing: "Importing data. Please wait...",
  exporting: "Preparing export. Please wait...",
  saving: "Saving changes. Please wait...",
  approving: "Saving changes. Please wait...",
  deleting: "Saving changes. Please wait...",
};

export function useInventoryAsyncAction() {
  const [busyType, setBusyType] = useState<InventoryBusyType>(null);
  const [busyMessage, setBusyMessage] = useState("");
  const [snackbar, setSnackbar] = useState<InventoryActionSnackbarState>({
    open: false,
    message: "",
    severity: "info",
    persist: false,
  });
  const actionIdRef = useRef(0);

  const isBusy = busyType !== null;

  const showMessage = useCallback(
    (message: string, severity: SnackbarSeverity = "info", persist = false) => {
      setSnackbar({ open: true, message, severity, persist });
    },
    []
  );

  const closeSnackbar = useCallback((reason?: string) => {
    if (reason === "clickaway") return;
    setSnackbar((prev) => ({ ...prev, open: false }));
  }, []);

  const startAction = useCallback(
    (type: Exclude<InventoryBusyType, null>, message?: string) => {
      if (actionIdRef.current > 0 && busyType) return null;
      actionIdRef.current += 1;
      const actionId = actionIdRef.current;
      const nextMessage = message || defaultMessages[type];
      setBusyType(type);
      setBusyMessage(nextMessage);
      showMessage(nextMessage, "info", true);
      return actionId;
    },
    [busyType, showMessage]
  );

  const finishAction = useCallback(
    (successMessage?: string, actionId?: number | null) => {
      if (actionId && actionId !== actionIdRef.current) return;
      actionIdRef.current = 0;
      setBusyType(null);
      setBusyMessage("");
      if (successMessage) showMessage(successMessage, "success", false);
    },
    [showMessage]
  );

  const failAction = useCallback(
    (error?: unknown, fallback = "Something went wrong. Please try again.", actionId?: number | null) => {
      if (actionId && actionId !== actionIdRef.current) return;
      actionIdRef.current = 0;
      setBusyType(null);
      setBusyMessage("");
      showMessage(getApiErrorMessage(error, fallback), "error", false);
    },
    [showMessage]
  );

  const resetAction = useCallback(() => {
    actionIdRef.current = 0;
    setBusyType(null);
    setBusyMessage("");
    setSnackbar((prev) => ({ ...prev, open: false, persist: false }));
  }, []);

  return useMemo(
    () => ({
      isBusy,
      busyType,
      busyMessage,
      disableAllActions: isBusy,
      snackbar,
      showMessage,
      closeSnackbar,
      startAction,
      finishAction,
      failAction,
      resetAction,
    }),
    [
      isBusy,
      busyType,
      busyMessage,
      snackbar,
      showMessage,
      closeSnackbar,
      startAction,
      finishAction,
      failAction,
      resetAction,
    ]
  );
}
