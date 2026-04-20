import { useState } from "react";

import { CalendarPage } from "../features/calendar/CalendarPage";
import { ExperimentsPage } from "../features/experiments/ExperimentsPage";
import { HomePage } from "../features/home/HomePage";
import { JournalPage } from "../features/journal/JournalPage";
import { GlobalTasksPage } from "../features/tasks/GlobalTasksPage";

type AppView = "today" | "tasks" | "experiments" | "journal" | "calendar";

const appViews: Array<{ value: AppView; label: string }> = [
  { value: "today", label: "Today" },
  { value: "tasks", label: "Global Tasks" },
  { value: "experiments", label: "Experiments" },
  { value: "journal", label: "Journal" },
  { value: "calendar", label: "Calendar" }
];

export function App() {
  const [activeView, setActiveView] = useState<AppView>("today");

  return (
    <>
      <header className="app-chrome">
        <nav className="app-nav" aria-label="Primary">
          {appViews.map((view) => (
            <button
              className={activeView === view.value ? "nav-tab nav-tab--active" : "nav-tab"}
              key={view.value}
              onClick={() => setActiveView(view.value)}
              type="button"
            >
              {view.label}
            </button>
          ))}
        </nav>
      </header>
      {activeView === "today" ? <HomePage /> : null}
      {activeView === "tasks" ? <GlobalTasksPage /> : null}
      {activeView === "experiments" ? <ExperimentsPage /> : null}
      {activeView === "journal" ? <JournalPage /> : null}
      {activeView === "calendar" ? <CalendarPage /> : null}
    </>
  );
}
