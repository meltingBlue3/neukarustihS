import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
// Before rendering: the browser offers installation and updates only once.
import "./pwa";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
