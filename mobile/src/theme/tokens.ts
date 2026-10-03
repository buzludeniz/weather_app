export type ThemeMode = "light" | "dark";

export type AppTheme = {
  mode: ThemeMode;
  colors: {
    background: string;
    surface: string;
    surfaceAlt: string;
    text: string;
    mutedText: string;
    border: string;
    primary: string;
    secondary: string;
    accent: string;
    accentCyan: string;
    accentWarm: string;
    warning: string;
    danger: string;
    success: string;
    mapWater: string;
    mapLand: string;
    // Glassmorphism
    glass: string;
    glassBorder: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    pill: number;
  };
  typography: {
    xs: number;
    sm: number;
    base: number;
    lg: number;
    xl: number;
    xxl: number;
    hero: number;
  };
};

export const darkTheme: AppTheme = {
  mode: "dark",
  colors: {
    // Aligned with web design system (hsl(222,47%,6%) family)
    background:  "#060e1e",
    surface:     "#0d1a2d",
    surfaceAlt:  "#122038",
    text:        "#ddeeff",
    mutedText:   "#6e8bab",
    border:      "#1a2e45",
    primary:     "#3b9eff",   // hsl(210, 100%, 62%)
    secondary:   "#00d4ff",   // hsl(191, 100%, 55%)
    accent:      "#3b9eff",
    accentCyan:  "#00d4ff",
    accentWarm:  "#ffb340",   // hsl(38, 100%, 62%)
    warning:     "#ffb340",
    danger:      "#f06070",   // hsl(350, 80%, 60%)
    success:     "#34d399",   // hsl(142, 70%, 50%)
    mapWater:    "#265B68",
    mapLand:     "#405541",
    glass:       "rgba(255,255,255,0.055)",
    glassBorder: "rgba(255,255,255,0.10)",
  },
  spacing: {
    xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 36,
  },
  radius: {
    sm: 8, md: 14, lg: 20, pill: 999,
  },
  typography: {
    xs: 11, sm: 13, base: 15, lg: 17, xl: 20, xxl: 26, hero: 56,
  },
};

export const lightTheme: AppTheme = {
  mode: "light",
  colors: {
    background:  "#e8f0f8",
    surface:     "#f4f8fd",
    surfaceAlt:  "#dde8f5",
    text:        "#081a2e",
    mutedText:   "#4a6380",
    border:      "#c0d0e0",
    primary:     "#2563eb",
    secondary:   "#0ea5e9",
    accent:      "#2563eb",
    accentCyan:  "#0ea5e9",
    accentWarm:  "#d97706",
    warning:     "#d97706",
    danger:      "#dc2626",
    success:     "#16a34a",
    mapWater:    "#7AB7C9",
    mapLand:     "#DDE7D2",
    glass:       "rgba(0,0,0,0.05)",
    glassBorder: "rgba(0,0,0,0.12)",
  },
  spacing: darkTheme.spacing,
  radius:  darkTheme.radius,
  typography: darkTheme.typography,
};
