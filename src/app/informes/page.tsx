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
      // Tipado mínimo para evitar 'any' manteniendo compatibilidad
      type SimpleJsPDF = {
        setFontSize(n: number): void;
        setTextColor(r: number, g?: number, b?: number): void;
        text(txt: string, x: number, y: number): void;
        addPage(): void;
        save(name: string): void;
        rect(x: number, y: number, w: number, h: number, style?: string): void;
        line(x1: number, y1: number, x2: number, y2: number): void;
        setDrawColor(r: number, g?: number, b?: number): void;
        setFillColor(r: number, g?: number, b?: number): void;
        splitTextToSize(text: string, size: number): string[];
        setFont?: (family?: string, style?: string, size?: number) => void;
      };
      const doc: SimpleJsPDF = new JsPDFCtor() as unknown as SimpleJsPDF;
      // Encabezado
      doc.setFontSize(16);
      doc.text(
        `Informes mensuales · Año teocrático ${yearLabel}`.trim(),
        14,
        18
      );
      doc.setFontSize(9);
      doc.setTextColor(80);
      doc.text("Generado: " + new Date().toLocaleString("es-ES"), 14, 24);

      // Definición de columnas (suma aprox <= 180mm en A4 con margen izq 14)
      const columns: { key: string; header: string; width: number }[] = [
        { key: "month", header: "Mes", width: 22 },
        { key: "hours", header: "Horas", width: 14 },
        { key: "in", header: "Min entran", width: 22 },
        { key: "out", header: "Min salen", width: 22 },
        { key: "sacred", header: "Serv. sagrado", width: 26 },
        { key: "studies", header: "Estudios", width: 18 },
        { key: "comments", header: "Comentarios", width: 48 },
        { key: "date", header: "Generado", width: 26 },
      ];
      const startX = 14;
      let y = 32;
      const lineHeight = 4.2;
      const pageBottom = 282; // margen para A4 (297mm) dejando footer opcional

      const drawHeader = () => {
        // Fondo encabezado
        doc.setFillColor(240, 242, 245);
        const totalWidth = columns.reduce((a, c) => a + c.width, 0);
        doc.rect(startX - 2, y - 3.2, totalWidth + 4, 7.4, "F");
        doc.setFontSize(9);
        doc.setTextColor(30);
        doc.setFont?.("helvetica", "bold");
        let x = startX;
        columns.forEach((col) => {
          doc.text(col.header, x, y);
          x += col.width;
        });
        doc.setFont?.("helvetica", "normal");
        y += lineHeight + 1;
        // Línea divisoria
        doc.setDrawColor(200);
        doc.line(startX - 2, y - 2.2, startX - 2 + totalWidth + 4, y - 2.2);
      };

      drawHeader();

      const ensurePage = (rowHeight: number) => {
        if (y + rowHeight > pageBottom) {
          doc.addPage();
          y = 20;
          drawHeader();
        }
      };

      const totalSacredMinutes = reports.reduce(
        (a, r) => a + (r.sacred_service_minutes || 0),
        0
      );

      // Filas
      reports.forEach((r, idx) => {
        const cells: Record<string, string | string[]> = {
          month: monthName(r.month_index),
          hours: String(r.whole_hours),
          in: `${r.carried_in_minutes}m`,
          out: `${r.carried_out_minutes}m`,
          sacred: String(r.sacred_service_minutes ?? 0),
          studies: String(r.distinct_studies),
          comments: r.comments ? r.comments.trim() : "",
          date: new Date(r.created_at).toLocaleDateString("es-ES"),
        };
        // Wrap comentarios
        const commentsRaw = Array.isArray(cells.comments)
          ? cells.comments.join(" ")
          : cells.comments;
        const commentLines: string[] = commentsRaw
          ? doc.splitTextToSize(commentsRaw, 46)
          : [""]; // width a mano (columns[6].width - padding)
        const rowHeight = Math.max(
          commentLines.length * lineHeight,
          lineHeight
        );
        ensurePage(rowHeight + 2);
        let x = startX;
        // Zebra strip
        if (idx % 2 === 0) {
          doc.setFillColor(252, 252, 252);
          doc.rect(
            startX - 2,
            y - lineHeight + 1,
            columns.reduce((a, c) => a + c.width, 0) + 4,
            rowHeight,
            "F"
          );
        }
        columns.forEach((col) => {
          const value = cells[col.key];
          if (col.key === "comments") {
            commentLines.forEach((ln, i) => {
              doc.text(String(ln), x, y + i * lineHeight);
            });
          } else {
            doc.text(String(value), x, y);
          }
          x += col.width;
        });
        y += rowHeight + 1;
      });

      // Resumen
      y += 2;
      ensurePage(30);
      doc.setFontSize(11);
      doc.setFont?.("helvetica", "bold");
      const totalHoursLine = `Total horas completas (predicación): ${totalWholeHours}h`;
      doc.text(totalHoursLine, startX, y);
      y += 6;
      doc.setFont?.("helvetica", "normal");
      doc.text(`Minutos pendientes finales: ${finalLeftover}m`, startX, y);
      y += 6;
      const sacredH = Math.floor(totalSacredMinutes / 60);
      const sacredM = totalSacredMinutes % 60;
      doc.text(
        `Servicio sagrado total: ${sacredH}h ${sacredM}m (${totalSacredMinutes}m)`,
        startX,
        y
      );
      y += 6;
      const annualGoal = 600;
      const pct = ((totalWholeHours / annualGoal) * 100).toFixed(1);
      doc.text(
        `Meta anual predicación: ${annualGoal}h · Avance: ${totalWholeHours}h (${pct}%)`,
        startX,
        y
      );
      y += 6;
      doc.setTextColor(120);
      doc.setFontSize(8);
      doc.text(
        "Nota: 'Servicio sagrado' se registra aparte y no se suma a las horas de predicación.",
        startX,
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
                  <TableCell>Serv. sagrado (min)</TableCell>
                  <TableCell>Estudios</TableCell>
                  <TableCell>Comentarios</TableCell>
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
                    <TableCell>{r.sacred_service_minutes ?? 0}</TableCell>
                    <TableCell>{r.distinct_studies}</TableCell>
                    <TableCell
                      sx={{
                        maxWidth: 140,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.comments || ""}
                    </TableCell>
                    <TableCell>
                      {new Date(r.created_at).toLocaleDateString("es-ES")}
                    </TableCell>
                  </TableRow>
                ))}
                {reports.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={8} style={{ opacity: 0.7 }}>
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
