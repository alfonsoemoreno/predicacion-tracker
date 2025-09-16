"use client";
import {
  Calendar,
  dateFnsLocalizer,
  Event as RBCEvent,
  SlotInfo,
  View,
} from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { es } from "date-fns/locale/es";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ActivityModal from "./ActivityModal";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Tooltip from "@mui/material/Tooltip";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import TodayIcon from "@mui/icons-material/Today";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import Chip from "@mui/material/Chip";
import {
  computeTheocraticYearBase,
  monthIndexFromDate,
  fetchReports,
} from "@/lib/reports";

// Localizador para react-big-calendar usando date-fns en español.
const locales = { es } as const;
const localizer = dateFnsLocalizer({
  format,
  parse: (str: string, fmt: string, refDate: Date) =>
    parse(str, fmt, refDate, { locale: es }),
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

interface EntryEvent extends RBCEvent {
  id: string;
  minutes: number; // store 0 if null in DB
  type: "preaching" | "bible_course";
  person_id?: string | null;
  person_name?: string | null;
  person_color?: string | null;
}

export default function CalendarView() {
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
  const [modalType, setModalType] = useState<"preaching" | "bible_course">(
    "preaching"
  );
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
      if (row.type === "preaching" && st && et) {
        startDate = new Date(y, m - 1, d, st.h, st.m);
        endDate = new Date(y, m - 1, d, et.h, et.m);
        if (endDate <= startDate) {
          // Fallback: treat as at least 1 minute to avoid react-big-calendar rendering issues
          endDate = new Date(startDate.getTime() + 60 * 1000);
        }
      } else {
        // All-day fallback (previous behavior) including bible_course or preaching sin rango
        startDate = new Date(y, m - 1, d);
        endDate = new Date(y, m - 1, d + 1); // exclusive end
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
      const baseTitle =
        row.type === "bible_course" && personName
          ? personName
          : row.title ||
            (row.type === "preaching"
              ? `Predicación${rangeLabel} ${minutesLabel}`.trim()
              : `Curso ${minutesLabel}`.trim());
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
      .filter((e) => e.type === "preaching" && !e.allDay)
      .some((e) => {
        if (id && e.id === id) return false; // skip self when editing
        return start < (e.end as Date) && end > (e.start as Date);
      });
  };

  const messages = useMemo(
    () => ({
      today: "Hoy",
      previous: "Atrás",
      next: "Siguiente",
      month: "Mes",
      week: "Semana",
      day: "Día",
      agenda: "Agenda",
      showMore: (total: number) => `+${total} más`,
    }),
    []
  );

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

  if (loading) return <Box p={2}>Cargando...</Box>;
  if (errorMsg)
    return (
      <Box p={2} color="error.main">
        Error: {errorMsg}
      </Box>
    );

  return (
    <Box
      sx={{
        height: "calc(100vh - 64px)",
        p: 3,
        display: "flex",
        flexDirection: "column",
        gap: 3,
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
        <Stack
          direction="row"
          flexWrap="wrap"
          alignItems="center"
          justifyContent="space-between"
          gap={1}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="Mes anterior">
              <IconButton
                size="small"
                onClick={goPrevMonth}
                aria-label="Mes anterior (Alt + Flecha izquierda)"
              >
                <ArrowBackIosNewIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Hoy">
              <IconButton
                size="small"
                onClick={goToday}
                aria-label="Ir a hoy (Alt + T)"
              >
                <TodayIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Mes siguiente">
              <IconButton
                size="small"
                onClick={goNextMonth}
                aria-label="Mes siguiente (Alt + Flecha derecha)"
              >
                <ArrowForwardIosIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
          </Stack>
          <Typography
            variant="h6"
            sx={{ fontWeight: 600, textTransform: "capitalize" }}
          >
            {metrics.monthLabel}
          </Typography>
          <Typography
            variant="caption"
            sx={{ opacity: 0.7, display: { xs: "none", sm: "inline" } }}
          >
            Vista mensual
          </Typography>
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Card sx={{ flex: 1, minWidth: 220 }} variant="outlined">
            <CardContent>
              <Typography variant="overline" sx={{ lineHeight: 1 }}>
                Tiempo predicación (mes)
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
      </Stack>
      {events.length === 0 && (
        <Box
          sx={{
            p: 2,
            border: "1px dashed",
            borderColor: "divider",
            borderRadius: 2,
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
          "& .rbc-month-view": {
            bgcolor: "background.paper",
            borderRadius: 2,
            overflow: "hidden",
          },
          borderRadius: 2,
          outline: "none",
          "&:focus-visible": {
            boxShadow: (t) => `0 0 0 3px ${t.palette.primary.main}40`,
          },
        }}
      >
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          selectable
          onSelectSlot={onSelectSlot}
          onSelectEvent={(event, e) => onSelectEvent(event as EntryEvent, e)}
          views={["month", "week", "day"]}
          messages={messages}
          date={viewDate}
          onNavigate={(d) => setViewDate(d as Date)}
          view={currentView}
          onView={(v) => setCurrentView(v)}
          eventPropGetter={(event) => {
            const isCourse = event.type === "bible_course";
            const style: React.CSSProperties = {};
            if (isCourse && event.person_color) {
              style.background = event.person_color;
              style.border = "1px solid rgba(0,0,0,0.15)";
              style.color = "#222";
              style.fontWeight = 600;
            }
            const cls = isCourse ? "event-bible_course" : "event-preaching";
            // Añadimos título accesible (aria-label a través de title para fallback) con tipo y duración si aplica
            const labelParts: string[] = [];
            if (event.type === "preaching") labelParts.push("Predicación");
            if (event.type === "bible_course") labelParts.push("Curso bíblico");
            if (typeof event.title === "string") labelParts.push(event.title);
            if (!event.allDay) {
              const start = event.start as Date;
              const end = event.end as Date;
              labelParts.push(
                `${format(start, "HH:mm")} - ${format(end, "HH:mm")}`
              );
            }
            return { className: cls, style, title: labelParts.join(" · ") };
          }}
        />
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
