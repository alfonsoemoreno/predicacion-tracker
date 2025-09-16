"use client";
// react-big-calendar types kept minimal; full component removed in favor of custom views
import { Event as RBCEvent, SlotInfo, View } from "react-big-calendar";
import { format, addMonths, addWeeks, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { useCallback, useEffect, useMemo, useState } from "react";
import useMediaQuery from "@mui/material/useMediaQuery";
import { supabase } from "@/lib/supabaseClient";
import ActivityModal from "./ActivityModal";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import TodayIcon from "@mui/icons-material/Today";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ViewWeekIcon from "@mui/icons-material/ViewWeek";
import TodayOutlinedIcon from "@mui/icons-material/TodayOutlined";
import ButtonGroup from "@mui/material/ButtonGroup";
import Button from "@mui/material/Button";
import { useTheme } from "@mui/material/styles";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import Chip from "@mui/material/Chip";
import BusinessCenterOutlinedIcon from "@mui/icons-material/BusinessCenterOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import ConstructionOutlinedIcon from "@mui/icons-material/ConstructionOutlined";
import {
  computeTheocraticYearBase,
  monthIndexFromDate,
  fetchReports,
} from "@/lib/reports";

// Localización: se usa locale 'es' de date-fns para todos los formatos.

// Manual startOfWeek to avoid any subtle changes in date-fns v4 behavior.
// Always returns a new Date representing Monday (00:00 local) of the week containing `date`.
function startOfWeekManual(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const jsDay = d.getDay(); // 0=Sun..6=Sat
  // If Sunday (0) we go back 6 days, else we go back (jsDay-1) days to reach Monday
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// getDayStable no longer required after removing react-big-calendar.

// localizer removed (all custom views implemented)

// Debug instrumentation components removed after resolving DST duplication root cause.

interface EntryEvent extends RBCEvent {
  id: string;
  minutes: number; // store 0 if null in DB
  type: "preaching" | "bible_course" | "sacred_service";
  person_id?: string | null;
  person_name?: string | null;
  person_color?: string | null;
  hideTime?: boolean; // para eventos donde no se muestra hora (curso bíblico)
}

// Toolbar personalizado para mejorar contraste y localización
// Unified toolbar used for both custom month grid and week/day (react-big-calendar) views.
interface UnifiedToolbarProps {
  date: Date;
  view: View;
  onView: (v: View) => void;
  onNavigate: (action: "TODAY" | "PREV" | "NEXT") => void;
}
function UnifiedToolbar({
  date,
  view,
  onView,
  onNavigate,
}: UnifiedToolbarProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const colorStyles = {
    textTransform: "none",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 0.2,
    "&.rbc-active": {
      backgroundColor: isDark
        ? theme.palette.primary.dark
        : theme.palette.primary.main,
      color: theme.palette.primary.contrastText,
    },
  } as const;
  const goTo = (action: "TODAY" | "PREV" | "NEXT") => onNavigate(action);
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1}
      alignItems={{ xs: "flex-start", sm: "center" }}
      justifyContent="space-between"
      sx={{ mb: 1.5 }}
    >
      <Stack direction="row" spacing={1} alignItems="center">
        <ButtonGroup
          size="small"
          variant="outlined"
          aria-label="Navegación del calendario"
        >
          <Button
            onClick={() => goTo("PREV")}
            aria-label="Mes anterior"
            startIcon={<ArrowBackIosNewIcon fontSize="inherit" />}
          >
            Atrás
          </Button>
          <Button
            onClick={() => goTo("TODAY")}
            aria-label="Ir a hoy"
            startIcon={<TodayIcon fontSize="inherit" />}
          >
            Hoy
          </Button>
          <Button
            onClick={() => goTo("NEXT")}
            aria-label="Mes siguiente"
            endIcon={<ArrowForwardIosIcon fontSize="inherit" />}
          >
            Siguiente
          </Button>
        </ButtonGroup>
      </Stack>
      <Typography
        variant="h6"
        sx={{ fontWeight: 600, textTransform: "capitalize" }}
      >
        {format(date, "MMMM yyyy", { locale: es })}
      </Typography>
      <ButtonGroup
        size="small"
        variant="outlined"
        aria-label="Cambiar vista calendario"
      >
        <Button
          onClick={() => onView("month")}
          className={view === "month" ? "rbc-active" : ""}
          startIcon={<CalendarMonthIcon fontSize="inherit" />}
          sx={colorStyles}
        >
          Mes
        </Button>
        <Button
          onClick={() => onView("week")}
          className={view === "week" ? "rbc-active" : ""}
          startIcon={<ViewWeekIcon fontSize="inherit" />}
          sx={colorStyles}
        >
          Semana
        </Button>
        <Button
          onClick={() => onView("day")}
          className={view === "day" ? "rbc-active" : ""}
          startIcon={<TodayOutlinedIcon fontSize="inherit" />}
          sx={colorStyles}
        >
          Día
        </Button>
      </ButtonGroup>
    </Stack>
  );
}

