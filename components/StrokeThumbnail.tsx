import React, { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";

import type { Stroke } from "@/contexts/LibraryContext";

type Props = {
  strokes: Stroke[];
  size?: number;
  borderColor?: string;
};

function pointsToPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} l 0.01 0`;
  }
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
  }
  return d;
}

export function StrokeThumbnail({ strokes, size = 36, borderColor }: Props) {
  const view = useMemo(() => {
    if (strokes.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of strokes) {
      for (const p of s.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    if (
      !isFinite(minX) ||
      !isFinite(maxX) ||
      !isFinite(minY) ||
      !isFinite(maxY)
    ) {
      return null;
    }
    const pad = 8;
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    return {
      x: minX - pad,
      y: minY - pad,
      w: w + pad * 2,
      h: h + pad * 2,
    };
  }, [strokes]);

  if (!view) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: borderColor ?? "#0002",
        }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: borderColor ?? "#0002",
        backgroundColor: "#fff",
      }}
    >
      <Svg
        width={size}
        height={size}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {strokes.map((s, i) => (
          <Path
            key={i}
            d={pointsToPath(s.points)}
            stroke={s.color}
            strokeOpacity={s.kind === "highlighter" ? 0.32 : 1}
            strokeWidth={s.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
      </Svg>
    </View>
  );
}
