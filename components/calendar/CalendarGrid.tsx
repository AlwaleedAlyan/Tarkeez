import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import CalendarCell from "./CalendarCell";
import {
  dateKey,
  getMonthData,
  type StudyData,
  type CalendarDay,
} from "@/lib/calendarUtils";

const HEAT_COLORS = [
  "#1e241e",
  "#233023",
  "#304430",
  "#415f41",
  "#557d55",
  "#699b69",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TOKENS = {
  bgCard: "#242b24",
  border: "rgba(124, 184, 124, 0.1)",
  textMuted: "#6a7a6a",
};

interface CalendarGridProps {
  currentMonth: Date;
  studyData: StudyData;
  selectedDate: Date;
  streakDays: Set<string>;
  showDuration: boolean;
  onSelectDate: (date: Date) => void;
  switching?: boolean;
}

export default function CalendarGrid({
  currentMonth,
  studyData,
  selectedDate,
  streakDays,
  showDuration,
  onSelectDate,
  switching = false,
}: CalendarGridProps) {
  const days = getMonthData(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
  );

  const handleKeyDown = (e: any, day: CalendarDay, index: number) => {
    if (Platform.OS !== "web") return;
    const key = e.nativeEvent?.key;
    if (key === "Enter" || key === " ") {
      e.preventDefault();
      onSelectDate(day.date);
      return;
    }

    let nextIndex = -1;
    if (key === "ArrowRight") nextIndex = index + 1;
    else if (key === "ArrowLeft") nextIndex = index - 1;
    else if (key === "ArrowUp") nextIndex = index - 7;
    else if (key === "ArrowDown") nextIndex = index + 7;

    if (nextIndex >= 0 && nextIndex < days.length) {
      e.preventDefault();
      const nextDay = days[nextIndex];
      onSelectDate(nextDay.date);
    }
  };

  return (
    <View style={styles.card as any}>
      <View style={styles.weekdayHeader as any}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekdayLabel as any}>
            {w}
          </Text>
        ))}
      </View>

      <View
        style={[
          styles.grid as any,
          switching && Platform.OS === "web" ? { opacity: 0 } : { opacity: 1 },
        ]}
      >
        {days.map((day, index) => {
          const key = dateKey(day.date);
          const minutes = studyData[key] ?? 0;
          const isSelected = dateKey(selectedDate) === key;
          const isStreak = streakDays.has(key) && minutes > 0;

          return (
            <View
              key={day.key}
              // @ts-ignore - web key events
              onKeyDown={(e: any) => handleKeyDown(e, day, index)}
              tabIndex={0}
              // @ts-ignore
              role="gridcell"
              aria-selected={isSelected}
            >
              <CalendarCell
                day={day}
                minutes={minutes}
                isSelected={isSelected}
                isStreak={isStreak}
                showDuration={showDuration}
                onSelect={onSelectDate}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.legend as any}>
        <Text style={styles.legendLabel as any}>Less</Text>
        <View style={styles.legendBoxes as any}>
          {HEAT_COLORS.map((color, i) => (
            <View
              key={i}
              style={[styles.legendBox as any, { backgroundColor: color }]}
            />
          ))}
        </View>
        <Text style={styles.legendLabel as any}>More</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: TOKENS.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TOKENS.border,
    padding: 16,
    gap: 12,
  },
  weekdayHeader: {
    flexDirection: "row",
    marginBottom: 4,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: TOKENS.textMuted,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    transition: "opacity 0.3s ease",
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  legendLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: TOKENS.textMuted,
  },
  legendBoxes: {
    flexDirection: "row",
    gap: 4,
  },
  legendBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
} as any);
