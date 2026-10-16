/**
 * The client's entry point, loaded by index.html: starts error tracking, then
 * renders App, inside the root error boundary, into #root under StrictMode.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import AppErrorBoundary from "./app/components/AppErrorBoundary.jsx";
import { initErrorTracking } from "./app/errorTracking.js";
import "./styles/index.css";

// Before the first render, so a crash while mounting is held and reported once
// the SDK has loaded.
initErrorTracking();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
