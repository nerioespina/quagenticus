import { create } from 'zustand';
import { api, session } from './api';
import type { LoginResponse, Me } from './api';
import { configureDates } from './dates';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  status: Status;
  token: string | null;
  user: Me | null;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: Me) => void;
}

async function loadMe(): Promise<Me> {
  const me = await api.get<Me>('/auth/me');
  configureDates(me.locale, me.timezone);
  return me;
}

export const useAuth = create<AuthState>((set, get) => {
  session.subscribe((token) => {
    if (!token && get().status === 'authenticated') set({ status: 'anonymous', token: null, user: null });
    else set({ token });
  });

  return {
    status: 'loading',
    token: null,
    user: null,

    /** Restores the session from the httpOnly refresh cookie. */
    bootstrap: async () => {
      localStorage.removeItem('qg_token'); // legacy storage of the access token
      const token = await session.refresh();
      if (!token) {
        set({ status: 'anonymous', user: null });
        return;
      }
      try {
        set({ status: 'authenticated', user: await loadMe() });
      } catch {
        set({ status: 'anonymous', user: null });
      }
    },

    login: async (email, password) => {
      const res = await api.post<LoginResponse>('/auth/login', { email, password });
      session.set(res.access_token);
      set({ status: 'authenticated', user: await loadMe() });
    },

    logout: async () => {
      await api.post('/auth/logout').catch(() => undefined);
      session.set(null);
      set({ status: 'anonymous', user: null, token: null });
    },

    setUser: (user) => {
      configureDates(user.locale, user.timezone);
      set({ user });
    },
  };
});

// Refresh the access token shortly before it expires (15 min TTL).
setInterval(() => {
  if (useAuth.getState().status === 'authenticated') session.refresh();
}, 12 * 60_000);
