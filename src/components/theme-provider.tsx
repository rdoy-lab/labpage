"use client";

import { useCallback, useEffect } from "react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const applyTheme = useCallback((theme: string) => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      root.classList.add(systemDark ? "dark" : "light");
    } else {
      root.classList.add(theme);
    }
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem("labpage-theme") || "system";
    applyTheme(savedTheme);
  }, [applyTheme]);

  return <>{children}</>;
}
