"use client";
import {
  Calendar,
  dateFnsLocalizer,
  Event as RBCEvent,
  SlotInfo,
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
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import TodayIcon from "@mui/icons-material/Today";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";

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
}

export default function CalendarView() {
  const [events, setEvents] = useState<EntryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState<Date>(new Date());
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
        "id, activity_date, minutes, type, title, person_id, start_time, end_time"
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
    };
    const mapped: EntryEvent[] = ((data as Row[] | null) ?? []).map((row) => {
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

      return {
        id: row.id,
        title:
          row.title ||
          (row.type === "preaching"
            ? `Predicación${rangeLabel} ${minutesLabel}`.trim()
            : `Curso ${minutesLabel}`.trim()),
        start: startDate,
        end: endDate,
        allDay,
        minutes: row.minutes ?? 0,
        type: row.type as EntryEvent["type"],
        person_id: row.person_id,
      };
    });
    setEvents(mapped);
    setLoading(false);
  }, []);

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
    setModalDate(slot.start as Date);
    setModalType("preaching");
    setEditData(null);
    setModalOpen(true);
  };

  const onSelectEvent = async (evt: EntryEvent) => {
    const action = prompt("Escribe 'e' para editar, 'd' para borrar:");
    if (action === "d") {
      const { error } = await supabase
        .from("activity_entries")
        .delete()
        .eq("id", evt.id);
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
    } else if (action === "e") {
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
    }
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
        <Stack
          direction="row"
          flexWrap="wrap"
          alignItems="center"
          justifyContent="space-between"
          gap={1}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="Mes anterior">
              <IconButton size="small" onClick={goPrevMonth}>
                <ArrowBackIosNewIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Hoy">
              <IconButton size="small" onClick={goToday}>
                <TodayIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Mes siguiente">
              <IconButton size="small" onClick={goNextMonth}>
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
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          alignItems="stretch"
        >
          <Card sx={{ flex: 1, minWidth: 220 }} variant="outlined">
            <CardContent>
              <Typography variant="overline" sx={{ lineHeight: 1 }}>
                Tiempo predicación
              </Typography>
              <Typography variant="h6" fontWeight={600}>
                {Math.floor(metrics.preachingMinutes / 60)}h{" "}
                {metrics.preachingMinutes % 60}m
              </Typography>
              <Chip size="small" label="Mes actual" sx={{ mt: 1 }} />
            </CardContent>
          </Card>
          <Card sx={{ flex: 1, minWidth: 180 }} variant="outlined">
            <CardContent>
              <Typography variant="overline" sx={{ lineHeight: 1 }}>
                Cursos bíblicos
              </Typography>
              <Typography variant="h6" fontWeight={600}>
                {metrics.distinctPersons}
              </Typography>
              <Chip size="small" label="Personas" sx={{ mt: 1 }} />
            </CardContent>
          </Card>
          <Card sx={{ flex: 1, minWidth: 160 }} variant="outlined">
            <CardContent>
              <Typography variant="overline" sx={{ lineHeight: 1 }}>
                Sesiones
              </Typography>
              <Typography variant="h6" fontWeight={600}>
                {events.length}
              </Typography>
              <Chip size="small" label="Total" sx={{ mt: 1 }} />
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
        sx={{
          flex: 1,
          minHeight: 0,
          "& .rbc-month-view": {
            bgcolor: "background.paper",
            borderRadius: 2,
            overflow: "hidden",
          },
          borderRadius: 2,
        }}
      >
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          selectable
          onSelectSlot={onSelectSlot}
          onSelectEvent={onSelectEvent}
          views={["month", "week", "day"]}
          messages={messages}
          date={viewDate}
          onNavigate={(d) => setViewDate(d as Date)}
          eventPropGetter={(event) => {
            const cls =
              event.type === "preaching"
                ? "event-preaching"
                : "event-bible_course";
            return { className: cls };
          }}
        />
      </Box>
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
      />
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
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
