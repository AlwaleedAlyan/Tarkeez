import React, { useState } from "react";
import {
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Tappable } from "@/components/Tappable";
import { useColors } from "@/hooks/useColors";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  formatDuration,
  formatMonthYear,
  getThemeHeatColor,
  type CalendarDay,
} from "@/lib/calendarUtils";

const STREAK_GOLD = "#ffaa44";

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
  const colors = useColors();
  const reducedMotion = useReducedMotion();
  const [hover, setHover] = useState(false);
  const [layout, setLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [pageX, setPageX] = useState(0);
  const [pageY, setPageY] = useState(0);

  const heat = getThemeHeatColor(minutes, monthMaxMinutes, colors.accent, colors.muted);
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
              ? colors.muted
              : heat.bg,
            opacity: day.isCurrentMonth ? 1 : 0.35,
            borderWidth:
              isSelected || day.isToday || hover || pressed ? 2 : 0,
            borderColor: isSelected
              ? colors.accent
              : day.isToday || hover
                ? colors.primary
                : "transparent",
            ...(day.isToday && Platform.OS === "web"
              ? { boxShadow: `0 0 0 1px ${colors.primary}` }
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
            { color: isCalendar ? colors.foreground : heat.text },
          ]}
        >
          {day.day}
        </Text>
        {isCalendar && hasData ? (
          <View
            style={[
              styles.heatSquare as any,
              { backgroundColor: heat.bg },
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
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
          // @ts-ignore
          role="tooltip"
        >
          <Text style={[styles.tooltipText as any, { color: colors.foreground }]}>
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
    justifyContent: "center",
    alignItems: "center",
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
    borderRadius: 8,
    borderWidth: 1,
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
    whiteSpace: "nowrap",
  },
} as any);
