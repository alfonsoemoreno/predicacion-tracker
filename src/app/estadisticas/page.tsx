"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";
import {
  Box,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Stack,
  Divider,
  Snackbar,
  Alert,
  Grid,
} from "@mui/material";

interface EntryRow {
  activity_date: string; // yyyy-mm-dd
  minutes: number | null;
  type: string;
  start_time?: string | null;
  end_time?: string | null;
  title?: string | null;
}

// Theocratic year: starts September (month 8 zero-based) ends next year August.
function getTheocraticYear(now: Date) {
  const m = now.getMonth();
  const startYear = m >= 8 ? now.getFullYear() : now.getFullYear() - 1; // 8 = September (0-based)
  const start = new Date(startYear, 8, 1); // Sept 1
  const end = new Date(startYear + 1, 8, 1); // next Sept 1 (exclusive)
  return { startYear, start, end };
}

const ANNUAL_GOAL_HOURS = 600;
const MONTHLY_GOAL_AVG = ANNUAL_GOAL_HOURS / 12; // 50

export default function EstadisticasPage() {
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string }>({
    open: false,
    message: "",
  });
  const now = useMemo(() => new Date(), []);
  const { start, end, startYear } = useMemo(
    () => getTheocraticYear(now),
    [now]
  );

  useEffect(() => {
    const load = async () => {
      setError(null);
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setRows([]);
        return;
      }
      const { data, error } = await supabase
        .from("activity_entries")
        .select("activity_date, minutes, type, start_time, end_time, title")
        .gte("activity_date", start.toISOString().slice(0, 10))
        .lt("activity_date", end.toISOString().slice(0, 10));
      if (error) {
        setError(error.message);
      } else {
        setRows((data as EntryRow[]) || []);
      }
    };
    load();
  }, [start, end]);

  // Aggregate
  const metrics = useMemo(() => {
    const coerce = (r: EntryRow) => {
      if (r.minutes != null) return r.minutes;
      if (r.start_time && r.end_time) {
        const [sh, sm] = r.start_time.split(":").map(Number);
        const [eh, em] = r.end_time.split(":").map(Number);
        const diff = eh * 60 + em - (sh * 60 + sm);
        return diff > 0 ? diff : 0;
      }
      return 0;
    };
    const preachingMinutesYear = rows
      .filter((r) => r.type === "preaching")
      .reduce((acc, r) => acc + coerce(r), 0);
    const sacredMinutesYear = rows
      .filter((r) => r.type === "sacred_service")
      .reduce((acc, r) => acc + coerce(r), 0);
    const hoursYear = preachingMinutesYear / 60;
    const sacredHoursYear = sacredMinutesYear / 60;
    const combinedHoursYear = (preachingMinutesYear + sacredMinutesYear) / 60;
    const monthsElapsed = (() => {
      // Count how many full or partial months in range up to now (inclusive current month if in range)
      const months: Date[] = [];
      let cur = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cur < end && cur <= now) {
        months.push(new Date(cur));
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      }
      return months.length;
    })();
    const expectedHoursSoFar = MONTHLY_GOAL_AVG * monthsElapsed;
    const hoursRemainingAnnual = Math.max(0, ANNUAL_GOAL_HOURS - hoursYear);
    const hoursBehindMonthlyAverage = Math.max(
      0,
      expectedHoursSoFar - hoursYear
    );
    const monthlyAverageCurrent =
      monthsElapsed > 0 ? hoursYear / monthsElapsed : 0;
    const pctAnnual = Math.min(100, (hoursYear / ANNUAL_GOAL_HOURS) * 100);
    const pctMonthlyTrack =
      expectedHoursSoFar > 0
        ? Math.min(100, (hoursYear / expectedHoursSoFar) * 100)
        : 0;
    return {
      hoursYear,
      sacredHoursYear,
      combinedHoursYear,
      hoursRemainingAnnual,
      hoursBehindMonthlyAverage,
      monthlyAverageCurrent,
      monthsElapsed,
      expectedHoursSoFar,
      pctAnnual,
      pctMonthlyTrack,
    };
  }, [rows, start, end, now]);

  // Trigger congratulation notifications when crossing goals (once per cycle)
  useEffect(() => {
    if (rows.length === 0) return;
    try {
      const annualKey = `annualGoalCongrats-${start.getFullYear()}`;
      const hoursYear = metrics.hoursYear;
      // Annual goal
      if (hoursYear >= ANNUAL_GOAL_HOURS) {
        if (!localStorage.getItem(annualKey)) {
          setSnackbar({
            open: true,
            message: `¡Felicidades! Alcanzaste la meta anual de ${ANNUAL_GOAL_HOURS} horas.`,
          });
          localStorage.setItem(annualKey, "1");
          return; // Prioriza la meta anual si ambas se alcanzan simultáneamente
        }
      }
      // Monthly average goal: detect current theocratic month index and compute expected boundary for that month
      const today = now;
      // Month index from start (0 = Septiembre)
      const monthIndex =
        (today.getFullYear() - start.getFullYear()) * 12 +
        (today.getMonth() - start.getMonth());
      if (monthIndex >= 0 && monthIndex < 12) {
        const monthGoal = MONTHLY_GOAL_AVG * (monthIndex + 1); // cumulative threshold reaching the average each month
        const monthStorageKey = `monthlyGoalCongrats-${start.getFullYear()}-${monthIndex}`;
        if (hoursYear >= monthGoal && !localStorage.getItem(monthStorageKey)) {
          setSnackbar({
            open: true,
            message: `¡Excelente! Alcanzaste el promedio acumulado esperado (≥ ${monthGoal.toFixed(
              0
            )}h) para este mes.`,
          });
          localStorage.setItem(monthStorageKey, "1");
        }
      }
    } catch {}
  }, [metrics.hoursYear, rows, start, now]);

  return (
    <AuthGuard>
      <Navbar />
      <Box
        sx={{
          p: 3,
          maxWidth: 1100,
          mx: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        <Typography variant="h5" fontWeight={700}>
          Estadísticas año teocrático {startYear}-{startYear + 1}
        </Typography>
        {error && (
          <Card variant="outlined">
            <CardContent>
              <Typography color="error">Error: {error}</Typography>
            </CardContent>
          </Card>
        )}
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6} md={4}>
            <Card variant="outlined" sx={{ height: "100%" }}>
              <CardContent>
                <Typography variant="overline" sx={{ fontWeight: 600 }}>
                  Horas acumuladas
                </Typography>
                <Typography variant="h4" fontWeight={700}>
                  {metrics.hoursYear.toFixed(1)}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={metrics.pctAnnual}
                  sx={{ mt: 2, height: 10, borderRadius: 5 }}
                  color={metrics.pctAnnual >= 100 ? "success" : "primary"}
                />
                <Stack direction="row" justifyContent="space-between" mt={1}>
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>
                    Meta 600h
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>
                    {metrics.pctAnnual.toFixed(1)}%
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Card variant="outlined" sx={{ height: "100%" }}>
              <CardContent>
                <Typography variant="overline" sx={{ fontWeight: 600 }}>
                  Faltan para meta anual
                </Typography>
                <Typography variant="h4" fontWeight={700}>
                  {Math.max(0, metrics.hoursRemainingAnnual).toFixed(1)}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.7 }}>
                  Si completas llegas a 600h
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Card variant="outlined" sx={{ height: "100%" }}>
              <CardContent>
                <Typography variant="overline" sx={{ fontWeight: 600 }}>
                  Servicio sagrado (h)
                </Typography>
                <Typography variant="h4" fontWeight={700}>
                  {metrics.sacredHoursYear.toFixed(1)}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.7 }}>
                  No suma a meta 600h
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Card variant="outlined" sx={{ height: "100%" }}>
              <CardContent>
                <Typography variant="overline" sx={{ fontWeight: 600 }}>
                  Total combinado (h)
                </Typography>
                <Typography variant="h4" fontWeight={700}>
                  {metrics.combinedHoursYear.toFixed(1)}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.7 }}>
                  Predicación + Serv. sagrado
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Card variant="outlined" sx={{ height: "100%" }}>
              <CardContent>
                <Typography variant="overline" sx={{ fontWeight: 600 }}>
                  Promedio mensual actual
                </Typography>
                <Typography variant="h4" fontWeight={700}>
                  {metrics.monthlyAverageCurrent.toFixed(1)}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.7 }}>
                  Meses transcurridos: {metrics.monthsElapsed}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Card variant="outlined" sx={{ height: "100%" }}>
              <CardContent>
                <Typography variant="overline" sx={{ fontWeight: 600 }}>
                  Faltante promedio acumulado
                </Typography>
                <Typography variant="h4" fontWeight={700}>
                  {metrics.hoursBehindMonthlyAverage.toFixed(1)}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={metrics.pctMonthlyTrack}
                  sx={{ mt: 2, height: 10, borderRadius: 5 }}
                  color={
                    metrics.pctMonthlyTrack >= 100
                      ? "success"
                      : metrics.pctMonthlyTrack >= 75
                      ? "primary"
                      : "warning"
                  }
                />
                <Stack direction="row" justifyContent="space-between" mt={1}>
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>
                    Esperado: {metrics.expectedHoursSoFar.toFixed(1)}h
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>
                    {metrics.pctMonthlyTrack.toFixed(1)}%
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        <Divider />
        <Typography variant="body2" sx={{ opacity: 0.7 }}>
          Año teocrático: septiembre a agosto. La meta anual (600h) sólo cuenta
          predicación. “Servicio sagrado” se informa aparte y también aparece el
          total combinado para referencia.
        </Typography>
      </Box>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity="success"
          variant="filled"
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </AuthGuard>
  );
}
