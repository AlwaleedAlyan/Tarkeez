import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db/client";

export type AnnotationsUpsertInput = {
  userId: string;
  materialId: string;
  pageNumber: number;
  pageData: unknown;
};

function syntheticId(r: { userId: string; materialId: string; pageNumber: number }) {
  return `${r.userId}|${r.materialId}|${r.pageNumber}`;
}

export async function upsertAnnotations(
  rows: AnnotationsUpsertInput[],
): Promise<void> {
  if (!db) return;
  if (rows.length === 0) return;
  const ts = Date.now();
  for (const r of rows) {
    const id = syntheticId(r);
    await db
      .insert(schema.annotations)
      .values({
        id,
        userId: r.userId,
        materialId: r.materialId,
        pageNumber: r.pageNumber,
        pageDataJson: JSON.stringify(r.pageData),
        updatedAt: ts,
      })
      .onConflictDoUpdate({
        target: schema.annotations.id,
        set: {
          pageDataJson: JSON.stringify(r.pageData),
          updatedAt: ts,
        },
      });
  }
}

export async function loadAnnotationsByMaterial(
  userId: string,
  materialId: string,
): Promise<Record<string, unknown>> {
  if (!db) return {};
  const rows = await db
    .select({
      pageNumber: schema.annotations.pageNumber,
      pageDataJson: schema.annotations.pageDataJson,
    })
    .from(schema.annotations)
    .where(
      and(
        eq(schema.annotations.userId, userId),
        eq(schema.annotations.materialId, materialId),
      ),
    );
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[String(r.pageNumber)] = JSON.parse(r.pageDataJson);
    } catch {
      /* skip corrupt row */
    }
  }
  return out;
}

export async function replaceAnnotationsForMaterial(
  userId: string,
  materialId: string,
  annos: Record<string, unknown>,
): Promise<void> {
  if (!db) return;
  const ts = Date.now();
  await db
    .delete(schema.annotations)
    .where(
      and(
        eq(schema.annotations.userId, userId),
        eq(schema.annotations.materialId, materialId),
      ),
    );
  const entries = Object.entries(annos);
  if (entries.length === 0) return;
  const values = entries
    .map(([page, pageData]) => ({
      pageNumber: Number.parseInt(page, 10),
      pageData,
    }))
    .filter((r) => Number.isFinite(r.pageNumber))
    .map((r) => ({
      id: syntheticId({ userId, materialId, pageNumber: r.pageNumber }),
      userId,
      materialId,
      pageNumber: r.pageNumber,
      pageDataJson: JSON.stringify(r.pageData),
      updatedAt: ts,
    }));
  if (values.length === 0) return;
  await db.insert(schema.annotations).values(values);
}
