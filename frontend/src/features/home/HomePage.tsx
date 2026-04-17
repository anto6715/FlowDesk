import {
  startTransition,
  type FormEvent,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState
} from "react";

import {
  createTask,
  getActiveTask,
  listTasks,
  pauseTask,
  startTask,
  switchTask,
  type Task,
  type TaskPriority,
  type WaitingReason
} from "../../shared/api";

const waitingOptions: Array<{ value: WaitingReason; label: string }> = [
  { value: "experiment_running", label: "Experiment running" },
  { value: "experiment_stalled", label: "Experiment stalled" },
  { value: "pr_feedback", label: "Waiting PR feedback" },
  { value: "issue_feedback", label: "Waiting issue feedback" },
  { value: "external_contribution", label: "Waiting external contribution" },
  { value: "researcher_input", label: "Waiting researcher input" },
  { value: "other", label: "Other" }
];

const priorityOptions: Array<{ value: TaskPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" }
];

interface DashboardState {
  tasks: Task[];
  activeTask: Task | null;
  activeSessionStartedAt: string | null;
  syncedAt: Date | null;
}

const initialState: DashboardState = {
  tasks: [],
  activeTask: null,
  activeSessionStartedAt: null,
  syncedAt: null
};

function countByStatus(tasks: Task[], status: Task["status"]) {
  return tasks.filter((task) => task.status === status).length;
}

function formatDateTime(iso: string | null) {
  if (iso === null) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));
}

