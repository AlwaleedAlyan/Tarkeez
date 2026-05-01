import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

const TOKEN_KEY = "@tarkeez/token";

let _token: string | null = null;
let _hydrated = false;

function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_DOMAIN;
  if (fromEnv) return `https://${fromEnv}/api`;

  const hostUri =
    (Constants.expoConfig?.hostUri as string | undefined) ??
    (Constants.expoGoConfig?.debuggerHost as string | undefined);
  if (hostUri) {
    const host = hostUri.split(":")[0];
    return `http://${host}:8080/api`;
  }
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.origin}/api`;
  }
  return "http://localhost:8080/api";
}

const BASE_URL = resolveBaseUrl();

export function getApiBaseUrl(): string {
  return BASE_URL;
}

async function hydrate() {
  if (_hydrated) return;
  _hydrated = true;
  try {
    _token = await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    _token = null;
  }
}

export async function getToken(): Promise<string | null> {
  await hydrate();
  return _token;
}

export async function setToken(token: string | null): Promise<void> {
  _token = token;
  _hydrated = true;
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

type FetchOpts = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  json?: unknown;
  formData?: FormData;
  auth?: boolean;
  signal?: AbortSignal;
};

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export { ApiError };

export async function api<T = unknown>(
  path: string,
  opts: FetchOpts = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;

  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.formData) {
    body = opts.formData as unknown as BodyInit;
  }

  if (opts.auth !== false) {
    const t = await getToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body,
    signal: opts.signal,
  });

  if (res.status === 204) return undefined as unknown as T;

  const ct = res.headers.get("content-type") || "";
  let data: unknown;
  if (ct.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    if (data && typeof data === "object") {
      const err = (data as { error?: unknown }).error;
      if (typeof err === "string" && err.length > 0) msg = err;
    } else if (typeof data === "string" && data.length > 0) {
      msg = data;
    }
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export function fileUrl(materialId: string): string {
  return `${BASE_URL}/materials/${materialId}/file`;
}