// --- Custom Month Grid component (outside toolbar) ---
interface CustomMonthGridProps {
  viewDate: Date;
  events: EntryEvent[];
  onSelectDay: (date: Date) => void;
  onSelectEvent: (evt: EntryEvent, e: React.SyntheticEvent) => void;
  isDateLocked: (d: Date) => boolean;
}
const CustomMonthGrid: React.FC<CustomMonthGridProps> = ({
  viewDate,
  events,
  onSelectDay,
  onSelectEvent,
  isDateLocked,
}) => {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1, 12, 0, 0, 0);
  const gridStart = startOfWeekManual(firstOfMonth);
  gridStart.setHours(12, 0, 0, 0);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    d.setHours(12, 0, 0, 0);
    days.push(d);
  }
  const weeks: Date[][] = [];
  for (let i = 0; i < 42; i += 7) weeks.push(days.slice(i, i + 7));
  const dayEventsCache = new Map<string, EntryEvent[]>();
  const keyFor = (d: Date) =>
    `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  for (const ev of events) {
    const start = ev.start as Date;
    const k = keyFor(start);
    if (!dayEventsCache.has(k)) dayEventsCache.set(k, []);
    dayEventsCache.get(k)!.push(ev);
  }
  const weekdayLabels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        bgcolor: "background.paper",
        borderRadius: 1,
        overflow: "hidden",
        border: (t) => `1px solid ${t.palette.divider}`,
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          borderBottom: (t) => `1px solid ${t.palette.divider}`,
          bgcolor: "background.default",
          // Ensure no horizontal scroll / consistent widths
          width: "100%",
        }}
      >
        {weekdayLabels.map((lbl) => (
          <Box
            key={lbl}
            sx={{ p: 0.75, fontSize: 11, fontWeight: 600, textAlign: "center" }}
          >
            {lbl}
          </Box>
        ))}
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateRows: "repeat(6,1fr)",
          flex: 1,
          minHeight: 0,
        }}
      >
        {weeks.map((week, wi) => (
          <Box
            key={wi}
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(7,1fr)",
              minHeight: 0,
            }}
          >
            {week.map((day, di) => {
              const inMonth = day.getMonth() === month;
              const locked = isDateLocked(day);
              const k = keyFor(day);
              const dayEvents = dayEventsCache.get(k) || [];
              return (
                <Box
                  key={di}
                  onClick={() => onSelectDay(day)}
                  sx={{
                    position: "relative",
                    borderRight:
                      di < 6 ? (t) => `1px solid ${t.palette.divider}` : "none",
                    borderBottom:
                      wi < weeks.length - 1
                        ? (t) => `1px solid ${t.palette.divider}`
                        : "none",
                    p: 0.5,
                    fontSize: 12,
                    cursor: "pointer",
                    bgcolor: locked ? "action.hover" : "background.default",
                    color: inMonth ? "text.primary" : "text.disabled",
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 0,
                    overflow: "hidden",
                    "&:hover": {
                      bgcolor: locked ? "action.hover" : "action.hover",
                    },
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      mb: 0.25,
                    }}
                  >
                    <Typography
                      component="span"
                      sx={{ fontSize: 12, fontWeight: 600 }}
                    >
                      {day.getDate()}
                    </Typography>
                    {locked && (
                      <Typography
                        component="span"
                        sx={{
                          fontSize: 9,
                          fontWeight: 600,
                          color: "warning.main",
                        }}
                      >
                        🔒
                      </Typography>
                    )}
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 0.25,
                      overflowY: "auto",
                    }}
                  >
                    {dayEvents.map((ev) => {
                      const isCourse = ev.type === "bible_course";
                      const isSacred = ev.type === "sacred_service";
                      // Uniform pastel backgrounds (same in light/dark): preaching, course, sacred
                      const preachingBg = "#b6ede3"; // matches primary.light from light theme
                      const courseBg = "#e2d9fb"; // matches secondary.light
                      const sacredBg = "#E6F7FF"; // user requested
                      const bg = isCourse
                        ? ev.person_color || courseBg
                        : isSacred
                        ? sacredBg
                        : preachingBg;
                      const titleParts: string[] = [];
                      if (ev.type === "preaching")
                        titleParts.push("__ICON_MINISTERIO__");
                      if (isCourse) titleParts.push("__ICON_CURSO__");
                      if (isSacred) titleParts.push("__ICON_SAGRADO__");
                      if (typeof ev.title === "string")
                        titleParts.push(ev.title);
                      if (!ev.allDay && !ev.hideTime) {
                        const s = ev.start as Date;
                        const en = ev.end as Date;
                        titleParts.push(
                          `${format(s, "HH:mm")}-${format(en, "HH:mm")}`
                        );
                      }
                      // Transform tokens into icon components
                      const parts = titleParts.map((p, idx) => {
                        if (p === "__ICON_MINISTERIO__")
                          return (
                            <BusinessCenterOutlinedIcon
                              key={idx}
                              sx={{
                                fontSize: 14,
                                verticalAlign: "middle",
                                color: "#1a1a1a",
                              }}
                            />
                          );
                        if (p === "__ICON_CURSO__")
                          return (
                            <MenuBookOutlinedIcon
                              key={idx}
                              sx={{
                                fontSize: 14,
                                verticalAlign: "middle",
                                color: "#1a1a1a",
                              }}
                            />
                          );
                        if (p === "__ICON_SAGRADO__")
                          return (
                            <ConstructionOutlinedIcon
                              key={idx}
                              sx={{
                                fontSize: 14,
                                verticalAlign: "middle",
                                color: "#1a1a1a",
                              }}
                            />
                          );
                        return (
                          <span key={idx} style={{ whiteSpace: "nowrap" }}>
                            {p}
                          </span>
                        );
                      });
                      return (
                        <Box
                          key={ev.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectEvent(ev, e);
                          }}
                          sx={{
                            bgcolor: bg,
                            borderRadius: 1,
                            px: 0.5,
                            py: 0.25,
                            fontSize: 10,
                            lineHeight: 1.1,
                            fontWeight: 500,
                            boxShadow: (t) =>
                              `inset 0 0 0 1px ${t.palette.divider}`,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                            overflow: "hidden",
                            color: isSacred ? "#1a1a1a" : "#1a1a1a",
                            "&:hover": { filter: "brightness(0.95)" },
                          }}
                          title={titleParts
                            .filter((t) => !t.startsWith("__ICON"))
                            .join(" · ")}
                        >
                          {parts}
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
    </Box>
  );
};

// --- Custom Week Grid (Monday-first, DST safe) ---
interface CustomWeekGridProps {
  viewDate: Date; // any day inside the target week
  events: EntryEvent[];
  onSelectDay: (date: Date) => void;
  onSelectEvent: (evt: EntryEvent, e: React.SyntheticEvent) => void;
  isDateLocked: (d: Date) => boolean;
}
const CustomWeekGrid: React.FC<CustomWeekGridProps> = ({
  viewDate,
  events,
  onSelectDay,
  onSelectEvent,
  isDateLocked,
}) => {
  const weekStart = startOfWeekManual(
    new Date(
      viewDate.getFullYear(),
      viewDate.getMonth(),
      viewDate.getDate(),
      12
    )
  );
  weekStart.setHours(12, 0, 0, 0);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    d.setHours(12, 0, 0, 0);
    days.push(d);
  }
  const dayEvents: EntryEvent[][] = days.map(() => []);
  for (const ev of events) {
    const s = ev.start as Date;
    const e = ev.end as Date;
    for (let di = 0; di < days.length; di++) {
      const day = days[di];
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      if (e >= dayStart && s <= dayEnd) dayEvents[di].push(ev as EntryEvent);
    }
  }
  // Simple ordering by start time
  dayEvents.forEach((list) =>
    list.sort(
      (a, b) => (a.start as Date).getTime() - (b.start as Date).getTime()
    )
  );
  const weekdayLabels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        bgcolor: "background.paper",
        borderRadius: 1,
        overflow: "hidden",
        border: (t) => `1px solid ${t.palette.divider}`,
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7,1fr)",
          borderBottom: (t) => `1px solid ${t.palette.divider}`,
          bgcolor: "background.default",
        }}
      >
        {days.map((d, i) => {
          const isToday = (() => {
            const now = new Date();
            return (
              now.getFullYear() === d.getFullYear() &&
              now.getMonth() === d.getMonth() &&
              now.getDate() === d.getDate()
            );
          })();
          return (
            <Box
              key={i}
              sx={{
                p: 1,
                textAlign: "center",
                fontSize: 13,
                fontWeight: 600,
                position: "relative",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 0.5,
                }}
              >
                <span>{weekdayLabels[i]}</span>
                <Box
                  component="button"
                  onClick={() => onSelectDay(d)}
                  disabled={isDateLocked(d)}
                  sx={{
                    all: "unset",
                    cursor: "pointer",
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 600,
                    bgcolor: isToday ? "primary.main" : "transparent",
                    color: isToday ? "primary.contrastText" : "text.primary",
                    border: (t) => `1px solid ${t.palette.divider}`,
                    "&:hover": {
                      bgcolor: isToday ? "primary.dark" : "action.hover",
                    },
                    "&:focus-visible": {
                      outline: "2px solid",
                      outlineColor: "primary.main",
                    },
                    opacity: isDateLocked(d) ? 0.5 : 1,
                  }}
                >
                  {d.getDate()}
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          flex: 1,
          minHeight: 0,
          width: "100%",
        }}
      >
        {days.map((d, i) => {
          const list = dayEvents[i];
          return (
            <Box
              key={i}
              sx={{
                borderRight:
                  i < 6 ? (t) => `1px solid ${t.palette.divider}` : "none",
                position: "relative",
                minHeight: 160,
                p: 0.5,
              }}
            >
              <Stack spacing={0.5} alignItems="stretch">
                {list.length === 0 && (
                  <Box
                    onClick={() => onSelectDay(d)}
                    sx={{
                      flex: 1,
                      minHeight: 40,
                      cursor: "pointer",
                      borderRadius: 1,
                      border: (t) => `1px dashed ${t.palette.divider}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      color: "text.secondary",
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  >
                    Añadir
                  </Box>
                )}
                {list.map((ev) => {
                  const start = ev.start as Date;
                  const end = ev.end as Date;
                  const isCourse = ev.type === "bible_course";
                  const isSacred = ev.type === "sacred_service";
                  const labelParts: string[] = [];
                  if (ev.type === "preaching")
                    labelParts.push("__ICON_MINISTERIO__");
                  if (isCourse) labelParts.push("__ICON_CURSO__");
                  if (isSacred) labelParts.push("__ICON_SAGRADO__");
                  if (typeof ev.title === "string") labelParts.push(ev.title);
                  if (!ev.hideTime) {
                    labelParts.push(
                      `${format(start, "HH:mm")} - ${format(end, "HH:mm")}`
                    );
                  }
                  const preachingBg = "#b6ede3";
                  const courseBg = "#e2d9fb";
                  const sacredBg = "#E6F7FF";
                  const bg = isCourse
                    ? ev.person_color || courseBg
                    : isSacred
                    ? sacredBg
                    : preachingBg;
                  // Pre-truncate very long raw title segment (not time) before rendering to reduce layout pressure
                  const MAX_RAW_CHARS = 60;
                  const parts = labelParts.map((raw, idx) => {
                    const p =
                      raw.length > MAX_RAW_CHARS
                        ? raw.slice(0, MAX_RAW_CHARS) + "…"
                        : raw;
                    if (p === "__ICON_MINISTERIO__")
                      return (
                        <BusinessCenterOutlinedIcon
                          key={idx}
                          sx={{
                            fontSize: 16,
                            color: "#1a1a1a",
                            flexShrink: 0,
                          }}
                        />
                      );
                    if (p === "__ICON_CURSO__")
                      return (
                        <MenuBookOutlinedIcon
                          key={idx}
                          sx={{
                            fontSize: 16,
                            color: "#1a1a1a",
                            flexShrink: 0,
                          }}
                        />
                      );
                    if (p === "__ICON_SAGRADO__")
                      return (
                        <ConstructionOutlinedIcon
                          key={idx}
                          sx={{
                            fontSize: 16,
                            color: "#1a1a1a",
                            flexShrink: 0,
                          }}
                        />
                      );
                    const spanStyle = {
                      overflow: "hidden",
                      textOverflow: "ellipsis" as const,
                      minWidth: 0,
                      flexShrink: 1,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      wordBreak: "break-word" as const,
                      lineHeight: 1.1,
                      width: "100%",
                    } as React.CSSProperties & {
                      WebkitLineClamp?: number;
                      WebkitBoxOrient?: string;
                    };
                    return (
                      <span key={idx} style={spanStyle}>
                        {p}
                      </span>
                    );
                  });
                  return (
                    <Box
                      key={ev.id}
                      onClick={(e: React.MouseEvent<HTMLDivElement>) =>
                        onSelectEvent(ev, e)
                      }
                      sx={{
                        cursor: "pointer",
                        p: 0.75,
                        borderRadius: 1,
                        bgcolor: bg,
                        color: "#1a1a1a",
                        fontSize: 12,
                        fontWeight: 500,
                        boxShadow: (t) =>
                          `inset 0 0 0 1px ${t.palette.divider}`,
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 0.5,
                        minWidth: 0,
                        overflow: "hidden",
                        width: "100%",
                        maxWidth: "100%",
                        // Stack icons + text inline but let text wrap internally
                        "& span": { display: "block" },
                        "& *": { minWidth: 0 },
                        "&:hover": { filter: "brightness(0.95)" },
                      }}
                      title={labelParts
                        .filter((t) => !t.startsWith("__ICON"))
                        .join(" · ")}
                    >
                      {parts}
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

// --- Custom Day View (timeline style) ---
interface CustomDayViewProps {
  date: Date;
  events: EntryEvent[];
  onSelectSlot: (date: Date) => void;
  onSelectEvent: (evt: EntryEvent, e: React.SyntheticEvent) => void;
  isDateLocked: (d: Date) => boolean;
}
const CustomDayView: React.FC<CustomDayViewProps> = ({
  date,
  events,
  onSelectSlot,
  onSelectEvent,
  isDateLocked,
}) => {
  const target = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
    0,
    0,
    0
  );
  const locked = isDateLocked(target);
  const dayStart = new Date(target);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(target);
  dayEnd.setHours(23, 59, 59, 999);
  const list = events.filter((ev) => {
    const s = ev.start as Date;
    const e = ev.end as Date;
    return e >= dayStart && s <= dayEnd;
  });
  list.sort(
    (a, b) => (a.start as Date).getTime() - (b.start as Date).getTime()
  );
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        bgcolor: "background.paper",
        borderRadius: 1,
        overflow: "hidden",
        border: (t) => `1px solid ${t.palette.divider}`,
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1,
          borderBottom: (t) => `1px solid ${t.palette.divider}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="subtitle2" fontWeight={600}>
          {format(target, "EEEE d MMMM yyyy", { locale: es })}
        </Typography>
        {locked && <Chip size="small" color="warning" label="Bloqueado" />}
      </Box>
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          p: 1,
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        {list.length === 0 && (
          <Box
            onClick={() => !locked && onSelectSlot(target)}
            sx={{
              p: 2,
              border: "1px dashed",
              borderColor: "divider",
              borderRadius: 1,
              textAlign: "center",
              fontSize: 13,
              color: "text.secondary",
              cursor: locked ? "not-allowed" : "pointer",
              "&:hover": { bgcolor: locked ? "inherit" : "action.hover" },
            }}
          >
            No hay actividades. Haz clic para agregar.
          </Box>
        )}
        {list.map((ev) => {
          const isCourse = ev.type === "bible_course";
          const isSacred = ev.type === "sacred_service";
          const preachingBg = "#b6ede3";
          const courseBg = "#e2d9fb";
          const sacredBg = "#E6F7FF";
          const bg = isCourse
            ? ev.person_color || courseBg
            : isSacred
            ? sacredBg
            : preachingBg;
          const s = ev.start as Date;
          const e = ev.end as Date;
          const labelParts: string[] = [];
          if (ev.type === "preaching")
            labelParts.push("__ICON_MINISTERIO__", "Ministerio");
          if (isCourse) labelParts.push("__ICON_CURSO__", "Curso bíblico");
          if (isSacred) labelParts.push("__ICON_SAGRADO__", "Servicio sagrado");
          if (typeof ev.title === "string") labelParts.push(ev.title);
          if (!ev.hideTime) {
            labelParts.push(`${format(s, "HH:mm")} - ${format(e, "HH:mm")}`);
          }
          const iconMap: Record<string, React.ReactNode> = {
            __ICON_MINISTERIO__: (
              <BusinessCenterOutlinedIcon
                sx={{ fontSize: 18, color: "#1a1a1a" }}
              />
            ),
            __ICON_CURSO__: (
              <MenuBookOutlinedIcon sx={{ fontSize: 18, color: "#1a1a1a" }} />
            ),
            __ICON_SAGRADO__: (
              <ConstructionOutlinedIcon
                sx={{ fontSize: 18, color: "#1a1a1a" }}
              />
            ),
          };
          const descriptive = labelParts.filter((p) => !p.startsWith("__ICON"));
          return (
            <Box
              key={ev.id}
              onClick={(evt) => onSelectEvent(ev, evt)}
              sx={{
                position: "relative",
                p: 1,
                borderRadius: 1,
                bgcolor: bg,
                fontSize: 13,
                fontWeight: 500,
                boxShadow: (t) => `inset 0 0 0 1px ${t.palette.divider}`,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 0.5,
                color: "#1a1a1a",
                "&:hover": { filter: "brightness(0.95)" },
              }}
              title={descriptive.join(" · ")}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  flexWrap: "wrap",
                }}
              >
                {labelParts
                  .filter((p) => p.startsWith("__ICON"))
                  .map((tok, i) => (
                    <span key={i}>{iconMap[tok]}</span>
                  ))}
                {descriptive[0] && (
                  <Typography
                    component="span"
                    sx={{ fontSize: 12, fontWeight: 600 }}
                  >
                    {descriptive[0]}
                  </Typography>
                )}
                {!ev.hideTime && (
                  <Typography component="span" sx={{ fontSize: 11 }}>{`${format(
                    s,
                    "HH:mm"
                  )} - ${format(e, "HH:mm")}`}</Typography>
                )}
              </Box>
              {descriptive
                .slice(1, descriptive.length - (ev.hideTime ? 0 : 1))
                .map((p, i) => (
                  <Typography
                    key={i}
                    component="span"
                    sx={{
                      fontSize: 11,
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      overflow: "hidden",
                    }}
                  >
                    {p}
                  </Typography>
                ))}
            </Box>
          );
        })}
      </Box>
      {!locked && (
        <Box
          sx={{
            p: 1,
            borderTop: (t) => `1px solid ${t.palette.divider}`,
            textAlign: "center",
          }}
        >
          <Button
            size="small"
            variant="outlined"
            onClick={() => onSelectSlot(target)}
          >
            Agregar actividad
          </Button>
        </Box>
      )}
    </Box>
  );
};

// Eliminamos encabezados personalizados para depuración: usamos los defaults

export default function CalendarView() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  // (Swipe effect will be declared after dependent functions/viewDate)
  const [events, setEvents] = useState<EntryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("calendarViewDate");
      if (saved) {
        const d = new Date(saved);
        if (!isNaN(d.getTime())) return d;
      }
    }
    return new Date();
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<
    "preaching" | "bible_course" | "sacred_service"
  >("preaching");
  const [modalDate, setModalDate] = useState<Date | null>(null);
  interface EditData {
    id: string;
    start_time?: string;
    end_time?: string;
    minutes?: number;
    title?: string;
    person_id?: string | null;
  }
  const [editData, setEditData] = useState<EditData | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuEvent, setMenuEvent] = useState<EntryEvent | null>(null);
  // Locked months for current theocratic year (month_index list)
  const [lockedMonthIndexes, setLockedMonthIndexes] = useState<number[]>([]);
  // Persisted calendar view (month/week/day)
  const [currentView, setCurrentView] = useState<View>(() => {
    if (typeof window !== "undefined") {
      const v = localStorage.getItem("calendarView") as View | null;
      if (v === "month" || v === "week" || v === "day" || v === "agenda")
        return v;
    }
    return "month";
  });
  useEffect(() => {
    try {
      localStorage.setItem("calendarView", currentView);
    } catch {}
  }, [currentView]);
  useEffect(() => {
    try {
      localStorage.setItem("calendarViewDate", viewDate.toISOString());
    } catch {}
  }, [viewDate]);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setEvents([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("activity_entries")
      .select(
        "id, activity_date, minutes, type, title, person_id, start_time, end_time, persons:person_id ( name, color )"
      )
      .order("activity_date", { ascending: true });
    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }
    type Row = {
      id: string;
      activity_date: string;
      minutes: number | null;
      type: string;
      title: string | null;
      person_id?: string | null;
      start_time?: string | null;
      end_time?: string | null;
      persons?: { name: string | null; color: string | null } | null;
    };
    const raw = (data as unknown[] | null) ?? [];
    interface RawRow {
      id: string;
      activity_date: string;
      minutes: number | null;
      type: string;
      title: string | null;
      person_id?: string | null;
      start_time?: string | null;
      end_time?: string | null;
      persons?:
        | { name: string | null; color: string | null }[]
        | { name: string | null; color: string | null }
        | null;
    }
    const mapped: EntryEvent[] = raw.map((rUnknown) => {
      const r = rUnknown as RawRow;
      const row: Row = {
        id: r.id,
        activity_date: r.activity_date,
        minutes: r.minutes,
        type: r.type,
        title: r.title,
        person_id: r.person_id,
        start_time: r.start_time,
        end_time: r.end_time,
        persons: Array.isArray(r.persons) ? r.persons[0] : r.persons,
      };
      const [y, m, d] = row.activity_date.split("-").map(Number);

      const parseTime = (t?: string | null) => {
        if (!t) return null;
        // Expected HH:MM:SS or HH:MM
        const [hh, mm = "0"] = t.split(":");
        return { h: Number(hh), m: Number(mm) };
      };

      const st = parseTime(row.start_time);
      const et = parseTime(row.end_time);

      let startDate: Date;
      let endDate: Date;
      let allDay = false;
      let hideTime = false;
      if (row.type === "bible_course") {
        // Curso bíblico: un solo día, sin mostrar horas, anclado al mediodía para evitar problemas DST
        startDate = new Date(y, m - 1, d, 12, 0, 0, 0);
        endDate = new Date(startDate.getTime() + 60 * 1000); // duración simbólica mínima
        hideTime = true;
      } else if (
        (row.type === "preaching" || row.type === "sacred_service") &&
        st &&
        et
      ) {
        startDate = new Date(y, m - 1, d, st.h, st.m);
        endDate = new Date(y, m - 1, d, et.h, et.m);
        if (endDate <= startDate) {
          endDate = new Date(startDate.getTime() + 60 * 1000);
        }
      } else {
        // preaching sin rango: consideramos día "completo" (visual), pero sin extender al día siguiente real (usar 23:59)
        startDate = new Date(y, m - 1, d, 0, 0, 0, 0);
        endDate = new Date(y, m - 1, d, 23, 59, 0, 0);
        allDay = true;
      }

      const minutesLabel = row.minutes != null ? `${row.minutes}m` : "";
      const rangeLabel =
        st && et
          ? ` ${String(st.h).padStart(2, "0")}:${String(st.m).padStart(
              2,
              "0"
            )}-${String(et.h).padStart(2, "0")}:${String(et.m).padStart(
              2,
              "0"
            )}`
          : "";

      const personName = row.persons?.name || null;
      const personColor = row.persons?.color || null;
      const baseTitle = (() => {
        if (row.type === "bible_course" && personName) return personName;
        if (row.title) return row.title;
        if (row.type === "preaching") return `Ministerio`.trim();
        if (row.type === "sacred_service")
          return `Servicio sagrado${rangeLabel}`.trim();
        return `Curso bíblico ${minutesLabel}`.trim();
      })();
      return {
        id: row.id,
        title: baseTitle,
        start: startDate,
        end: endDate,
        allDay,
        minutes: row.minutes ?? 0,
        type: row.type as EntryEvent["type"],
        person_id: row.person_id,
        person_name: personName,
        person_color: personColor,
        hideTime,
      };
    });
    setEvents(mapped);
    setLoading(false);
  }, []);

  // Load locked months whenever viewDate changes the theocratic base year
  useEffect(() => {
    const loadLocked = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setLockedMonthIndexes([]);
        return;
      }
      try {
        const baseYear = computeTheocraticYearBase(viewDate);
        const reports = await fetchReports(baseYear);
        setLockedMonthIndexes(reports.map((r) => r.month_index));
      } catch {
        // ignore silently
      }
    };
    loadLocked();
  }, [viewDate]);

  const isDateLocked = (date: Date | null | undefined) => {
    if (!date) return false;
    const baseYear = computeTheocraticYearBase(date);
    const idx = monthIndexFromDate(baseYear, date);
    return lockedMonthIndexes.includes(idx);
  };

  useEffect(() => {
    fetchEntries();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) {
        fetchEntries();
      } else {
        setEvents([]);
      }
    });
    // Suscripción en tiempo real a cambios de la tabla
    const channel = supabase
      .channel("activity_entries_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "activity_entries",
        },
        () => {
          // Estrategia simple: refetch completo (para mantener lógica coherente)
          fetchEntries();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [fetchEntries]);

  const onSelectSlot = async (slot: SlotInfo) => {
    const date = slot.start as Date;
    if (isDateLocked(date)) {
      setSnackbar({
        open: true,
        message: "Mes cerrado: no puedes crear registros (informe generado)",
        severity: "error",
      });
      return;
    }
    setModalDate(date);
    setModalType("preaching");
    setEditData(null);
    setModalOpen(true);
  };

  const getExistingCoursePersonIdsForDay = () => {
    if (!modalDate) return [] as string[];
    return events
      .filter(
        (e) =>
          e.type === "bible_course" &&
          e.person_id &&
          (e.start as Date).toDateString() === modalDate.toDateString() &&
          (!editData || editData.id !== e.id)
      )
      .map((e) => e.person_id!) as string[];
  };
  const onSelectEvent = (evt: EntryEvent, e: React.SyntheticEvent) => {
    // open context menu anchored to click
    setMenuEvent(evt);
    setMenuAnchor(e.currentTarget as HTMLElement);
  };

  const handleEdit = () => {
    if (!menuEvent) return;
    const evt = menuEvent;
    if (isDateLocked(evt.start as Date)) {
      setSnackbar({
        open: true,
        message: "Mes cerrado: no puedes editar este registro",
        severity: "error",
      });
      setMenuAnchor(null);
      return;
    }
    setModalType(evt.type);
    setModalDate(evt.start as Date);
    setEditData({
      id: evt.id,
      start_time: evt.allDay
        ? undefined
        : format(evt.start as Date, "HH:mm") + ":00",
      end_time: evt.allDay
        ? undefined
        : format(evt.end as Date, "HH:mm") + ":00",
      minutes: evt.minutes,
      title: typeof evt.title === "string" ? evt.title : undefined,
      person_id: evt.person_id,
    });
    setModalOpen(true);
    setMenuAnchor(null);
  };

  const handleDelete = async () => {
    if (!menuEvent) return;
    const { error } = await supabase
      .from("activity_entries")
      .delete()
      .eq("id", menuEvent.id);
    if (error) {
      setSnackbar({
        open: true,
        message: error.message || "Error eliminando",
        severity: "error",
      });
    } else {
      fetchEntries();
      setSnackbar({
        open: true,
        message: "Registro eliminado",
        severity: "success",
      });
    }
    setMenuAnchor(null);
  };

  const validateOverlap = ({
    start,
    end,
    id,
  }: {
    start: Date;
    end: Date;
    id?: string;
  }) => {
    return events
      .filter(
        (e) =>
          (e.type === "preaching" || e.type === "sacred_service") && !e.allDay
      )
      .some((e) => {
        if (id && e.id === id) return false; // skip self when editing
        return start < (e.end as Date) && end > (e.start as Date);
      });
  };

  // messages removed (custom toolbar handles labels)

  // Metrics derived from events + viewDate (month scope)
  const metrics = useMemo(() => {
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    const preachingMinutes = events
      .filter((e) => e.type === "preaching")
      .filter((e) => (e.start as Date).getFullYear() === y)
      .filter((e) => (e.start as Date).getMonth() === m)
      .reduce((acc, e) => acc + e.minutes, 0);
    const distinctPersons = new Set(
      events
        .filter((e) => e.type === "bible_course")
        .filter((e) => (e.start as Date).getFullYear() === y)
        .filter((e) => (e.start as Date).getMonth() === m)
        .filter((e) => e.person_id)
        .map((e) => e.person_id as string)
    ).size;
    const monthLabel = format(new Date(y, m, 1), "MMMM yyyy", { locale: es });
    return { preachingMinutes, distinctPersons, monthLabel };
  }, [events, viewDate]);

  const goPrevMonth = () => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };
  const goNextMonth = () => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };
  const goToday = () => setViewDate(new Date());

  // Swipe deshabilitado (se retiraron los listeners por problemas con el Navbar)

  if (loading) return <Box p={2}>Cargando...</Box>;
  if (errorMsg)
    return (
      <Box p={2} color="error.main">
        Error: {errorMsg}
      </Box>
    );

  return (
    <Box
      id="calendar-root-container"
      sx={{
        height: { md: "calc(100vh - 64px)" },
        minHeight: { xs: "100dvh" },
        p: { xs: 1, md: 3 },
        display: "flex",
        flexDirection: "column",
        gap: { xs: 1, md: 3 },
      }}
    >
      <Stack spacing={2}>
        {/* Encabezado invisible para lectores de pantalla con mes actual */}
        <Box
          component="h2"
          id="calendar-heading"
          sx={{
            position: "absolute",
            width: 1,
            height: 1,
            p: 0,
            m: -1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          Calendario {metrics.monthLabel}
        </Box>
        {isMobile ? (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              label={`Ministerio: ${Math.floor(
                metrics.preachingMinutes / 60
              )}h ${metrics.preachingMinutes % 60}m`}
              size="small"
              color="primary"
              variant="outlined"
            />
            <Chip
              label={`Cursos: ${metrics.distinctPersons}`}
              size="small"
              color="secondary"
              variant="outlined"
            />
            {isDateLocked(viewDate) && (
              <Chip
                label="Mes cerrado"
                size="small"
                color="warning"
                variant="filled"
              />
            )}
          </Stack>
        ) : (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Card sx={{ flex: 1, minWidth: 220 }} variant="outlined">
              <CardContent>
                <Typography variant="overline" sx={{ lineHeight: 1 }}>
                  Tiempo en ministerio (mes)
                </Typography>
                <Typography variant="h6" fontWeight={600}>
                  {Math.floor(metrics.preachingMinutes / 60)}h{" "}
                  {metrics.preachingMinutes % 60}m
                </Typography>
                {isDateLocked(viewDate) && (
                  <Chip
                    label="Mes cerrado"
                    size="small"
                    color="warning"
                    sx={{ mt: 1, fontWeight: 600 }}
                  />
                )}
              </CardContent>
            </Card>
            <Card sx={{ flex: 1, minWidth: 180 }} variant="outlined">
              <CardContent>
                <Typography variant="overline" sx={{ lineHeight: 1 }}>
                  Cursos bíblicos distintos
                </Typography>
                <Typography variant="h6" fontWeight={600}>
                  {metrics.distinctPersons}
                </Typography>
                {isDateLocked(viewDate) && (
                  <Chip
                    label="Bloqueado"
                    size="small"
                    color="warning"
                    sx={{ mt: 1, fontWeight: 600 }}
                  />
                )}
              </CardContent>
            </Card>
          </Stack>
        )}
      </Stack>
      {events.length === 0 && (
        <Box
          sx={{
            p: 2,
            border: "1px dashed",
            borderColor: "divider",
            borderRadius: 1,
            fontSize: 14,
          }}
        >
          No hay registros todavía. Selecciona un día en el calendario para
          crear uno.
        </Box>
      )}
      <Box
        role="region"
        aria-labelledby="calendar-heading"
        aria-describedby="calendar-instructions"
        tabIndex={0}
        onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
          if (e.altKey && e.key === "ArrowLeft") {
            e.preventDefault();
            goPrevMonth();
          } else if (e.altKey && e.key === "ArrowRight") {
            e.preventDefault();
            goNextMonth();
          } else if (e.altKey && e.key.toLowerCase() === "t") {
            e.preventDefault();
            goToday();
          }
        }}
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          "& .rbc-calendar": {
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            height: "100%",
          },
          "& .rbc-month-view": {
            bgcolor: "background.paper",
            borderRadius: 1,
            overflow: "hidden",
            flex: 1,
            minHeight: 0,
          },
          borderRadius: 1,
          outline: "none",
          "&:focus-visible": {
            boxShadow: (t) => `0 0 0 3px ${t.palette.primary.main}40`,
          },
          // Ajuste móvil: permite que el calendario use el espacio restante sin forzar scroll extra
          height: { xs: "100%" },
        }}
      >
        <Box
          id="calendar-swipe-surface"
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <UnifiedToolbar
            date={viewDate}
            view={currentView as View}
            onView={(v) => setCurrentView(v)}
            onNavigate={(action) => {
              if (action === "TODAY") {
                const today = new Date();
                setViewDate(today);
                return;
              }
              const delta = action === "PREV" ? -1 : 1;
              let newDate = viewDate;
              if (currentView === "month") newDate = addMonths(viewDate, delta);
              else if (currentView === "week")
                newDate = addWeeks(viewDate, delta);
              else if (currentView === "day")
                newDate = addDays(viewDate, delta);
              setViewDate(newDate);
            }}
          />
          {currentView === "month" ? (
            <CustomMonthGrid
              viewDate={viewDate}
              events={events}
              onSelectDay={(d) =>
                onSelectSlot({
                  start: d,
                  end: d,
                  action: "click",
                  slots: [d],
                } as unknown as SlotInfo)
              }
              onSelectEvent={(evt, e) => onSelectEvent(evt, e)}
              isDateLocked={isDateLocked}
            />
          ) : currentView === "week" ? (
            <CustomWeekGrid
              viewDate={viewDate}
              events={events}
              onSelectDay={(d) =>
                onSelectSlot({
                  start: d,
                  end: d,
                  action: "click",
                  slots: [d],
                } as unknown as SlotInfo)
              }
              onSelectEvent={(evt, e) => onSelectEvent(evt, e)}
              isDateLocked={isDateLocked}
            />
          ) : (
            <CustomDayView
              date={viewDate}
              events={events}
              onSelectSlot={(d) =>
                onSelectSlot({
                  start: d,
                  end: d,
                  action: "click",
                  slots: [d],
                } as unknown as SlotInfo)
              }
              onSelectEvent={(evt, e) => onSelectEvent(evt, e)}
              isDateLocked={isDateLocked}
            />
          )}
        </Box>
        {/* Instrucciones ocultas para navegación por teclado */}
        <Box
          id="calendar-instructions"
          sx={{
            position: "absolute",
            width: 1,
            height: 1,
            p: 0,
            m: -1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          Navegación del calendario: Alt + Flecha izquierda/derecha para cambiar
          de mes. Alt + T para ir a hoy. Tab para entrar a días y eventos.
        </Box>
      </Box>
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        <MenuItem onClick={handleEdit} aria-label="Editar actividad">
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          Editar
        </MenuItem>
        <MenuItem onClick={handleDelete} aria-label="Eliminar actividad">
          <ListItemIcon>
            <DeleteIcon fontSize="small" />
          </ListItemIcon>
          Eliminar
        </MenuItem>
      </Menu>
      <ActivityModal
        open={modalOpen}
        mode={editData ? "edit" : "create"}
        type={modalType}
        date={modalDate}
        initialData={editData || undefined}
        onClose={() => {
          setModalOpen(false);
          setEditData(null);
        }}
        onSaved={() => {
          fetchEntries();
          setSnackbar({
            open: true,
            message: editData ? "Registro actualizado" : "Registro creado",
            severity: "success",
          });
        }}
        validateOverlap={validateOverlap}
        existingCoursePersonIdsForDay={getExistingCoursePersonIdsForDay()}
      />
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        ContentProps={{ role: "status", "aria-live": "polite" }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
