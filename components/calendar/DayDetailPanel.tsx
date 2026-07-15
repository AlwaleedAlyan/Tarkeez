import React, { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import ProgressRing from "./ProgressRing";
import SessionItem from "./SessionItem";
import { useColors } from "@/hooks/useColors";
import {
  calculateStreak,
  dateKey,
  formatDayMonth,
  formatDayName,
  formatDuration,
  type Session,
  type StudyData,
} from "@/lib/calendarUtils";

const STREAK_GOLD = "#ffaa44";

interface DayDetailPanelProps {
  selectedDate: Date;
  studyData: StudyData;
  sessions: Session[];
  dailyGoal?: number;
}

export default function DayDetailPanel({
  selectedDate,
  studyData,
  sessions,
  dailyGoal = 180,
}: DayDetailPanelProps) {
  const colors = useColors();
  const key = dateKey(selectedDate);
  const minutes = studyData[key] ?? 0;
  const progress = minutes / dailyGoal;

  const { current: streak } = useMemo(
    () => calculateStreak(studyData, selectedDate),
    [studyData, selectedDate],
  );

  const isInStreak = streak > 1 && minutes > 0;

  return (
    <View
      style={[styles.card as any, { backgroundColor: colors.card, borderColor: colors.border }]}
      // @ts-ignore
      aria-live="polite"
    >
      <View style={styles.header as any}>
        <Text style={[styles.title as any, { color: colors.foreground }]}>Study Sessions</Text>
        <Text style={[styles.date as any, { color: colors.mutedForeground }]}>{formatDayMonth(selectedDate)}</Text>
      </View>

      <View style={styles.summary as any}>
        <ProgressRing
          progress={progress}
          label={formatDurationShort(minutes)}
        />
        <View style={styles.summaryText as any}>
          <Text style={[styles.dayName as any, { color: colors.foreground }]}>{formatDayName(selectedDate)}</Text>
          <Text style={[styles.sessionCount as any, { color: colors.mutedForeground }]}>
            {sessions.length} {sessions.length === 1 ? "session" : "sessions"} ·{" "}
            {avgFocus(sessions)}% avg focus
          </Text>
          {isInStreak ? (
            <View style={styles.streakRow as any}>
              <Text style={styles.streakIcon as any}>🔥</Text>
              <Text style={[styles.streakText as any, { color: STREAK_GOLD }]}>
                Part of {streak}-day streak
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.sessionList as any}>
        {sessions.length === 0 ? (
          <View style={styles.empty as any}>
            <Text style={styles.emptyIcon as any}>📭</Text>
            <Text style={[styles.emptyTitle as any, { color: colors.foreground }]}>No sessions</Text>
            <Text style={[styles.emptyText as any, { color: colors.mutedForeground }]}>
              No study sessions recorded for this day
            </Text>
          </View>
        ) : (
          sessions.map((s) => <SessionItem key={s.id} session={s} />)
        )}
      </View>
    </View>
  );
}

function avgFocus(sessions: Session[]): number {
  if (sessions.length === 0) return 0;
  const total = sessions.reduce((sum, s) => sum + s.focusScore, 0);
  return Math.round(total / sessions.length);
}

function formatDurationShort(minutes: number): string {
  if (minutes === 0) return "0m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 18,
    animation: "fadeIn 0.4s ease-out",
    "@keyframes fadeIn": {
      from: { opacity: 0, transform: "translateY(10px)" },
      to: { opacity: 1, transform: "translateY(0)" },
    },
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  date: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  summaryText: {
    flex: 1,
    gap: 4,
  },
  dayName: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  sessionCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  streakIcon: {
    fontSize: 12,
  },
  streakText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  sessionList: {
    gap: 10,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 32,
  },
  emptyTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
  },
} as any);
