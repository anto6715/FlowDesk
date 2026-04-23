import { useState } from "react";

import { CalendarPage } from "../features/calendar/CalendarPage";
import { ExperimentDetailPage } from "../features/experiments/ExperimentDetailPage";
import { ExperimentsPage } from "../features/experiments/ExperimentsPage";
import { HomePage } from "../features/home/HomePage";
import { JournalPage } from "../features/journal/JournalPage";
import { TagDetailPage } from "../features/journal/TagDetailPage";
import { GlobalTasksPage } from "../features/tasks/GlobalTasksPage";
import { TaskDetailPage } from "../features/tasks/TaskDetailPage";

type AppView =
  | "today"
  | "tasks"
  | "task-detail"
  | "experiments"
  | "experiment-detail"
  | "journal"
  | "tag-detail"
  | "calendar";

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
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(null);
  const [selectedTagName, setSelectedTagName] = useState<string | null>(null);
  const [experimentBackView, setExperimentBackView] = useState<AppView>("experiments");
  const [tagBackView, setTagBackView] = useState<AppView>("journal");

  function openTaskDetail(taskId: string) {
    setSelectedTaskId(taskId);
    setActiveView("task-detail");
  }

  function openExperimentDetail(experimentId: string) {
    setExperimentBackView(activeView === "experiment-detail" ? "experiments" : activeView);
    setSelectedExperimentId(experimentId);
    setActiveView("experiment-detail");
  }

  function openTagDetail(tagName: string) {
    if (activeView !== "tag-detail") {
      setTagBackView(activeView);
    }
    setSelectedTagName(tagName);
    setActiveView("tag-detail");
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
                (view.value === "tasks" && activeView === "task-detail") ||
                (view.value === "experiments" && activeView === "experiment-detail") ||
                (view.value === "journal" && activeView === "tag-detail");

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
        {activeView === "today" ? (
          <HomePage
            onOpenExperiment={openExperimentDetail}
            onOpenTag={openTagDetail}
            onOpenTask={openTaskDetail}
          />
        ) : null}
        {activeView === "tasks" ? <GlobalTasksPage onOpenTask={openTaskDetail} /> : null}
        {activeView === "task-detail" && selectedTaskId !== null ? (
          <TaskDetailPage
            onBack={() => {
              setActiveView("tasks");
            }}
            onOpenExperiment={openExperimentDetail}
            onOpenTag={openTagDetail}
            onOpenTask={openTaskDetail}
            taskId={selectedTaskId}
          />
        ) : null}
        {activeView === "experiments" ? (
          <ExperimentsPage
            onOpenExperiment={openExperimentDetail}
            onOpenTask={openTaskDetail}
          />
        ) : null}
        {activeView === "experiment-detail" && selectedExperimentId !== null ? (
          <ExperimentDetailPage
            experimentId={selectedExperimentId}
            onBack={() => {
              setActiveView(experimentBackView);
            }}
            onOpenExperiment={openExperimentDetail}
            onOpenTag={openTagDetail}
            onOpenTask={openTaskDetail}
          />
        ) : null}
        {activeView === "journal" ? (
          <JournalPage
            onOpenExperiment={openExperimentDetail}
            onOpenTag={openTagDetail}
            onOpenTask={openTaskDetail}
          />
        ) : null}
        {activeView === "tag-detail" && selectedTagName !== null ? (
          <TagDetailPage
            onBack={() => {
              setActiveView(tagBackView);
            }}
            onOpenExperiment={openExperimentDetail}
            onOpenTag={openTagDetail}
            onOpenTask={openTaskDetail}
            tagName={selectedTagName}
          />
        ) : null}
        {activeView === "calendar" ? <CalendarPage onOpenTask={openTaskDetail} /> : null}
      </div>
    </div>
  );
}
