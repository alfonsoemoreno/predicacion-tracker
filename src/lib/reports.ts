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
  totalMinutes: number;
  distinctStudies: number;
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
    .select("minutes, type, activity_date, person_id")
    .gte("activity_date", from)
    .lt("activity_date", to);
  if (preachingErr) throw preachingErr;
  let totalMinutes = 0;
  const distinctStudyIds = new Set<string>();
  (preachingData || []).forEach((r) => {
    if (r.type === "preaching") totalMinutes += r.minutes || 0;
    if (r.type === "bible_course" && r.person_id)
      distinctStudyIds.add(r.person_id);
  });
  return { totalMinutes, distinctStudies: distinctStudyIds.size };
}

export interface GenerateReportResult {
  report: MonthlyReportRow;
}

export async function generateMonthlyReportSequential(baseYear: number) {
  // Fetch existing reports to know next index & carried_in
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("No autenticado");
  const reports = await fetchReports(baseYear);
  const nextIndex = reports.length; // sequential enforcement
  if (nextIndex > 11) throw new Error("Todos los meses ya están cerrados");
  const { totalMinutes, distinctStudies } = await aggregateMonth(
    baseYear,
    nextIndex
  );
  const carriedIn =
    reports.length === 0 ? 0 : reports[reports.length - 1].carried_out_minutes;
  const effective = totalMinutes + carriedIn;
  const wholeHours = Math.floor(effective / 60);
  const leftover = effective % 60;
  const { start, end } = monthRange(baseYear, nextIndex);
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
