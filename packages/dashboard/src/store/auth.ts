import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  tenantId: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuth: (data: {
    user: User;
    accessToken: string;
    refreshToken: string;
  }) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setAuth: (data) => {
        set({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
        });
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
      },
      logout: () => {
        set({ user: null, accessToken: null, refreshToken: null });
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      },
      isAuthenticated: () => {
        const state = get();
        return !!state.accessToken && !!state.user;
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);
