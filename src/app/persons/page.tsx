"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";
import {
  Box,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Snackbar,
  Alert,
  Tooltip,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";

interface Person {
  id: string;
  name: string;
  notes: string | null;
  color: string | null;
}

const COLOR_OPTIONS = [
  "#F9D5E5", // soft pink
  "#FCE9DB", // peach
  "#FFF6C2", // light yellow
  "#E0F4D3", // mint
  "#D3F2F9", // pale cyan
  "#E3E0F9", // lavender
  "#F9E0F2", // light magenta
  "#FFE4E1", // misty rose
  "#E6F7FF", // powder blue
  "#F5E6CC", // beige
];

export default function PersonsPage() {
  const [list, setList] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [formName, setFormName] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formColor, setFormColor] = useState<string>(COLOR_OPTIONS[0]);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    msg: string;
    severity: "success" | "error";
  }>({ open: false, msg: "", severity: "success" });
  const [deleteConfirm, setDeleteConfirm] = useState<Person | null>(null);

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setList([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("persons")
      .select("id, name, notes, color")
      .order("created_at");
    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }
    setList(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setFormName("");
    setFormNotes("");
    setFormColor(COLOR_OPTIONS[0]);
    setDialogOpen(true);
  };
  const openEdit = (p: Person) => {
    setEditing(p);
    setFormName(p.name);
    setFormNotes(p.notes || "");
    setFormColor(p.color || COLOR_OPTIONS[0]);
    setDialogOpen(true);
  };
  const savePerson = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return;
    if (!formName.trim()) return;
    setSaving(true);
    let error = null;
    if (editing) {
      const { error: e } = await supabase
        .from("persons")
        .update({
          name: formName.trim(),
          notes: formNotes.trim() || null,
          color: formColor,
        })
        .eq("id", editing.id);
      error = e;
    } else {
      const { error: e } = await supabase.from("persons").insert({
        user_id: sessionData.session.user.id,
        name: formName.trim(),
        notes: formNotes.trim() || null,
        color: formColor,
      });
      error = e;
    }
    setSaving(false);
    if (error) {
      setSnackbar({
        open: true,
        msg: error.message || "Error guardando",
        severity: "error",
      });
    } else {
      setDialogOpen(false);
      setSnackbar({
        open: true,
        msg: editing ? "Persona actualizada" : "Persona creada",
        severity: "success",
      });
      load();
    }
  };
  const confirmDelete = (p: Person) => setDeleteConfirm(p);
  const deletePerson = async () => {
    if (!deleteConfirm) return;
    const { error } = await supabase
      .from("persons")
      .delete()
      .eq("id", deleteConfirm.id);
    if (error) {
      setSnackbar({
        open: true,
        msg: error.message || "Error eliminando",
        severity: "error",
      });
    } else {
      setSnackbar({
        open: true,
        msg: "Persona eliminada",
        severity: "success",
      });
      load();
    }
    setDeleteConfirm(null);
  };

  return (
    <AuthGuard>
      <Navbar />
      <Box
        component="main"
        sx={{ p: 3, maxWidth: 760, mx: "auto", width: "100%" }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          mb={3}
          flexWrap="wrap"
          gap={2}
        >
          <Box>
            <Typography variant="h5" fontWeight={600}>
              Personas
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>
              Estudios bíblicos asociados a actividades
            </Typography>
          </Box>
          <Button
            startIcon={<AddIcon />}
            variant="contained"
            onClick={openCreate}
          >
            Nueva
          </Button>
        </Stack>
        {errorMsg && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMsg}
          </Alert>
        )}
        <Paper variant="outlined" sx={{ p: 0 }}>
          {loading ? (
            <Stack alignItems="center" py={6}>
              <CircularProgress size={28} />
              <Typography variant="caption" sx={{ mt: 1 }}>
                Cargando...
              </Typography>
            </Stack>
          ) : list.length === 0 ? (
            <Stack alignItems="center" py={6}>
              <Typography variant="body2" sx={{ opacity: 0.6 }}>
                Sin registros
              </Typography>
            </Stack>
          ) : (
            <List dense disablePadding>
              {list.map((p) => (
                <ListItem
                  key={p.id}
                  divider
                  secondaryAction={
                    <Stack direction="row" spacing={1}>
                      <IconButton
                        size="small"
                        aria-label="Editar"
                        onClick={() => openEdit(p)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        aria-label="Eliminar"
                        onClick={() => confirmDelete(p)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  }
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" gap={1} alignItems="center">
                        {p.color && (
                          <Box
                            sx={{
                              width: 14,
                              height: 14,
                              borderRadius: "50%",
                              bgcolor: p.color,
                              border: "1px solid rgba(0,0,0,0.15)",
                              boxShadow: 1,
                            }}
                          />
                        )}
                        <Typography fontWeight={500}>{p.name}</Typography>
                      </Stack>
                    }
                    secondary={p.notes || undefined}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Paper>
      </Box>

      {/* Create/Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => !saving && setDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {editing ? "Editar persona" : "Nueva persona"}
        </DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
        >
          <TextField
            label="Nombre"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            autoFocus
            size="small"
            fullWidth
          />
          <TextField
            label="Notas (opcional)"
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            size="small"
            fullWidth
            multiline
            minRows={2}
          />
          <Box>
            <Typography
              variant="caption"
              sx={{ fontWeight: 600, display: "block", mb: 1 }}
            >
              Color
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {COLOR_OPTIONS.map((c) => {
                const selected = formColor === c;
                return (
                  <Tooltip title={c} key={c} arrow>
                    <Box
                      role="radio"
                      aria-checked={selected}
                      tabIndex={0}
                      onClick={() => setFormColor(c)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setFormColor(c);
                        }
                      }}
                      sx={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        bgcolor: c,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                        outline: selected
                          ? "2px solid #111"
                          : "2px solid transparent",
                        boxShadow: selected
                          ? "0 0 0 2px rgba(0,0,0,0.35)"
                          : "0 0 0 1px rgba(0,0,0,0.2)",
                        transition: "outline-color .15s, box-shadow .15s",
                      }}
                    >
                      {selected && (
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            bgcolor: "rgba(0,0,0,0.35)",
                          }}
                        />
                      )}
                    </Box>
                  </Tooltip>
                );
              })}
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setDialogOpen(false)}
            disabled={saving}
            color="inherit"
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={savePerson}
            disabled={saving || !formName.trim()}
          >
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={Boolean(deleteConfirm)}
        onClose={() => setDeleteConfirm(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Eliminar persona</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            ¿Seguro que deseas eliminar <strong>{deleteConfirm?.name}</strong>?
            Esta acción no se puede deshacer.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={deletePerson}>
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snackbar.severity}
          variant="filled"
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        >
          {snackbar.msg}
        </Alert>
      </Snackbar>
    </AuthGuard>
  );
}
