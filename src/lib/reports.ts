import { supabase } from "@/lib/supabaseClient";

export interface MonthlyReportRow {
  id: string;
  user_id: string;
  period_year: number;
  month_index: number; // 0=Sept
  period_start: string; // ISO date
  period_end: string; // ISO date (exclusive)
  total_minutes: number;
  carried_in_minutes: number;
  carried_out_minutes: number;
  whole_hours: number;
  leftover_minutes: number;
  effective_minutes: number;
  distinct_studies: number;
  sacred_service_minutes?: number;
  comments?: string | null;
  locked: boolean;
  created_at: string;
}

export const THEOCRATIC_START_MONTH = 8; // September (0-based 8)

export function computeTheocraticYearBase(date: Date) {
  const m = date.getMonth();
  return m >= THEOCRATIC_START_MONTH
    ? date.getFullYear()
    : date.getFullYear() - 1;
}

export function monthIndexFromDate(baseYear: number, date: Date): number {
  // baseYear September is index 0
  const start = new Date(baseYear, THEOCRATIC_START_MONTH, 1);
  return (
    (date.getFullYear() - start.getFullYear()) * 12 +
    (date.getMonth() - start.getMonth())
  );
}

export function monthRange(baseYear: number, monthIndex: number) {
  const start = new Date(baseYear, THEOCRATIC_START_MONTH + monthIndex, 1);
  const end = new Date(baseYear, THEOCRATIC_START_MONTH + monthIndex + 1, 1);
  return { start, end };
}

export async function fetchReports(baseYear: number) {
  const { data, error } = await supabase
    .from("monthly_reports")
    .select("*")
    .eq("period_year", baseYear)
    .order("month_index", { ascending: true });
  if (error) throw error;
  return data as MonthlyReportRow[];
}

export interface MonthAggregateResult {
  totalMinutes: number; // preaching only
  distinctStudies: number;
  sacredServiceMinutes: number;
  sacredServiceCount: number;
}

export async function aggregateMonth(
  baseYear: number,
  monthIndex: number
): Promise<MonthAggregateResult> {
  const { start, end } = monthRange(baseYear, monthIndex);
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);
  // Preaching minutes
  const { data: preachingData, error: preachingErr } = await supabase
    .from("activity_entries")
    .select("minutes, type, activity_date, person_id, start_time, end_time")
    .gte("activity_date", from)
    .lt("activity_date", to);
  if (preachingErr) throw preachingErr;
  let totalMinutes = 0; // preaching
  let sacredServiceMinutes = 0;
  let sacredServiceCount = 0;
  const distinctStudyIds = new Set<string>();
  (preachingData || []).forEach((r) => {
    // Recalcular minutos si vienen null usando start_time/end_time (por compatibilidad)
    const coerceMinutes = () => {
      if (r.minutes != null) return r.minutes;
      if (r.start_time && r.end_time) {
        // Expect HH:MM:SS
        const [sh, sm] = r.start_time.split(":").map(Number);
        const [eh, em] = r.end_time.split(":").map(Number);
        const diff = eh * 60 + em - (sh * 60 + sm);
        return diff > 0 ? diff : 0;
      }
      return 0;
    };
    if (r.type === "preaching") totalMinutes += coerceMinutes();
    if (r.type === "sacred_service") {
      sacredServiceMinutes += coerceMinutes();
      sacredServiceCount += 1;
    }
    if (r.type === "bible_course" && r.person_id)
      distinctStudyIds.add(r.person_id);
  });
  return {
    totalMinutes,
    distinctStudies: distinctStudyIds.size,
    sacredServiceMinutes,
    sacredServiceCount,
  };
}

export interface GenerateReportResult {
  report: MonthlyReportRow;
}

export async function generateMonthlyReportSequential(
  baseYear: number,
  opts?: { comment?: string | null; includeAuto?: boolean }
) {
  // Fetch existing reports to know next index & carried_in
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("No autenticado");
  const reports = await fetchReports(baseYear);
  const nextIndex = reports.length; // sequential enforcement
  if (nextIndex > 11) throw new Error("Todos los meses ya están cerrados");
  const { totalMinutes, distinctStudies, sacredServiceMinutes } =
    await aggregateMonth(baseYear, nextIndex);
  const carriedIn =
    reports.length === 0 ? 0 : reports[reports.length - 1].carried_out_minutes;
  const effective = totalMinutes + carriedIn;
  const wholeHours = Math.floor(effective / 60);
  const leftover = effective % 60;
  const { start, end } = monthRange(baseYear, nextIndex);
  // Auto comment with per-record sacred service detail (X.XXh - Title)
  let autoComment: string | null = null;
  if (sacredServiceMinutes > 0 && (opts?.includeAuto ?? true)) {
    // Fetch rows for this month to list each sacred_service entry
    const from = start.toISOString().slice(0, 10);
    const to = end.toISOString().slice(0, 10);
    const { data: sacredRows, error: sacredErr } = await supabase
      .from("activity_entries")
      .select("title, minutes, start_time, end_time, type")
      .gte("activity_date", from)
      .lt("activity_date", to)
      .eq("type", "sacred_service");
    if (sacredErr) throw sacredErr;
    const lines: string[] = [];
    (sacredRows || []).forEach((row) => {
      let mins = row.minutes as number | null;
      if (mins == null && row.start_time && row.end_time) {
        const [sh, sm] = row.start_time.split(":").map(Number);
        const [eh, em] = row.end_time.split(":").map(Number);
        const diff = eh * 60 + em - (sh * 60 + sm);
        mins = diff > 0 ? diff : 0;
      }
      const hours = ((mins || 0) / 60).toFixed(2);
      const title = (row.title && row.title.trim()) || "(Sin título)";
      lines.push(`${hours}h - ${title}`);
    });
    autoComment = lines.join(" | ");
  }
  // Combinar comentario manual y automático (si existe)
  let finalComments: string | null = null;
  const manual = opts?.comment?.trim();
  if (manual && autoComment) finalComments = manual + " | " + autoComment;
  else if (manual) finalComments = manual;
  else finalComments = autoComment;

  const payload = {
    user_id: userId,
    period_year: baseYear,
    month_index: nextIndex,
    period_start: start.toISOString().slice(0, 10),
    period_end: end.toISOString().slice(0, 10),
    total_minutes: totalMinutes,
    carried_in_minutes: carriedIn,
    carried_out_minutes: leftover,
    whole_hours: wholeHours,
    leftover_minutes: leftover,
    effective_minutes: effective,
    distinct_studies: distinctStudies,
    sacred_service_minutes: sacredServiceMinutes,
    comments: finalComments,
    locked: true,
  };
  const { data, error } = await supabase
    .from("monthly_reports")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return { report: data as MonthlyReportRow };
}
