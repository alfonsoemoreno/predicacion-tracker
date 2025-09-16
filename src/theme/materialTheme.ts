"use client";
import { createTheme, ThemeOptions } from "@mui/material/styles";
import { deepmerge } from "@mui/utils";

const base: ThemeOptions = {
  palette: {
    mode: "light",
    primary: {
      main: "#12b58b",
      light: "#45caa2",
      dark: "#0d9673",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#6366f1", // matches bible course event gradient base
      light: "#818cf8",
      dark: "#4f46e5",
      contrastText: "#ffffff",
    },
    error: { main: "#d32f2f" },
    warning: { main: "#ed6c02" },
    info: { main: "#0288d1" },
    success: { main: "#2e7d32" },
    background: {
      default: "#fafafa",
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
      background: {
        default: "#0f1113",
        paper: "#15181b",
      },
      primary: { main: "#12b58b" },
    },
  })
);
