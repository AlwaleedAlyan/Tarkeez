import React, { useState } from "react";
import {
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Tappable } from "@/components/Tappable";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  formatDuration,
  formatMonthYear,
  getHeatColor,
  type CalendarDay,
} from "@/lib/calendarUtils";

const TOKENS = {
  accent: "#7cb87c",
  accentLight: "#9dd49d",
  textMuted: "#6a7a6a",
  streakGold: "#ffaa44",
  cellBg: "#1e241e",
};

interface CalendarCellProps {
  day: CalendarDay;
  minutes: number;
  monthMaxMinutes: number;
  isSelected: boolean;
  isStreak: boolean;
  variant?: "heatmap" | "calendar";
  onSelect: (date: Date) => void;
}

export default function CalendarCell({
  day,
  minutes,
  monthMaxMinutes,
  isSelected,
  isStreak,
  variant = "heatmap",
  onSelect,
}: CalendarCellProps) {
  const reducedMotion = useReducedMotion();
  const [hover, setHover] = useState(false);
  const [layout, setLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [pageX, setPageX] = useState(0);
  const [pageY, setPageY] = useState(0);

  const colors = getHeatColor(minutes, monthMaxMinutes);
  const hasData = minutes > 0;
  const isCalendar = variant === "calendar";

  const handleLayout = (e: LayoutChangeEvent) => {
    setLayout(e.nativeEvent.layout);
  };

  const handleMouseEnter = () => {
    if (Platform.OS !== "web") return;
    setHover(true);
  };

  const handleMouseMove = (e: any) => {
    if (Platform.OS !== "web") return;
    setPageX(e.nativeEvent?.pageX ?? 0);
    setPageY(e.nativeEvent?.pageY ?? 0);
  };

  const handleMouseLeave = () => {
    if (Platform.OS !== "web") return;
    setHover(false);
  };

  const ariaLabel = `${formatMonthYear(day.date)} ${day.day}, ${
    hasData ? formatDuration(minutes) + " studied" : "no study session"
  }`;

  const baseCellStyle = isCalendar
    ? (styles.cellCalendar as any)
    : (styles.cellHeatmap as any);
  const baseDayStyle = isCalendar
    ? (styles.dayNumberCalendar as any)
    : (styles.dayNumberHeatmap as any);

  return (
    <View style={styles.wrapper as any} onLayout={handleLayout}>
      <Tappable
        onPress={() => onSelect(day.date)}
        style={({ pressed }) => [
          styles.cell as any,
          baseCellStyle,
          {
            backgroundColor: isCalendar
              ? TOKENS.cellBg
              : colors.bg,
            opacity: day.isCurrentMonth ? 1 : 0.3,
            borderWidth:
              isSelected || day.isToday || hover || pressed ? 2 : 0,
            borderColor: isSelected
              ? TOKENS.accentLight
              : day.isToday || hover
                ? TOKENS.accent
                : "transparent",
            ...(day.isToday && Platform.OS === "web"
              ? { boxShadow: `0 0 0 1px ${TOKENS.accent}` }
              : {}),
            transform:
              hover && !reducedMotion ? [{ scale: 1.05 }] : [{ scale: 1 }],
          },
        ]}
        // @ts-ignore - web mouse events
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
        accessibilityLabel={ariaLabel}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
      >
        <Text
          style={[
            baseDayStyle,
            { color: isCalendar ? "#ffffff" : colors.text },
          ]}
        >
          {day.day}
        </Text>
        {isCalendar && hasData ? (
          <View
            style={[
              styles.heatSquare as any,
              { backgroundColor: colors.bg },
            ]}
          />
        ) : null}
        {isStreak && hasData ? (
          <Text
            style={[
              styles.streakBadge as any,
              isCalendar && (styles.streakBadgeCalendar as any),
            ]}
          >
            🔥
          </Text>
        ) : null}
      </Tappable>

      {hover && Platform.OS === "web" ? (
        <View
          style={[
            styles.tooltip as any,
            {
              left: pageX - layout.x - 60,
              top: pageY - layout.y - 40,
            },
          ]}
          // @ts-ignore
          role="tooltip"
        >
          <Text style={styles.tooltipText as any}>
            {formatMonthYear(day.date)} {day.day}:{" "}
            {hasData ? formatDuration(minutes) + " studied" : "No study session"}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    aspectRatio: 1,
    width: "100%",
    position: "relative",
  },
  cell: {
    flex: 1,
    borderRadius: 4,
    justifyContent: "flex-start",
    alignItems: "flex-start",
    position: "relative",
    overflow: "hidden",
    transition: "transform 0.15s ease, border-color 0.15s ease, background-color 0.2s ease",
    cursor: "pointer",
    zIndex: 1,
    ":hover": {
      zIndex: 2,
    },
  },
  cellHeatmap: {
    padding: 2,
  },
  cellCalendar: {
    padding: 6,
    justifyContent: "space-between",
    alignItems: "center",
  },
  dayNumberHeatmap: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    lineHeight: 12,
  },
  dayNumberCalendar: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    lineHeight: 18,
    alignSelf: "flex-start",
  },
  heatSquare: {
    width: 12,
    height: 12,
    borderRadius: 2,
    alignSelf: "center",
  },
  streakBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    fontSize: 7,
  },
  streakBadgeCalendar: {
    top: 4,
    right: 4,
    fontSize: 9,
  },
  tooltip: {
    position: "absolute",
    backgroundColor: "#111611",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(124, 184, 124, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    zIndex: 10,
    pointerEvents: "none",
    minWidth: 120,
    alignItems: "center",
  },
  tooltipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: "#ffffff",
    whiteSpace: "nowrap",
  },
} as any);
