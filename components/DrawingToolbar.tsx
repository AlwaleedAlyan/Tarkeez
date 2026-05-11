import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import type { DrawingTool } from "@/components/DrawingCanvas";

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

export const PEN_SIZES = [2, 4, 6, 10, 16];
export const HIGHLIGHTER_SIZES = [6, 12, 20, 28, 40];

export function sizesForTool(tool: DrawingTool): number[] {
  return tool === "highlighter" ? HIGHLIGHTER_SIZES : PEN_SIZES;
}

type Props = {
  tool: DrawingTool;
  color: string;
  width: number;
  onToolChange: (tool: DrawingTool) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

export function DrawingToolbar({
  tool,
  color,
  width,
  onToolChange,
  onColorChange,
  onWidthChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: Props) {
  const colors = useColors();
  const [popover, setPopover] = useState<"color" | "size" | null>(null);

  const closePopover = () => setPopover(null);

  const pickersDisabled = tool === "eraser" || tool === "lasso";

  const TOOL_BTNS: { tool: DrawingTool; icon: React.ReactNode }[] = [
    {
      tool: "pen",
      icon: <Feather name="edit-2" size={18} color={iconColor(tool, "pen", colors)} />,
    },
    {
      tool: "highlighter",
      icon: (
        <Feather
          name="feather"
          size={18}
          color={iconColor(tool, "highlighter", colors)}
        />
      ),
    },
    {
      tool: "eraser",
      icon: (
        <Feather name="x-circle" size={18} color={iconColor(tool, "eraser", colors)} />
      ),
    },
    {
      tool: "lasso",
      icon: (
        <Feather name="crop" size={18} color={iconColor(tool, "lasso", colors)} />
      ),
    },
  ];

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
      ]}
    >
      {popover === "color" ? (
        <Popover
          onClose={closePopover}
          background={colors.background}
          border={colors.border}
        >
          <View style={styles.swatchRow}>
            {PEN_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => {
                  onColorChange(c);
                  closePopover();
                }}
                style={({ pressed }) => [
                  styles.swatch,
                  {
                    backgroundColor: c,
                    borderColor:
                      c.toLowerCase() === color.toLowerCase()
                        ? colors.primary
                        : colors.border,
                    borderWidth:
                      c.toLowerCase() === color.toLowerCase() ? 2 : 1,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                accessibilityLabel={`Color ${c}`}
              />
            ))}
          </View>
        </Popover>
      ) : null}

      {popover === "size" ? (
        <Popover
          onClose={closePopover}
          background={colors.background}
          border={colors.border}
        >
          <View style={styles.sizeRow}>
            {sizesForTool(tool).map((s) => (
              <Pressable
                key={s}
                onPress={() => {
                  onWidthChange(s);
                  closePopover();
                }}
                style={({ pressed }) => [
                  styles.sizeCell,
                  {
                    borderColor: s === width ? colors.primary : "transparent",
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                accessibilityLabel={`Size ${s}`}
              >
                <View
                  style={{
                    width: Math.min(s, 22),
                    height: Math.min(s, 22),
                    borderRadius: Math.min(s, 22) / 2,
                    backgroundColor:
                      tool === "eraser" ? colors.foreground : color,
                    opacity: tool === "highlighter" ? 0.45 : 1,
                  }}
                />
              </Pressable>
            ))}
          </View>
        </Popover>
      ) : null}

      <View style={styles.row}>
        <View style={styles.group}>
          {TOOL_BTNS.map((b) => (
            <Pressable
              key={b.tool}
              onPress={() => {
                onToolChange(b.tool);
                closePopover();
              }}
              style={({ pressed }) => [
                styles.toolBtn,
                {
                  backgroundColor:
                    tool === b.tool ? colors.secondary : "transparent",
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              accessibilityLabel={`Tool ${b.tool}`}
            >
              {b.icon}
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() => {
            if (pickersDisabled) return;
            setPopover((p) => (p === "color" ? null : "color"));
          }}
          disabled={pickersDisabled}
          style={({ pressed }) => [
            styles.toolBtn,
            { opacity: pickersDisabled ? 0.4 : pressed ? 0.7 : 1 },
          ]}
          accessibilityLabel="Color picker"
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
        </Pressable>

        <Pressable
          onPress={() => {
            if (pickersDisabled) return;
            setPopover((p) => (p === "size" ? null : "size"));
          }}
          disabled={pickersDisabled}
          style={({ pressed }) => [
            styles.toolBtn,
            { opacity: pickersDisabled ? 0.4 : pressed ? 0.7 : 1 },
          ]}
          accessibilityLabel="Stroke size"
        >
          <View
            style={{
              width: Math.min(width, 18),
              height: Math.min(width, 18),
              borderRadius: Math.min(width, 18) / 2,
              backgroundColor:
                tool === "eraser" ? colors.foreground : color,
              opacity: tool === "highlighter" ? 0.45 : 1,
            }}
          />
        </Pressable>

        <View style={styles.spacer} />

        <Pressable
          onPress={onUndo}
          disabled={!canUndo}
          style={({ pressed }) => [
            styles.toolBtn,
            { opacity: !canUndo ? 0.35 : pressed ? 0.7 : 1 },
          ]}
          accessibilityLabel="Undo"
        >
          <Feather name="rotate-ccw" size={18} color={colors.foreground} />
        </Pressable>

        <Pressable
          onPress={onRedo}
          disabled={!canRedo}
          style={({ pressed }) => [
            styles.toolBtn,
            { opacity: !canRedo ? 0.35 : pressed ? 0.7 : 1 },
          ]}
          accessibilityLabel="Redo"
        >
          <Feather name="rotate-cw" size={18} color={colors.foreground} />
        </Pressable>

      </View>
    </View>
  );
}

function iconColor(
  active: DrawingTool,
  tool: DrawingTool,
  colors: ReturnType<typeof useColors>,
): string {
  return active === tool ? colors.primary : colors.foreground;
}

function Popover({
  children,
  onClose,
  background,
  border,
}: {
  children: React.ReactNode;
  onClose: () => void;
  background: string;
  border: string;
}) {
  return (
    <>
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={onClose}
        accessibilityLabel="Dismiss popover"
      />
      <View
        style={[
          styles.popover,
          {
            backgroundColor: background,
            borderColor: border,
          },
        ]}
      >
        {children}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 48,
    borderTopWidth: 1,
    paddingHorizontal: 6,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  group: {
    flexDirection: "row",
    gap: 2,
    marginRight: 4,
  },
  toolBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  spacer: { flex: 1 },
  colorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
  },
  popover: {
    position: "absolute",
    bottom: 56,
    left: 12,
    right: 12,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 6 },
    }),
  },
  swatchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  sizeRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  sizeCell: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
