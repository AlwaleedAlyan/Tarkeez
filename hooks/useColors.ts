import { useTheme } from "@/contexts/ThemeContext";

/**
 * Returns the design tokens for the active theme (mode + accent),
 * sourced from ThemeContext. The active palette automatically updates
 * when the user changes mode or accent in Settings.
 */
export function useColors() {
  const { palette, radius } = useTheme();
  return { ...palette, radius };
}