function formatElapsed(startedAt: string | null) {
  if (startedAt === null) {
    return "00h 00m";
  }

  const elapsedMs = Math.max(Date.now() - new Date(startedAt).getTime(), 0);
  const totalMinutes = Math.floor(elapsedMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
}

function statusLabel(status: Task["status"]) {
  return status.replace(/_/g, " ");
}

function waitingLabel(value: WaitingReason | null) {
  if (value === null) {
    return "none";
  }

  return value.replace(/_/g, " ");
}

export function HomePage() {
  const [dashboard, setDashboard] = useState<DashboardState>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createPriority, setCreatePriority] = useState<TaskPriority>("normal");
  const [waitingReason, setWaitingReason] = useState<WaitingReason>("experiment_running");
  const deferredQuery = useDeferredValue(query);

  async function loadDashboard(options?: { background?: boolean }) {
    if (options?.background) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const [tasks, active] = await Promise.all([listTasks(), getActiveTask()]);
      startTransition(() => {
        setDashboard({
          tasks,
          activeTask: active.task,
          activeSessionStartedAt: active.work_session?.started_at ?? null,
          syncedAt: new Date()
        });
        setError(null);
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load Flow Desk.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  const refreshFromEffect = useEffectEvent(() => {
    void loadDashboard({ background: true });
  });

  useEffect(() => {
    void loadDashboard();
    const intervalId = window.setInterval(() => {
      refreshFromEffect();
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, []);

  const filteredTasks = (() => {
    const search = deferredQuery.trim().toLowerCase();
    if (search.length === 0) {
      return dashboard.tasks;
    }

    return dashboard.tasks.filter((task) => {
      const description = task.description ?? "";
      return `${task.title} ${description}`.toLowerCase().includes(search);
    });
  })();

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createTitle.trim().length === 0) {
      setError("Task title is required.");
      return;
    }

    setIsCreating(true);
    try {
      await createTask({
        title: createTitle.trim(),
        description: createDescription.trim() || undefined,
        priority: createPriority
      });
      setCreateTitle("");
      setCreateDescription("");
      setCreatePriority("normal");
      await loadDashboard({ background: true });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create task.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleStartTask(taskId: string) {
    setBusyTaskId(taskId);
    try {
      await startTask(taskId);
      await loadDashboard({ background: true });
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "Failed to start task.");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleSwitchTask(toTaskId: string) {
    if (dashboard.activeTask === null) {
      return;
    }

    setBusyTaskId(toTaskId);
    try {
      await switchTask(dashboard.activeTask.id, toTaskId);
      await loadDashboard({ background: true });
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "Failed to switch task.");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handlePauseActiveTask(mode: "pause" | "waiting" | "complete") {
    if (dashboard.activeTask === null) {
      return;
    }

    setBusyTaskId(dashboard.activeTask.id);
    try {
      if (mode === "waiting") {
        await pauseTask(dashboard.activeTask.id, {
          end_reason: "waiting",
          waiting_reason: waitingReason
        });
      } else if (mode === "complete") {
        await pauseTask(dashboard.activeTask.id, {
          end_reason: "completed"
        });
      } else {
        await pauseTask(dashboard.activeTask.id, {
          end_reason: "paused"
        });
      }

      await loadDashboard({ background: true });
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "Failed to update active task.");
    } finally {
      setBusyTaskId(null);
    }
  }

  const openTasks = dashboard.tasks.filter((task) => !["done", "archived"].includes(task.status));
  const activeTaskId = dashboard.activeTask?.id ?? null;

  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <p className="eyebrow">Today cockpit</p>
          <h1>Flow Desk</h1>
        </div>
        <div className="sync-chip">
          <span>{isRefreshing ? "Refreshing..." : "Live local state"}</span>
          <strong>{dashboard.syncedAt ? formatDateTime(dashboard.syncedAt.toISOString()) : "Sync pending"}</strong>
        </div>
      </section>

      <section className="summary-grid" aria-label="Current task summary">
        <article className="summary-card summary-card--spotlight">
          <p className="section-kicker">Active task</p>
          {dashboard.activeTask ? (
            <>
              <h2>{dashboard.activeTask.title}</h2>
              <p className="summary-copy">
                {dashboard.activeTask.description || "No description yet. Use notes and links later to expand the execution context."}
              </p>
              <div className="pill-row">
                <span className={`pill pill--${dashboard.activeTask.status}`}>{statusLabel(dashboard.activeTask.status)}</span>
                <span className={`pill pill--priority-${dashboard.activeTask.priority}`}>
                  {dashboard.activeTask.priority}
                </span>
              </div>
              <div className="stat-strip">
                <div>
                  <span>Started</span>
                  <strong>{formatDateTime(dashboard.activeSessionStartedAt)}</strong>
                </div>
                <div>
                  <span>Elapsed</span>
                  <strong>{formatElapsed(dashboard.activeSessionStartedAt)}</strong>
                </div>
                <div>
                  <span>Waiting reason</span>
                  <strong>{waitingLabel(dashboard.activeTask.waiting_reason)}</strong>
                </div>
              </div>
              <div className="action-row">
                <button
                  className="button button--ghost"
                  disabled={busyTaskId === dashboard.activeTask.id}
                  onClick={() => void handlePauseActiveTask("pause")}
                  type="button"
                >
                  Pause
                </button>
                <button
                  className="button button--accent"
                  disabled={busyTaskId === dashboard.activeTask.id}
                  onClick={() => void handlePauseActiveTask("complete")}
                  type="button"
                >
                  Complete
                </button>
              </div>
              <div className="waiting-bar">
                <label>
                  <span>Move to waiting</span>
                  <select
                    onChange={(event) => setWaitingReason(event.target.value as WaitingReason)}
                    value={waitingReason}
                  >
                    {waitingOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button button--warning"
                  disabled={busyTaskId === dashboard.activeTask.id}
                  onClick={() => void handlePauseActiveTask("waiting")}
                  type="button"
                >
                  Wait
                </button>
              </div>
            </>
          ) : (
            <>
              <h2>No task is active</h2>
              <p className="summary-copy">
                Pick a task from the deck below or create a new one. The one-active-task rule is enforced by the backend.
              </p>
              <div className="empty-ribbon">Open tasks ready to start: {openTasks.length}</div>
            </>
          )}
        </article>

        <article className="summary-card">
          <p className="section-kicker">Operational pulse</p>
          <ul className="metric-list">
            <li>
              <span>Open</span>
              <strong>{openTasks.length}</strong>
            </li>
            <li>
              <span>Waiting</span>
              <strong>{countByStatus(dashboard.tasks, "waiting")}</strong>
            </li>
            <li>
              <span>Blocked</span>
              <strong>{countByStatus(dashboard.tasks, "blocked")}</strong>
            </li>
            <li>
              <span>Done</span>
              <strong>{countByStatus(dashboard.tasks, "done")}</strong>
            </li>
          </ul>
        </article>

        <article className="summary-card">
          <p className="section-kicker">Create task</p>
          <form className="create-form" onSubmit={(event) => void handleCreateTask(event)}>
            <label>
              <span>Title</span>
              <input
                onChange={(event) => setCreateTitle(event.target.value)}
                placeholder="Investigate stalled coupled run"
                value={createTitle}
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                onChange={(event) => setCreateDescription(event.target.value)}
                placeholder="Capture what you need to do next, not the whole project context."
                rows={4}
                value={createDescription}
              />
            </label>
            <label>
              <span>Priority</span>
              <select
                onChange={(event) => setCreatePriority(event.target.value as TaskPriority)}
                value={createPriority}
              >
                {priorityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="button button--accent" disabled={isCreating} type="submit">
              {isCreating ? "Creating..." : "Create task"}
            </button>
          </form>
        </article>
      </section>

      <section className="panel panel--wide">
        <div className="panel-header">
          <div>
            <p className="section-kicker">Global tasks</p>
            <h2>One-shot view of the current workload</h2>
          </div>
          <label className="search-field">
            <span>Filter</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title or description"
              value={query}
            />
          </label>
        </div>

        {error ? <div className="banner banner--error">{error}</div> : null}
        {isLoading ? <div className="banner">Loading Flow Desk...</div> : null}

        <div className="task-grid">
          {filteredTasks.map((task) => {
            const isActive = task.id === activeTaskId;
            const canStart = activeTaskId === null && !["done", "archived"].includes(task.status);
            const canSwitch =
              activeTaskId !== null &&
              activeTaskId !== task.id &&
              !["done", "archived"].includes(task.status);

            return (
              <article className="task-card" key={task.id}>
                <div className="task-card__head">
                  <div>
                    <p className="task-card__title">{task.title}</p>
                    <p className="task-card__timestamp">
                      Updated {formatDateTime(task.updated_at)}
                    </p>
                  </div>
                  <div className="pill-row pill-row--tight">
                    <span className={`pill pill--${task.status}`}>{statusLabel(task.status)}</span>
                    <span className={`pill pill--priority-${task.priority}`}>{task.priority}</span>
                  </div>
                </div>

                <p className="task-card__description">
                  {task.description || "No task description yet."}
                </p>

                <div className="task-card__meta">
                  <span>Waiting: {waitingLabel(task.waiting_reason)}</span>
                  <span>Created: {formatDateTime(task.created_at)}</span>
                </div>

                <div className="task-card__actions">
                  {isActive ? (
                    <button className="button button--inactive" disabled type="button">
                      Active now
                    </button>
                  ) : null}
                  {canStart ? (
                    <button
                      className="button button--accent"
                      disabled={busyTaskId === task.id}
                      onClick={() => void handleStartTask(task.id)}
                      type="button"
                    >
                      {busyTaskId === task.id ? "Starting..." : "Start"}
                    </button>
                  ) : null}
                  {canSwitch ? (
                    <button
                      className="button button--ghost"
                      disabled={busyTaskId === task.id}
                      onClick={() => void handleSwitchTask(task.id)}
                      type="button"
                    >
                      {busyTaskId === task.id ? "Switching..." : "Switch here"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
