import type { Stroke } from "@/contexts/LibraryContext";

export type Point = { x: number; y: number };
export type BBox = { minX: number; minY: number; maxX: number; maxY: number };

// Affine matrix in column-major order: x' = a*x + c*y + tx, y' = b*x + d*y + ty.
// Tuple layout matches Skia's Matrix3.
export type Mat2x3 = [
  a: number,
  b: number,
  c: number,
  d: number,
  tx: number,
  ty: number,
];

export function identity(): Mat2x3 {
  return [1, 0, 0, 1, 0, 0];
}

function multiply(m1: Mat2x3, m2: Mat2x3): Mat2x3 {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function translate(tx: number, ty: number): Mat2x3 {
  return [1, 0, 0, 1, tx, ty];
}

function scaleMat(s: number): Mat2x3 {
  return [s, 0, 0, s, 0, 0];
}

function rotateMat(rad: number): Mat2x3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, s, -s, c, 0, 0];
}

// Builds T(pivot) * R * S * T(-pivot) so pinch/rotate happen about (pivotX, pivotY),
// then applies a free translation (tx, ty) on top.
export function compose(
  tx: number,
  ty: number,
  scale: number,
  rotationRad: number,
  pivotX: number,
  pivotY: number,
): Mat2x3 {
  const toPivot = translate(-pivotX, -pivotY);
  const sm = scaleMat(scale);
  const rm = rotateMat(rotationRad);
  const fromPivot = translate(pivotX, pivotY);
  const free = translate(tx, ty);
  // free * fromPivot * R * S * toPivot
  return multiply(
    free,
    multiply(fromPivot, multiply(rm, multiply(sm, toPivot))),
  );
}

export function applyToPoint(m: Mat2x3, p: Point): Point {
  return {
    x: m[0] * p.x + m[2] * p.y + m[4],
    y: m[1] * p.x + m[3] * p.y + m[5],
  };
}

function uniformScale(m: Mat2x3): number {
  return Math.sqrt(m[0] * m[0] + m[1] * m[1]);
}

export function applyToStroke(m: Mat2x3, s: Stroke): Stroke {
  const k = uniformScale(m);
  return {
    color: s.color,
    width: s.width * k,
    kind: s.kind,
    points: s.points.map((p) => applyToPoint(m, p)),
  };
}

export function bboxOfStrokes(strokes: Stroke[]): BBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const s of strokes) {
    for (const p of s.points) {
      any = true;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!any) return null;
  return { minX, minY, maxX, maxY };
}

export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function strokeInLasso(
  s: Stroke,
  polygon: Point[],
  threshold = 0.6,
): boolean {
  if (s.points.length === 0 || polygon.length < 3) return false;
  if (s.points.length === 1) return pointInPolygon(s.points[0], polygon);
  let inside = 0;
  for (const p of s.points) {
    if (pointInPolygon(p, polygon)) inside++;
  }
  return inside / s.points.length >= threshold;
}
