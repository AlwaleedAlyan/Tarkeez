import { supabase } from "./supabase";

export const MAX_MATERIAL_BYTES = 15 * 1024 * 1024;

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export { ApiError };

function formatMb(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

type FetchOpts = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  json?: unknown;
  formData?: FormData;
  auth?: boolean;
  signal?: AbortSignal;
};

export async function api<T = unknown>(
  path: string,
  opts: FetchOpts = {},
): Promise<T> {
  const method = opts.method ?? "GET";

  if (path === "/auth/login" && method === "POST") {
    const { email, password } = opts.json as any;
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new ApiError(error.message, error.status ?? 400);

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, email, photoUri:photo_uri, photoTransform:photo_transform")
      .eq("id", data.user.id)
      .single();

    if (profileError) throw new ApiError(profileError.message, 400);

    return { token: data.session?.access_token || "", user: profileData } as T;
  }

  if (path === "/auth/signup" && method === "POST") {
    const { name, email, password } = opts.json as any;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) throw new ApiError(error.message, error.status ?? 400);
    if (!data.user) throw new ApiError("Sign up failed", 400);

    const { data: profileData, error: fetchError } = await supabase
      .from("profiles")
      .select("id, name, email, photoUri:photo_uri, photoTransform:photo_transform")
      .eq("id", data.user.id)
      .single();

    if (fetchError) throw new ApiError(fetchError.message, 400);

    return { token: data.session?.access_token || "", user: profileData } as T;
  }

  if (path === "/auth/me" && method === "GET") {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user)
      throw new ApiError(error?.message ?? "Not authenticated", 401);

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, email, photoUri:photo_uri, photoTransform:photo_transform")
      .eq("id", user.id)
      .single();

    if (profileError) throw new ApiError(profileError.message, 400);

    return { user: profileData } as T;
  }

  if (path === "/auth/me" && method === "PATCH") {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user)
      throw new ApiError(error?.message ?? "Not authenticated", 401);

    const patch = opts.json as any;
    const updateData: any = {};
    if (patch.name !== undefined) updateData.name = patch.name;
    if (patch.email !== undefined) updateData.email = patch.email;
    if (patch.photoUri !== undefined) updateData.photo_uri = patch.photoUri;
    if (patch.photoTransform !== undefined)
      updateData.photo_transform = patch.photoTransform;

    if (Object.keys(updateData).length > 0) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", user.id);

      if (profileError) throw new ApiError(profileError.message, 400);
    }

    if (patch.newPassword) {
       const { error: updateAuthError } = await supabase.auth.updateUser({ password: patch.newPassword });
       if (updateAuthError) throw new ApiError(updateAuthError.message, 400);
    }

    const { data: profileData, error: fetchError } = await supabase
      .from("profiles")
      .select("id, name, email, photoUri:photo_uri, photoTransform:photo_transform")
      .eq("id", user.id)
      .single();
      
    if (fetchError) throw new ApiError(fetchError.message, 400);

    return { user: profileData } as T;
  }

  if (path === "/auth/logout" && method === "POST") {
    const { error } = await supabase.auth.signOut();
    if (error) throw new ApiError(error.message, 400);
    return {} as T;
  }

  if (path === "/materials" && method === "GET") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ApiError("Not authenticated", 401);

    const { data, error } = await supabase
      .from("materials")
      .select("*")
      .eq("user_id", user.id);

    if (error) throw new ApiError(error.message, 400);

    const materials = data.map((m: any) => ({
      id: m.id,
      title: m.title,
      fileName: m.file_name,
      mimeType: m.mime_type,
      sizeBytes: m.size_bytes,
      totalPages: m.total_pages,
      currentPage: m.current_page,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    }));

    return { materials } as T;
  }

  if (path === "/materials" && method === "POST") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ApiError("Not authenticated", 401);

    const formData = opts.formData;
    if (!formData) throw new ApiError("Missing formData", 400);

    const title = formData.get("title") as string;
    const file = formData.get("file") as any;
    
    let blob: Blob;
    if (file && file.uri) {
      const response = await fetch(file.uri);
      blob = await response.blob();
    } else {
      blob = file as Blob;
    }

    if (blob.size > MAX_MATERIAL_BYTES) {
      throw new ApiError(
        `This PDF is ${formatMb(blob.size)} MB. Materials must be 15 MB or less.`,
        413,
      );
    }

    const filePath = `${user.id}/${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("materials")
      .upload(filePath, blob, {
        contentType: file.type || "application/pdf",
        upsert: true,
      });

    if (uploadError) throw new ApiError(uploadError.message, 400);

    const { data: materialData, error: materialError } = await supabase
      .from("materials")
      .insert({
        user_id: user.id,
        title: title,
        file_name: file.name,
        mime_type: file.type || "application/pdf",
        size_bytes: blob.size,
        current_page: 1,
      })
      .select()
      .single();

    if (materialError) throw new ApiError(materialError.message, 400);

    const m = materialData;
    return {
      material: {
        id: m.id,
        title: m.title,
        fileName: m.file_name,
        mimeType: m.mime_type,
        sizeBytes: m.size_bytes,
        totalPages: m.total_pages,
        currentPage: m.current_page,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      },
    } as T;
  }

  const materialMatch = path.match(/^\/materials\/(.+)$/);
  if (materialMatch) {
    const id = materialMatch[1];
    if (method === "PATCH") {
      const patch = opts.json as any;
      const updateData: any = {};
      if (patch.title !== undefined) updateData.title = patch.title;
      if (patch.totalPages !== undefined)
        updateData.total_pages = patch.totalPages;
      if (patch.currentPage !== undefined)
        updateData.current_page = patch.currentPage;

      const { data, error } = await supabase
        .from("materials")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new ApiError(error.message, 400);

      const m = data;
      return {
        material: {
          id: m.id,
          title: m.title,
          fileName: m.file_name,
          mimeType: m.mime_type,
          sizeBytes: m.size_bytes,
          totalPages: m.total_pages,
          currentPage: m.current_page,
          createdAt: m.created_at,
          updatedAt: m.updated_at,
        },
      } as T;
    }

    if (method === "DELETE") {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new ApiError("Not authenticated", 401);

      const { data: material, error: fetchError } = await supabase
        .from("materials")
        .select("file_name")
        .eq("id", id)
        .single();

      if (fetchError) throw new ApiError(fetchError.message, 400);

      const filePath = `${user.id}/${material.file_name}`;

      const { error: storageError } = await supabase.storage
        .from("materials")
        .remove([filePath]);

      if (storageError) throw new ApiError(storageError.message, 400);

      const { error: deleteError } = await supabase
        .from("materials")
        .delete()
        .eq("id", id);

      if (deleteError) throw new ApiError(deleteError.message, 400);

      return {} as T;
    }
  }

  if (path === "/collections" && method === "GET") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ApiError("Not authenticated", 401);
    const { data, error } = await supabase
      .from("collections")
      .select("id, name, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw new ApiError(error.message, 400);
    const collections = data.map((c: any) => ({
      id: c.id,
      name: c.name,
      createdAt: c.created_at,
    }));
    return { collections } as T;
  }

  if (path === "/collections" && method === "POST") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ApiError("Not authenticated", 401);
    const { name } = opts.json as any;
    const trimmed = (name ?? "").toString().trim();
    if (!trimmed) throw new ApiError("Name is required", 400);
    const { data, error } = await supabase
      .from("collections")
      .insert({ user_id: user.id, name: trimmed })
      .select()
      .single();
    if (error) throw new ApiError(error.message, 400);
    return {
      collection: {
        id: data.id,
        name: data.name,
        createdAt: data.created_at,
      },
    } as T;
  }

  const collectionMatch = path.match(/^\/collections\/([^/]+)$/);
  if (collectionMatch) {
    const id = collectionMatch[1];
    if (method === "PATCH") {
      const { name } = opts.json as any;
      const trimmed = (name ?? "").toString().trim();
      if (!trimmed) throw new ApiError("Name is required", 400);
      const { data, error } = await supabase
        .from("collections")
        .update({ name: trimmed })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new ApiError(error.message, 400);
      return {
        collection: {
          id: data.id,
          name: data.name,
          createdAt: data.created_at,
        },
      } as T;
    }
    if (method === "DELETE") {
      const { error } = await supabase
        .from("collections")
        .delete()
        .eq("id", id);
      if (error) throw new ApiError(error.message, 400);
      return {} as T;
    }
  }

  if (path === "/collection-materials" && method === "GET") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ApiError("Not authenticated", 401);
    const { data, error } = await supabase
      .from("collection_materials")
      .select("collection_id, material_id, note_id, added_at");
    if (error) throw new ApiError(error.message, 400);
    const rows = data.map((r: any) => ({
      collectionId: r.collection_id,
      materialId: r.material_id ?? null,
      noteId: r.note_id ?? null,
      addedAt: r.added_at,
    }));
    return { rows } as T;
  }

  if (path === "/collection-materials" && method === "POST") {
    const { collectionId, materialId, noteId } = opts.json as any;
    if (!collectionId || (!materialId && !noteId))
      throw new ApiError("collectionId and one of materialId/noteId required", 400);
    if (materialId && noteId)
      throw new ApiError("Provide only one of materialId or noteId", 400);
    const insertRow: any = { collection_id: collectionId };
    if (materialId) insertRow.material_id = materialId;
    else insertRow.note_id = noteId;
    const { error } = await supabase
      .from("collection_materials")
      .insert(insertRow);
    if (error && (error as any).code !== "23505") {
      throw new ApiError(error.message, 400);
    }
    return {} as T;
  }

  const cmMaterialMatch = path.match(
    /^\/collection-materials\/material\/([^/]+)\/([^/]+)$/,
  );
  if (cmMaterialMatch && method === "DELETE") {
    const [, collectionId, materialId] = cmMaterialMatch;
    const { error } = await supabase
      .from("collection_materials")
      .delete()
      .eq("collection_id", collectionId)
      .eq("material_id", materialId);
    if (error) throw new ApiError(error.message, 400);
    return {} as T;
  }

  const cmNoteMatch = path.match(
    /^\/collection-materials\/note\/([^/]+)\/([^/]+)$/,
  );
  if (cmNoteMatch && method === "DELETE") {
    const [, collectionId, noteId] = cmNoteMatch;
    const { error } = await supabase
      .from("collection_materials")
      .delete()
      .eq("collection_id", collectionId)
      .eq("note_id", noteId);
    if (error) throw new ApiError(error.message, 400);
    return {} as T;
  }

  if (path === "/sessions" && method === "GET") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ApiError("Not authenticated", 401);
    const { data, error } = await supabase
      .from("study_sessions")
      .select(
        "id, material_id, note_id, started_at, ended_at, duration_sec, paused_sec, pages_read, page_times, selections, words_added, keystrokes, strokes_added, created_at",
      )
      .eq("user_id", user.id)
      .order("started_at", { ascending: false });
    if (error) throw new ApiError(error.message, 400);
    const sessions = data.map((s: any) => ({
      id: s.id,
      materialId: s.material_id ?? null,
      noteId: s.note_id ?? null,
      startedAt: Number(s.started_at),
      endedAt: Number(s.ended_at),
      durationSec: s.duration_sec,
      pausedSec: s.paused_sec ?? 0,
      pagesRead: s.pages_read ?? null,
      pageTimes: s.page_times ?? null,
      selections: s.selections ?? null,
      wordsAdded: s.words_added ?? null,
      keystrokes: s.keystrokes ?? null,
      strokesAdded: s.strokes_added ?? null,
      createdAt: s.created_at,
    }));
    return { sessions } as T;
  }

  if (path === "/sessions" && method === "POST") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ApiError("Not authenticated", 401);
    const body = (opts.json ?? {}) as any;
    const session = body.session ?? body;
    if (!session?.id) throw new ApiError("session.id required", 400);
    if (!session.materialId && !session.noteId)
      throw new ApiError("materialId or noteId required", 400);
    if (session.materialId && session.noteId)
      throw new ApiError("Provide only one of materialId or noteId", 400);
    const insertRow: any = {
      id: session.id,
      user_id: user.id,
      material_id: session.materialId ?? null,
      note_id: session.noteId ?? null,
      started_at: session.startedAt,
      ended_at: session.endedAt,
      duration_sec: session.durationSec,
      paused_sec: session.pausedSec ?? 0,
      pages_read: session.pagesRead ?? null,
      page_times: session.pageTimes ?? null,
      selections: session.selections ?? null,
      words_added: session.wordsAdded ?? null,
      keystrokes: session.keystrokes ?? null,
      strokes_added: session.strokesAdded ?? null,
    };
    const { data, error } = await supabase
      .from("study_sessions")
      .insert(insertRow)
      .select(
        "id, material_id, note_id, started_at, ended_at, duration_sec, paused_sec, pages_read, page_times, selections, words_added, keystrokes, strokes_added, created_at",
      )
      .single();
    if (error) throw new ApiError(error.message, 400);
    return {
      session: {
        id: data.id,
        materialId: data.material_id ?? null,
        noteId: data.note_id ?? null,
        startedAt: Number(data.started_at),
        endedAt: Number(data.ended_at),
        durationSec: data.duration_sec,
        pausedSec: data.paused_sec ?? 0,
        pagesRead: data.pages_read ?? null,
        pageTimes: data.page_times ?? null,
        selections: data.selections ?? null,
        wordsAdded: data.words_added ?? null,
        keystrokes: data.keystrokes ?? null,
        strokesAdded: data.strokes_added ?? null,
        createdAt: data.created_at,
      },
    } as T;
  }

  if (path === "/notes" && method === "GET") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ApiError("Not authenticated", 401);
    const { data, error } = await supabase
      .from("notes")
      .select(
        "id, title, content_html, drawing_strokes, created_at, updated_at",
      )
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) throw new ApiError(error.message, 400);
    const notes = data.map((n: any) => ({
      id: n.id,
      title: n.title,
      contentHtml: n.content_html ?? "",
      drawingStrokes: Array.isArray(n.drawing_strokes) ? n.drawing_strokes : [],
      createdAt: n.created_at,
      updatedAt: n.updated_at,
    }));
    return { notes } as T;
  }

  if (path === "/notes" && method === "POST") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ApiError("Not authenticated", 401);
    const { title, contentHtml, drawingStrokes } = (opts.json ?? {}) as any;
    const insertRow: any = { user_id: user.id };
    if (title !== undefined) insertRow.title = title;
    if (contentHtml !== undefined) insertRow.content_html = contentHtml;
    if (drawingStrokes !== undefined)
      insertRow.drawing_strokes = drawingStrokes;
    const { data, error } = await supabase
      .from("notes")
      .insert(insertRow)
      .select(
        "id, title, content_html, drawing_strokes, created_at, updated_at",
      )
      .single();
    if (error) throw new ApiError(error.message, 400);
    return {
      note: {
        id: data.id,
        title: data.title,
        contentHtml: data.content_html ?? "",
        drawingStrokes: Array.isArray(data.drawing_strokes)
          ? data.drawing_strokes
          : [],
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    } as T;
  }

  const noteMatch = path.match(/^\/notes\/([^/]+)$/);
  if (noteMatch) {
    const id = noteMatch[1];
    if (method === "PATCH") {
      const patch = (opts.json ?? {}) as any;
      const updateRow: any = { updated_at: new Date().toISOString() };
      if (patch.title !== undefined) updateRow.title = patch.title;
      if (patch.contentHtml !== undefined)
        updateRow.content_html = patch.contentHtml;
      if (patch.drawingStrokes !== undefined)
        updateRow.drawing_strokes = patch.drawingStrokes;
      const { data, error } = await supabase
        .from("notes")
        .update(updateRow)
        .eq("id", id)
        .select(
          "id, title, content_html, drawing_strokes, created_at, updated_at",
        )
        .single();
      if (error) throw new ApiError(error.message, 400);
      return {
        note: {
          id: data.id,
          title: data.title,
          contentHtml: data.content_html ?? "",
          drawingStrokes: Array.isArray(data.drawing_strokes)
            ? data.drawing_strokes
            : [],
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
      } as T;
    }
    if (method === "DELETE") {
      const { error } = await supabase.from("notes").delete().eq("id", id);
      if (error) throw new ApiError(error.message, 400);
      return {} as T;
    }
  }

  throw new ApiError(`Unhandled route: ${method} ${path}`, 404);
}

// --- Avatars (profile photos) ---
//
// New uploads go through `uploadAvatar` and are stored at
//   avatars/{user_id}/avatar.<ext>
// The path (not the URL) is what gets persisted into `profiles.photo_uri`.
// `resolveAvatarUri` signs a stored path on read so the Avatar component
// always renders a real, fresh URL. Legacy `file://` and `http(s)://`
// values are passed through unchanged for backwards compatibility.

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function avatarExtFromMime(mime?: string | null): string {
  switch ((mime ?? "").toLowerCase()) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
    case "image/jpg":
    default:
      return "jpg";
  }
}

