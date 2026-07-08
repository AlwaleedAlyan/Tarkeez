import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import StudyCalendar from "@/components/calendar/StudyCalendar";
import { useLibrary } from "@/contexts/LibraryContext";
import { dateKey, type Session } from "@/lib/calendarUtils";
import {
  bestStreak,
  currentStreak,
  sessionsForJuly8,
  studyData,
  weeklyActivity,
} from "@/lib/calendarMockData";

function materialIcon(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("machine") || t.includes("notes")) return "notes";
  if (t.includes("stat") || t.includes("math")) return "math";
  if (t.includes("paper") || t.includes("read")) return "reading";
  if (t.includes("program") || t.includes("code")) return "coding";
  return "reading";
}

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { sessions: librarySessions, materials, notes } = useLibrary();

  const { mergedStudyData, mergedSessions } = useMemo(() => {
    const data: Record<string, number> = { ...studyData };

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

    return { mergedStudyData: data, mergedSessions: realSessions };
  }, [librarySessions, materials, notes]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StudyCalendar
        studyData={mergedStudyData}
        sessions={[...sessionsForJuly8, ...mergedSessions]}
        currentStreak={currentStreak}
        bestStreak={bestStreak}
        weeklyActivity={weeklyActivity}
        bottomPadding={insets.bottom + 80}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#111611",
  },
});
