"use client";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { materialLight, materialDark } from "@/theme/materialTheme";

export const ColorModeContext = createContext<{
  mode: "light" | "dark";
  toggle: () => void;
}>({ mode: "light", toggle: () => {} });
export const useColorMode = () => useContext(ColorModeContext);

export function ColorModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const stored = window.localStorage.getItem("color-mode");
    if (stored === "light" || stored === "dark") return stored;
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    return prefersDark ? "dark" : "light";
  });
  useEffect(() => {
    try {
      window.localStorage.setItem("color-mode", mode);
    } catch {}
  }, [mode]);
  const value = useMemo(
    () => ({
      mode,
      toggle: () => setMode((m) => (m === "light" ? "dark" : "light")),
    }),
    [mode]
  );
  return (
    <ColorModeContext.Provider value={value}>
      {children}
    </ColorModeContext.Provider>
  );
}

export default function AppThemeClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const { mode } = useColorMode();
  const theme = mode === "light" ? materialLight : materialDark;
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
