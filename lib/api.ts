import { supabase } from "./supabase";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export { ApiError };

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
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new ApiError(error.message, error.status ?? 400);
    if (!data.user) throw new ApiError("Sign up failed", 400);

    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: data.user.id,
        name,
        email,
      });

    if (profileError) throw new ApiError(profileError.message, 400);

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

  throw new ApiError(`Unhandled route: ${method} ${path}`, 404);
}

export async function fileUrl(materialId: string): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ApiError("Not authenticated", 401);

  const { data: material, error: fetchError } = await supabase
    .from("materials")
    .select("file_name")
    .eq("id", materialId)
    .single();

  if (fetchError) throw new ApiError(fetchError.message, 400);

  const filePath = `${user.id}/${material.file_name}`;
  const { data, error } = await supabase.storage
    .from("materials")
    .createSignedUrl(filePath, 3600);

  if (error || !data)
    throw new ApiError(error?.message ?? "Failed to get signed URL", 400);

  return data.signedUrl;
}
