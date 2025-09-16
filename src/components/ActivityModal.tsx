"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Props {
  open: boolean;
  mode: "create" | "edit";
  type: "preaching" | "bible_course";
  date: Date | null; // selected date
  initialData?: {
    id?: string;
    start_time?: string | null; // HH:MM:SS
    end_time?: string | null;
    minutes?: number | null;
    title?: string | null;
    person_id?: string | null;
  };
  onClose: () => void;
  onSaved: () => void;
  validateOverlap?: (range: { start: Date; end: Date; id?: string }) => boolean; // returns true if overlaps
}

interface Person {
  id: string;
  name: string;
}

export default function ActivityModal({
  open,
  mode,
  type,
  date,
  initialData,
  onClose,
  onSaved,
  validateOverlap,
}: Props) {
  const [persons, setPersons] = useState<Person[]>([]);
  const [loadingPersons, setLoadingPersons] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [minutes, setMinutes] = useState("");
  const [title, setTitle] = useState("");
  const [personId, setPersonId] = useState("");

  // Preload persons
  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoadingPersons(true);
      const { data, error } = await supabase
        .from("persons")
        .select("id, name")
        .order("name");
      if (!error && data) setPersons(data as Person[]);
      setLoadingPersons(false);
    };
    load();
  }, [open]);

  // Initialize fields on open / initialData change
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === "edit" && initialData) {
      if (type === "preaching") {
        if (initialData.start_time)
          setStartTime(initialData.start_time.substring(0, 5));
        if (initialData.end_time)
          setEndTime(initialData.end_time.substring(0, 5));
      }
      if (initialData.minutes) setMinutes(String(initialData.minutes));
      if (initialData.title) setTitle(initialData.title);
      if (initialData.person_id) setPersonId(initialData.person_id);
    } else {
      setStartTime("");
      setEndTime("");
      setMinutes(type === "bible_course" ? "30" : "");
      setTitle("");
      setPersonId("");
    }
  }, [open, mode, initialData, type]);

  if (!open) return null;

  const validate = () => {
    if (!date) return "Fecha requerida";
    if (type === "preaching") {
      if (!startTime || !endTime) return "Horas inicio y fin requeridas";
      const toM = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + (m || 0);
      };
      const diff = toM(endTime) - toM(startTime);
      if (diff <= 0) return "La hora fin debe ser mayor que inicio";
    } else {
      if (!minutes) return "Minutos requeridos";
      const m = parseInt(minutes, 10);
      if (!m || m <= 0) return "Minutos inválidos";
    }
    return null;
  };

  const handleSave = async () => {
    setError(null);
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setError("Sesión expirada");
      setSaving(false);
      return;
    }

    interface Payload {
      user_id: string;
      activity_date?: string;
      type: "preaching" | "bible_course";
      start_time?: string;
      end_time?: string;
      minutes?: number;
      title?: string;
      person_id?: string;
    }
    const payload: Payload = {
      user_id: sessionData.session.user.id,
      activity_date: date ? date.toISOString().slice(0, 10) : undefined,
      type,
    };

    if (type === "preaching") {
      payload.start_time = startTime + ":00";
      payload.end_time = endTime + ":00";
    } else {
      payload.minutes = parseInt(minutes, 10);
      if (personId) payload.person_id = personId;
    }
    if (title.trim()) payload.title = title.trim();

    // Overlap check client side for preaching
    if (
      type === "preaching" &&
      date &&
      startTime &&
      endTime &&
      typeof window !== "undefined"
    ) {
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      const start = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        sh,
        sm
      );
      const end = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        eh,
        em
      );
      if (
        payload &&
        typeof validateOverlap === "function" &&
        validateOverlap({ start, end, id: initialData?.id })
      ) {
        setError("El rango se solapa con otro registro de predicación");
        setSaving(false);
        return;
      }
    }

    let dbError = null;
    if (mode === "create") {
      const { error } = await supabase.from("activity_entries").insert(payload);
      dbError = error;
    } else if (mode === "edit" && initialData?.id) {
      const { error } = await supabase
        .from("activity_entries")
        .update(payload)
        .eq("id", initialData.id);
      dbError = error;
    }

    if (dbError) {
      setError(dbError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff",
          width: "100%",
          maxWidth: 420,
          borderRadius: 8,
          padding: 20,
          boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 18 }}>
          {mode === "create" ? "Nueva" : "Editar"}{" "}
          {type === "preaching" ? "Predicación" : "Curso bíblico"}
        </h3>
        <div style={{ fontSize: 13, opacity: 0.7 }}>
          {date && date.toLocaleDateString()}
        </div>

        {type === "preaching" && (
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: 1, fontSize: 12 }}>
              Inicio
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={{ width: "100%" }}
              />
            </label>
            <label style={{ flex: 1, fontSize: 12 }}>
              Fin
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                style={{ width: "100%" }}
              />
            </label>
          </div>
        )}

        {type === "bible_course" && (
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: 1, fontSize: 12 }}>
              Minutos
              <input
                type="number"
                min={1}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                style={{ width: "100%" }}
              />
            </label>
            <label style={{ flex: 1, fontSize: 12 }}>
              Persona
              <select
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="">(Opcional)</option>
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <label style={{ fontSize: 12 }}>
          Título (opcional)
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: "100%" }}
            placeholder="Ej: Servicio matutino"
          />
        </label>

        {error && <div style={{ color: "#b00020", fontSize: 12 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1,
              background: "#111",
              color: "#fff",
              padding: "8px 12px",
              borderRadius: 6,
              border: 0,
              cursor: "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              flex: 1,
              background: "#eee",
              color: "#111",
              padding: "8px 12px",
              borderRadius: 6,
              border: 0,
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
        </div>
        {loadingPersons && type === "bible_course" && (
          <div style={{ fontSize: 11, opacity: 0.6 }}>Cargando personas...</div>
        )}
      </div>
    </div>
  );
}
