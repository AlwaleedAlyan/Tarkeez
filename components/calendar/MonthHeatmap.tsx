import React, { useMemo, useState } from "react";
import {
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Tappable } from "@/components/Tappable";
import { useColors } from "@/hooks/useColors";
import {
  dateKey,
  formatDuration,
  formatDayMonth,
  getMonthData,
  getMonthMaxMinutes,
  getThemeHeatColor,
  getThemeHeatColorForRatio,
  type CalendarDay,
  type StudyData,
} from "@/lib/calendarUtils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LEGEND_RATIOS = [0, 0.2, 0.4, 0.6, 0.8, 1];

const GAP = 4;
const COLS = 7;
const ROWS = 6;
const WEEKDAY_HEADER_HEIGHT = 18;
const LEGEND_HEIGHT = 28;
const MIN_CELL = 14;
const MAX_CELL = 72;

interface MonthHeatmapProps {
  currentMonth: Date;
  studyData: StudyData;
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
}

// GitHub-style month heatmap. Cells are sized in exact pixels derived from the
// measured container so the whole month always fits the screen — no scrolling,
// no CSS grid (which React Native ignores on native).
export default function MonthHeatmap({
  currentMonth,
  studyData,
  selectedDate,
  onSelectDate,
}: MonthHeatmapProps) {
  const colors = useColors();
  const [bounds, setBounds] = useState({ width: 0, height: 0 });

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const days = useMemo(() => getMonthData(year, month), [year, month]);
  const monthMaxMinutes = useMemo(
    () => getMonthMaxMinutes(studyData, year, month),
    [studyData, year, month],
  );

  const weeks = useMemo(() => {
    const out: CalendarDay[][] = [];
    for (let r = 0; r < ROWS; r++) {
      out.push(days.slice(r * COLS, (r + 1) * COLS));
    }
    return out;
  }, [days]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBounds((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height },
    );
  };

  let cellSize = 0;
  if (bounds.width > 0 && bounds.height > 0) {
    const byWidth = (bounds.width - (COLS - 1) * GAP) / COLS;
    const byHeight =
      (bounds.height -
        (ROWS - 1) * GAP -
        WEEKDAY_HEADER_HEIGHT -
        LEGEND_HEIGHT -
        8) / // vertical breathing room between sections
      ROWS;
    cellSize = Math.max(
      MIN_CELL,
      Math.min(MAX_CELL, Math.floor(Math.min(byWidth, byHeight))),
    );
  }

  const selectedKey = selectedDate ? dateKey(selectedDate) : null;
  const cellRadius = Math.max(3, Math.round(cellSize * 0.18));

  return (
    <View style={styles.root} onLayout={handleLayout}>
      {cellSize > 0 ? (
        <View style={styles.inner}>
          <View style={[styles.weekdayRow, { gap: GAP, height: WEEKDAY_HEADER_HEIGHT }]}>
            {WEEKDAYS.map((w) => (
              <Text
                key={w}
                style={[
                  styles.weekdayLabel,
                  { width: cellSize, color: colors.mutedForeground },
                ]}
              >
                {w}
              </Text>
            ))}
          </View>

          {weeks.map((week, rowIndex) => (
            <View key={rowIndex} style={[styles.weekRow, { gap: GAP }]}>
              {week.map((day) => {
                const key = day.key;
                const minutes = studyData[key] ?? 0;
                const heat = getThemeHeatColor(
                  minutes,
                  monthMaxMinutes,
                  colors.accent,
                  colors.muted,
                );
                const isSelected = selectedKey === key;
                const hasData = minutes > 0;
                const ariaLabel = `${formatDayMonth(day.date)}, ${
                  hasData ? `${formatDuration(minutes)} focused` : "no focus session"
                }`;

                return (
                  <Tappable
                    key={key}
                    onPress={() => onSelectDate(day.date)}
                    style={({ pressed }) => [
                      {
                        width: cellSize,
                        height: cellSize,
                        borderRadius: cellRadius,
                        backgroundColor: heat.bg,
                        opacity: (day.isCurrentMonth ? 1 : 0.35) * (pressed ? 0.7 : 1),
                        borderWidth: isSelected || day.isToday ? 2 : 0,
                        borderColor: isSelected ? colors.accent : colors.primary,
                      },
                    ]}
                    accessibilityLabel={ariaLabel}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  />
                );
              })}
            </View>
          ))}

          <View style={[styles.legend, { height: LEGEND_HEIGHT }]}>
            <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>
              Less
            </Text>
            <View style={styles.legendBoxes}>
              {LEGEND_RATIOS.map((ratio, i) => (
                <View
                  key={i}
                  style={[
                    styles.legendBox,
                    {
                      backgroundColor: getThemeHeatColorForRatio(
                        ratio,
                        colors.accent,
                        colors.muted,
                      ),
                    },
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>
              More
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: GAP,
  },
  weekdayRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  weekdayLabel: {
    textAlign: "center",
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  weekRow: {
    flexDirection: "row",
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  legendLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
  },
  legendBoxes: {
    flexDirection: "row",
    gap: 4,
  },
  legendBox: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
});
