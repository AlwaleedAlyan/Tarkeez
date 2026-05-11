import {
  Canvas,
  Fill,
  Path,
  Skia,
  type SkPath,
} from "@shopify/react-native-skia";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import type { Stroke } from "@/contexts/LibraryContext";

const ERASER_RADIUS = 14;
const HISTORY_LIMIT = 50;

export type DrawingTool = "pen" | "highlighter" | "eraser";

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
  addPage: () => void;
};

function skPathFromStroke(s: Stroke): SkPath {
  const p = Skia.Path.Make();
  if (s.points.length === 0) return p;
  p.moveTo(s.points[0].x, s.points[0].y);
  if (s.points.length === 1) {
    p.lineTo(s.points[0].x + 0.01, s.points[0].y);
    return p;
  }
  for (let i = 1; i < s.points.length; i++) {
    p.lineTo(s.points[i].x, s.points[i].y);
  }
  return p;
}

function strokeBox(s: Stroke) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of s.points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function strokeNearPoint(s: Stroke, x: number, y: number, r: number): boolean {
  const box = strokeBox(s);
  if (x < box.minX - r || x > box.maxX + r) return false;
  if (y < box.minY - r || y > box.maxY + r) return false;
  const r2 = r * r;
  for (const p of s.points) {
    const dx = p.x - x;
    const dy = p.y - y;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
}

function maxStrokeY(strokes: Stroke[]): number {
  let m = 0;
  for (const s of strokes) {
    for (const p of s.points) {
      if (p.y > m) m = p.y;
    }
  }
  return m;
}

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, Props>(
  function DrawingCanvas(
    {
      strokes,
      onStrokesChange,
      tool,
      color,
      width,
      background,
      viewportWidth,
      viewportHeight,
    },
    ref,
  ) {
    const [pages, setPages] = useState(1);
    const [scrollY, setScrollY] = useState(0);
    const [inProgress, setInProgress] = useState<Stroke | null>(null);

    useEffect(() => {
      if (viewportHeight <= 0) return;
      const need = Math.max(1, Math.ceil(maxStrokeY(strokes) / viewportHeight));
      if (need > pages) setPages(need);
    }, [strokes, viewportHeight, pages]);

    const inProgressRef = useRef<Stroke | null>(null);
    const scrollYRef = useRef(0);
    scrollYRef.current = scrollY;

    const scrollBaseRef = useRef(0);

    const historyRef = useRef<Stroke[][]>([]);
    const futureRef = useRef<Stroke[][]>([]);

    const canvasHeight = pages * Math.max(viewportHeight, 1);
    const minScrollY = Math.min(0, viewportHeight - canvasHeight);

    const clampScrollY = useCallback(
      (y: number) => {
        if (y > 0) return 0;
        if (y < minScrollY) return minScrollY;
        return y;
      },
      [minScrollY],
    );

    const commit = useCallback(
      (next: Stroke[]) => {
        historyRef.current.push(strokes);
        if (historyRef.current.length > HISTORY_LIMIT) {
          historyRef.current.shift();
        }
        futureRef.current = [];
        onStrokesChange(next);
      },
      [strokes, onStrokesChange],
    );

    useImperativeHandle(
      ref,
      () => ({
        undo: () => {
          const prev = historyRef.current.pop();
          if (!prev) return;
          futureRef.current.push(strokes);
          onStrokesChange(prev);
        },
        redo: () => {
          const next = futureRef.current.pop();
          if (!next) return;
          historyRef.current.push(strokes);
          onStrokesChange(next);
        },
        canUndo: () => historyRef.current.length > 0,
        canRedo: () => futureRef.current.length > 0,
        addPage: () => {
          setPages((p) => p + 1);
          if (viewportHeight > 0) {
            setScrollY((y) => {
              const newCanvasH = (pages + 1) * viewportHeight;
              const minY = Math.min(0, viewportHeight - newCanvasH);
              const target = -(newCanvasH - viewportHeight);
              return Math.max(minY, target);
            });
          }
        },
      }),
      [strokes, onStrokesChange, pages, viewportHeight],
    );

    const drawGesture = useMemo(
      () =>
        Gesture.Pan()
          .runOnJS(true)
          .minPointers(1)
          .maxPointers(1)
          .averageTouches(true)
          .onBegin((e) => {
            const cx = e.x;
            const cy = e.y - scrollYRef.current;
            if (tool === "eraser") {
              const next = strokes.filter(
                (s) => !strokeNearPoint(s, cx, cy, ERASER_RADIUS),
              );
              if (next.length !== strokes.length) commit(next);
              return;
            }
            const fresh: Stroke = {
              color,
              width,
              kind: tool === "highlighter" ? "highlighter" : "pen",
              points: [{ x: cx, y: cy }],
            };
            inProgressRef.current = fresh;
            setInProgress(fresh);
          })
          .onUpdate((e) => {
            const cx = e.x;
            const cy = e.y - scrollYRef.current;
            if (tool === "eraser") {
              const next = strokes.filter(
                (s) => !strokeNearPoint(s, cx, cy, ERASER_RADIUS),
              );
              if (next.length !== strokes.length) commit(next);
              return;
            }
            const cur = inProgressRef.current;
            if (!cur) return;
            const last = cur.points[cur.points.length - 1];
            if (last && last.x === cx && last.y === cy) return;
            const next: Stroke = {
              ...cur,
              points: [...cur.points, { x: cx, y: cy }],
            };
            inProgressRef.current = next;
            setInProgress(next);
          })
          .onEnd(() => {
            const cur = inProgressRef.current;
            inProgressRef.current = null;
            setInProgress(null);
            if (cur && cur.points.length > 0) {
              commit([...strokes, cur]);
            }
          })
          .onFinalize(() => {
            inProgressRef.current = null;
            setInProgress(null);
          }),
      [strokes, tool, color, width, commit],
    );

    const scrollGesture = useMemo(
      () =>
        Gesture.Pan()
          .runOnJS(true)
          .minPointers(2)
          .maxPointers(2)
          .onBegin(() => {
            scrollBaseRef.current = scrollYRef.current;
          })
          .onUpdate((e) => {
            const next = clampScrollY(scrollBaseRef.current + e.translationY);
            setScrollY(next);
          }),
      [clampScrollY],
    );

    const composed = useMemo(
      () => Gesture.Race(drawGesture, scrollGesture),
      [drawGesture, scrollGesture],
    );

    const committedPaths = useMemo(
      () => strokes.map((s) => ({ s, path: skPathFromStroke(s) })),
      [strokes],
    );

    const inProgressPath = useMemo(
      () => (inProgress ? skPathFromStroke(inProgress) : null),
      [inProgress],
    );

    return (
      <View style={[styles.container, { backgroundColor: background }]}>
        <GestureDetector gesture={composed}>
          <View style={styles.flex} collapsable={false}>
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: viewportWidth,
                height: canvasHeight,
                transform: [{ translateY: scrollY }],
              }}
            >
              <Canvas style={{ width: viewportWidth, height: canvasHeight }}>
                <Fill color={background} />
                {committedPaths.map(({ s, path }, i) => (
                  <Path
                    key={i}
                    path={path}
                    color={s.color}
                    style="stroke"
                    strokeWidth={s.width}
                    strokeCap="round"
                    strokeJoin="round"
                    opacity={s.kind === "highlighter" ? 0.32 : 1}
                  />
                ))}
                {inProgressPath && inProgress ? (
                  <Path
                    path={inProgressPath}
                    color={inProgress.color}
                    style="stroke"
                    strokeWidth={inProgress.width}
                    strokeCap="round"
                    strokeJoin="round"
                    opacity={inProgress.kind === "highlighter" ? 0.32 : 1}
                  />
                ) : null}
              </Canvas>
            </View>
          </View>
        </GestureDetector>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  flex: { flex: 1, overflow: "hidden" },
});
