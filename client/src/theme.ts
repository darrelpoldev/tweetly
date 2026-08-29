import { z } from "zod";

const themeSchema = z.enum(["light", "dark"]);

export const THEME_STORAGE_KEY = "tweetly-theme";

export type Theme = z.infer<typeof themeSchema>;

export interface ThemeStorageReader {
  getItem(key: string): unknown;
}

export interface ThemeStorageReaderProvider {
  readonly localStorage: ThemeStorageReader;
}

export interface ThemeStorageWriter {
  setItem(key: string, value: string): void;
}

export interface ThemeStorageWriterProvider {
  readonly localStorage: ThemeStorageWriter;
}

export interface ThemeRoot {
  setAttribute(name: string, value: string): void;
}

export interface ThemeTogglePresentation {
  destinationTheme: Theme;
  label: "Switch to dark mode" | "Switch to light mode";
  icon: "☾" | "☀";
}

export function readStoredTheme(
  storageProvider: ThemeStorageReaderProvider,
): Theme | null {
  try {
    const result = themeSchema.safeParse(
      storageProvider.localStorage.getItem(THEME_STORAGE_KEY),
    );
    return result.success ? result.data : null;
  } catch (_storageError: unknown) {
    return null;
  }
}

export function applyTheme(theme: Theme, root: ThemeRoot): void {
  root.setAttribute("data-theme", theme);
}

export function oppositeOfCurrent(theme: Theme): Theme {
  return theme === "light" ? "dark" : "light";
}

export function persistTheme(
  theme: Theme,
  storageProvider: ThemeStorageWriterProvider,
): void {
  try {
    storageProvider.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (_storageError: unknown) {
    return;
  }
}

export function getThemeTogglePresentation(
  theme: Theme,
): ThemeTogglePresentation {
  const destinationTheme = oppositeOfCurrent(theme);
  return destinationTheme === "dark"
    ? {
        destinationTheme,
        label: "Switch to dark mode",
        icon: "☾",
      }
    : {
        destinationTheme,
        label: "Switch to light mode",
        icon: "☀",
      };
}

export function toggleTheme(
  currentTheme: Theme,
  storageProvider: ThemeStorageWriterProvider,
  root: ThemeRoot,
): Theme {
  const nextTheme = oppositeOfCurrent(currentTheme);
  persistTheme(nextTheme, storageProvider);
  applyTheme(nextTheme, root);
  return nextTheme;
}

export function initializeTheme(
  storageProvider: ThemeStorageReaderProvider,
  root: ThemeRoot,
): Theme {
  const theme = readStoredTheme(storageProvider) ?? "light";
  applyTheme(theme, root);
  return theme;
}
