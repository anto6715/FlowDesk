import { useState } from "react";

import { CalendarPage } from "../features/calendar/CalendarPage";
import { ExperimentsPage } from "../features/experiments/ExperimentsPage";
import { HomePage } from "../features/home/HomePage";
import { JournalPage } from "../features/journal/JournalPage";
import { GlobalTasksPage } from "../features/tasks/GlobalTasksPage";
import { TaskDetailPage } from "../features/tasks/TaskDetailPage";

type AppView = "today" | "tasks" | "task-detail" | "experiments" | "journal" | "calendar";

const appViews: Array<{ value: AppView; label: string }> = [
  { value: "today", label: "Home" },
  { value: "tasks", label: "Tasks" },
  { value: "journal", label: "Journal" },
  { value: "experiments", label: "Experiments" },
  { value: "calendar", label: "Calendar" }
];

export function App() {
  const [activeView, setActiveView] = useState<AppView>("today");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  function openTaskDetail(taskId: string) {
    setSelectedTaskId(taskId);
    setActiveView("task-detail");
  }

  return (
    <div className="app-layout">
      <aside className="side-nav" aria-label="Primary">
        <div className="side-nav__brand">
          <span>Flow Desk</span>
        </div>
        <nav className="side-nav__items">
          {appViews.map((view) => {
              const isActive =
                activeView === view.value ||
                (view.value === "tasks" && activeView === "task-detail");

              return (
                <button
                  className={isActive ? "side-nav__item side-nav__item--active" : "side-nav__item"}
                  key={view.value}
                  onClick={() => setActiveView(view.value)}
                  type="button"
                >
                  {view.label}
                </button>
              );
            })}
        </nav>
      </aside>
      <div className="app-main">
        {activeView === "today" ? <HomePage /> : null}
        {activeView === "tasks" ? <GlobalTasksPage onOpenTask={openTaskDetail} /> : null}
        {activeView === "task-detail" && selectedTaskId !== null ? (
          <TaskDetailPage
            onBack={() => {
              setActiveView("tasks");
            }}
            taskId={selectedTaskId}
          />
        ) : null}
        {activeView === "experiments" ? <ExperimentsPage /> : null}
        {activeView === "journal" ? <JournalPage /> : null}
        {activeView === "calendar" ? <CalendarPage /> : null}
      </div>
    </div>
  );
}
