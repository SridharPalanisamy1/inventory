import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  clearPersistedAuth,
  persistAuth,
  readStoredAuth,
  releaseOwnedModuleLocks,
} from '@/lib/auth-storage';


interface AuthState {
  isLoggedIn: boolean;
  username: string;
  token: string | null;
}

const initialState: AuthState = {
  isLoggedIn: false,
  username: '',
  token: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginSuccess: (
      state,
      action: PayloadAction<{ username: string; token: string }>
    ) => {
      state.isLoggedIn = true;
      state.username = action.payload.username;
      state.token = action.payload.token;

      persistAuth(action.payload);
    },

    hydrateAuth: (
      state,
      action: PayloadAction<{ username: string; token: string }>
    ) => {
      state.isLoggedIn = true;
      state.username = action.payload.username;
      state.token = action.payload.token;
    },

    logout: (state) => {
      state.isLoggedIn = false;
      state.username = '';
      state.token = null;

      releaseOwnedModuleLocks();
      clearPersistedAuth();
    },

    logoutThisTabOnly: (state) => {
      state.isLoggedIn = false;
      state.username = '';
      state.token = null;

      releaseOwnedModuleLocks();
    },

    setIsLoggedIn: (state, action) => {
      state.isLoggedIn = action.payload;

      if (!action.payload) {
        state.username = '';
        state.token = null;
        clearPersistedAuth();
      } else if (state.username && state.token) {
        persistAuth({ username: state.username, token: state.token });
      }
    },
  },
});

export const { hydrateAuth, loginSuccess, logout, logoutThisTabOnly, setIsLoggedIn } =
  authSlice.actions;
export default authSlice.reducer;
