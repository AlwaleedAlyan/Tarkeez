import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";
import type { PenType } from "@/contexts/LibraryContext";
import type { DrawingTool } from "@/components/DrawingCanvas";

export type { PenType };

export const PEN_COLORS = [
  "#111111",
  "#FFFFFF",
  "#7A7A7A",
  "#DC4444",
  "#E58A2A",
  "#F0C73D",
  "#3DAA52",
  "#3D7AE5",
];

export const PEN_COLORS_EXTENDED: string[] = [
  // Row 1 — neutrals
  "#0F0F10",
  "#3A3A3D",
  "#6B6B70",
  "#9D9DA3",
  "#C8C8CE",
  "#E5E5EA",
  "#F4F1EC",
  "#FFFFFF",
  // Row 2 — warms
  "#7E1F1F",
  "#C53030",
  "#E55353",
  "#F08A4B",
  "#F2B441",
  "#F2D85A",
  "#D9A066",
  "#7C4A1E",
  // Row 3 — cools
  "#1F3D7A",
  "#2E5BC9",
  "#3D7AE5",
  "#3EB0E5",
  "#3DAA86",
  "#3DAA52",
  "#8C5BE5",
  "#C95BC5",
];

export const PEN_SIZES = [2, 4, 6, 10, 16];
export const HIGHLIGHTER_SIZES = [6, 12, 20, 28, 40];

export function sizesForTool(tool: DrawingTool): number[] {
  return tool === "highlighter" ? HIGHLIGHTER_SIZES : PEN_SIZES;
}

export const PEN_TYPES: { type: PenType; label: string; hint: string }[] = [
  { type: "ballpoint", label: "Ballpoint", hint: "Crisp, even line" },
  { type: "pencil", label: "Pencil", hint: "Soft, grainy stroke" },
  { type: "marker", label: "Marker", hint: "Bold, flat-cap line" },
  { type: "brush", label: "Brush", hint: "Thick, painterly stroke" },
  { type: "fountain", label: "Fountain", hint: "Refined, fine line" },
];

