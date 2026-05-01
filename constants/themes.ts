export type ThemeMode = "light" | "dark" | "system";

export type AccentName =
  | "latte"
  | "cherry"
  | "matcha"
  | "rose"
  | "navy"
  | "espresso";

export type AccentSpec = {
  name: AccentName;
  label: string;
  swatch: string;
};

export const ACCENTS: Record<AccentName, AccentSpec> = {
  latte: { name: "latte", label: "Latte", swatch: "#d4a574" },
  cherry: { name: "cherry", label: "Cherry", swatch: "#a83232" },
  matcha: { name: "matcha", label: "Matcha", swatch: "#5a8a4c" },
  rose: { name: "rose", label: "Rose", swatch: "#d97a9a" },
  navy: { name: "navy", label: "Navy", swatch: "#2d3561" },
  espresso: { name: "espresso", label: "Espresso", swatch: "#2b1d14" },
};

export const ACCENT_LIST: AccentSpec[] = [
  ACCENTS.latte,
  ACCENTS.cherry,
  ACCENTS.matcha,
  ACCENTS.rose,
  ACCENTS.navy,
  ACCENTS.espresso,
];

export type Palette = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
};

const PALETTES: Record<AccentName, { light: Palette; dark: Palette }> = {
  latte: {
    light: {
      background: "#faf3e7",
      foreground: "#2d1f10",
      card: "#ffffff",
      cardForeground: "#2d1f10",
      primary: "#c8965a",
      primaryForeground: "#ffffff",
      secondary: "#f0e4d0",
      secondaryForeground: "#8b5e2a",
      muted: "#f4ead8",
      mutedForeground: "#806948",
      accent: "#d4a574",
      accentForeground: "#1a1208",
      destructive: "#c44444",
      destructiveForeground: "#ffffff",
      border: "#e6d5b8",
      input: "#e6d5b8",
    },
    dark: {
      background: "#1c160e",
      foreground: "#f5e8d3",
      card: "#2a2018",
      cardForeground: "#f5e8d3",
      primary: "#d4a574",
      primaryForeground: "#1a1208",
      secondary: "#322519",
      secondaryForeground: "#e0c596",
      muted: "#251c14",
      mutedForeground: "#a89878",
      accent: "#d4a574",
      accentForeground: "#1a1208",
      destructive: "#e05959",
      destructiveForeground: "#ffffff",
      border: "#3a2c1d",
      input: "#3a2c1d",
    },
  },
  cherry: {
    light: {
      background: "#fdf3f3",
      foreground: "#2e1010",
      card: "#ffffff",
      cardForeground: "#2e1010",
      primary: "#a83232",
      primaryForeground: "#ffffff",
      secondary: "#f5dcdc",
      secondaryForeground: "#7a2020",
      muted: "#f9e6e6",
      mutedForeground: "#8a5050",
      accent: "#c24a4a",
      accentForeground: "#ffffff",
      destructive: "#7a1a1a",
      destructiveForeground: "#ffffff",
      border: "#ecc4c4",
      input: "#ecc4c4",
    },
    dark: {
      background: "#1c0d0d",
      foreground: "#f5d8d8",
      card: "#291616",
      cardForeground: "#f5d8d8",
      primary: "#d04545",
      primaryForeground: "#ffffff",
      secondary: "#321a1a",
      secondaryForeground: "#e89a9a",
      muted: "#241212",
      mutedForeground: "#b58080",
      accent: "#d04545",
      accentForeground: "#ffffff",
      destructive: "#e05959",
      destructiveForeground: "#ffffff",
      border: "#3a1f1f",
      input: "#3a1f1f",
    },
  },
  matcha: {
    light: {
      background: "#f0f5e8",
      foreground: "#1a2810",
      card: "#ffffff",
      cardForeground: "#1a2810",
      primary: "#5a8a4c",
      primaryForeground: "#ffffff",
      secondary: "#dde9cb",
      secondaryForeground: "#3a5a30",
      muted: "#e6efd5",
      mutedForeground: "#5e7548",
      accent: "#7eb068",
      accentForeground: "#0e1808",
      destructive: "#c44444",
      destructiveForeground: "#ffffff",
      border: "#c5d5a5",
      input: "#c5d5a5",
    },
    dark: {
      background: "#101810",
      foreground: "#e8f0d8",
      card: "#1a2418",
      cardForeground: "#e8f0d8",
      primary: "#7eb068",
      primaryForeground: "#0e1808",
      secondary: "#1f2c1c",
      secondaryForeground: "#b8d49c",
      muted: "#172116",
      mutedForeground: "#8aa078",
      accent: "#7eb068",
      accentForeground: "#0e1808",
      destructive: "#e05959",
      destructiveForeground: "#ffffff",
      border: "#283820",
      input: "#283820",
    },
  },
  rose: {
    light: {
      background: "#fdf2f5",
      foreground: "#2a1018",
      card: "#ffffff",
      cardForeground: "#2a1018",
      primary: "#c25577",
      primaryForeground: "#ffffff",
      secondary: "#f5d8e0",
      secondaryForeground: "#8a2c4c",
      muted: "#f9e3e9",
      mutedForeground: "#8a5468",
      accent: "#d97a9a",
      accentForeground: "#2a1018",
      destructive: "#c44444",
      destructiveForeground: "#ffffff",
      border: "#ecbbcc",
      input: "#ecbbcc",
    },
    dark: {
      background: "#1c0e14",
      foreground: "#f5d8e0",
      card: "#2a1820",
      cardForeground: "#f5d8e0",
      primary: "#d97a9a",
      primaryForeground: "#2a1018",
      secondary: "#321c25",
      secondaryForeground: "#ecb0c4",
      muted: "#24141c",
      mutedForeground: "#b58598",
      accent: "#d97a9a",
      accentForeground: "#2a1018",
      destructive: "#e05959",
      destructiveForeground: "#ffffff",
      border: "#3a2028",
      input: "#3a2028",
    },
  },
  navy: {
    light: {
      background: "#eef0f7",
      foreground: "#0e1530",
      card: "#ffffff",
      cardForeground: "#0e1530",
      primary: "#2d3561",
      primaryForeground: "#ffffff",
      secondary: "#d5dae8",
      secondaryForeground: "#2d3561",
      muted: "#e2e6f0",
      mutedForeground: "#545d80",
      accent: "#5560a0",
      accentForeground: "#ffffff",
      destructive: "#c44444",
      destructiveForeground: "#ffffff",
      border: "#b8c0d6",
      input: "#b8c0d6",
    },
    dark: {
      background: "#0d101c",
      foreground: "#d8dcf0",
      card: "#161b2c",
      cardForeground: "#d8dcf0",
      primary: "#5560a0",
      primaryForeground: "#ffffff",
      secondary: "#1d2440",
      secondaryForeground: "#a8b0d0",
      muted: "#141828",
      mutedForeground: "#7a85a8",
      accent: "#5560a0",
      accentForeground: "#ffffff",
      destructive: "#e05959",
      destructiveForeground: "#ffffff",
      border: "#22293d",
      input: "#22293d",
    },
  },
  espresso: {
    light: {
      background: "#f4f0ec",
      foreground: "#1c1410",
      card: "#ffffff",
      cardForeground: "#1c1410",
      primary: "#3a2a20",
      primaryForeground: "#ffffff",
      secondary: "#e0d6cc",
      secondaryForeground: "#3a2a20",
      muted: "#ebe3da",
      mutedForeground: "#6e5e50",
      accent: "#6e5044",
      accentForeground: "#ffffff",
      destructive: "#c44444",
      destructiveForeground: "#ffffff",
      border: "#c8bcb0",
      input: "#c8bcb0",
    },
    dark: {
      background: "#000000",
      foreground: "#f0e4d8",
      card: "#0e0a07",
      cardForeground: "#f0e4d8",
      primary: "#b89880",
      primaryForeground: "#000000",
      secondary: "#1a120c",
      secondaryForeground: "#d4b89c",
      muted: "#0a0604",
      mutedForeground: "#998877",
      accent: "#b89880",
      accentForeground: "#000000",
      destructive: "#e05959",
      destructiveForeground: "#ffffff",
      border: "#1f160f",
      input: "#1f160f",
    },
  },
};

export function buildPalette(
  mode: "light" | "dark",
  accentName: AccentName,
): Palette {
  return PALETTES[accentName][mode];
}

export const RADIUS = 16;
