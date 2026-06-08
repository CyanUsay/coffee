import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import CafeJournal from "./CafeJournal.jsx";
import { migrateLocalToCloud } from "./migrate.js";

function start() {
  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <CafeJournal />
    </StrictMode>
  );
}

// 先尝试把本机旧日志合并到云端（一次性、出错也不阻塞），再渲染 app。
migrateLocalToCloud().finally(start);
