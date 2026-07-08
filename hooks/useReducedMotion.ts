import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";

export function useReducedMotion(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") {
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      setEnabled(media.matches);
      const listener = (e: MediaQueryListEvent) => setEnabled(e.matches);
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }

    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setEnabled(v);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (v) => setEnabled(v),
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return enabled;
}
