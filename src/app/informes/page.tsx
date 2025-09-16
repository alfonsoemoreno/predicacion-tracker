"use client";
import { useEffect, useState, useCallback } from "react";
import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";
import { supabase } from "@/lib/supabaseClient";
import {
  fetchReports,
  generateMonthlyReportSequential,
  computeTheocraticYearBase,
  THEOCRATIC_START_MONTH,
  MonthlyReportRow,
} from "@/lib/reports";
import {
  Box,
  Typography,
  Stack,
  Card,
  CardContent,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  LinearProgress,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Snackbar,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import AddTaskIcon from "@mui/icons-material/AddTask";

export default function InformesPage() {
  const [baseYear, setBaseYear] = useState(() =>
    computeTheocraticYearBase(new Date())
  );
  const [reports, setReports] = useState<MonthlyReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [genOpen, setGenOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });
  const [pdfLoading, setPdfLoading] = useState(false);
  const nextIndex = reports.length; // sequential
  const canGenerate = nextIndex < 12;

  const yearLabel = `${baseYear}-${baseYear + 1}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Ensure auth
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setReports([]);
        setLoading(false);
        return;
      }
      const data = await fetchReports(baseYear);
      setReports(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Error cargando informes");
    } finally {
      setLoading(false);
    }
  }, [baseYear]);

  useEffect(() => {
    load();
  }, [load]);

  const monthName = (idx: number) => {
    const m = new Date(baseYear, THEOCRATIC_START_MONTH + idx, 1);
    return m.toLocaleDateString("es-ES", { month: "long" });
  };

  const handleGenerate = async () => {
    setError(null);
    try {
      const { report } = await generateMonthlyReportSequential(baseYear);
      setReports((r) => [...r, report]);
      setSnackbar({
        open: true,
        message: `Informe generado para ${monthName(report.month_index)} (${
          report.whole_hours
        }h + ${report.leftover_minutes}m restantes)`,
        severity: "success",
      });
      setGenOpen(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSnackbar({
        open: true,
        message: msg || "Error generando informe",
        severity: "error",
      });
    }
  };

  const totalWholeHours = reports.reduce((a, r) => a + r.whole_hours, 0);
  const finalLeftover = reports.length
    ? reports[reports.length - 1].leftover_minutes
    : 0;

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      // Dynamic import (bundle-splitting). jsPDF default export.
      const jsPDFModule = (await import("jspdf")) as unknown as {
        jsPDF?: new () => {
          setFontSize(n: number): void;
          text(txt: string, x: number, y: number): void;
          addPage(): void;
          save(name: string): void;
        };
        default?: new () => {
          setFontSize(n: number): void;
          text(txt: string, x: number, y: number): void;
          addPage(): void;
          save(name: string): void;
        };
      };
      const JsPDFCtor =
        jsPDFModule.jsPDF ||
        (jsPDFModule.default as {
          new (): {
            setFontSize(n: number): void;
            text(txt: string, x: number, y: number): void;
            addPage(): void;
            save(name: string): void;
          };
        });
      const doc = new JsPDFCtor();
      doc.setFontSize(14);
      doc.text(`Informes mensuales año teocrático ${yearLabel}`, 14, 16);
      doc.setFontSize(10);
      const startY = 26;
      let y = startY;
      doc.text("Mes", 14, y);
      doc.text("Horas", 44, y);
      doc.text("Carried In", 64, y);
      doc.text("Carried Out", 94, y);
      doc.text("Estudios", 124, y);
      doc.text("Fecha", 154, y);
      y += 4;
      reports.forEach((r) => {
        const date = new Date(r.created_at).toLocaleDateString("es-ES");
        doc.text(monthName(r.month_index), 14, y);
        doc.text(String(r.whole_hours), 44, y);
        doc.text(`${r.carried_in_minutes}m`, 64, y);
        doc.text(`${r.carried_out_minutes}m`, 94, y);
        doc.text(String(r.distinct_studies), 124, y);
        doc.text(date, 154, y);
        y += 4;
        if (y > 270) {
          doc.addPage();
          y = 16;
        }
      });
      y += 6;
      doc.setFontSize(12);
      doc.text(`Total horas completas: ${totalWholeHours}h`, 14, y);
      y += 6;
      doc.text(`Minutos pendientes finales: ${finalLeftover}m`, 14, y);
      y += 6;
      const annualGoal = 600; // constant
      doc.text(
        `Meta anual: ${annualGoal}h | Avance: ${totalWholeHours}h (${(
          (totalWholeHours / annualGoal) *
          100
        ).toFixed(1)}%)`,
        14,
        y
      );
      doc.save(`informes_${yearLabel}.pdf`);
      setSnackbar({ open: true, message: "PDF generado", severity: "success" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSnackbar({
        open: true,
        message: msg || "Error generando PDF",
        severity: "error",
      });
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <AuthGuard>
      <Navbar />
      <Box
        sx={{
          p: 3,
          maxWidth: 1200,
          mx: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          gap={2}
        >
          <Box>
            <Typography variant="h5" fontWeight={700}>
              Informes mensuales
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.7 }}>
              Año teocrático {yearLabel}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <FormControl size="small">
              <InputLabel>Año base</InputLabel>
              <Select
                label="Año base"
                value={baseYear}
                onChange={(e) => setBaseYear(Number(e.target.value))}
              >
                {/* Allow selecting base year +/-1 for navigation */}
                {[baseYear - 1, baseYear, baseYear + 1].map((y) => (
                  <MenuItem key={y} value={y}>
                    {y}-{y + 1}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              startIcon={<AddTaskIcon />}
              variant="contained"
              disabled={!canGenerate}
              onClick={() => setGenOpen(true)}
            >
              Generar informe
            </Button>
            <Button
              startIcon={<DownloadIcon />}
              variant="outlined"
              disabled={reports.length === 0 || pdfLoading}
              onClick={downloadPdf}
            >
              {pdfLoading ? "Generando..." : "Descargar PDF"}
            </Button>
          </Stack>
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        {loading && <LinearProgress />}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Resumen
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={3}>
              <Box>
                <Typography variant="caption" sx={{ opacity: 0.7 }}>
                  Total horas completas
                </Typography>
                <Typography variant="h6" fontWeight={600}>
                  {totalWholeHours}h
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ opacity: 0.7 }}>
                  Minutos pendientes finales
                </Typography>
                <Typography variant="h6" fontWeight={600}>
                  {finalLeftover}m
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ opacity: 0.7 }}>
                  Meta anual
                </Typography>
                <Typography variant="h6" fontWeight={600}>
                  {((totalWholeHours / 600) * 100).toFixed(1)}%
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Detalle de meses
            </Typography>
            <Table size="small" aria-label="Tabla informes">
              <TableHead>
                <TableRow>
                  <TableCell>Mes</TableCell>
                  <TableCell>Horas</TableCell>
                  <TableCell>Min entran</TableCell>
                  <TableCell>Min salen</TableCell>
                  <TableCell>Estudios</TableCell>
                  <TableCell>Generado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ textTransform: "capitalize" }}>
                      {monthName(r.month_index)}
                    </TableCell>
                    <TableCell>{r.whole_hours}</TableCell>
                    <TableCell>{r.carried_in_minutes}m</TableCell>
                    <TableCell>{r.carried_out_minutes}m</TableCell>
                    <TableCell>{r.distinct_studies}</TableCell>
                    <TableCell>
                      {new Date(r.created_at).toLocaleDateString("es-ES")}
                    </TableCell>
                  </TableRow>
                ))}
                {reports.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={6} style={{ opacity: 0.7 }}>
                      Sin informes todavía.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Dialog
          open={genOpen}
          onClose={() => setGenOpen(false)}
          fullWidth
          maxWidth="xs"
        >
          <DialogTitle>Generar informe</DialogTitle>
          <DialogContent>
            {nextIndex < 12 ? (
              <Typography variant="body2" sx={{ mt: 1 }}>
                Se generará el informe para{" "}
                <strong style={{ textTransform: "capitalize" }}>
                  {monthName(nextIndex)}
                </strong>
                . Este cierre bloqueará nuevas ediciones en ese mes.
              </Typography>
            ) : (
              <Alert severity="info" sx={{ mt: 1 }}>
                Ya están generados los 12 meses del año teocrático.
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setGenOpen(false)}>Cancelar</Button>
            <Button
              variant="contained"
              disabled={nextIndex >= 12}
              onClick={handleGenerate}
            >
              Confirmar
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
            onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
            severity={snackbar.severity}
            variant="filled"
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </AuthGuard>
  );
}
