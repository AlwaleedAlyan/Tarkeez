import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { ApiError, api } from "@/lib/api";
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
  photoUri?: string;
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

function toUser(u: ApiUser): User {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    photoUri: u.photoUri ?? undefined,
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
          setUser(toUser(me.user));
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
            setUser(toUser(me.user));
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

  const login = useCallback(async (email: string, password: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !password)
      throw new Error("Please enter your email and password.");
    const res = await api<AuthResponse>("/auth/login", {
      method: "POST",
      json: { email: trimmed, password },
      auth: false,
    });
    setUser(toUser(res.user));
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
      setUser(toUser(res.user));
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
    setUser(toUser(res.user));
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
