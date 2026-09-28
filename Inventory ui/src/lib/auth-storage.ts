"use client";

export const AUTH_STORAGE_KEY = "auth";
export const AUTH_SESSION_MS = 2 * 60 * 60 * 1000;
export const AUTH_LOGOUT_EVENT_KEY = "yen_inventory_auth_logout_event";
const ACTIVE_MODULE_PREFIX = "yen_inventory_active_module:";
const TAB_SESSION_KEY = "yen_inventory_tab_session_id";
const LEGACY_TOKEN_KEY = "token";
const LEGACY_USERNAME_KEY = "username";
const MODULE_LOCK_STALE_MS = 15_000;

export interface StoredAuth {
  isLoggedIn: boolean;
  username: string;
  token: string;
  expiresAt: number;
  issuedAt: number;
}

export interface ActiveModuleLock {
  moduleKey: string;
  ownerId: string;
  username: string;
  updatedAt: number;
}

const isValidStoredAuth = (value: unknown): value is StoredAuth => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const auth = value as Partial<StoredAuth>;
  return (
    auth.isLoggedIn === true &&
    typeof auth.username === "string" &&
    auth.username.trim().length > 0 &&
    typeof auth.token === "string" &&
    auth.token.trim().length > 0 &&
    typeof auth.expiresAt === "number" &&
    auth.expiresAt > Date.now()
  );
};

const canUseStorage = () => typeof window !== "undefined";

const moduleLockKey = (moduleKey: string) => `${ACTIVE_MODULE_PREFIX}${moduleKey}`;

const createTabSessionId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const readModuleLock = (moduleKey: string): ActiveModuleLock | null => {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const stored = localStorage.getItem(moduleLockKey(moduleKey));
    if (!stored) return null;

    const parsed = JSON.parse(stored) as Partial<ActiveModuleLock>;
    if (
      typeof parsed.moduleKey === "string" &&
      typeof parsed.ownerId === "string" &&
      typeof parsed.username === "string" &&
      typeof parsed.updatedAt === "number"
    ) {
      return parsed as ActiveModuleLock;
    }
  } catch {
    localStorage.removeItem(moduleLockKey(moduleKey));
  }

  return null;
};

export const persistAuth = (auth: { username: string; token: string }) => {
  if (!canUseStorage()) {
    return;
  }

  const issuedAt = Date.now();

  const value: StoredAuth = {
    isLoggedIn: true,
    username: auth.username,
    token: auth.token,
    issuedAt,
    expiresAt: issuedAt + AUTH_SESSION_MS,
  };

  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(value));
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_USERNAME_KEY);
};

export const clearPersistedAuth = () => {
  if (!canUseStorage()) {
    return;
  }

  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_USERNAME_KEY);
};

export const getTabSessionId = () => {
  if (!canUseStorage()) {
    return "";
  }

  let tabId = sessionStorage.getItem(TAB_SESSION_KEY);
  if (!tabId) {
    tabId = createTabSessionId();
    sessionStorage.setItem(TAB_SESSION_KEY, tabId);
  }

  return tabId;
};

export const claimModuleLock = (
  moduleKey: string,
  username: string
):
  | { status: "claimed"; lock: ActiveModuleLock }
  | { status: "blocked"; lock: ActiveModuleLock } => {
  const ownerId = getTabSessionId();
  const now = Date.now();
  const existingLock = readModuleLock(moduleKey);

  if (
    existingLock &&
    existingLock.ownerId !== ownerId &&
    now - existingLock.updatedAt <= MODULE_LOCK_STALE_MS
  ) {
    return { status: "blocked", lock: existingLock };
  }

  const lock: ActiveModuleLock = {
    moduleKey,
    ownerId,
    username,
    updatedAt: now,
  };

  localStorage.setItem(moduleLockKey(moduleKey), JSON.stringify(lock));
  return { status: "claimed", lock };
};

export const refreshModuleLock = (moduleKey: string, username: string) => {
  if (!canUseStorage()) return false;

  const ownerId = getTabSessionId();
  const currentLock = readModuleLock(moduleKey);

  if (currentLock && currentLock.ownerId !== ownerId) {
    return false;
  }

  const lock: ActiveModuleLock = {
    moduleKey,
    ownerId,
    username,
    updatedAt: Date.now(),
  };

  localStorage.setItem(moduleLockKey(moduleKey), JSON.stringify(lock));
  return true;
};

export const forceClaimModuleLock = (moduleKey: string, username: string) => {
  const ownerId = getTabSessionId();
  const lock: ActiveModuleLock = {
    moduleKey,
    ownerId,
    username,
    updatedAt: Date.now(),
  };

  localStorage.setItem(moduleLockKey(moduleKey), JSON.stringify(lock));
  return lock;
};

export const releaseModuleLock = (moduleKey: string) => {
  if (!canUseStorage()) return;

  const ownerId = getTabSessionId();
  const currentLock = readModuleLock(moduleKey);

  if (!currentLock || currentLock.ownerId === ownerId) {
    localStorage.removeItem(moduleLockKey(moduleKey));
  }
};

export const releaseOwnedModuleLocks = () => {
  if (!canUseStorage()) return;

  const ownerId = getTabSessionId();

  Object.keys(localStorage).forEach((key) => {
    if (!key.startsWith(ACTIVE_MODULE_PREFIX)) return;

    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "") as ActiveModuleLock;
      if (parsed.ownerId === ownerId) {
        localStorage.removeItem(key);
      }
    } catch {
      localStorage.removeItem(key);
    }
  });
};

export const broadcastLogoutOtherTabs = () => {
  if (!canUseStorage()) return;

  localStorage.setItem(
    AUTH_LOGOUT_EVENT_KEY,
    JSON.stringify({
      ownerId: getTabSessionId(),
      at: Date.now(),
    })
  );
};

export const readStoredAuth = (): StoredAuth | null => {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);

    if (stored) {
      const parsed: unknown = JSON.parse(stored);

      if (isValidStoredAuth(parsed)) {
        return parsed;
      }

      localStorage.removeItem(AUTH_STORAGE_KEY);
    }

    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(LEGACY_USERNAME_KEY);
  } catch {
    clearPersistedAuth();
  }

  return null;
};
