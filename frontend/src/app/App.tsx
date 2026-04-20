import { useState } from "react";

import { CalendarPage } from "../features/calendar/CalendarPage";
import { ExperimentsPage } from "../features/experiments/ExperimentsPage";
import { HomePage } from "../features/home/HomePage";
import { JournalPage } from "../features/journal/JournalPage";
import { GlobalTasksPage } from "../features/tasks/GlobalTasksPage";
import { TaskDetailPage } from "../features/tasks/TaskDetailPage";

type AppView = "today" | "tasks" | "task-detail" | "experiments" | "journal" | "calendar";

const primaryViews: Array<{ value: AppView; label: string }> = [
  { value: "tasks", label: "Tasks" },
  { value: "journal", label: "Journal" }
];

const secondaryViews: Array<{ value: AppView; label: string }> = [
  { value: "today", label: "Today cockpit" },
  { value: "experiments", label: "Experiments" },
  { value: "calendar", label: "Calendar" }
];

export function App() {
  const [activeView, setActiveView] = useState<AppView>("tasks");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  function openTaskDetail(taskId: string) {
    setSelectedTaskId(taskId);
    setActiveView("task-detail");
  }

  return (
    <>
      <header className="app-chrome">
        <nav className="app-nav" aria-label="Primary">
          <div className="app-nav__primary">
            {primaryViews.map((view) => {
              const isActive =
                activeView === view.value ||
                (view.value === "tasks" && activeView === "task-detail");

              return (
                <button
                  className={isActive ? "nav-tab nav-tab--active" : "nav-tab"}
                  key={view.value}
                  onClick={() => setActiveView(view.value)}
                  type="button"
                >
                  {view.label}
                </button>
              );
            })}
          </div>
          <label className="nav-more">
            <span>More</span>
            <select
              onChange={(event) => {
                if (event.target.value.length > 0) {
                  setActiveView(event.target.value as AppView);
                }
              }}
              value={
                secondaryViews.some((view) => view.value === activeView) ? activeView : ""
              }
            >
              <option value="">More views</option>
              {secondaryViews.map((view) => (
                <option key={view.value} value={view.value}>
                  {view.label}
                </option>
              ))}
            </select>
          </label>
        </nav>
      </header>
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
    </>
  );
}
