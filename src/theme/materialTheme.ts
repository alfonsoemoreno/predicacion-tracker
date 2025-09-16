"use client";
import { createTheme, ThemeOptions } from "@mui/material/styles";
import { deepmerge } from "@mui/utils";

const base: ThemeOptions = {
  palette: {
    mode: "light",
    // Pastel inspired palette: softer hues while maintaining AA contrast for text on main buttons
    primary: {
      main: "#66c6b3", // soft teal
      light: "#b6ede3",
      dark: "#3d9f8e",
      contrastText: "#10332d",
    },
    secondary: {
      main: "#b8a6f2", // soft lavender
      light: "#e2d9fb",
      dark: "#8b7dc7",
      contrastText: "#2c2540",
    },
    error: { main: "#ef9a9a" }, // pastel red
    warning: { main: "#ffcc80" },
    info: { main: "#90caf9" },
    success: { main: "#a5d6a7" },
    background: {
      default: "#f7f9fa",
      paper: "#ffffff",
    },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: [
      "Inter",
      "system-ui",
      "-apple-system",
      "BlinkMacSystemFont",
      "'Segoe UI'",
      "Roboto",
      "'Helvetica Neue'",
      "Arial",
      "sans-serif",
    ].join(","),
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: (theme) => ({
        ".event-preaching": {
          background:
            "linear-gradient(90deg, " +
            theme.palette.primary.main +
            " 0%, " +
            theme.palette.primary.light +
            " 100%)",
          color: theme.palette.primary.contrastText,
          borderRadius: 8,
          border: "none",
          padding: "2px 6px",
          fontSize: 12,
        },
        ".event-bible_course": {
          background:
            "linear-gradient(90deg, " +
            theme.palette.secondary.main +
            " 0%, " +
            theme.palette.secondary.light +
            " 100%)",
          color: theme.palette.secondary.contrastText,
          borderRadius: 8,
          border: "none",
          padding: "2px 6px",
          fontSize: 12,
        },
        ".rbc-event": {
          boxShadow: "0 1px 2px rgba(0,0,0,0.24)",
        },
        ".rbc-today": {
          backgroundColor: theme.palette.action.hover,
        },
        ".rbc-off-range-bg": {
          backgroundColor: theme.palette.action.selectedOpacity
            ? "rgba(0,0,0,0.02)"
            : "#f5f5f5",
        },
      }),
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: theme.shape.borderRadius - 4,
        }),
        containedPrimary: {
          boxShadow: "0 2px 4px -1px rgba(0,0,0,.15)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        rounded: ({ theme }) => ({
          borderRadius: theme.shape.borderRadius,
        }),
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: ({ theme }) => ({
          borderRadius: theme.shape.borderRadius + 2,
        }),
      },
    },
    MuiChip: {
      styleOverrides: {
        root: ({ theme }) => ({
          fontWeight: 500,
          borderRadius: theme.shape.borderRadius,
        }),
      },
    },
  },
};

export const materialLight = createTheme(base);
export const materialDark = createTheme(
  deepmerge(base, {
    palette: {
      mode: "dark",
      primary: {
        main: "#66c6b3",
        light: "#4ca596",
        dark: "#2e6f63",
        contrastText: "#0d1e1b",
      },
      secondary: {
        main: "#b8a6f2",
        light: "#9385c4",
        dark: "#5f537d",
        contrastText: "#1d182b",
      },
      background: {
        default: "#1c1f22",
        paper: "#24282c",
      },
      error: { main: "#e57373" },
      warning: { main: "#ffb74d" },
      info: { main: "#64b5f6" },
      success: { main: "#81c784" },
    },
  })
);
