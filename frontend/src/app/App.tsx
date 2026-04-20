import { useState } from "react";

import { HomePage } from "../features/home/HomePage";
import { GlobalTasksPage } from "../features/tasks/GlobalTasksPage";

type AppView = "today" | "tasks";

export function App() {
  const [activeView, setActiveView] = useState<AppView>("today");

  return (
    <>
      <header className="app-chrome">
        <nav className="app-nav" aria-label="Primary">
          <button
            className={activeView === "today" ? "nav-tab nav-tab--active" : "nav-tab"}
            onClick={() => setActiveView("today")}
            type="button"
          >
            Today
          </button>
          <button
            className={activeView === "tasks" ? "nav-tab nav-tab--active" : "nav-tab"}
            onClick={() => setActiveView("tasks")}
            type="button"
          >
            Global Tasks
          </button>
        </nav>
      </header>
      {activeView === "today" ? <HomePage /> : <GlobalTasksPage />}
    </>
  );
}
