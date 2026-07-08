import React, { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import ProgressRing from "./ProgressRing";
import SessionItem from "./SessionItem";
import {
  calculateStreak,
  dateKey,
  formatDayMonth,
  formatDayName,
  formatDuration,
  type Session,
  type StudyData,
} from "@/lib/calendarUtils";

const TOKENS = {
  bgCard: "#242b24",
  border: "rgba(124, 184, 124, 0.1)",
  accent: "#7cb87c",
  accentDim: "rgba(124, 184, 124, 0.15)",
  streakGold: "#ffaa44",
  textPrimary: "#ffffff",
  textSecondary: "#a0b0a0",
  textMuted: "#6a7a6a",
};

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
      style={styles.card as any}
      // @ts-ignore
      aria-live="polite"
    >
      <View style={styles.header as any}>
        <Text style={styles.title as any}>Study Sessions</Text>
        <Text style={styles.date as any}>{formatDayMonth(selectedDate)}</Text>
      </View>

      <View style={styles.summary as any}>
        <ProgressRing
          progress={progress}
          label={formatDurationShort(minutes)}
        />
        <View style={styles.summaryText as any}>
          <Text style={styles.dayName as any}>{formatDayName(selectedDate)}</Text>
          <Text style={styles.sessionCount as any}>
            {sessions.length} {sessions.length === 1 ? "session" : "sessions"} ·{" "}
            {avgFocus(sessions)}% avg focus
          </Text>
          {isInStreak ? (
            <View style={styles.streakRow as any}>
              <Text style={styles.streakIcon as any}>🔥</Text>
              <Text style={styles.streakText as any}>
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
            <Text style={styles.emptyTitle as any}>No sessions</Text>
            <Text style={styles.emptyText as any}>
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
    backgroundColor: TOKENS.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TOKENS.border,
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
    color: TOKENS.textPrimary,
  },
  date: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: TOKENS.textMuted,
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
    color: TOKENS.textPrimary,
  },
  sessionCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: TOKENS.textSecondary,
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
    color: TOKENS.streakGold,
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
    color: TOKENS.textPrimary,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: TOKENS.textMuted,
    textAlign: "center",
  },
} as any);
