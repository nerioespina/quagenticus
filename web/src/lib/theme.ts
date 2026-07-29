import { create } from 'zustand';

type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const getInitialTheme = (): Theme => {
  const saved = localStorage.getItem('qg_theme') as Theme | null;
  if (saved === 'light' || saved === 'dark') {
    return saved;
  }
  return 'light';
};

const applyThemeClass = (theme: Theme) => {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.remove('dark');
    root.classList.add('light');
  }
};

export const useTheme = create<ThemeState>((set, get) => {
  const initial = getInitialTheme();
  applyThemeClass(initial);

  return {
    theme: initial,
    setTheme: (theme: Theme) => {
      localStorage.setItem('qg_theme', theme);
      applyThemeClass(theme);
      set({ theme });
    },
    toggleTheme: () => {
      const current = get().theme;
      const next: Theme = current === 'light' ? 'dark' : 'light';
      localStorage.setItem('qg_theme', next);
      applyThemeClass(next);
      set({ theme: next });
    },
  };
});
