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
  minutes: number;
  type: "preaching" | "bible_course";
  person_id?: string | null;
}

export default function CalendarView() {
  const [events, setEvents] = useState<EntryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      .select("id, activity_date, minutes, type, title, person_id")
      .order("activity_date", { ascending: true });
    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }
    const mapped: EntryEvent[] = (data ?? []).map((row) => ({
      id: row.id,
      title:
        row.title ||
        (row.type === "preaching"
          ? `Predicación (${row.minutes}m)`
          : `Curso (${row.minutes}m)`),
      start: new Date(row.activity_date),
      end: new Date(row.activity_date),
      allDay: true,
      minutes: row.minutes,
      type: row.type as EntryEvent["type"],
      person_id: row.person_id,
    }));
    setEvents(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const onSelectSlot = async (slot: SlotInfo) => {
    const date = slot.start as Date;
    const minutesStr = prompt("Minutos dedicados ese día (entero):");
    if (!minutesStr) return;
    const minutes = parseInt(minutesStr, 10);
    if (Number.isNaN(minutes) || minutes <= 0) {
      alert("Valor inválido");
      return;
    }
    const type = (prompt("Tipo: 'preaching' o 'bible_course'", "preaching") ||
      "preaching") as "preaching" | "bible_course";
    const title = prompt("Título (opcional):") || undefined;

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      alert("Primero inicia sesión");
      return;
    }

    const { error } = await supabase.from("activity_entries").insert({
      user_id: sessionData.session.user.id,
      activity_date: format(date, "yyyy-MM-dd"),
      minutes,
      type,
      title,
    });
    if (error) {
      alert(error.message);
      return;
    }
    await fetchEntries();
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
      const minutesStr = prompt("Nuevos minutos:", String(evt.minutes));
      if (!minutesStr) return;
      const minutes = parseInt(minutesStr, 10);
      if (Number.isNaN(minutes) || minutes <= 0) {
        alert("Valor inválido");
        return;
      }
      const { error } = await supabase
        .from("activity_entries")
        .update({ minutes })
        .eq("id", evt.id);
      if (error) alert(error.message);
      else fetchEntries();
    }
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
    <div style={{ height: "calc(100vh - 64px)", padding: 16 }}>
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
  );
}
