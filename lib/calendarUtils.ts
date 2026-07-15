export interface StudyData {
  [dateKey: string]: number;
}

export interface Session {
  id: string;
  title: string;
  topic: string;
  startTime: string;
  duration: number;
  pagesRead?: number;
  focusScore: number;
  date?: string; // YYYY-MM-DD for filtering real sessions
}

export interface CalendarDay {
  date: Date;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  key: string;
}

export interface MonthlyStats {
  totalMinutes: number;
  dailyAverageMinutes: number;
  currentStreak: number;
  bestStreak: number;
  bestDayMinutes: number;
}

export function getHeatLevel(minutes: number): number {
  if (minutes === 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 60) return 2;
  if (minutes < 90) return 3;
  if (minutes < 150) return 4;
  return 5;
}

const HEAT_BASE = "#1e241e";
const HEAT_BRIGHT = "#699b69";
const HEAT_TEXT_DARK = "#111611";
const HEAT_TEXT_LIGHT = "#ffffff";

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const sanitized = hex.replace("#", "");
  const bigint = parseInt(sanitized, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(Math.round(r))}${toHex(Math.round(g))}${toHex(Math.round(b))}`;
}

function interpolateColor(a: string, b: string, t: number): string {
  const start = hexToRgb(a);
  const end = hexToRgb(b);
  const r = start.r + (end.r - start.r) * t;
  const g = start.g + (end.g - start.g) * t;
  const b2 = start.b + (end.b - start.b) * t;
  return rgbToHex(r, g, b2);
}

export function getHeatColorForRatio(ratio: number): string {
  const t = Math.min(Math.max(ratio, 0), 1);
  return interpolateColor(HEAT_BASE, HEAT_BRIGHT, t);
}

export function getHeatColor(
  minutes: number,
  maxMinutes: number,
): { bg: string; text: string } {
  if (maxMinutes <= 0 || minutes <= 0) {
    return { bg: HEAT_BASE, text: HEAT_TEXT_LIGHT };
  }
  const ratio = Math.min(Math.max(minutes / maxMinutes, 0), 1);
  const bg = getHeatColorForRatio(ratio);
  const text = ratio > 0.8 ? HEAT_TEXT_DARK : HEAT_TEXT_LIGHT;
  return { bg, text };
}

function getLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

export function getThemeHeatColorForRatio(
  ratio: number,
  accent: string,
  muted: string,
): string {
  const t = Math.min(Math.max(ratio, 0), 1);
  return interpolateColor(muted, accent, t);
}

export function getThemeHeatColor(
  minutes: number,
  maxMinutes: number,
  accent: string,
  muted: string,
): { bg: string; text: string } {
  if (maxMinutes <= 0 || minutes <= 0) {
    return { bg: muted, text: getLuminance(muted) > 0.5 ? "#111611" : "#ffffff" };
  }
  const ratio = Math.min(Math.max(minutes / maxMinutes, 0), 1);
  const bg = getThemeHeatColorForRatio(ratio, accent, muted);
  const text = getLuminance(bg) > 0.5 ? "#111611" : "#ffffff";
  return { bg, text };
}

export function getMonthMaxMinutes(
  studyData: StudyData,
  year: number,
  month: number,
): number {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let max = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(new Date(year, month, d));
    const minutes = studyData[key] ?? 0;
    if (minutes > max) max = minutes;
  }
  return max;
}

export function formatDuration(minutes: number): string {
  if (minutes === 0) return "";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatDurationHours(minutes: number): string {
  const h = minutes / 60;
  if (h === 0) return "0h";
  if (h < 10 && h % 1 !== 0) return `${h.toFixed(1)}h`;
  return `${Math.round(h)}h`;
}

export function formatDurationShort(minutes: number): string {
  if (minutes === 0) return "0m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

export function formatDurationAverage(minutes: number): string {
  if (minutes === 0) return "0m";
  if (minutes < 60) return `${Math.round(minutes)}m`;

  const hours = minutes / 60;
  const roundedHours = Math.round(hours * 10) / 10;
  const totalMinutes = Math.round(roundedHours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function getMonthData(year: number, month: number): CalendarDay[] {
  const firstDayOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstDayOfMonth.getDay(); // 0 = Sunday

  const today = new Date();

  const days: CalendarDay[] = [];

  // Previous month padding
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = startWeekday - 1; i >= 0; i--) {
    const date = new Date(year, month - 1, prevMonthDays - i);
    days.push({
      date,
      day: date.getDate(),
      isCurrentMonth: false,
      isToday: isSameDay(date, today),
      key: dateKey(date),
    });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    days.push({
      date,
      day: d,
      isCurrentMonth: true,
      isToday: isSameDay(date, today),
      key: dateKey(date),
    });
  }

  // Next month padding to fill 6 rows (42 cells)
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    const date = new Date(year, month + 1, d);
    days.push({
      date,
      day: d,
      isCurrentMonth: false,
      isToday: isSameDay(date, today),
      key: dateKey(date),
    });
  }

  return days;
}

export function calculateStreak(
  studyData: StudyData,
  endDate?: Date,
): { current: number; best: number } {
  const end = endDate ? new Date(endDate) : new Date();
  const keys = Object.keys(studyData)
    .filter((k) => studyData[k] > 0)
    .sort();

  if (keys.length === 0) return { current: 0, best: 0 };

  // Build a set of date keys with activity
  const activeSet = new Set(keys);

  // Current streak: count consecutive days ending at endDate (or yesterday if endDate has no activity)
  let current = 0;
  let cursor = new Date(end);
  // Normalize cursor to start of day
  cursor.setHours(0, 0, 0, 0);
  while (activeSet.has(dateKey(cursor))) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }
  // If endDate itself has no activity, still count backwards from endDate
  // (the prompt says "current streak" based on consecutive days up to today)
  // We'll keep the above loop which starts at endDate.

  // Best streak
  let best = 0;
  let run = 0;
  const sortedDates = keys.map(parseDateKey);
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) {
      run = 1;
    } else {
      const prev = sortedDates[i - 1];
      const curr = sortedDates[i];
      const diffDays =
        (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays === 1) {
        run++;
      } else {
        run = 1;
      }
    }
    best = Math.max(best, run);
  }

  return { current, best };
}

export function computeMonthlyStats(
  studyData: StudyData,
  year: number,
  month: number,
): MonthlyStats {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let totalMinutes = 0;
  let activeDays = 0;
  let bestDayMinutes = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(new Date(year, month, d));
    const minutes = studyData[key] ?? 0;
    totalMinutes += minutes;
    if (minutes > 0) activeDays++;
    if (minutes > bestDayMinutes) bestDayMinutes = minutes;
  }

  const dailyAverageMinutes = activeDays > 0 ? totalMinutes / activeDays : 0;
  const { current: currentStreak, best: bestStreak } = calculateStreak(
    studyData,
    new Date(year, month + 1, 0),
  );

  return {
    totalMinutes,
    dailyAverageMinutes,
    currentStreak,
    bestStreak,
    bestDayMinutes,
  };
}

export function getWeeklyActivity(studyData: StudyData): number[] {
  const today = new Date();
  const out: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(studyData[dateKey(d)] ?? 0);
  }
  return out;
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function formatDayMonth(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

export function formatDayName(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long" });
}
