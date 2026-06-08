import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import CafeJournal from "./CafeJournal.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <CafeJournal />
  </StrictMode>
);
