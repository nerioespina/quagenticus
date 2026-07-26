import { create } from 'zustand';
import { api } from './api';
import type { User, LoginResponse } from './api';

interface AuthState {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  token: localStorage.getItem('qg_token'),
  user: null,

  login: async (email, password) => {
    const res = await api.post<LoginResponse>('/auth/login', { email, password });
    localStorage.setItem('qg_token', res.access_token);
    set({ token: res.access_token });
    const user = await api.get<User>('/auth/me');
    set({ user });
  },

  logout: () => {
    localStorage.removeItem('qg_token');
    set({ token: null, user: null });
  },

  loadUser: async () => {
    const token = localStorage.getItem('qg_token');
    if (!token) return;
    try {
      const user = await api.get<User>('/auth/me');
      set({ user });
    } catch {
      localStorage.removeItem('qg_token');
      set({ token: null, user: null });
    }
  },
}));
