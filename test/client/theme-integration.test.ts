import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Window as HappyDomWindow } from "happy-dom";

import { App, ApplicationHeader, ThemeToggle } from "../../client/src/App.js";
import { THEME_STORAGE_KEY } from "../../client/src/theme.js";

const themeSpecificTokens = [
  "--color-canvas",
  "--color-panel",
  "--color-surface-subtle",
  "--color-surface-hover",
  "--color-header",
  "--color-text",
  "--color-text-muted",
  "--color-border",
  "--color-border-strong",
  "--color-action",
  "--color-action-hover",
  "--color-action-text",
  "--color-shadow",
  "--color-login-glow-primary",
  "--color-login-glow-secondary",
  "--color-cover-start",
  "--color-cover-middle",
  "--color-cover-end",
] as const;

const colorBearingPropertyPattern = /^(?:color|background(?:-color|-image)?|border|border-color|border-(?:top|right|bottom|left)(?:-color)?|outline|outline-color|box-shadow|text-shadow|fill|stroke)$/i;
const safeNonTokenColorValuePattern = /^(?:0|none|transparent|inherit|currentcolor)$/i;

function findUnsemanticColorDeclarations(styles: string): string[] {
  const violations: string[] = [];

  for (const match of styles.matchAll(/([-\w]+)\s*:\s*([^;{}]+);/g)) {
    const property = match[1];
    const value = match[2]?.trim();
    if (
      property === undefined ||
      value === undefined ||
      property.startsWith("--") ||
      !colorBearingPropertyPattern.test(property) ||
      safeNonTokenColorValuePattern.test(value) ||
      value.includes("var(--color-")
    ) {
      continue;
    }
    violations.push(`${property}: ${value}`);
  }

  return violations;
}

test("renders one accessible destination toggle in the application header", () => {
  const toggleCalls: string[] = [];
  const onToggle = toggleCalls.push.bind(toggleCalls, "toggle");
  const toggleElement = ThemeToggle({ theme: "light", onToggle });
  assert.equal(toggleElement.props.onClick, onToggle);
  toggleElement.props.onClick();
  assert.deepEqual(toggleCalls, ["toggle"]);

  const lightHeader = renderToStaticMarkup(
    createElement(ApplicationHeader, {
      theme: "light",
      onNavigateHome: assert.fail,
      onToggleTheme: assert.fail,
    }),
  );
  assert.match(lightHeader, /^<header class="sidebar-header">/);
  assert.equal((lightHeader.match(/class="theme-toggle"/g) ?? []).length, 1);
  assert.match(lightHeader, /aria-label="Switch to dark mode"/);
  assert.match(lightHeader, /title="Switch to dark mode"/);
  assert.match(lightHeader, /aria-hidden="true">☾<\/span>/);

  const darkHeader = renderToStaticMarkup(
    createElement(ApplicationHeader, {
      theme: "dark",
      onNavigateHome: assert.fail,
      onToggleTheme: assert.fail,
    }),
  );
  assert.match(darkHeader, /aria-label="Switch to light mode"/);
  assert.match(darkHeader, /title="Switch to light mode"/);
  assert.match(darkHeader, /aria-hidden="true">☀<\/span>/);
});

test("clicking the App theme toggle applies and persists the destination theme", async () => {
  const browserWindow = new HappyDomWindow({ url: "http://localhost" });
  browserWindow.document.body.innerHTML = '<div id="root"></div>';

  const globalNames = [
    "window",
    "document",
    "navigator",
    "Node",
    "HTMLElement",
    "HTMLButtonElement",
    "Event",
    "MouseEvent",
    "IS_REACT_ACT_ENVIRONMENT",
  ] as const;
  const originalGlobalDescriptors = new Map(
    globalNames.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: browserWindow },
    document: { configurable: true, value: browserWindow.document },
    navigator: { configurable: true, value: browserWindow.navigator },
    Node: { configurable: true, value: browserWindow.Node },
    HTMLElement: { configurable: true, value: browserWindow.HTMLElement },
    HTMLButtonElement: {
      configurable: true,
      value: browserWindow.HTMLButtonElement,
    },
    Event: { configurable: true, value: browserWindow.Event },
    MouseEvent: { configurable: true, value: browserWindow.MouseEvent },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    if (input === "/api/session") {
      return Response.json({
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          username: "admin",
          displayName: "Admin User",
        },
      });
    }
    if (input === "/api/feed") {
      return Response.json({ items: [], nextCursor: null });
    }
    return assert.fail(`unexpected request: ${String(input)}`);
  };

  const rootElement = document.getElementById("root");
  assert.ok(rootElement);
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(rootElement);

  try {
    await act(async () => {
      root.render(createElement(App, { initialTheme: "light" }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const toggle = Array.from(
      document.getElementsByTagName("button"),
    ).find(
      (button) => button.getAttribute("aria-label") === "Switch to dark mode",
    );
    assert.ok(toggle);

    await act(async () => toggle.click());

    assert.equal(
      document.documentElement.getAttribute("data-theme"),
      "dark",
    );
    assert.equal(browserWindow.localStorage.getItem(THEME_STORAGE_KEY), "dark");
    assert.equal(toggle.getAttribute("aria-label"), "Switch to light mode");
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    await browserWindow.happyDOM.close();
    for (const [name, descriptor] of originalGlobalDescriptors) {
      if (descriptor === undefined) {
        Reflect.deleteProperty(globalThis, name);
      } else {
        Object.defineProperty(globalThis, name, descriptor);
      }
    }
  }
});

test("keeps UI color literals inside complete semantic theme tokens", () => {
  const styles = readFileSync("client/src/styles.css", "utf8");
  assert.deepEqual(findUnsemanticColorDeclarations(styles), []);
  assert.deepEqual(
    findUnsemanticColorDeclarations(
      ".named { color: rebeccapurple; } .hsl { background: hsl(0 0% 0%); }",
    ),
    ["color: rebeccapurple", "background: hsl(0 0% 0%)"],
  );

  const darkThemeStart = styles.indexOf(':root[data-theme="dark"] {');
  const darkThemeEnd = styles.indexOf("\n}", darkThemeStart);
  assert.notEqual(darkThemeStart, -1);
  assert.notEqual(darkThemeEnd, -1);
  const darkThemeBlock = styles.slice(darkThemeStart, darkThemeEnd);

  for (const token of themeSpecificTokens) {
    assert.ok(darkThemeBlock.includes(`${token}:`), `${token} needs a dark value`);
  }
});
