import { Feather } from "@expo/vector-icons";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import type { Stroke } from "@/contexts/LibraryContext";
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
const TAP_MOVE_THRESHOLD = 4;

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

type PointerState = {
  id: number;
  x: number;
  y: number;
};

type GestureKind =
  | "none"
  | "draw"
  | "erase"
  | "lasso-draw"
  | "transform"
  | "scroll";

type GestureState = {
  kind: GestureKind;
  startX: number;
  startY: number;
  scrollBase: number;
  centroidStart: Point;
  distStart: number;
  angleStart: number;
  movedFar: boolean;
};

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

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  if (s.points.length === 0) return;
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = s.kind === "highlighter" ? 0.32 : 1;
  ctx.beginPath();
  ctx.moveTo(s.points[0].x, s.points[0].y);
  if (s.points.length === 1) {
    ctx.lineTo(s.points[0].x + 0.01, s.points[0].y);
  } else {
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i].x, s.points[i].y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, Props>(
  function DrawingCanvasWeb(
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

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const hostRef = useRef<HTMLDivElement | null>(null);

    const [contentHeight, setContentHeight] = useState(
      Math.max(viewportHeight, 1),
    );
    const [scrollY, setScrollY] = useState(0);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
      () => new Set(),
    );
    const [isTransforming, setIsTransforming] = useState(false);

    const contentHeightRef = useRef(contentHeight);
    contentHeightRef.current = contentHeight;
    const scrollYRef = useRef(scrollY);
    scrollYRef.current = scrollY;
    const selectedIndicesRef = useRef(selectedIndices);
    selectedIndicesRef.current = selectedIndices;
    const strokesRef = useRef(strokes);
    strokesRef.current = strokes;
    const toolRef = useRef(tool);
    toolRef.current = tool;
    const colorRef = useRef(color);
    colorRef.current = color;
    const widthRef = useRef(width);
    widthRef.current = width;

    const inProgressRef = useRef<Stroke | null>(null);
    const lassoPathRef = useRef<Point[] | null>(null);
    const liveTransformRef = useRef<LiveTransform | null>(null);
    const pivotRef = useRef<Point>({ x: 0, y: 0 });
    const gestureRef = useRef<GestureState>({
      kind: "none",
      startX: 0,
      startY: 0,
      scrollBase: 0,
      centroidStart: { x: 0, y: 0 },
      distStart: 1,
      angleStart: 0,
      movedFar: false,
    });
    const pointersRef = useRef<Map<number, PointerState>>(new Map());

    const historyRef = useRef<Stroke[][]>([]);
    const futureRef = useRef<Stroke[][]>([]);

    const dprRef = useRef(1);
    const redrawScheduledRef = useRef(false);
    const redrawFnRef = useRef<() => void>(() => {});

    // --- Selection bbox derived from current strokes + selection ---
    const selectionBBox: BBox | null = (() => {
      if (selectedIndices.size === 0) return null;
      const sel: Stroke[] = [];
      strokes.forEach((s, i) => {
        if (selectedIndices.has(i)) sel.push(s);
      });
      return bboxOfStrokes(sel);
    })();
    const selectionBBoxRef = useRef<BBox | null>(selectionBBox);
    selectionBBoxRef.current = selectionBBox;

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
        const cur = contentHeightRef.current;
        if (targetY > cur - GROW_THRESHOLD) {
          const next = targetY + viewportHeight;
          contentHeightRef.current = next;
          setContentHeight(next);
        }
      },
      [viewportHeight],
    );

    // Clear selection on tool change.
    useEffect(() => {
      if (tool !== "lasso") {
        if (selectedIndicesRef.current.size > 0) {
          setSelectedIndices(new Set());
        }
        lassoPathRef.current = null;
        liveTransformRef.current = null;
        setIsTransforming(false);
      }
    }, [tool]);

    const commit = useCallback(
      (next: Stroke[]) => {
        historyRef.current.push(strokesRef.current);
        if (historyRef.current.length > HISTORY_LIMIT) {
          historyRef.current.shift();
        }
        futureRef.current = [];
        onStrokesChange(next);
      },
      [onStrokesChange],
    );

    useImperativeHandle(
      ref,
      () => ({
        undo: () => {
          const prev = historyRef.current.pop();
          if (!prev) return;
          futureRef.current.push(strokesRef.current);
          onStrokesChange(prev);
          setSelectedIndices(new Set());
        },
        redo: () => {
          const next = futureRef.current.pop();
          if (!next) return;
          historyRef.current.push(strokesRef.current);
          onStrokesChange(next);
          setSelectedIndices(new Set());
        },
        canUndo: () => historyRef.current.length > 0,
        canRedo: () => futureRef.current.length > 0,
        clearSelection: () => {
          setSelectedIndices(new Set());
          lassoPathRef.current = null;
          liveTransformRef.current = null;
          setIsTransforming(false);
        },
      }),
      [onStrokesChange],
    );

    const clampScrollY = useCallback(
      (y: number) => {
        const minScrollY = Math.min(
          0,
          viewportHeight - contentHeightRef.current,
        );
        if (y > 0) return 0;
        if (y < minScrollY) return minScrollY;
        return y;
      },
      [viewportHeight],
    );

    // --- rAF redraw loop ---
    const requestRedraw = useCallback(() => {
      if (redrawScheduledRef.current) return;
      redrawScheduledRef.current = true;
      requestAnimationFrame(() => {
        redrawScheduledRef.current = false;
        redrawFnRef.current();
      });
    }, []);

    // Always-fresh draw closure.
    redrawFnRef.current = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = dprRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewportWidth, viewportHeight);
      // background
      ctx.save();
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, viewportWidth, viewportHeight);
      ctx.restore();

      // Translate to content space.
      ctx.translate(0, scrollYRef.current);

      const sel = selectedIndicesRef.current;
      const strokesCur = strokesRef.current;
      // Pass 1: unselected strokes.
      for (let i = 0; i < strokesCur.length; i++) {
        if (sel.has(i)) continue;
        drawStroke(ctx, strokesCur[i]);
      }

      // Pass 2: selected strokes inside live-transform group.
      if (sel.size > 0) {
        ctx.save();
        const lt = liveTransformRef.current;
        const piv = pivotRef.current;
        if (lt) {
          // Match strokeTransform.compose: free * fromPivot * R * S * toPivot.
          ctx.translate(lt.tx, lt.ty);
          ctx.translate(piv.x, piv.y);
          ctx.rotate(lt.rotation);
          ctx.scale(lt.scale, lt.scale);
          ctx.translate(-piv.x, -piv.y);
        }
        for (let i = 0; i < strokesCur.length; i++) {
          if (!sel.has(i)) continue;
          drawStroke(ctx, strokesCur[i]);
        }
        const bbox = selectionBBoxRef.current;
        if (bbox) {
          ctx.save();
          ctx.strokeStyle = LASSO_COLOR;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 4]);
          ctx.globalAlpha = 0.85;
          ctx.strokeRect(
            bbox.minX,
            bbox.minY,
            bbox.maxX - bbox.minX,
            bbox.maxY - bbox.minY,
          );
          ctx.setLineDash([]);
          ctx.fillStyle = LASSO_COLOR;
          ctx.globalAlpha = 1;
          const corners: Point[] = [
            { x: bbox.minX, y: bbox.minY },
            { x: bbox.maxX, y: bbox.minY },
            { x: bbox.maxX, y: bbox.maxY },
            { x: bbox.minX, y: bbox.maxY },
          ];
          for (const c of corners) {
            ctx.beginPath();
            ctx.arc(c.x, c.y, HANDLE_RADIUS, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
        ctx.restore();
      }

      // In-progress stroke.
      const ip = inProgressRef.current;
      if (ip) drawStroke(ctx, ip);

      // Lasso polygon overlay.
      const lp = lassoPathRef.current;
      if (lp && lp.length > 1) {
        ctx.save();
        ctx.strokeStyle = LASSO_COLOR;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.85;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(lp[0].x, lp[0].y);
        for (let i = 1; i < lp.length; i++) ctx.lineTo(lp[i].x, lp[i].y);
        ctx.stroke();
        ctx.restore();
      }
    };

    // Sync canvas backing-store + CSS size when viewport changes.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || viewportWidth <= 0 || viewportHeight <= 0) return;
      const dpr = Math.min(
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
        2,
      );
      dprRef.current = dpr;
      canvas.width = Math.max(1, Math.round(viewportWidth * dpr));
      canvas.height = Math.max(1, Math.round(viewportHeight * dpr));
      canvas.style.width = `${viewportWidth}px`;
      canvas.style.height = `${viewportHeight}px`;
      requestRedraw();
    }, [viewportWidth, viewportHeight, requestRedraw]);

    // Redraw on prop / state changes.
    useEffect(() => {
      requestRedraw();
    }, [
      strokes,
      selectedIndices,
      scrollY,
      contentHeight,
      background,
      isTransforming,
      requestRedraw,
    ]);

    // --- Gesture helpers ---
    function getCanvasPoint(
      e: React.PointerEvent<HTMLCanvasElement>,
    ): { x: number; y: number } {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }

    function centroidOf(pts: PointerState[]): Point {
      let sx = 0;
      let sy = 0;
      for (const p of pts) {
        sx += p.x;
        sy += p.y;
      }
      return { x: sx / pts.length, y: sy / pts.length };
    }

    function activePointers(): PointerState[] {
      return Array.from(pointersRef.current.values());
    }

    function bakeTransform() {
      const lt = liveTransformRef.current;
      if (!lt) return;
      const piv = pivotRef.current;
      const sel = selectedIndicesRef.current;
      const m = compose(lt.tx, lt.ty, lt.scale, lt.rotation, piv.x, piv.y);
      const next = strokesRef.current.map((s, i) =>
        sel.has(i) ? applyToStroke(m, s) : s,
      );
      liveTransformRef.current = null;
      setIsTransforming(false);
      commit(next);
    }

    function startTransformGesture(viewportPt: Point) {
      const bbox = selectionBBoxRef.current;
      if (!bbox) return;
      pivotRef.current = {
        x: (bbox.minX + bbox.maxX) / 2,
        y: (bbox.minY + bbox.maxY) / 2,
      };
      liveTransformRef.current = { tx: 0, ty: 0, scale: 1, rotation: 0 };
      gestureRef.current = {
        kind: "transform",
        startX: viewportPt.x,
        startY: viewportPt.y,
        scrollBase: scrollYRef.current,
        centroidStart: viewportPt,
        distStart: 1,
        angleStart: 0,
        movedFar: false,
      };
      setIsTransforming(true);
    }

    function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const vp = getCanvasPoint(e);
      pointersRef.current.set(e.pointerId, {
        id: e.pointerId,
        x: vp.x,
        y: vp.y,
      });

      const total = pointersRef.current.size;
      const cx = vp.x;
      const cy = vp.y - scrollYRef.current;
      const t = toolRef.current;

      if (total === 2) {
        // Switch to two-pointer scroll (or two-pointer transform if selection).
        const pts = activePointers();
        const centroid = centroidOf(pts);
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const angle = Math.atan2(dy, dx);

        // If we were drawing or lassoing, drop the in-progress stroke.
        if (inProgressRef.current) {
          inProgressRef.current = null;
        }
        if (lassoPathRef.current) {
          lassoPathRef.current = null;
        }

        const hasSel = selectedIndicesRef.current.size > 0;
        if (t === "lasso" && hasSel) {
          // Two-pointer transform: lock pivot at bbox center.
          const bbox = selectionBBoxRef.current;
          if (bbox) {
            pivotRef.current = {
              x: (bbox.minX + bbox.maxX) / 2,
              y: (bbox.minY + bbox.maxY) / 2,
            };
          }
          liveTransformRef.current = {
            tx: 0,
            ty: 0,
            scale: 1,
            rotation: 0,
          };
          gestureRef.current = {
            kind: "transform",
            startX: centroid.x,
            startY: centroid.y,
            scrollBase: scrollYRef.current,
            centroidStart: centroid,
            distStart: dist,
            angleStart: angle,
            movedFar: false,
          };
          setIsTransforming(true);
        } else {
          gestureRef.current = {
            kind: "scroll",
            startX: centroid.x,
            startY: centroid.y,
            scrollBase: scrollYRef.current,
            centroidStart: centroid,
            distStart: dist,
            angleStart: angle,
            movedFar: false,
          };
        }
        requestRedraw();
        return;
      }

      // total === 1
      const sCount = strokesRef.current.length;
      gestureRef.current = {
        kind: "none",
        startX: vp.x,
        startY: vp.y,
        scrollBase: scrollYRef.current,
        centroidStart: vp,
        distStart: 1,
        angleStart: 0,
        movedFar: false,
      };

      if (t === "pen" || t === "highlighter") {
        const fresh: Stroke = {
          color: colorRef.current,
          width: widthRef.current,
          kind: t === "highlighter" ? "highlighter" : "pen",
          points: [{ x: cx, y: cy }],
        };
        inProgressRef.current = fresh;
        ensureRoom(cy);
        gestureRef.current.kind = "draw";
      } else if (t === "eraser") {
        const next = strokesRef.current.filter(
          (s) => !strokeNearPoint(s, cx, cy, ERASER_RADIUS),
        );
        if (next.length !== sCount) commit(next);
        gestureRef.current.kind = "erase";
      } else if (t === "lasso") {
        const hasSel = selectedIndicesRef.current.size > 0;
        if (!hasSel) {
          lassoPathRef.current = [{ x: cx, y: cy }];
          gestureRef.current.kind = "lasso-draw";
        } else {
          startTransformGesture(vp);
        }
      }
      requestRedraw();
    }

    function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!pointersRef.current.has(e.pointerId)) return;
      e.preventDefault();
      const vp = getCanvasPoint(e);
      pointersRef.current.set(e.pointerId, {
        id: e.pointerId,
        x: vp.x,
        y: vp.y,
      });

      const g = gestureRef.current;
      const dx = vp.x - g.startX;
      const dy = vp.y - g.startY;
      if (dx * dx + dy * dy > TAP_MOVE_THRESHOLD * TAP_MOVE_THRESHOLD) {
        g.movedFar = true;
      }

      const cx = vp.x;
      const cy = vp.y - scrollYRef.current;

      if (g.kind === "draw") {
        const cur = inProgressRef.current;
        if (!cur) return;
        const last = cur.points[cur.points.length - 1];
        if (last && Math.abs(last.x - cx) < 1 && Math.abs(last.y - cy) < 1) {
          return;
        }
        cur.points.push({ x: cx, y: cy });
        ensureRoom(cy);
        requestRedraw();
      } else if (g.kind === "erase") {
        const next = strokesRef.current.filter(
          (s) => !strokeNearPoint(s, cx, cy, ERASER_RADIUS),
        );
        if (next.length !== strokesRef.current.length) commit(next);
      } else if (g.kind === "lasso-draw") {
        const cur = lassoPathRef.current;
        if (!cur) return;
        const last = cur[cur.length - 1];
        if (last && Math.abs(last.x - cx) < 1 && Math.abs(last.y - cy) < 1) {
          return;
        }
        cur.push({ x: cx, y: cy });
        requestRedraw();
      } else if (g.kind === "transform") {
        const pts = activePointers();
        if (pts.length >= 2) {
          const c = centroidOf(pts);
          const p0 = pts[0];
          const p1 = pts[1];
          const dist = Math.max(1, Math.hypot(p0.x - p1.x, p0.y - p1.y));
          const angle = Math.atan2(p0.y - p1.y, p0.x - p1.x);
          liveTransformRef.current = {
            tx: c.x - g.centroidStart.x,
            ty: c.y - g.centroidStart.y,
            scale: dist / g.distStart,
            rotation: angle - g.angleStart,
          };
        } else {
          liveTransformRef.current = {
            tx: vp.x - g.startX,
            ty: vp.y - g.startY,
            scale: 1,
            rotation: 0,
          };
        }
        requestRedraw();
      } else if (g.kind === "scroll") {
        const pts = activePointers();
        if (pts.length >= 2) {
          const c = centroidOf(pts);
          const next = clampScrollY(
            g.scrollBase + (c.y - g.centroidStart.y),
          );
          scrollYRef.current = next;
          setScrollY(next);
          const bottomVisible = viewportHeight - next;
          if (bottomVisible > contentHeightRef.current - GROW_THRESHOLD) {
            ensureRoom(bottomVisible);
          }
          requestRedraw();
        }
      }
    }

    function endPointer(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!pointersRef.current.has(e.pointerId)) return;
      const vp = getCanvasPoint(e);
      pointersRef.current.delete(e.pointerId);
      try {
        canvasRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      const remaining = pointersRef.current.size;
      const g = gestureRef.current;

      if (remaining === 0) {
        if (g.kind === "draw") {
          const cur = inProgressRef.current;
          inProgressRef.current = null;
          if (cur && cur.points.length > 0) {
            commit([...strokesRef.current, cur]);
          }
        } else if (g.kind === "lasso-draw") {
          const poly = lassoPathRef.current ?? [];
          lassoPathRef.current = null;
          if (poly.length >= 3) {
            const next = new Set<number>();
            strokesRef.current.forEach((s, i) => {
              if (strokeInLasso(s, poly)) next.add(i);
            });
            setSelectedIndices(next);
          } else {
            // Tap-style click: deselect if outside current bbox.
            const bbox = selectionBBoxRef.current;
            if (
              !g.movedFar &&
              bbox &&
              !(
                vp.x >= bbox.minX &&
                vp.x <= bbox.maxX &&
                vp.y - g.scrollBase >= bbox.minY &&
                vp.y - g.scrollBase <= bbox.maxY
              )
            ) {
              setSelectedIndices(new Set());
            }
          }
        } else if (g.kind === "transform") {
          bakeTransform();
        }
        gestureRef.current = {
          kind: "none",
          startX: 0,
          startY: 0,
          scrollBase: 0,
          centroidStart: { x: 0, y: 0 },
          distStart: 1,
          angleStart: 0,
          movedFar: false,
        };
      } else if (remaining === 1 && g.kind === "transform") {
        // Bake the multi-pointer transform now, then start a fresh single-pointer translate.
        bakeTransform();
        const last = activePointers()[0];
        startTransformGesture({ x: last.x, y: last.y });
      } else if (remaining === 1 && g.kind === "scroll") {
        gestureRef.current = {
          kind: "none",
          startX: 0,
          startY: 0,
          scrollBase: 0,
          centroidStart: { x: 0, y: 0 },
          distStart: 1,
          angleStart: 0,
          movedFar: false,
        };
      }
      requestRedraw();
    }

    function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
      // Scroll vertically with the wheel; let pinch (ctrlKey) fall through to default.
      if (e.ctrlKey) return;
      e.preventDefault();
      const next = clampScrollY(scrollYRef.current - e.deltaY);
      scrollYRef.current = next;
      setScrollY(next);
      const bottomVisible = viewportHeight - next;
      if (bottomVisible > contentHeightRef.current - GROW_THRESHOLD) {
        ensureRoom(bottomVisible);
      }
      requestRedraw();
    }

    // --- Selection action bar position ---
    const actionBar = (() => {
      if (selectedIndices.size === 0 || !selectionBBox || isTransforming)
        return null;
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
      const next = strokesRef.current.filter((_, i) => !sel.has(i));
      setSelectedIndices(new Set());
      commit(next);
    }, [commit]);

    return (
      <View style={[styles.container, { backgroundColor: background }]}>
        <div
          ref={hostRef}
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            overflow: "hidden",
            touchAction: "none",
            userSelect: "none",
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onPointerLeave={endPointer}
            onWheel={onWheel}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              touchAction: "none",
              cursor:
                tool === "eraser"
                  ? "crosshair"
                  : tool === "lasso"
                    ? "default"
                    : "crosshair",
            }}
          />
        </div>

        {actionBar ? (
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
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
  actionBar: {
    position: "absolute",
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
