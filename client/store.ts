import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  subscription: string;
}

interface AppState {
  // Auth state
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  /** True once the initial session-restore attempt has completed. */
  sessionRestored: boolean;

  // Actions
  setAuth: (accessToken: string, refreshToken: string | null, user: AuthUser) => void;
  clearAuth: () => void;
  setSessionRestored: () => void;

  // Legacy helper used by older code paths
  setUserId: (userId: string | null) => void;
  resetAppState: () => void;
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

const STORAGE_KEY = 'lumina_auth';

async function persistAuth(accessToken: string, refreshToken: string | null, user: AuthUser) {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ accessToken, refreshToken, user })
    );
  } catch {
    // Storage failures are non-fatal.
  }
}

async function clearPersistedAuth() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Non-fatal.
  }
}

export async function restoreAuth(): Promise<{
  accessToken: string;
  refreshToken: string | null;
  user: AuthUser;
} | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { accessToken: string; refreshToken: string | null; user: AuthUser };
  } catch {
    return null;
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>((set) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  sessionRestored: false,

  setAuth: (accessToken, refreshToken, user) => {
    set({ accessToken, refreshToken, user });
    persistAuth(accessToken, refreshToken, user);
  },

  clearAuth: () => {
    set({ accessToken: null, refreshToken: null, user: null });
    clearPersistedAuth();
  },

  setSessionRestored: () => set({ sessionRestored: true }),

  // ── Legacy ────────────────────────────────────────────────────────────────
  // Kept for compatibility with any remaining call sites; prefer setAuth.
  setUserId: (userId) => {
    if (!userId) {
      set({ accessToken: null, refreshToken: null, user: null });
      clearPersistedAuth();
    }
    // If a plain userId is set without tokens, no-op on the real auth fields.
  },

  resetAppState: () => {
    set({ accessToken: null, refreshToken: null, user: null });
    clearPersistedAuth();
  },
}));