export async function uploadAvatar(
  localUri: string,
  mimeType?: string,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ApiError("Not authenticated", 401);

  const response = await fetch(localUri);
  const blob = await response.blob();
  if (blob.size > MAX_AVATAR_BYTES) {
    throw new ApiError(
      `Photo is ${(blob.size / (1024 * 1024)).toFixed(1)} MB. Avatars must be 5 MB or less.`,
      413,
    );
  }

  const ext = avatarExtFromMime(mimeType ?? blob.type);
  const path = `${user.id}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, blob, {
      contentType: mimeType ?? blob.type ?? "image/jpeg",
      upsert: true,
    });
  if (uploadError) throw new ApiError(uploadError.message, 400);
  return path;
}

export async function avatarUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, 3600);
  if (error || !data)
    throw new ApiError(error?.message ?? "Failed to sign avatar", 400);
  return data.signedUrl;
}

export async function deleteAvatar(path: string): Promise<void> {
  await supabase.storage.from(AVATAR_BUCKET).remove([path]).catch(() => {});
}

export async function resolveAvatarUri(
  stored: string | null | undefined,
): Promise<string | null> {
  if (!stored) return null;
  if (stored.startsWith("http://") || stored.startsWith("https://"))
    return stored;
  if (stored.startsWith("file://")) return stored; // legacy device-local
  try {
    return await avatarUrl(stored);
  } catch {
    return null;
  }
}

export async function fileUrl(materialId: string): Promise<string> {
  const { data: material, error: fetchError } = await supabase
    .from("materials")
    .select("user_id, file_name")
    .eq("id", materialId)
    .single();

  if (fetchError) throw new ApiError(fetchError.message, 400);
  if (!material) throw new ApiError("Material not found", 404);

  const filePath = `${material.user_id}/${material.file_name}`;
  const { data, error } = await supabase.storage
    .from("materials")
    .createSignedUrl(filePath, 3600);

  if (error || !data) {
    throw new ApiError(
      `Could not sign URL for ${filePath}: ${error?.message ?? "no data"}`,
      400,
    );
  }

  return data.signedUrl;
}
