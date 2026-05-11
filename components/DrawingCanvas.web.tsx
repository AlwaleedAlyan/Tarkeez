import React, { forwardRef, useImperativeHandle } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

import type { Stroke } from "@/contexts/LibraryContext";

export type DrawingTool = "pen" | "highlighter" | "eraser" | "lasso";

type Props = {
  strokes: Stroke[];
  onStrokesChange: (next: Stroke[]) => void;
  tool: DrawingTool;
  color: string;
  width: number;
  background: string;
  viewportWidth: number;
  viewportHeight: number;
};

export type DrawingCanvasHandle = {
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearSelection: () => void;
};

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, Props>(
  function DrawingCanvasWeb({ background }, ref) {
    const colors = useColors();

    useImperativeHandle(
      ref,
      () => ({
        undo: () => {},
        redo: () => {},
        canUndo: () => false,
        canRedo: () => false,
        clearSelection: () => {},
      }),
      [],
    );

    return (
      <View style={[styles.container, { backgroundColor: background }]}>
        <View style={styles.center}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Drawing isn’t available in the desktop preview yet.
          </Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            Open this note on the iOS or Android dev build to draw.
          </Text>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  center: { maxWidth: 360, paddingHorizontal: 24, alignItems: "center" },
  title: { fontSize: 16, fontWeight: "600", textAlign: "center" },
  body: { fontSize: 14, textAlign: "center", marginTop: 8 },
});
