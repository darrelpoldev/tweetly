import assert from "node:assert/strict";
import test from "node:test";

import {
  THEME_STORAGE_KEY,
  getThemeTogglePresentation,
  initializeTheme,
  oppositeOfCurrent,
  toggleTheme,
  type ThemeStorageReaderProvider,
  type ThemeStorageWriterProvider,
} from "../../client/src/theme.js";

function throwStorageError(): never {
  throw new Error("browser storage unavailable");
}

test("applies stored dark theme and falls back to light", () => {
  const attributes = new Map<string, string>();
  const root = { setAttribute: attributes.set.bind(attributes) };
  const darkThemeStorage = new Map([[THEME_STORAGE_KEY, "dark"]]);

  const darkTheme = initializeTheme(
    {
      localStorage: { getItem: darkThemeStorage.get.bind(darkThemeStorage) },
    },
    root,
  );
  assert.equal(darkTheme, "dark");
  assert.equal(attributes.get("data-theme"), "dark");

  const emptyStorage = new Map<string, string>();
  const missingThemeStorage: ThemeStorageReaderProvider = {
    localStorage: { getItem: emptyStorage.get.bind(emptyStorage) },
  };
  assert.equal(initializeTheme(missingThemeStorage, root), "light");

  const invalidStorage = new Map([[THEME_STORAGE_KEY, "invalid"]]);
  const invalidThemeStorage = {
    localStorage: { getItem: invalidStorage.get.bind(invalidStorage) },
  };
  assert.equal(initializeTheme(invalidThemeStorage, root), "light");

  assert.equal(
    initializeTheme({ localStorage: { getItem: throwStorageError } }, root),
    "light",
  );
  assert.equal(attributes.get("data-theme"), "light");

  const deniedStorageProvider = new Proxy<ThemeStorageReaderProvider>(
    { localStorage: { getItem: throwStorageError } },
    { get: throwStorageError },
  );
  assert.equal(initializeTheme(deniedStorageProvider, root), "light");
  assert.equal(attributes.get("data-theme"), "light");
});

test("switches to the opposite theme and persists it", () => {
  assert.equal(oppositeOfCurrent("light"), "dark");
  assert.equal(oppositeOfCurrent("dark"), "light");

  const attributes = new Map<string, string>();
  const storageValues = new Map<string, string>();
  const nextTheme = toggleTheme(
    "light",
    {
      localStorage: { setItem: storageValues.set.bind(storageValues) },
    },
    { setAttribute: attributes.set.bind(attributes) },
  );

  assert.equal(nextTheme, "dark");
  assert.equal(attributes.get("data-theme"), "dark");
  assert.equal(storageValues.get(THEME_STORAGE_KEY), "dark");

  const sessionOnlyTheme = toggleTheme(
    "dark",
    { localStorage: { setItem: throwStorageError } },
    { setAttribute: attributes.set.bind(attributes) },
  );
  assert.equal(sessionOnlyTheme, "light");
  assert.equal(attributes.get("data-theme"), "light");

  const deniedStorageProvider = new Proxy<ThemeStorageWriterProvider>(
    { localStorage: { setItem: throwStorageError } },
    { get: throwStorageError },
  );
  const deniedStorageTheme = toggleTheme(
    "light",
    deniedStorageProvider,
    { setAttribute: attributes.set.bind(attributes) },
  );
  assert.equal(deniedStorageTheme, "dark");
  assert.equal(attributes.get("data-theme"), "dark");
});

test("describes the destination theme with its label and icon", () => {
  assert.deepEqual(getThemeTogglePresentation("light"), {
    destinationTheme: "dark",
    label: "Switch to dark mode",
    icon: "☾",
  });
  assert.deepEqual(getThemeTogglePresentation("dark"), {
    destinationTheme: "light",
    label: "Switch to light mode",
    icon: "☀",
  });
});
