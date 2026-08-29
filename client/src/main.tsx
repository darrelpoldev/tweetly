import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import "./styles.css";
import { initializeTheme } from "./theme.js";

const initialTheme = initializeTheme(
  window,
  document.documentElement,
);

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App initialTheme={initialTheme} />
  </StrictMode>,
);