type Props = {
  tool: DrawingTool;
  color: string;
  width: number;
  penType: PenType;
  onToolChange: (tool: DrawingTool) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onPenTypeChange: (penType: PenType) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

type Sheet = "color" | "size" | "pen" | null;

export function DrawingToolbar({
  tool,
  color,
  width,
  penType,
  onToolChange,
  onColorChange,
  onWidthChange,
  onPenTypeChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: Props) {
  const colors = useColors();
  const [sheet, setSheet] = useState<Sheet>(null);

  const closeSheet = () => setSheet(null);

  const pickersDisabled = tool === "eraser" || tool === "lasso";

  useEffect(() => {
    if (pickersDisabled && sheet !== null) setSheet(null);
  }, [pickersDisabled, sheet]);

  const TOOLS: { tool: DrawingTool; icon: keyof typeof Feather.glyphMap; label: string }[] = [
    { tool: "pen", icon: "edit-2", label: "Pen" },
    { tool: "highlighter", icon: "feather", label: "Highlighter" },
    { tool: "eraser", icon: "x-circle", label: "Eraser" },
    { tool: "lasso", icon: "crop", label: "Lasso" },
  ];

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {sheet === "color" ? (
        <Sheet
          onClose={closeSheet}
          surface={colors.card}
          border={colors.border}
        >
          <SheetTitle label="Color" muted={colors.mutedForeground} />
          <View style={styles.swatchGrid}>
            {PEN_COLORS_EXTENDED.map((c) => {
              const active = c.toLowerCase() === color.toLowerCase();
              return (
                <Pressable
                  key={c}
                  onPress={() => {
                    onColorChange(c);
                    closeSheet();
                  }}
                  accessibilityLabel={`Color ${c}`}
                  style={({ pressed }) => [
                    styles.swatchCell,
                    {
                      transform: [{ scale: pressed ? 0.92 : 1 }],
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.swatchRing,
                      {
                        borderColor: active ? colors.primary : "transparent",
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.swatch,
                        {
                          backgroundColor: c,
                          borderColor: colors.border,
                        },
                      ]}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Sheet>
      ) : null}

      {sheet === "size" ? (
        <Sheet
          onClose={closeSheet}
          surface={colors.card}
          border={colors.border}
        >
          <SheetTitle label="Stroke size" muted={colors.mutedForeground} />
          <View style={styles.sizeRow}>
            {sizesForTool(tool).map((s) => {
              const active = s === width;
              const dotSize = Math.min(s, 24);
              return (
                <Pressable
                  key={s}
                  onPress={() => {
                    onWidthChange(s);
                    closeSheet();
                  }}
                  accessibilityLabel={`Size ${s}`}
                  style={({ pressed }) => [
                    styles.sizeCell,
                    {
                      borderColor: active ? colors.primary : "transparent",
                      backgroundColor: active
                        ? withAlpha(colors.primary, 0.08)
                        : "transparent",
                      transform: [{ scale: pressed ? 0.94 : 1 }],
                    },
                  ]}
                >
                  <View
                    style={{
                      width: dotSize,
                      height: dotSize,
                      borderRadius: dotSize / 2,
                      backgroundColor:
                        tool === "eraser" ? colors.foreground : color,
                      opacity: tool === "highlighter" ? 0.45 : 1,
                    }}
                  />
                </Pressable>
              );
            })}
          </View>
        </Sheet>
      ) : null}

      {sheet === "pen" ? (
        <Sheet
          onClose={closeSheet}
          surface={colors.card}
          border={colors.border}
        >
          <SheetTitle label="Pen type" muted={colors.mutedForeground} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.penRow}
          >
            {PEN_TYPES.map(({ type, label, hint }) => {
              const active = type === penType;
              return (
                <Pressable
                  key={type}
                  onPress={() => {
                    onPenTypeChange(type);
                    closeSheet();
                  }}
                  accessibilityLabel={`${label} pen`}
                  style={({ pressed }) => [
                    styles.penCard,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active
                        ? withAlpha(colors.primary, 0.08)
                        : colors.background,
                      transform: [{ scale: pressed ? 0.97 : 1 }],
                    },
                  ]}
                >
                  <PenPreview type={type} color={color} foreground={colors.foreground} />
                  <Text
                    style={[
                      styles.penLabel,
                      { color: active ? colors.primary : colors.foreground },
                    ]}
                  >
                    {label}
                  </Text>
                  <Text
                    style={[
                      styles.penHint,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {hint}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Sheet>
      ) : null}

      <View
        style={[
          styles.bar,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.group}>
          {TOOLS.map((b) => (
            <ToolButton
              key={b.tool}
              icon={b.icon}
              label={b.label}
              active={tool === b.tool}
              activeBg={colors.secondary}
              activeIcon={colors.primary}
              idleIcon={colors.foreground}
              onPress={() => {
                onToolChange(b.tool);
                closeSheet();
              }}
            />
          ))}
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <ToolButton
          icon="edit-3"
          label="Pen type"
          active={sheet === "pen"}
          activeBg={colors.secondary}
          activeIcon={colors.primary}
          idleIcon={colors.foreground}
          disabled={pickersDisabled || tool !== "pen"}
          onPress={() => setSheet((s) => (s === "pen" ? null : "pen"))}
        />

        <PressablePill
          disabled={pickersDisabled}
          onPress={() => setSheet((s) => (s === "color" ? null : "color"))}
          accessibilityLabel="Color"
        >
          <View
            style={[
              styles.colorDot,
              {
                backgroundColor: color,
                borderColor: colors.border,
              },
            ]}
          />
        </PressablePill>

        <PressablePill
          disabled={pickersDisabled}
          onPress={() => setSheet((s) => (s === "size" ? null : "size"))}
          accessibilityLabel="Stroke size"
        >
          <View
            style={{
              width: Math.min(width, 20),
              height: Math.min(width, 20),
              borderRadius: Math.min(width, 20) / 2,
              backgroundColor: tool === "eraser" ? colors.foreground : color,
              opacity: tool === "highlighter" ? 0.45 : 1,
            }}
          />
        </PressablePill>

        <View style={styles.spacer} />

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <ToolButton
          icon="rotate-ccw"
          label="Undo"
          active={false}
          activeBg={colors.secondary}
          activeIcon={colors.primary}
          idleIcon={colors.foreground}
          disabled={!canUndo}
          onPress={onUndo}
        />
        <ToolButton
          icon="rotate-cw"
          label="Redo"
          active={false}
          activeBg={colors.secondary}
          activeIcon={colors.primary}
          idleIcon={colors.foreground}
          disabled={!canRedo}
          onPress={onRedo}
        />
      </View>
    </View>
  );
}

function ToolButton({
  icon,
  label,
  active,
  activeBg,
  activeIcon,
  idleIcon,
  onPress,
  disabled,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  active: boolean;
  activeBg: string;
  activeIcon: string;
  idleIcon: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const press = useSharedValue(0);
  const activeProgress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    activeProgress.value = withTiming(active ? 1 : 0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
  }, [active, activeProgress]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.04 }],
    backgroundColor: interpolateColor(
      activeProgress.value,
      [0, 1],
      ["transparent", activeBg],
    ),
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 80, easing: Easing.out(Easing.quad) });
      }}
      onPressOut={() => {
        press.value = withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) });
      }}
      disabled={disabled}
      accessibilityLabel={label}
      style={[
        styles.btn,
        { opacity: disabled ? 0.35 : 1 },
        animStyle,
      ]}
    >
      <Feather
        name={icon}
        size={18}
        color={active ? activeIcon : idleIcon}
      />
    </AnimatedPressable>
  );
}

function PressablePill({
  children,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  const press = useSharedValue(0);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.04 }],
  }));
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 80, easing: Easing.out(Easing.quad) });
      }}
      onPressOut={() => {
        press.value = withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) });
      }}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.btn,
        { opacity: disabled ? 0.35 : 1 },
        animStyle,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function Sheet({
  children,
  onClose,
  surface,
  border,
}: {
  children: React.ReactNode;
  onClose: () => void;
  surface: string;
  border: string;
}) {
  return (
    <>
      <Animated.View
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(140)}
        style={StyleSheet.absoluteFillObject}
      >
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          accessibilityLabel="Dismiss"
        />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.springify().damping(20).stiffness(180)}
        exiting={SlideOutDown.duration(180)}
        style={[
          styles.sheet,
          { backgroundColor: surface, borderColor: border },
        ]}
      >
        <View style={[styles.sheetHandle, { backgroundColor: border }]} />
        {children}
      </Animated.View>
    </>
  );
}

