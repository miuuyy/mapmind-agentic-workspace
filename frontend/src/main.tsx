import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { readInitialThemeMode } from "./lib/appStatePersistence";
import { ensureThemeStylesheet } from "./lib/themeStyles";
import "./styles.css";

ensureThemeStylesheet(readInitialThemeMode());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
