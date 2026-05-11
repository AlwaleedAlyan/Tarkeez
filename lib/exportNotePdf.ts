import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";

import type { Stroke } from "@/contexts/LibraryContext";

type NoteLike = {
  title: string;
  contentHtml: string;
  drawingStrokes: Stroke[];
  createdAt: number;
};

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(s: string): string {
  return escHtml(s);
}

function sanitizeFilename(s: string): string {
  const trimmed = s.trim().replace(/[\\/:*?"<>|]+/g, "_");
  return trimmed.length > 0 ? trimmed.slice(0, 80) : "Note";
}

function formatDate(ts: number): string {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function pointsToSvgPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)} l 0.01 0`;
  }
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`;
  }
  return d;
}

function strokesToSvg(strokes: Stroke[]): string {
  if (strokes.length === 0) return "";
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
  if (!isFinite(minX)) return "";
  const pad = 16;
  const vx = minX - pad;
  const vy = minY - pad;
  const vw = Math.max(1, maxX - minX + pad * 2);
  const vh = Math.max(1, maxY - minY + pad * 2);

  const paths = strokes
    .map((s) => {
      const d = pointsToSvgPath(s.points);
      if (!d) return "";
      const opacity = s.kind === "highlighter" ? 0.32 : 1;
      return `<path d="${d}" stroke="${escAttr(s.color)}" stroke-opacity="${opacity}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    })
    .join("");

  return `<svg class="drawing-svg" viewBox="${vx} ${vy} ${vw} ${vh}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMin meet">${paths}</svg>`;
}

function buildHtml(note: NoteLike): string {
  const titleText = note.title.trim() || "Untitled";
  const drawing = strokesToSvg(note.drawingStrokes);
  const contentHtml = note.contentHtml || "";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  @page { margin: 32px; size: letter; }
  body { font-family: -apple-system, system-ui, "Helvetica Neue", sans-serif; font-size: 12pt; color: #111; line-height: 1.5; }
  .title { font-size: 22pt; font-weight: 700; letter-spacing: -0.4pt; margin-bottom: 4px; }
  .date { font-size: 10pt; color: #666; margin-bottom: 24px; }
  .body-text img { max-width: 100%; height: auto; }
  .section-divider { margin: 24px 0; border-top: 1px solid #ddd; }
  .drawing-svg { display: block; width: 100%; height: auto; page-break-inside: avoid; }
  ul, ol { padding-left: 24px; }
  p { margin: 0 0 8pt 0; }
  h1, h2, h3 { margin: 16pt 0 8pt 0; }
</style>
</head><body>
  <div class="title">${escHtml(titleText)}</div>
  <div class="date">${escHtml(formatDate(note.createdAt))}</div>
  <div class="body-text">${contentHtml}</div>
  ${drawing ? `<div class="section-divider"></div>${drawing}` : ""}
</body></html>`;
}

export async function exportNoteToPdf(note: NoteLike): Promise<string> {
  const html = buildHtml(note);
  const { uri } = await Print.printToFileAsync({
    html,
    width: 612,
    height: 792,
    base64: false,
  });
  const cache = FileSystem.cacheDirectory;
  if (!cache) return uri;
  const name = sanitizeFilename(note.title) + ".pdf";
  const dest = `${cache}${name}`;
  try {
    try {
      await FileSystem.deleteAsync(dest, { idempotent: true });
    } catch {
      /* ignore */
    }
    await FileSystem.moveAsync({ from: uri, to: dest });
    return dest;
  } catch {
    return uri;
  }
}