function SheetTitle({ label, muted }: { label: string; muted: string }) {
  return (
    <Text style={[styles.sheetTitle, { color: muted }]}>{label}</Text>
  );
}

function PenPreview({
  type,
  color,
  foreground,
}: {
  type: PenType;
  color: string;
  foreground: string;
}) {
  const visualColor = color === "#FFFFFF" ? foreground : color;
  switch (type) {
    case "pencil":
      return (
        <View style={styles.preview}>
          <View
            style={{
              height: 4,
              width: 64,
              backgroundColor: visualColor,
              opacity: 0.6,
              borderRadius: 1,
            }}
          />
        </View>
      );
    case "marker":
      return (
        <View style={styles.preview}>
          <View
            style={{
              height: 10,
              width: 64,
              backgroundColor: visualColor,
              opacity: 0.92,
            }}
          />
        </View>
      );
    case "brush":
      return (
        <View style={styles.preview}>
          <View
            style={{
              height: 12,
              width: 64,
              backgroundColor: visualColor,
              borderRadius: 6,
            }}
          />
        </View>
      );
    case "fountain":
      return (
        <View style={styles.preview}>
          <View
            style={{
              height: 3,
              width: 64,
              backgroundColor: visualColor,
              borderRadius: 1.5,
            }}
          />
        </View>
      );
    case "ballpoint":
    default:
      return (
        <View style={styles.preview}>
          <View
            style={{
              height: 5,
              width: 64,
              backgroundColor: visualColor,
              borderRadius: 2.5,
            }}
          />
        </View>
      );
  }
}

function withAlpha(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  bar: {
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 4 },
    }),
  },
  group: {
    flexDirection: "row",
    gap: 2,
  },
  divider: {
    width: 1,
    height: 24,
    marginHorizontal: 4,
    opacity: 0.6,
  },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  spacer: { flex: 1 },
  colorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  sheet: {
    position: "absolute",
    bottom: 72,
    left: 12,
    right: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    borderRadius: 22,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 10 },
    }),
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.5,
    marginBottom: 10,
  },
  sheetTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  swatchGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  swatchCell: {
    width: `${100 / 8}%`,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
  },
  sizeRow: {
    flexDirection: "row",
    gap: 14,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 4,
  },
  sizeCell: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  penRow: {
    gap: 10,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  penCard: {
    width: 132,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 2,
    gap: 6,
  },
  preview: {
    height: 28,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  penLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  penHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
});
