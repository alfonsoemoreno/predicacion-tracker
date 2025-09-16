"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Stack from "@mui/material/Stack";
import Autocomplete from "@mui/material/Autocomplete";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";

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
  existingCoursePersonIdsForDay?: string[]; // list of person_ids already used that day (excluding editing one)
}

interface Person {
  id: string;
  name: string;
  color?: string | null;
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
  existingCoursePersonIdsForDay,
}: Props) {
  const [persons, setPersons] = useState<Person[]>([]);
  const [loadingPersons, setLoadingPersons] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  // minutes removed for bible_course flows (legacy field retained only in initialData if present)
  const [title, setTitle] = useState("");
  const [personId, setPersonId] = useState("");

  // Preload persons
  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoadingPersons(true);
      const { data, error } = await supabase
        .from("persons")
        .select("id, name, color")
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
      // ignore initialData.minutes (deprecated)
      if (initialData.title) setTitle(initialData.title);
      if (initialData.person_id) setPersonId(initialData.person_id);
    } else {
      setStartTime("");
      setEndTime("");
      // no minutes setup
      setTitle("");
      setPersonId("");
    }
  }, [open, mode, initialData, type]);

  const [localType, setLocalType] = useState<"preaching" | "bible_course">(
    type
  );
  useEffect(() => {
    if (open) setLocalType(type);
  }, [type, open]);
  if (!open) {
    return null;
  }

  const validate = () => {
    if (!date) return "Fecha requerida";
    if (localType === "preaching") {
      if (!startTime || !endTime) return "Horas inicio y fin requeridas";
      const toM = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + (m || 0);
      };
      const diff = toM(endTime) - toM(startTime);
      if (diff <= 0) return "La hora fin debe ser mayor que inicio";
    } else {
      // person is now mandatory for course
      if (!personId) return "Selecciona la persona";
      if (
        existingCoursePersonIdsForDay &&
        existingCoursePersonIdsForDay.includes(personId) &&
        (!initialData?.person_id || initialData.person_id !== personId)
      ) {
        return "Ya registraste un curso para esta persona este día";
      }
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
    const toLocalDateString = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${da}`;
    };
    const payload: Payload = {
      user_id: sessionData.session.user.id,
      activity_date: date ? toLocalDateString(date) : undefined,
      type: localType,
    };

    if (localType === "preaching") {
      payload.start_time = startTime + ":00";
      payload.end_time = endTime + ":00";
    } else {
      // bible_course: only person
      payload.person_id = personId;
    }
    if (localType === "preaching" && title.trim()) payload.title = title.trim();

    // Overlap check client side for preaching
    if (localType === "preaching" && date && startTime && endTime) {
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
        validateOverlap &&
        validateOverlap({ start, end, id: initialData?.id })
      ) {
        setError("Se traslapa con otra actividad de predicación");
        setSaving(false);
        return;
      }
    }

    let dbError: { message?: string } | null = null;
    if (mode === "create") {
      const { error } = await supabase.from("activity_entries").insert(payload);
      dbError = error;
    } else if (initialData?.id) {
      const { error } = await supabase
        .from("activity_entries")
        .update(payload)
        .eq("id", initialData.id);
      dbError = error;
    }
    if (dbError) {
      const msgRaw = dbError.message || "Error guardando";
      let friendly = msgRaw;
      if (msgRaw.includes("OVERLAP_PREACHING")) {
        friendly = "Se traslapa con otra actividad de predicación";
      } else if (msgRaw.includes("RANGO_INCOMPLETO")) {
        friendly = "Rango de horas incompleto";
      } else if (msgRaw.includes("ux_activity_entries_course_person_day")) {
        friendly = "Ya existe un curso para esa persona en ese día";
      }
      setError(friendly);
      setSaving(false);
      return;
    }
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6" component="span" fontWeight={600} mr={1}>
          {mode === "create" ? "Registrar" : "Actualizar"}
        </Typography>
        <Typography
          component="span"
          sx={{ color: "primary.main", fontWeight: 600 }}
        >
          {localType === "preaching" ? "predicación" : "curso bíblico"}
        </Typography>
        <Typography
          variant="caption"
          sx={{ display: "block", mt: 0.5, opacity: 0.7 }}
        >
          {date && date.toLocaleDateString()} •{" "}
          {mode === "create" ? "Nuevo" : "Edición"}
        </Typography>
      </DialogTitle>
      <DialogContent
        dividers
        sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 2 }}
      >
        <ToggleButtonGroup
          value={localType}
          exclusive
          onChange={(_, v) => {
            if (v === "preaching" || v === "bible_course") setLocalType(v);
          }}
          size="small"
          sx={{ alignSelf: "flex-start" }}
        >
          <ToggleButton value="preaching">Predicación</ToggleButton>
          <ToggleButton value="bible_course">Curso</ToggleButton>
        </ToggleButtonGroup>

        {localType === "preaching" && (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Inicio"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
              size="small"
              autoFocus
            />
            <TextField
              label="Fin"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
              size="small"
              autoFocus
            />
          </Stack>
        )}

        {localType === "bible_course" && (
          <Autocomplete
            options={persons}
            loading={loadingPersons}
            getOptionLabel={(o) => o.name}
            value={persons.find((p) => p.id === personId) || null}
            onChange={(_, val) => setPersonId(val?.id || "")}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Persona"
                size="small"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {loadingPersons ? (
                        <CircularProgress color="inherit" size={16} />
                      ) : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
            fullWidth
          />
        )}

        {localType === "preaching" && (
          <TextField
            label="Título (opcional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Servicio matutino"
            fullWidth
            size="small"
          />
        )}

        {error && (
          <Alert severity="error" variant="outlined" icon={false}>
            {error}
          </Alert>
        )}
        {loadingPersons && localType === "bible_course" && !error && (
          <Typography variant="caption" sx={{ opacity: 0.6 }}>
            Cargando personas...
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving} color="inherit">
          Cancelar
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          variant="contained"
          color="primary"
        >
          {saving ? "Guardando..." : "Guardar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
