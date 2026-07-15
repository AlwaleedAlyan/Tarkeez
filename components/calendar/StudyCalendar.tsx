import React, { useCallback, useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import CalendarGrid from "./CalendarGrid";
import DayDetailPanel from "./DayDetailPanel";
import MonthSelector from "./MonthSelector";
import StatsRow from "./StatsRow";
import StreakCard from "./StreakCard";
import { useColors } from "@/hooks/useColors";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  computeMonthlyStats,
  dateKey,
  getMonthData,
  formatDurationAverage,
  formatDurationHours,
  formatDurationShort,
  type Session,
  type StudyData,
} from "@/lib/calendarUtils";

interface StudyCalendarProps {
  studyData: StudyData;
  sessions: Session[];
  currentStreak: number;
  bestStreak: number;
  weeklyActivity: number[];
  dailyGoal?: number;
  bottomPadding?: number;
}

export default function StudyCalendar({
  studyData,
  sessions,
  currentStreak: initialCurrentStreak,
  bestStreak: initialBestStreak,
  weeklyActivity,
  dailyGoal = 180,
  bottomPadding = 0,
}: StudyCalendarProps) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const isMobile = width < 600;
  const isDesktop = width >= 900;

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today);
  const [selectedDate, setSelectedDate] = useState(today);
  const [switching, setSwitching] = useState(false);

  const stats = useMemo(
    () => computeMonthlyStats(studyData, currentMonth.getFullYear(), currentMonth.getMonth()),
    [studyData, currentMonth],
  );

  const streakDays = useMemo(() => {
    const days = getMonthData(currentMonth.getFullYear(), currentMonth.getMonth());
    const set = new Set<string>();
    for (const day of days) {
      const key = dateKey(day.date);
      const prev = new Date(day.date);
      prev.setDate(day.date.getDate() - 1);
      const next = new Date(day.date);
      next.setDate(day.date.getDate() + 1);
      const hasActivity = (studyData[key] ?? 0) > 0;
      const prevActive = (studyData[dateKey(prev)] ?? 0) > 0;
      const nextActive = (studyData[dateKey(next)] ?? 0) > 0;
      if (hasActivity && (prevActive || nextActive)) {
        set.add(key);
      }
    }
    return set;
  }, [studyData, currentMonth]);

  const selectedSessions = useMemo(() => {
    const selectedKey = dateKey(selectedDate);
    return sessions.filter((s) => s.date === selectedKey);
  }, [selectedDate, sessions]);

  const handlePrevMonth = useCallback(() => {
    if (reducedMotion) {
      setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
      return;
    }
    setSwitching(true);
    setTimeout(() => {
      setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
      setSwitching(false);
    }, 300);
  }, [reducedMotion]);

  const handleNextMonth = useCallback(() => {
    if (reducedMotion) {
      setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
      return;
    }
    setSwitching(true);
    setTimeout(() => {
      setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
      setSwitching(false);
    }, 300);
  }, [reducedMotion]);

  const handleToday = useCallback(() => {
    if (reducedMotion) {
      setCurrentMonth(today);
      setSelectedDate(today);
      return;
    }
    setSwitching(true);
    setTimeout(() => {
      setCurrentMonth(today);
      setSelectedDate(today);
      setSwitching(false);
    }, 300);
  }, [today, reducedMotion]);

  const handleSelectDate = useCallback((date: Date) => {
    setSelectedDate(date);
  }, []);

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: 24 + bottomPadding },
      ]}
    >
      <View style={styles.header as any}>
        <Text style={[styles.title as any, { color: colors.foreground }]}>Study Calendar</Text>
        <Text style={[styles.subtitle as any, { color: colors.mutedForeground }]}>
          Track your study habits and build consistent streaks.
        </Text>
      </View>

      <StatsRow
        totalHours={formatDurationHours(stats.totalMinutes)}
        dailyAverage={formatDurationAverage(stats.dailyAverageMinutes)}
        streak={stats.currentStreak}
        bestDay={formatDurationShort(stats.bestDayMinutes)}
        compact={isMobile}
      />

      <View
        style={[
          styles.main as any,
          isDesktop
            ? { flexDirection: "row", display: "grid" }
            : { flexDirection: "column", display: "flex" },
        ]}
      >
        <View style={styles.leftColumn as any}>
          <MonthSelector
            currentMonth={currentMonth}
            onPrev={handlePrevMonth}
            onNext={handleNextMonth}
            onToday={handleToday}
          />

          <CalendarGrid
            currentMonth={currentMonth}
            studyData={studyData}
            selectedDate={selectedDate}
            streakDays={streakDays}
            variant={isMobile ? "calendar" : "heatmap"}
            onSelectDate={handleSelectDate}
            switching={switching}
          />
        </View>

        <View style={styles.rightColumn as any}>
          <DayDetailPanel
            selectedDate={selectedDate}
            studyData={studyData}
            sessions={selectedSessions}
            dailyGoal={dailyGoal}
          />
          <StreakCard
            currentStreak={initialCurrentStreak}
            bestStreak={initialBestStreak}
            weeklyActivity={weeklyActivity}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 24,
    gap: 20,
    maxWidth: 1200,
    alignSelf: "center",
    width: "100%",
  },
  header: {
    gap: 4,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  main: {
    gap: 24,
    display: "grid",
    gridTemplateColumns: "1fr 380px",
    flexDirection: "row",
  },
  leftColumn: {
    gap: 16,
    minWidth: 0,
  },
  rightColumn: {
    gap: 16,
    minWidth: 0,
  },
} as any);
