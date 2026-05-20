import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";

import {
  ACCENTS,
  type AccentName,
  type Palette,
  RADIUS,
  type ThemeMode,
  buildPalette,
} from "@/constants/themes";
import { setTapSoundEnabled } from "@/lib/tapSound";

type AppPrefs = {
  mode: ThemeMode;
  accent: AccentName;
  notifications: boolean;
  soundsEnabled: boolean;
};

const DEFAULT_PREFS: AppPrefs = {
  mode: "system",
  accent: "latte",
  notifications: true,
  soundsEnabled: true,
};

const PREFS_KEY = "@Tarkeez/prefs";

type ThemeContextType = {
  prefs: AppPrefs;
  isReady: boolean;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: AccentName) => void;
  setNotifications: (enabled: boolean) => void;
  setSoundsEnabled: (enabled: boolean) => void;
  effectiveMode: "light" | "dark";
  palette: Palette;
  radius: number;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [prefs, setPrefs] = useState<AppPrefs>(DEFAULT_PREFS);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PREFS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<AppPrefs>;
          setPrefs({
            mode: parsed.mode ?? DEFAULT_PREFS.mode,
            accent:
              parsed.accent && parsed.accent in ACCENTS
                ? (parsed.accent as AccentName)
                : DEFAULT_PREFS.accent,
            notifications:
              typeof parsed.notifications === "boolean"
                ? parsed.notifications
                : DEFAULT_PREFS.notifications,
            soundsEnabled:
              typeof parsed.soundsEnabled === "boolean"
                ? parsed.soundsEnabled
                : DEFAULT_PREFS.soundsEnabled,
          });
        }
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  const persist = useCallback((next: AppPrefs) => {
    setPrefs(next);
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const setMode = useCallback(
    (mode: ThemeMode) => persist({ ...prefs, mode }),
    [prefs, persist],
  );
  const setAccent = useCallback(
    (accent: AccentName) => persist({ ...prefs, accent }),
    [prefs, persist],
  );
  const setNotifications = useCallback(
    (enabled: boolean) => persist({ ...prefs, notifications: enabled }),
    [prefs, persist],
  );
  const setSoundsEnabled = useCallback(
    (enabled: boolean) => persist({ ...prefs, soundsEnabled: enabled }),
    [prefs, persist],
  );

  useEffect(() => {
    setTapSoundEnabled(prefs.soundsEnabled);
  }, [prefs.soundsEnabled]);

  const effectiveMode: "light" | "dark" =
    prefs.mode === "system"
      ? systemScheme === "dark"
        ? "dark"
        : "light"
      : prefs.mode;

  const palette = useMemo(
    () => buildPalette(effectiveMode, prefs.accent),
    [effectiveMode, prefs.accent],
  );

  const value = useMemo(
    () => ({
      prefs,
      isReady,
      setMode,
      setAccent,
      setNotifications,
      setSoundsEnabled,
      effectiveMode,
      palette,
      radius: RADIUS,
    }),
    [
      prefs,
      isReady,
      setMode,
      setAccent,
      setNotifications,
      setSoundsEnabled,
      effectiveMode,
      palette,
    ],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
