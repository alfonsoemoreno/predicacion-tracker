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
  unlockReport,
  recalcAndLockFrom,
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
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  useMediaQuery,
  Divider,
  Tooltip,
  TextField,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import DownloadIcon from "@mui/icons-material/Download";
import AddTaskIcon from "@mui/icons-material/AddTask";
import EditIcon from "@mui/icons-material/Edit";
import IconButton from "@mui/material/IconButton";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import Menu from "@mui/material/Menu";

// Pequeño componente para pares etiqueta/valor en vista móvil
function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <Stack spacing={0.2} sx={{ minWidth: 90 }}>
      <Typography variant="caption" sx={{ opacity: 0.6, fontSize: 10 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 13 }}>
        {value}
      </Typography>
    </Stack>
  );
}

export default function InformesPage() {
  const [baseYear, setBaseYear] = useState(() =>
    computeTheocraticYearBase(new Date())
  );
  const [reports, setReports] = useState<MonthlyReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [genOpen, setGenOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [includeAuto, setIncludeAuto] = useState(true);
  const [editTarget, setEditTarget] = useState<MonthlyReportRow | null>(null);
  const [editComment, setEditComment] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [unlocking, setUnlocking] = useState<string | null>(null); // report id
  const [recalcOpen, setRecalcOpen] = useState(false); // diálogo confirm
  const [recalcFromIdx, setRecalcFromIdx] = useState<number | null>(null);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [actionsAnchor, setActionsAnchor] = useState<null | HTMLElement>(null);
  const actionsMenuOpen = Boolean(actionsAnchor);

  const openActionsMenu = (e: React.MouseEvent<HTMLElement>) => {
    setActionsAnchor(e.currentTarget);
  };
  const closeActionsMenu = () => setActionsAnchor(null);

  const handleUnlock = async () => {
    const last = reports[reports.length - 1];
    if (!last) return;
    if (!last.locked) {
      alert("El último informe ya está desbloqueado.");
      return;
    }
    setUnlocking(last.id);
    try {
      const updated = await unlockReport(last.id);
      setReports((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
      setRecalcFromIdx(last.month_index);
      alert(
        "Mes desbloqueado. Añade/edita actividades y luego usa 'Recalcular' para cerrar nuevamente."
      );
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      let friendly = raw;
      if (raw.includes("permission") || raw.includes("denied")) {
        friendly =
          "Permiso denegado por RLS. Debes crear la policy UPDATE en monthly_reports. Consulta instrucciones en la consola SQL.";
      } else if (raw.includes("row-level security")) {
        friendly =
          "RLS impide la acción. Falta una policy UPDATE para monthly_reports.";
      }
      alert(friendly);
      console.error(raw);
    } finally {
      setUnlocking(null);
      closeActionsMenu();
    }
  };

  const handleOpenRecalc = () => {
    const firstUnlocked = reports
      .filter((r) => !r.locked)
      .reduce(
        (min, r) => (r.month_index < min ? r.month_index : min),
        Infinity
      );
    if (firstUnlocked === Infinity) return;
    setRecalcFromIdx(firstUnlocked);
    setRecalcOpen(true);
    closeActionsMenu();
  };
  const nextIndex = reports.length; // sequential
  const canGenerate = nextIndex < 12;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

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
      const { report } = await generateMonthlyReportSequential(baseYear, {
        comment: newComment || null,
        includeAuto,
      });
      setReports((r) => [...r, report]);
      // Éxito: podrías mostrar Snackbar aquí si se reintroduce
      setGenOpen(false);
      setNewComment("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(msg);
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
        { key: "sacred", header: "Serv. sagrado (h)", width: 30 },
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
          sacred: ((r.sacred_service_minutes ?? 0) / 60).toFixed(2),
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
        doc.setFontSize(9);
        const paintRowBg = idx % 2 === 0;
        if (paintRowBg) {
          doc.setFillColor(252, 252, 252);
          doc.rect(
            startX - 2,
            y - 3.2,
            columns.reduce((a, c) => a + c.width, 0) + 4,
            rowHeight + 4,
            "F"
          );
        }
        columns.forEach((col) => {
          let textVal = "";
          if (col.key === "comments") {
            commentLines.forEach((l, i) => {
              doc.text(l, x, y + i * lineHeight);
            });
          } else {
            textVal = (cells[col.key] as string) || "";
            doc.text(textVal, x, y);
          }
          x += col.width;
        });
        y += rowHeight + 2.2;
      });

      // Resumen final
      ensurePage(30);
      y += 4;
      doc.setFontSize(11);
      doc.setFont?.("helvetica", "bold");
      doc.text("Resumen", startX, y);
      doc.setFont?.("helvetica", "normal");
      y += 6;
      doc.setFontSize(9);
      const totalWholeHours = reports.reduce((a, r) => a + r.whole_hours, 0);
      const finalLeftover = reports.length
        ? reports[reports.length - 1].leftover_minutes
        : 0;
      const totalSacredHours = (totalSacredMinutes / 60).toFixed(2);
      const summaryLines = [
        `Horas completas acumuladas: ${totalWholeHours}h`,
        `Minutos finales pendientes: ${finalLeftover}m`,
        `Servicio sagrado total: ${totalSacredHours}h`,
        `Progreso meta anual (600h): ${((totalWholeHours / 600) * 100).toFixed(
          1
        )}%`,
      ];
      summaryLines.forEach((l) => {
        if (y + lineHeight > pageBottom) {
          doc.addPage();
          y = 20;
        }
        doc.text(l, startX, y);
        y += lineHeight + 0.5;
      });

      doc.save(`informes_${yearLabel}.pdf`);
    } catch (e) {
      console.error(e);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <AuthGuard>
      <Navbar />
      <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 1300, mx: "auto" }}>
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
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>Año base</InputLabel>
              <Select
                label="Año base"
                value={baseYear}
                onChange={(e) => setBaseYear(Number(e.target.value))}
                size={isMobile ? "small" : "medium"}
              >
                {[baseYear - 1, baseYear, baseYear + 1].map((y) => (
                  <MenuItem key={y} value={y}>
                    {y}-{y + 1}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {isMobile ? (
              <>
                <IconButton
                  aria-label="Acciones de informes"
                  onClick={openActionsMenu}
                  size="small"
                  sx={{ border: "1px solid", borderColor: "divider" }}
                >
                  <MoreVertIcon fontSize="small" />
                </IconButton>
                <Menu
                  anchorEl={actionsAnchor}
                  open={actionsMenuOpen}
                  onClose={closeActionsMenu}
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                  transformOrigin={{ vertical: "top", horizontal: "right" }}
                >
                  <MenuItem
                    disabled={!canGenerate}
                    onClick={() => {
                      setGenOpen(true);
                      closeActionsMenu();
                    }}
                  >
                    Generar informe
                  </MenuItem>
                  <MenuItem
                    disabled={reports.length === 0 || pdfLoading}
                    onClick={() => {
                      downloadPdf();
                      closeActionsMenu();
                    }}
                  >
                    {pdfLoading ? "Generando PDF…" : "Descargar PDF"}
                  </MenuItem>
                  <MenuItem
                    disabled={reports.length === 0 || unlocking !== null}
                    onClick={handleUnlock}
                  >
                    {unlocking ? "Desbloqueando…" : "Desbloquear último"}
                  </MenuItem>
                  <MenuItem
                    disabled={!reports.some((r) => !r.locked) || recalcLoading}
                    onClick={handleOpenRecalc}
                  >
                    {recalcLoading ? "Recalculando…" : "Recalcular"}
                  </MenuItem>
                </Menu>
              </>
            ) : (
              <Stack direction="row" spacing={1} alignItems="center">
                <Button
                  startIcon={<AddTaskIcon />}
                  variant="contained"
                  size="small"
                  disabled={!canGenerate}
                  onClick={() => setGenOpen(true)}
                >
                  Generar
                </Button>
                <Button
                  startIcon={<DownloadIcon />}
                  variant="outlined"
                  size="small"
                  disabled={reports.length === 0 || pdfLoading}
                  onClick={downloadPdf}
                >
                  {pdfLoading ? "Generando…" : "PDF"}
                </Button>
                <Tooltip
                  title="Desbloquear último mes para editar registros"
                  arrow
                >
                  <span>
                    <Button
                      variant="outlined"
                      color="warning"
                      size="small"
                      disabled={reports.length === 0 || unlocking !== null}
                      onClick={handleUnlock}
                    >
                      {unlocking ? "..." : "Desbloquear"}
                    </Button>
                  </span>
                </Tooltip>
                <Tooltip title="Recalcular desde el primer mes abierto" arrow>
                  <span>
                    <Button
                      variant="contained"
                      color="secondary"
                      size="small"
                      disabled={
                        !reports.some((r) => !r.locked) || recalcLoading
                      }
                      onClick={handleOpenRecalc}
                    >
                      {recalcLoading ? "..." : "Recalcular"}
                    </Button>
                  </span>
                </Tooltip>
              </Stack>
            )}
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
            {isMobile ? (
              <Stack spacing={2} aria-label="Lista de informes mensuales">
                {reports.map((r) => {
                  const sacredHours = (
                    (r.sacred_service_minutes ?? 0) / 60
                  ).toFixed(2);
                  return (
                    <Card
                      key={r.id}
                      variant="outlined"
                      sx={{
                        background: "linear-gradient(145deg,#ffffff,#fafafa)",
                        borderRadius: 2,
                      }}
                    >
                      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                          mb={0.5}
                        >
                          <Typography
                            variant="subtitle2"
                            sx={{
                              textTransform: "capitalize",
                              fontWeight: 600,
                            }}
                          >
                            {monthName(r.month_index)}
                          </Typography>
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                          >
                            <Typography variant="caption" sx={{ opacity: 0.7 }}>
                              {new Date(r.created_at).toLocaleDateString(
                                "es-ES"
                              )}
                            </Typography>
                            <Tooltip
                              title="Editar comentarios"
                              placement="left"
                              arrow
                            >
                              <span>
                                <IconButton
                                  size="small"
                                  aria-label={`Editar comentarios de ${monthName(
                                    r.month_index
                                  )}`}
                                  onClick={() => {
                                    setEditTarget(r);
                                    setEditComment(r.comments || "");
                                  }}
                                >
                                  <EditIcon fontSize="inherit" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Stack>
                        </Stack>
                        <Divider sx={{ mb: 1 }} />
                        <Stack
                          direction="row"
                          flexWrap="wrap"
                          rowGap={0.5}
                          columnGap={2}
                        >
                          <InfoItem label="Horas" value={`${r.whole_hours}h`} />
                          <InfoItem
                            label="Min entran"
                            value={`${r.carried_in_minutes}m`}
                          />
                          <InfoItem
                            label="Min salen"
                            value={`${r.carried_out_minutes}m`}
                          />
                          <InfoItem
                            label="Serv. sagrado"
                            value={`${sacredHours}h`}
                          />
                          <InfoItem
                            label="Estudios"
                            value={String(r.distinct_studies)}
                          />
                        </Stack>
                        {r.comments && (
                          <Box mt={1}>
                            <Typography
                              variant="caption"
                              sx={{ opacity: 0.7, display: "block", mb: 0.3 }}
                            >
                              Comentarios
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{
                                fontSize: 12,
                                whiteSpace: "pre-line",
                                maxHeight: 160,
                                overflow: "hidden",
                              }}
                            >
                              {r.comments}
                            </Typography>
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
                {reports.length === 0 && !loading && (
                  <Typography variant="body2" sx={{ opacity: 0.7 }}>
                    Sin informes todavía.
                  </Typography>
                )}
              </Stack>
            ) : (
              <Table size="small" aria-label="Tabla informes">
                <TableHead>
                  <TableRow>
                    <TableCell>Mes</TableCell>
                    <TableCell>Horas</TableCell>
                    <TableCell>Min entran</TableCell>
                    <TableCell>Min salen</TableCell>
                    <TableCell>Serv. sagrado (h)</TableCell>
                    <TableCell>Estudios</TableCell>
                    <TableCell>Comentarios</TableCell>
                    <TableCell>Generado</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell align="center" sx={{ width: 50 }}>
                      Editar
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {reports.map((r) => {
                    const commentText = r.comments || "";
                    const showTooltip = commentText.length > 25; // umbral arbitrario
                    return (
                      <TableRow
                        key={r.id}
                        hover
                        onDoubleClick={() => {
                          setEditTarget(r);
                          setEditComment(r.comments || "");
                        }}
                        sx={{ cursor: "pointer" }}
                      >
                        <TableCell sx={{ textTransform: "capitalize" }}>
                          {monthName(r.month_index)}
                        </TableCell>
                        <TableCell>{r.whole_hours}</TableCell>
                        <TableCell>{r.carried_in_minutes}m</TableCell>
                        <TableCell>{r.carried_out_minutes}m</TableCell>
                        <TableCell>
                          {((r.sacred_service_minutes ?? 0) / 60).toFixed(2)}
                        </TableCell>
                        <TableCell>{r.distinct_studies}</TableCell>
                        <TableCell
                          sx={{
                            maxWidth: 160,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            cursor: showTooltip ? "help" : "default",
                          }}
                        >
                          {showTooltip ? (
                            <Tooltip
                              title={
                                <Box
                                  sx={{ whiteSpace: "pre-line", fontSize: 12 }}
                                >
                                  {commentText}
                                </Box>
                              }
                              disableInteractive
                              arrow
                              placement="top-start"
                            >
                              <span>{commentText}</span>
                            </Tooltip>
                          ) : (
                            commentText
                          )}
                        </TableCell>
                        <TableCell>
                          {new Date(r.created_at).toLocaleDateString("es-ES")}
                        </TableCell>
                        <TableCell>
                          {r.locked ? (
                            <Typography
                              variant="caption"
                              color="success.main"
                              component="span"
                              sx={{ fontWeight: 600 }}
                            >
                              Cerrado
                            </Typography>
                          ) : (
                            <Typography
                              variant="caption"
                              color="warning.main"
                              component="span"
                              sx={{ fontWeight: 600 }}
                            >
                              Abierto
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title="Editar comentarios" arrow>
                            <span>
                              <IconButton
                                size="small"
                                aria-label={`Editar comentarios de ${monthName(
                                  r.month_index
                                )}`}
                                onClick={() => {
                                  setEditTarget(r);
                                  setEditComment(r.comments || "");
                                }}
                              >
                                <EditIcon fontSize="inherit" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {reports.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={8} style={{ opacity: 0.7 }}>
                        Sin informes todavía.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        {/* Dialog de generación */}
        <Dialog
          open={genOpen}
          onClose={() => setGenOpen(false)}
          fullWidth
          maxWidth="xs"
        >
          <DialogTitle>Generar informe</DialogTitle>
          <DialogContent>
            {nextIndex < 12 ? (
              <Stack spacing={2} sx={{ mt: 1 }}>
                <Typography variant="body2">
                  Se generará el informe para{" "}
                  <strong style={{ textTransform: "capitalize" }}>
                    {monthName(nextIndex)}
                  </strong>
                  . Este cierre bloqueará nuevas ediciones en ese mes.
                </Typography>
                <TextField
                  label="Comentarios (opcional)"
                  multiline
                  minRows={2}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Notas personales, aclaraciones, etc."
                  inputProps={{ maxLength: 800 }}
                  helperText={`${newComment.length}/800`}
                  fullWidth
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={includeAuto}
                      onChange={(e) => setIncludeAuto(e.target.checked)}
                      size="small"
                    />
                  }
                  label="Incluir resumen automático de servicio sagrado"
                />
              </Stack>
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
        {/* Dialog edición de comentarios */}
        <Dialog
          open={!!editTarget}
          onClose={() => !savingEdit && setEditTarget(null)}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>Editar comentarios</DialogTitle>
          <DialogContent>
            {editTarget && (
              <Stack spacing={2} sx={{ mt: 1 }}>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  {`Informe: ${monthName(editTarget.month_index)} (${
                    editTarget.whole_hours
                  }h + ${editTarget.leftover_minutes}m)`}
                </Typography>
                <TextField
                  label="Comentarios"
                  multiline
                  minRows={3}
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  inputProps={{ maxLength: 1200 }}
                  helperText={`${editComment.length}/1200`}
                  fullWidth
                  autoFocus
                />
                <Alert severity="info" variant="outlined">
                  Solo puedes modificar el texto de comentarios. Las cifras del
                  informe permanecen protegidas.
                </Alert>
              </Stack>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditTarget(null)} disabled={savingEdit}>
              Cancelar
            </Button>
            <Button
              variant="contained"
              disabled={savingEdit}
              onClick={async () => {
                if (!editTarget) return;
                setSavingEdit(true);
                try {
                  const { error: updErr } = await supabase
                    .from("monthly_reports")
                    .update({ comments: editComment || null })
                    .eq("id", editTarget.id)
                    .select("*")
                    .single();
                  if (updErr) throw updErr;
                  setReports((rs) =>
                    rs.map((r) =>
                      r.id === editTarget.id
                        ? { ...r, comments: editComment || null }
                        : r
                    )
                  );
                  setEditTarget(null);
                } catch (e: unknown) {
                  const msg =
                    e instanceof Error
                      ? e.message
                      : "Error guardando comentarios";
                  console.error(msg);
                  alert(
                    msg.includes("SOLO_COMMENTS_EDITABLE")
                      ? "Solo puedes editar los comentarios."
                      : msg
                  );
                } finally {
                  setSavingEdit(false);
                }
              }}
            >
              {savingEdit ? "Guardando..." : "Guardar"}
            </Button>
          </DialogActions>
        </Dialog>
        {/* Dialog confirm recalc */}
        <Dialog
          open={recalcOpen}
          onClose={() => !recalcLoading && setRecalcOpen(false)}
          fullWidth
          maxWidth="xs"
        >
          <DialogTitle>Recalcular informes encadenados</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Alert severity="warning" icon={false} variant="outlined">
                Se recalcularán todos los informes desde el mes{" "}
                <strong style={{ textTransform: "capitalize" }}>
                  {recalcFromIdx != null ? monthName(recalcFromIdx) : "?"}
                </strong>{" "}
                usando los registros actuales y se volverán a cerrar. Los
                comentarios se preservan.
              </Alert>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                Esto es útil si agregaste actividades a un mes reabierto. El
                rollover (minutos que pasan al siguiente) se recalculará
                correctamente.
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setRecalcOpen(false)}
              disabled={recalcLoading}
            >
              Cancelar
            </Button>
            <Button
              variant="contained"
              onClick={async () => {
                if (recalcFromIdx == null) return;
                setRecalcLoading(true);
                try {
                  const refreshed = await recalcAndLockFrom(
                    baseYear,
                    recalcFromIdx
                  );
                  setReports(refreshed);
                  setRecalcOpen(false);
                } catch (e: unknown) {
                  const msg =
                    e instanceof Error
                      ? e.message
                      : "Error recalculando informes";
                  console.error(msg);
                  alert(msg);
                } finally {
                  setRecalcLoading(false);
                }
              }}
              disabled={recalcLoading}
            >
              {recalcLoading ? "Recalculando..." : "Confirmar"}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </AuthGuard>
  );
}
