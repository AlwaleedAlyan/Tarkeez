import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  photoPath: text("photo_path"),
  photoTransform: text("photo_transform"),
  updatedAt: integer("updated_at").notNull(),
  serverUpdatedAt: integer("server_updated_at"),
});

export const materials = sqliteTable(
  "materials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    fileName: text("file_name"),
    mimeType: text("mime_type").default("application/pdf"),
    sizeBytes: integer("size_bytes"),
    totalPages: integer("total_pages"),
    currentPage: integer("current_page").default(1),
    localFilePath: text("local_file_path"),
    isDownloaded: integer("is_downloaded").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    serverUpdatedAt: integer("server_updated_at"),
    syncStatus: text("sync_status").notNull().default("synced"),
    deletedAt: integer("deleted_at"),
  },
  (t) => [
    index("materials_user_idx").on(t.userId),
    index("materials_sync_idx")
      .on(t.syncStatus)
      .where(sql`${t.syncStatus} != 'synced'`),
  ],
);

export const collections = sqliteTable(
  "collections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    serverUpdatedAt: integer("server_updated_at"),
    syncStatus: text("sync_status").notNull().default("synced"),
    deletedAt: integer("deleted_at"),
  },
  (t) => [index("collections_user_idx").on(t.userId)],
);

export const collectionMaterials = sqliteTable(
  "collection_materials",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id").notNull(),
    materialId: text("material_id"),
    noteId: text("note_id"),
    addedAt: integer("added_at").notNull(),
    syncStatus: text("sync_status").notNull().default("synced"),
    deletedAt: integer("deleted_at"),
  },
  (t) => [
    check(
      "cm_xor_chk",
      sql`(${t.materialId} IS NOT NULL) <> (${t.noteId} IS NOT NULL)`,
    ),
    uniqueIndex("cm_coll_material_uniq")
      .on(t.collectionId, t.materialId)
      .where(sql`${t.materialId} IS NOT NULL AND ${t.deletedAt} IS NULL`),
    uniqueIndex("cm_coll_note_uniq")
      .on(t.collectionId, t.noteId)
      .where(sql`${t.noteId} IS NOT NULL AND ${t.deletedAt} IS NULL`),
  ],
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull().default("Untitled"),
    contentHtml: text("content_html").notNull().default(""),
    strokesFilePath: text("strokes_file_path"),
    strokesByteSize: integer("strokes_byte_size").notNull().default(0),
    strokesDirtyAt: integer("strokes_dirty_at"),
    strokesServerSyncedAt: integer("strokes_server_synced_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    serverUpdatedAt: integer("server_updated_at"),
    syncStatus: text("sync_status").notNull().default("synced"),
    deletedAt: integer("deleted_at"),
  },
  (t) => [index("notes_user_idx").on(t.userId)],
);

export const studySessions = sqliteTable(
  "study_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    materialId: text("material_id"),
    noteId: text("note_id"),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at").notNull(),
    durationSec: integer("duration_sec").notNull(),
    pausedSec: integer("paused_sec").default(0),
    pagesRead: integer("pages_read"),
    pageTimesJson: text("page_times_json"),
    selections: integer("selections"),
    wordsAdded: integer("words_added"),
    keystrokes: integer("keystrokes"),
    strokesAdded: integer("strokes_added"),
    createdAt: integer("created_at").notNull(),
    syncStatus: text("sync_status").notNull().default("pending_create"),
  },
  (t) => [
    check(
      "ss_xor_chk",
      sql`(${t.materialId} IS NOT NULL) <> (${t.noteId} IS NOT NULL)`,
    ),
    index("sessions_user_idx").on(t.userId),
    index("sessions_sync_idx")
      .on(t.syncStatus)
      .where(sql`${t.syncStatus} != 'synced'`),
  ],
);

export const annotations = sqliteTable(
  "annotations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    materialId: text("material_id").notNull(),
    pageNumber: integer("page_number").notNull(),
    pageDataJson: text("page_data_json").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("annotations_user_material_page_uniq").on(
      t.userId,
      t.materialId,
      t.pageNumber,
    ),
  ],
);

export const syncOutbox = sqliteTable(
  "sync_outbox",
  {
    id: text("id").primaryKey(),
    tableName: text("table_name").notNull(),
    rowId: text("row_id").notNull(),
    operation: text("operation").notNull(),
    payloadJson: text("payload_json").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: integer("next_attempt_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("outbox_ready_idx").on(t.nextAttemptAt)],
);

export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
