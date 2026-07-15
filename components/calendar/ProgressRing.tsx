import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { useColors } from "@/hooks/useColors";

interface ProgressRingProps {
  progress: number; // 0 to 1
  size?: number;
  strokeWidth?: number;
  label: string;
}

export default function ProgressRing({
  progress,
  size = 64,
  strokeWidth = 4,
  label,
}: ProgressRingProps) {
  const colors = useColors();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = circumference * (1 - clamped);
  const center = size / 2;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={colors.muted}
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={colors.accent}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          originX={center}
          originY={center}
          rotation="-90"
        />
      </Svg>
      <Text style={[styles.label, { color: colors.accent }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  svg: {
    position: "absolute",
  },
  label: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
});
