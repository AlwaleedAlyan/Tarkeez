import { Feather } from "@expo/vector-icons";
import {
  Canvas,
  Circle,
  Fill,
  Group,
  Path,
  Rect,
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
import { Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { useColors } from "@/hooks/useColors";
import type { Stroke } from "@/contexts/LibraryContext";
import {
  createMomentumScroller,
  type MomentumScroller,
} from "@/lib/momentumScroll";
import {
  applyToStroke,
  bboxOfStrokes,
  compose,
  strokeInLasso,
  type BBox,
  type Point,
} from "@/lib/strokeTransform";

const ERASER_RADIUS = 14;
const HISTORY_LIMIT = 50;
const GROW_THRESHOLD = 120;
const LASSO_COLOR = "#3D7AE5";
const HANDLE_RADIUS = 6;

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

type LiveTransform = {
  tx: number;
  ty: number;
  scale: number;
  rotation: number;
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

function skPathFromPolygon(points: Point[], close: boolean): SkPath {
  const p = Skia.Path.Make();
  if (points.length === 0) return p;
  p.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    p.lineTo(points[i].x, points[i].y);
  }
  if (close) p.close();
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
    const colors = useColors();

    const [contentHeight, setContentHeight] = useState(
      Math.max(viewportHeight, 1),
    );
    const [scrollY, setScrollY] = useState(0);
    const [inProgress, setInProgress] = useState<Stroke | null>(null);

    const [lassoPath, setLassoPath] = useState<Point[] | null>(null);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
      () => new Set(),
    );
    const [liveTransform, setLiveTransform] = useState<LiveTransform | null>(
      null,
    );

    const inProgressRef = useRef<Stroke | null>(null);
    const scrollYRef = useRef(0);
    scrollYRef.current = scrollY;
    const scrollBaseRef = useRef(0);

    const lassoPathRef = useRef<Point[] | null>(null);
    lassoPathRef.current = lassoPath;

    const selectedIndicesRef = useRef<Set<number>>(selectedIndices);
    selectedIndicesRef.current = selectedIndices;

    const liveTransformRef = useRef<LiveTransform | null>(null);
    liveTransformRef.current = liveTransform;

    const pivotRef = useRef<Point>({ x: 0, y: 0 });
    const activeTransformsRef = useRef(0);

    const historyRef = useRef<Stroke[][]>([]);
    const futureRef = useRef<Stroke[][]>([]);

    // --- Vertical Continuous: auto-grow content height ---
    useEffect(() => {
      if (viewportHeight <= 0) return;
      const needed = maxStrokeY(strokes) + viewportHeight;
      setContentHeight((c) => (c < needed ? needed : c));
    }, [strokes, viewportHeight]);

    useEffect(() => {
      if (viewportHeight <= 0) return;
      setContentHeight((c) => Math.max(c, viewportHeight));
    }, [viewportHeight]);

    const ensureRoom = useCallback(
      (targetY: number) => {
        if (viewportHeight <= 0) return;
        setContentHeight((c) =>
          targetY > c - GROW_THRESHOLD ? targetY + viewportHeight : c,
        );
      },
      [viewportHeight],
    );

    const minScrollY = Math.min(0, viewportHeight - contentHeight);

    const clampScrollY = useCallback(
      (y: number) => {
        if (y > 0) return 0;
        if (y < minScrollY) return minScrollY;
        return y;
      },
      [minScrollY],
    );

    const contentHeightRef = useRef(contentHeight);
    contentHeightRef.current = contentHeight;

    const momentumRef = useRef<MomentumScroller | null>(null);
    if (!momentumRef.current) {
      momentumRef.current = createMomentumScroller((dy) => {
        const cur = scrollYRef.current;
        const minY = Math.min(0, viewportHeight - contentHeightRef.current);
        let next = cur + dy;
        if (next > 0) next = 0;
        else if (next < minY) next = minY;
        if (next === cur) return;
        setScrollY(next);
        const bottomVisible = viewportHeight - next;
        if (bottomVisible > contentHeightRef.current - GROW_THRESHOLD) {
          if (viewportHeight > 0) {
            const grown = bottomVisible + viewportHeight;
            setContentHeight((c) => (c < grown ? grown : c));
          }
        }
      });
    }

    useEffect(() => {
      return () => {
        momentumRef.current?.stop();
      };
    }, []);

    // --- Selection bookkeeping ---
    const selectedStrokes = useMemo(
      () => strokes.filter((_, i) => selectedIndices.has(i)),
      [strokes, selectedIndices],
    );

    const selectionBBox = useMemo<BBox | null>(
      () => bboxOfStrokes(selectedStrokes),
      [selectedStrokes],
    );

    const selectionBBoxRef = useRef<BBox | null>(selectionBBox);
    selectionBBoxRef.current = selectionBBox;

    // Clear selection when switching away from lasso.
    useEffect(() => {
      if (tool !== "lasso") {
        setSelectedIndices((prev) => (prev.size === 0 ? prev : new Set()));
        setLassoPath(null);
        setLiveTransform(null);
        activeTransformsRef.current = 0;
      }
    }, [tool]);

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
          setSelectedIndices(new Set());
        },
        redo: () => {
          const next = futureRef.current.pop();
          if (!next) return;
          historyRef.current.push(strokes);
          onStrokesChange(next);
          setSelectedIndices(new Set());
        },
        canUndo: () => historyRef.current.length > 0,
        canRedo: () => futureRef.current.length > 0,
        clearSelection: () => {
          setSelectedIndices(new Set());
          setLassoPath(null);
          setLiveTransform(null);
        },
      }),
      [strokes, onStrokesChange],
    );

    // --- Draw gesture (pen / highlighter / eraser) ---
    const drawGesture = useMemo(
      () =>
        Gesture.Pan()
          .runOnJS(true)
          .minPointers(1)
          .maxPointers(1)
          .averageTouches(true)
          .onBegin((e) => {
            momentumRef.current?.stop();
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
            ensureRoom(cy);
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
            ensureRoom(cy);
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
      [strokes, tool, color, width, commit, ensureRoom],
    );

    // --- Lasso draw gesture (build the lasso polygon) ---
    const lassoDrawGesture = useMemo(
      () =>
        Gesture.Pan()
          .runOnJS(true)
          .minPointers(1)
          .maxPointers(1)
          .averageTouches(true)
          .onBegin((e) => {
            momentumRef.current?.stop();
            const p = { x: e.x, y: e.y - scrollYRef.current };
            lassoPathRef.current = [p];
            setLassoPath([p]);
          })
          .onUpdate((e) => {
            const cur = lassoPathRef.current;
            if (!cur) return;
            const p = { x: e.x, y: e.y - scrollYRef.current };
            const last = cur[cur.length - 1];
            if (last && Math.abs(last.x - p.x) < 1 && Math.abs(last.y - p.y) < 1) {
              return;
            }
            const next = [...cur, p];
            lassoPathRef.current = next;
            setLassoPath(next);
          })
          .onEnd(() => {
            const poly = lassoPathRef.current ?? [];
            lassoPathRef.current = null;
            setLassoPath(null);
            if (poly.length < 3) {
              setSelectedIndices(new Set());
              return;
            }
            const next = new Set<number>();
            strokes.forEach((s, i) => {
              if (strokeInLasso(s, poly)) next.add(i);
            });
            setSelectedIndices(next);
          })
          .onFinalize(() => {
            lassoPathRef.current = null;
            setLassoPath(null);
          }),
      [strokes],
    );

    // --- Transform gestures (pan / pinch / rotate the selection) ---
    const startTransform = useCallback(() => {
      momentumRef.current?.stop();
      if (activeTransformsRef.current === 0) {
        const bbox = selectionBBoxRef.current;
        if (!bbox) return;
        pivotRef.current = {
          x: (bbox.minX + bbox.maxX) / 2,
          y: (bbox.minY + bbox.maxY) / 2,
        };
        setLiveTransform({ tx: 0, ty: 0, scale: 1, rotation: 0 });
      }
      activeTransformsRef.current += 1;
    }, []);

    const endTransform = useCallback(() => {
      activeTransformsRef.current = Math.max(
        0,
        activeTransformsRef.current - 1,
      );
      if (activeTransformsRef.current !== 0) return;
      const lt = liveTransformRef.current;
      if (!lt) return;
      const sel = selectedIndicesRef.current;
      const pivot = pivotRef.current;
      const m = compose(lt.tx, lt.ty, lt.scale, lt.rotation, pivot.x, pivot.y);
      const next = strokes.map((s, i) =>
        sel.has(i) ? applyToStroke(m, s) : s,
      );
      setLiveTransform(null);
      commit(next);
    }, [strokes, commit]);

    const transformPan = useMemo(
      () =>
        Gesture.Pan()
          .runOnJS(true)
          .onBegin(startTransform)
          .onUpdate((e) => {
            setLiveTransform((lt) =>
              lt ? { ...lt, tx: e.translationX, ty: e.translationY } : lt,
            );
          })
          .onEnd(endTransform)
          .onFinalize(() => {
            // onEnd already handles the normal exit; only safeguard if state desyncs.
          }),
      [startTransform, endTransform],
    );

    const transformPinch = useMemo(
      () =>
        Gesture.Pinch()
          .runOnJS(true)
          .onBegin(startTransform)
          .onUpdate((e) => {
            setLiveTransform((lt) => (lt ? { ...lt, scale: e.scale } : lt));
          })
          .onEnd(endTransform),
      [startTransform, endTransform],
    );

    const transformRotation = useMemo(
      () =>
        Gesture.Rotation()
          .runOnJS(true)
          .onBegin(startTransform)
          .onUpdate((e) => {
            setLiveTransform((lt) =>
              lt ? { ...lt, rotation: e.rotation } : lt,
            );
          })
          .onEnd(endTransform),
      [startTransform, endTransform],
    );

    const tapToDeselect = useMemo(
      () =>
        Gesture.Tap()
          .runOnJS(true)
          .onEnd((e) => {
            const bbox = selectionBBoxRef.current;
            if (!bbox) return;
            const p = { x: e.x, y: e.y - scrollYRef.current };
            const inside =
              p.x >= bbox.minX &&
              p.x <= bbox.maxX &&
              p.y >= bbox.minY &&
              p.y <= bbox.maxY;
            if (!inside) {
              setSelectedIndices(new Set());
            }
          }),
      [],
    );

    // --- Scroll gesture (2-finger) ---
    const scrollGesture = useMemo(
      () =>
        Gesture.Pan()
          .runOnJS(true)
          .minPointers(2)
          .maxPointers(2)
          .onBegin(() => {
            momentumRef.current?.stop();
            scrollBaseRef.current = scrollYRef.current;
          })
          .onUpdate((e) => {
            const next = clampScrollY(scrollBaseRef.current + e.translationY);
            setScrollY(next);
            // Grow if scrolled near bottom.
            const bottomVisible = viewportHeight - next;
            if (bottomVisible > contentHeight - GROW_THRESHOLD) {
              ensureRoom(bottomVisible);
            }
          })
          .onEnd((e) => {
            const v = e.velocityY ?? 0;
            if (Math.abs(v) > 80) momentumRef.current?.start(v);
          }),
      [clampScrollY, contentHeight, ensureRoom, viewportHeight],
    );

    // --- Composed gesture (depends on mode) ---
    const hasSelection = selectedIndices.size > 0;
    const composed = useMemo(() => {
      if (tool !== "lasso") {
        return Gesture.Race(drawGesture, scrollGesture);
      }
      if (!hasSelection) {
        // Scroll first so 2-finger scroll still works even in lasso mode.
        return Gesture.Race(scrollGesture, lassoDrawGesture);
      }
      return Gesture.Race(
        Gesture.Simultaneous(transformPan, transformPinch, transformRotation),
        tapToDeselect,
      );
    }, [
      tool,
      hasSelection,
      drawGesture,
      scrollGesture,
      lassoDrawGesture,
      transformPan,
      transformPinch,
      transformRotation,
      tapToDeselect,
    ]);

    // --- Render helpers ---
    const pathBundles = useMemo(
      () => strokes.map((s) => ({ s, path: skPathFromStroke(s) })),
      [strokes],
    );

    const inProgressPath = useMemo(
      () => (inProgress ? skPathFromStroke(inProgress) : null),
      [inProgress],
    );

    const lassoSkPath = useMemo(
      () => (lassoPath && lassoPath.length > 1 ? skPathFromPolygon(lassoPath, false) : null),
      [lassoPath],
    );

    const liveTransformProps = useMemo(() => {
      if (!liveTransform) return undefined;
      const { tx, ty, scale, rotation } = liveTransform;
      const px = pivotRef.current.x;
      const py = pivotRef.current.y;
      return [
        { translateX: tx },
        { translateY: ty },
        { translateX: px },
        { translateY: py },
        { rotate: rotation },
        { scale },
        { translateX: -px },
        { translateY: -py },
      ];
    }, [liveTransform]);

    // Action bar position (viewport coords). Hide while user is actively transforming.
    const actionBar = (() => {
      if (!hasSelection || !selectionBBox || liveTransform) return null;
      const barWidth = 56;
      const barHeight = 36;
      const desiredTop = selectionBBox.minY + scrollY - barHeight - 10;
      const top = Math.max(8, desiredTop);
      const centerX = (selectionBBox.minX + selectionBBox.maxX) / 2;
      const left = Math.max(
        8,
        Math.min(viewportWidth - barWidth - 8, centerX - barWidth / 2),
      );
      return { top, left, barWidth, barHeight };
    })();

    const onDeleteSelection = useCallback(() => {
      const sel = selectedIndicesRef.current;
      if (sel.size === 0) return;
      const next = strokes.filter((_, i) => !sel.has(i));
      setSelectedIndices(new Set());
      setLassoPath(null);
      setLiveTransform(null);
      commit(next);
    }, [strokes, commit]);

    const corners: Point[] = selectionBBox
      ? [
          { x: selectionBBox.minX, y: selectionBBox.minY },
          { x: selectionBBox.maxX, y: selectionBBox.minY },
          { x: selectionBBox.maxX, y: selectionBBox.maxY },
          { x: selectionBBox.minX, y: selectionBBox.maxY },
        ]
      : [];

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
                height: contentHeight,
                transform: [{ translateY: scrollY }],
              }}
            >
              <Canvas style={{ width: viewportWidth, height: contentHeight }}>
                <Fill color={background} />
                {/* Unselected strokes */}
                {pathBundles.map(({ s, path }, i) =>
                  selectedIndices.has(i) ? null : (
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
                  ),
                )}
                {/* Selected strokes (wrapped in live transform) */}
                {selectedIndices.size > 0 ? (
                  <Group transform={liveTransformProps}>
                    {pathBundles.map(({ s, path }, i) =>
                      selectedIndices.has(i) ? (
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
                      ) : null,
                    )}
                    {selectionBBox ? (
                      <>
                        <Rect
                          x={selectionBBox.minX}
                          y={selectionBBox.minY}
                          width={selectionBBox.maxX - selectionBBox.minX}
                          height={selectionBBox.maxY - selectionBBox.minY}
                          color={LASSO_COLOR}
                          style="stroke"
                          strokeWidth={1.5}
                          opacity={0.7}
                        />
                        {corners.map((c, i) => (
                          <Circle
                            key={i}
                            cx={c.x}
                            cy={c.y}
                            r={HANDLE_RADIUS}
                            color={LASSO_COLOR}
                          />
                        ))}
                      </>
                    ) : null}
                  </Group>
                ) : null}
                {/* In-progress stroke (pen / highlighter) */}
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
                {/* Lasso polygon (in-progress) */}
                {lassoSkPath ? (
                  <Path
                    path={lassoSkPath}
                    color={LASSO_COLOR}
                    style="stroke"
                    strokeWidth={1.5}
                    opacity={0.9}
                  />
                ) : null}
              </Canvas>
            </View>
          </View>
        </GestureDetector>

        {actionBar ? (
          <View
            pointerEvents="box-none"
            style={StyleSheet.absoluteFill}
          >
            <Pressable
              onPress={onDeleteSelection}
              style={({ pressed }) => [
                styles.actionBar,
                {
                  top: actionBar.top,
                  left: actionBar.left,
                  width: actionBar.barWidth,
                  height: actionBar.barHeight,
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              accessibilityLabel="Delete selection"
            >
              <Feather name="trash-2" size={18} color={colors.destructive} />
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  flex: { flex: 1, overflow: "hidden" },
  actionBar: {
    position: "absolute",
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
