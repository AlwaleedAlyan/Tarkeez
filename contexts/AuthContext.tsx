import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { ApiError, api, resolveAvatarUri } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export type PhotoTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

export type User = {
  id: string;
  name: string;
  email: string;
  // Renderable URL (a signed Supabase URL, a legacy file:// from a single-device
  // upload, or undefined). Avatar consumers should use this directly.
  photoUri?: string;
  // The raw value stored in profiles.photo_uri — the storage path for new
  // uploads. Kept so we can re-sign on a timer and clean up on removal.
  photoPath?: string;
  photoTransform?: PhotoTransform;
};

export type ProfileUpdate = {
  name?: string;
  email?: string;
  photoUri?: string | null;
  photoTransform?: PhotoTransform | null;
  newPassword?: string;
  currentPassword?: string;
};

type ApiUser = {
  id: string;
  name: string;
  email: string;
  photoUri: string | null;
  photoTransform: PhotoTransform | null;
};

type AuthResponse = { token: string; user: ApiUser };
type MeResponse = { user: ApiUser };

async function toUser(u: ApiUser): Promise<User> {
  const path = u.photoUri ?? null;
  const resolved = await resolveAvatarUri(path);
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    photoUri: resolved ?? undefined,
    photoPath: path ?? undefined,
    photoTransform: u.photoTransform ?? undefined,
  };
}

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: ProfileUpdate) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        try {
          const me = await api<MeResponse>("/auth/me");
          setUser(await toUser(me.user));
        } catch (e) {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session) {
          try {
            const me = await api<MeResponse>("/auth/me");
            setUser(await toUser(me.user));
          } catch (e) {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Re-sign the avatar URL before its 1 h TTL expires so long-lived sessions
  // don't end up rendering a stale URL. Only relevant when the stored value is
  // a Supabase storage path (resolveAvatarUri leaves http/file URIs alone).
  useEffect(() => {
    const path = user?.photoPath;
    if (!path) return;
    if (path.startsWith("http://") || path.startsWith("https://")) return;
    if (path.startsWith("file://")) return;
    const id = setInterval(
      async () => {
        try {
          const next = await resolveAvatarUri(path);
          if (!next) return;
          setUser((prev) =>
            prev && prev.photoPath === path
              ? { ...prev, photoUri: next }
              : prev,
          );
        } catch {
          /* leave the previous URL in place — next refresh will retry */
        }
      },
      50 * 60 * 1000,
    );
    return () => clearInterval(id);
  }, [user?.photoPath]);

  const login = useCallback(async (email: string, password: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !password)
      throw new Error("Please enter your email and password.");
    const res = await api<AuthResponse>("/auth/login", {
      method: "POST",
      json: { email: trimmed, password },
      auth: false,
    });
    setUser(await toUser(res.user));
  }, []);

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      const trimmedName = name.trim();
      const trimmedEmail = email.trim().toLowerCase();
      if (!trimmedName) throw new Error("Please enter your name.");
      if (!trimmedEmail || !trimmedEmail.includes("@"))
        throw new Error("Please enter a valid email.");
      if (password.length < 4)
        throw new Error("Password must be at least 4 characters.");

      const res = await api<AuthResponse>("/auth/signup", {
        method: "POST",
        json: { name: trimmedName, email: trimmedEmail, password },
        auth: false,
      });
      setUser(await toUser(res.user));
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* ignore — clear locally anyway */
    }
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (patch: ProfileUpdate) => {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.email !== undefined) body.email = patch.email;
    if (patch.photoUri !== undefined) body.photoUri = patch.photoUri;
    if (patch.photoTransform !== undefined)
      body.photoTransform = patch.photoTransform;
    if (patch.newPassword !== undefined) {
      body.newPassword = patch.newPassword;
      body.currentPassword = patch.currentPassword;
    }
    const res = await api<MeResponse>("/auth/me", {
      method: "PATCH",
      json: body,
    });
    setUser(await toUser(res.user));
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, signup, logout, updateProfile }),
    [user, isLoading, login, signup, logout, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
