import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DayDetailsSheet from "@/components/calendar/DayDetailsSheet";
import MonthHeatmap from "@/components/calendar/MonthHeatmap";
import MonthSelector from "@/components/calendar/MonthSelector";
import { Tappable } from "@/components/Tappable";
import { useLibrary } from "@/contexts/LibraryContext";
import { useColors } from "@/hooks/useColors";
import {
  calculateStreak,
  computeMonthlyStats,
  dateKey,
  formatDurationAverage,
  formatDurationHours,
  type Session,
} from "@/lib/calendarUtils";

function materialIcon(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("machine") || t.includes("notes")) return "notes";
  if (t.includes("stat") || t.includes("math")) return "math";
  if (t.includes("paper") || t.includes("read")) return "reading";
  if (t.includes("program") || t.includes("code")) return "coding";
  return "reading";
}

export default function CalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sessions: librarySessions, materials, notes } = useLibrary();

  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const { studyData, sessions, currentStreak } = useMemo(() => {
    const data: Record<string, number> = {};

    const realSessions: Session[] = librarySessions.map((s) => {
      const material = s.materialId
        ? materials.find((m) => m.id === s.materialId)
        : undefined;
      const note = s.noteId ? notes.find((n) => n.id === s.noteId) : undefined;
      const title = material?.title ?? note?.title ?? "Study session";
      const startDate = new Date(s.startedAt);
      const startTime = `${String(startDate.getHours()).padStart(2, "0")}:${String(
        startDate.getMinutes(),
      ).padStart(2, "0")}`;
      return {
        id: s.id,
        title,
        topic: material ? materialIcon(title) : note ? "notes" : "reading",
        startTime,
        duration: Math.round(s.durationSec / 60),
        pagesRead: s.pagesRead ?? undefined,
        focusScore:
          Math.round(
            (s.durationSec / (s.durationSec + (s.pausedSec ?? 0))) * 100,
          ) || 0,
        date: dateKey(new Date(s.startedAt)),
      };
    });

    for (const s of librarySessions) {
      const key = dateKey(new Date(s.startedAt));
      data[key] = (data[key] ?? 0) + Math.round(s.durationSec / 60);
    }

    const { current } = calculateStreak(data);

    return { studyData: data, sessions: realSessions, currentStreak: current };
  }, [librarySessions, materials, notes]);

  const monthStats = useMemo(
    () =>
      computeMonthlyStats(
        studyData,
        currentMonth.getFullYear(),
        currentMonth.getMonth(),
      ),
    [studyData, currentMonth],
  );

  const monthPages = useMemo(() => {
    const prefix = `${currentMonth.getFullYear()}-${String(
      currentMonth.getMonth() + 1,
    ).padStart(2, "0")}-`;
    return sessions
      .filter((s) => s.date?.startsWith(prefix))
      .reduce((sum, s) => sum + (s.pagesRead ?? 0), 0);
  }, [sessions, currentMonth]);

  const handlePrevMonth = useCallback(() => {
    setCurrentMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
    );
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
    );
  }, []);

  const handleToday = useCallback(() => {
    setCurrentMonth(new Date());
  }, []);

  const handleSelectDate = useCallback((date: Date) => {
    setSelectedDate(date);
  }, []);

  const handleCloseSheet = useCallback(() => {
    setSelectedDate(null);
  }, []);

  const selectedKey = selectedDate ? dateKey(selectedDate) : null;
  const selectedMinutes = selectedKey ? (studyData[selectedKey] ?? 0) : 0;
  const selectedSessions = selectedKey
    ? sessions.filter((s) => s.date === selectedKey)
    : [];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Tappable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backBtn,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          accessibilityLabel="Back"
        >
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </Tappable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Focus Calendar
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View
        style={[
          styles.content,
          { paddingBottom: insets.bottom + 12 },
        ]}
      >
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Feather name="clock" size={14} color={colors.accent} />
            <Text style={[styles.statText, { color: colors.foreground }]}>
              {formatDurationHours(monthStats.totalMinutes)} total
            </Text>
          </View>
          <Text style={[styles.statDivider, { color: colors.mutedForeground }]}>
            •
          </Text>
          <View style={styles.stat}>
            <Feather name="trending-up" size={14} color={colors.accent} />
            <Text style={[styles.statText, { color: colors.foreground }]}>
              {formatDurationAverage(monthStats.dailyAverageMinutes)} daily avg
            </Text>
          </View>
          <Text style={[styles.statDivider, { color: colors.mutedForeground }]}>
            •
          </Text>
          <View style={styles.stat}>
            <Feather name="book-open" size={14} color={colors.accent} />
            <Text style={[styles.statText, { color: colors.foreground }]}>
              {monthPages} {monthPages === 1 ? "page" : "pages"}
            </Text>
          </View>
          <Text style={[styles.statDivider, { color: colors.mutedForeground }]}>
            •
          </Text>
          <View style={styles.stat}>
            <Text style={styles.statEmoji}>🔥</Text>
            <Text style={[styles.statText, { color: colors.foreground }]}>
              {currentStreak} day streak
            </Text>
          </View>
        </View>

        <MonthSelector
          currentMonth={currentMonth}
          onPrev={handlePrevMonth}
          onNext={handleNextMonth}
          onToday={handleToday}
        />

        <MonthHeatmap
          currentMonth={currentMonth}
          studyData={studyData}
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
        />
      </View>

      <DayDetailsSheet
        date={selectedDate}
        minutes={selectedMinutes}
        sessions={selectedSessions}
        onClose={handleCloseSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    textAlign: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    rowGap: 4,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  statEmoji: {
    fontSize: 13,
  },
  statDivider: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
});
