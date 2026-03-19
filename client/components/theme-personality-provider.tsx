"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { themes, DEFAULT_THEME_ID, type ThemePersonality } from "@/lib/themes";

interface ThemePersonalityContextValue {
  activeTheme: ThemePersonality;
  setTheme: (id: string) => void;
  themes: ThemePersonality[];
}

const ThemePersonalityContext = createContext<ThemePersonalityContextValue | null>(null);

export function ThemePersonalityProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME_ID;
    return localStorage.getItem("theme-personality") ?? DEFAULT_THEME_ID;
  });

  const activeTheme = themes.find((t) => t.id === themeId) ?? themes[0];

  function setTheme(id: string) {
    const theme = themes.find((t) => t.id === id);
    if (!theme) return;

    for (const t of themes) {
      document.documentElement.classList.remove(t.className);
    }
    document.documentElement.classList.add(theme.className);
    localStorage.setItem("theme-personality", id);
    setThemeId(id);
  }

  return (
    <ThemePersonalityContext.Provider value={{ activeTheme, setTheme, themes }}>
      {children}
    </ThemePersonalityContext.Provider>
  );
}

export function useThemePersonality() {
  const ctx = useContext(ThemePersonalityContext);
  if (!ctx) throw new Error("useThemePersonality must be used within ThemePersonalityProvider");
  return ctx;
}
