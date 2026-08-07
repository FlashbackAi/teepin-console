"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: Theme;
  /** The theme actually applied — `system` resolved against the OS. */
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "teepin-theme";

/**
 * Inline script that applies the theme before first paint.
 *
 * This MUST run before React hydrates, or a dark-mode user sees a white
 * flash on every page load. That flash is the difference between an app
 * that feels considered and one that does not, and it cannot be fixed
 * from a useEffect — by then the browser has already painted.
 *
 * Kept deliberately small and dependency-free: it is inlined into the
 * document head and runs on the critical path.
 */
export const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var theme = stored || 'system';
    var dark = theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {
    /* localStorage can throw in private mode; light is a safe default. */
  }
})();
`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  // Read the stored preference after mount. The inline script has
  // already applied the correct class, so this only syncs React state —
  // it never causes a visual change.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored) setThemeState(stored);
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      const dark =
        theme === "dark" ||
        (theme === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);

      root.classList.toggle("dark", dark);
      setResolved(dark ? "dark" : "light");
    };

    apply();

    // Follow the OS while on `system`, so a user whose machine switches
    // at sunset sees the console switch too.
    if (theme !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* Preference is lost on reload in private mode; not worth failing over. */
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return context;
}
