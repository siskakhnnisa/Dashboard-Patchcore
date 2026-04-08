import { create } from "zustand";

type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const getInitialTheme = (): Theme => {
  try {
    const stored = localStorage.getItem("app-theme");
    if (stored === "dark" || stored === "light") return stored;
  } catch {}
  return "light";
};

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === "light" ? "dark" : "light";
      localStorage.setItem("app-theme", next);
      document.documentElement.setAttribute("data-theme", next);
      return { theme: next };
    }),
  setTheme: (t) => {
    localStorage.setItem("app-theme", t);
    document.documentElement.setAttribute("data-theme", t);
    set({ theme: t });
  },
}));
