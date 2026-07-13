import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyStoredUiPreferences } from "./utils/uiPreferences";

import {
  ToastProvider
} from "./context/ToastContext";

import {
  LanguageProvider
} from "./context/LanguageContext";

applyStoredUiPreferences();

const root =
  ReactDOM.createRoot(
    document.getElementById("root")
  );

root.render(
  <LanguageProvider>
    <ToastProvider>
      <App />
    </ToastProvider>
  </LanguageProvider>
);
