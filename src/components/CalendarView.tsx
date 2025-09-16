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
  const [monthMetrics, setMonthMetrics] = useState<{
    month: string;
    preachingMinutes: number;
    distinctPersons: number;
  } | null>(null);
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
    // Calculate metrics for current month (client-side for now)
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const preachingMinutes = mapped
      .filter((e) => e.type === "preaching")
      .filter((e) => (e.start as Date).getMonth() === currentMonth)
      .filter((e) => (e.start as Date).getFullYear() === currentYear)
      .reduce((sum, e) => sum + e.minutes, 0);
    const distinctPersons = new Set(
      mapped
        .filter((e) => e.type === "bible_course")
        .filter((e) => (e.start as Date).getMonth() === currentMonth)
        .filter((e) => (e.start as Date).getFullYear() === currentYear)
        .filter((e) => e.person_id)
        .map((e) => e.person_id as string)
    ).size;
    setMonthMetrics({
      month: format(new Date(currentYear, currentMonth, 1), "MMMM yyyy", {
        locale: es,
      }),
      preachingMinutes,
      distinctPersons,
    });
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
      if (error) alert(error.message);
      else fetchEntries();
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

  if (loading) return <div style={{ padding: 16 }}>Cargando...</div>;
  if (errorMsg)
    return <div style={{ padding: 16, color: "red" }}>Error: {errorMsg}</div>;

  return (
    <div
      style={{
        height: "calc(100vh - 64px)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {monthMetrics && (
        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 12,
            fontSize: 13,
            background: "#f5f5f5",
            padding: 8,
            borderRadius: 6,
          }}
        >
          <span>
            Mes actual: <strong>{monthMetrics.month}</strong>
          </span>
          <span>
            Tiempo de actividad:{" "}
            <strong>
              {Math.floor(monthMetrics.preachingMinutes / 60)}h{" "}
              {monthMetrics.preachingMinutes % 60}m
            </strong>
          </span>
          <span>
            Cursos bíblicos: <strong>{monthMetrics.distinctPersons}</strong>
          </span>
        </div>
      )}
      {events.length === 0 && (
        <div
          style={{
            padding: 12,
            border: "1px dashed #ccc",
            borderRadius: 4,
            marginBottom: 12,
            fontSize: 14,
          }}
        >
          No hay registros todavía. Selecciona un día en el calendario para
          crear uno.
        </div>
      )}
      <div style={{ flex: 1 }}>
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
        />
      </div>
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
        onSaved={fetchEntries}
        validateOverlap={validateOverlap}
      />
    </div>
  );
}
