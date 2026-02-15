import { create } from 'zustand';

interface UIState {
  darkMode: boolean;
  commandPaletteOpen: boolean;
  sidebarOpen: boolean;
  toggleDarkMode: () => void;
  toggleCommandPalette: () => void;
  toggleSidebar: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
}

const getInitialDarkMode = (): boolean => {
  const stored = localStorage.getItem('darkMode');
  if (stored !== null) {
    return stored === 'true';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

export const useUIStore = create<UIState>((set) => ({
  darkMode: getInitialDarkMode(),
  commandPaletteOpen: false,
  sidebarOpen: true,
  toggleDarkMode: () =>
    set((state) => {
      const newMode = !state.darkMode;
      localStorage.setItem('darkMode', String(newMode));
      if (newMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return { darkMode: newMode };
    }),
  toggleCommandPalette: () =>
    set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
  toggleSidebar: () =>
    set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
}));
