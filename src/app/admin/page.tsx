"use client";
import { useEffect, useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabaseClient";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Stack,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  LinearProgress,
} from "@mui/material";

interface PurgeResult {
  deleted: number;
  cutoff: string;
}

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeRunning, setPurgeRunning] = useState(false);
  const [purgeResult, setPurgeResult] = useState<PurgeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState(18);

  const checkAdmin = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    try {
      const { data, error: selErr } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", sessionData.session.user.id)
        .maybeSingle();
      if (selErr) throw selErr;
      setIsAdmin(!!data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error verificando admin";
      setError(msg);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAdmin();
  }, [checkAdmin]);

  const runPurge = async () => {
    setPurgeRunning(true);
    setError(null);
    setPurgeResult(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc(
        "purge_old_activity_entries",
        { p_months: months }
      );
      if (rpcErr) throw rpcErr;
      if (data && Array.isArray(data) && data.length > 0) {
        const row = data[0] as PurgeResult;
        setPurgeResult(row);
      } else if (
        data &&
        typeof (data as Record<string, unknown>).deleted !== "undefined"
      ) {
        const generic = data as Record<string, unknown>;
        const pr: PurgeResult = {
          deleted: Number(generic.deleted) || 0,
          cutoff: String(generic.cutoff || ""),
        };
        setPurgeResult(pr);
      } else {
        setError("Respuesta inesperada de la función");
      }
      setPurgeOpen(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error ejecutando purga";
      if (msg.includes("NOT_ADMIN")) {
        setError(
          "No tienes permisos para purgar. Asegúrate de ser administrador."
        );
      } else {
        setError(msg);
      }
    } finally {
      setPurgeRunning(false);
    }
  };

  return (
    <AuthGuard>
      <Navbar />
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: "auto" }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Panel de administración
        </Typography>
        {loading && <LinearProgress sx={{ mb: 2 }} />}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {isAdmin === false && !loading && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            No eres administrador. Contacta a un admin para otorgarte acceso.
          </Alert>
        )}
        {isAdmin && !loading && (
          <Stack spacing={3}>
            <Card variant="outlined">
              <CardContent>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  flexWrap="wrap"
                  gap={2}
                >
                  <Box>
                    <Typography
                      variant="subtitle1"
                      fontWeight={600}
                      gutterBottom
                    >
                      Purga de actividades antiguas
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.8 }}>
                      Elimina definitivamente registros de actividad anteriores
                      al límite definido (por defecto 18 meses).
                    </Typography>
                    <Chip
                      label={`Ventana actual: ${months} meses`}
                      size="small"
                      sx={{ mt: 1 }}
                    />
                    {purgeResult && (
                      <Alert severity="success" sx={{ mt: 2 }}>
                        Eliminados {purgeResult.deleted} registros (cutoff{" "}
                        {purgeResult.cutoff}).
                      </Alert>
                    )}
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <TextField
                      type="number"
                      label="Meses"
                      size="small"
                      value={months}
                      onChange={(e) => setMonths(Number(e.target.value))}
                      inputProps={{ min: 1, max: 60 }}
                      sx={{ width: 110 }}
                    />
                    <Button
                      variant="contained"
                      color="error"
                      onClick={() => setPurgeOpen(true)}
                      disabled={purgeRunning}
                    >
                      {purgeRunning ? "Ejecutando..." : "Purgar"}
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        )}
      </Box>
      <Dialog
        open={purgeOpen}
        onClose={() => !purgeRunning && setPurgeOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Confirmar purga</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mt: 1, lineHeight: 1.5 }}>
            Esta acción eliminará todas las actividades con fecha anterior a{" "}
            <strong>{months}</strong> meses desde hoy.
            <br />
            Los informes mensuales permanecerán intactos pero no podrás
            desbloquear informes cuyo período esté antes de ese cutoff.
            <br />
            ¿Deseas continuar?
          </Typography>
          <Alert severity="warning" sx={{ mt: 2 }}>
            Acción irreversible. Se recomienda haber generado todos los informes
            necesarios antes de purgar.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPurgeOpen(false)} disabled={purgeRunning}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={runPurge}
            disabled={purgeRunning}
          >
            {purgeRunning ? "Eliminando..." : "Confirmar"}
          </Button>
        </DialogActions>
      </Dialog>
    </AuthGuard>
  );
}
