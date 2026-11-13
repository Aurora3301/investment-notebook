import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type ThemeName = "light" | "dark";

interface ChromeState {
  hidden: boolean;
  toggleHidden: () => void;
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

const ChromeContext = createContext<ChromeState | null>(null);
const HIDDEN_KEY = "investment-notebook-hidden";
const THEME_KEY = "investment-notebook-theme";

export function ChromeProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(() => localStorage.getItem(HIDDEN_KEY) === "1");
  const [theme, setThemeState] = useState<ThemeName>(() => (localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.conceal = hidden ? "1" : "0";
    document.documentElement.style.colorScheme = theme;
  }, [hidden, theme]);

  const value: ChromeState = {
    hidden,
    toggleHidden: () => {
      setHidden((current) => {
        const next = !current;
        localStorage.setItem(HIDDEN_KEY, next ? "1" : "0");
        return next;
      });
    },
    theme,
    setTheme: (next) => {
      localStorage.setItem(THEME_KEY, next);
      setThemeState(next);
    },
  };
  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}

export function useChrome(): ChromeState {
  const value = useContext(ChromeContext);
  if (!value) throw new Error("外觀尚未準備好");
  return value;
}
