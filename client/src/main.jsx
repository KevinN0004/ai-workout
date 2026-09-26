import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { initErrorTracking } from "./app/errorTracking.js";
import "./styles/index.css";

// Before the first render, so a crash while mounting is held and reported once
// the SDK has loaded.
initErrorTracking();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
