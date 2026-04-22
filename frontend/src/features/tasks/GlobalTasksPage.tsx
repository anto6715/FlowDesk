import {
  startTransition,
  type ChangeEvent,
  useDeferredValue,
  useEffect,
  useState
} from "react";

import {
  createTask,
  getActiveTask,
  listGitHubReferences,
  listMacroActivities,
  listTasks,
  startTask,
  switchTask,
  type GitHubReference,
  type MacroActivity,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type WaitingReason
} from "../../shared/api";
import { formatGitHubReference, QuickActionDialog, TaskCreateForm } from "../../shared/forms";
import { formatTaskStatus } from "../../shared/labels";

type TaskStatusFilter = "open" | TaskStatus;
type PriorityFilter = "all" | TaskPriority;
type WaitingFilter = "all" | WaitingReason;

interface GlobalTasksState {
  tasks: Task[];
  macroActivities: MacroActivity[];
  githubReferences: GitHubReference[];
  activeTaskId: string | null;
  syncedAt: Date | null;
}

interface GlobalTasksPageProps {
  onOpenTask: (taskId: string) => void;
}

const initialState: GlobalTasksState = {
  tasks: [],
  macroActivities: [],
  githubReferences: [],
  activeTaskId: null,
  syncedAt: null
};

const taskStatusFilters: Array<{ value: TaskStatusFilter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "inbox", label: "Backlog" },
  { value: "ready", label: "Ready" },
  { value: "in_progress", label: "Active" },
  { value: "waiting", label: "Waiting" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
  { value: "archived", label: "Archived" }
];

const priorityFilters: Array<{ value: PriorityFilter; label: string }> = [
  { value: "all", label: "All priorities" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" }
];

const waitingFilters: Array<{ value: WaitingFilter; label: string }> = [
  { value: "all", label: "All waiting reasons" },
  { value: "experiment_running", label: "Experiment running" },
  { value: "experiment_stalled", label: "Experiment stalled" },
  { value: "pr_feedback", label: "PR feedback" },
  { value: "issue_feedback", label: "Issue feedback" },
  { value: "external_contribution", label: "External contribution" },
  { value: "researcher_input", label: "Researcher input" },
  { value: "other", label: "Other" }
];

function formatDateTime(iso: string | null) {
  if (iso === null) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));
}

function waitingLabel(value: WaitingReason | null) {
  return value === null ? "none" : value.replace(/_/g, " ");
}

function countByStatus(tasks: Task[], status: TaskStatus) {
  return tasks.filter((task) => task.status === status).length;
}

export function GlobalTasksPage({ onOpenTask }: GlobalTasksPageProps) {
  const [state, setState] = useState<GlobalTasksState>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>("open");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [waitingFilter, setWaitingFilter] = useState<WaitingFilter>("all");
  const [macroActivityFilter, setMacroActivityFilter] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  async function loadGlobalTasks() {
    setIsLoading(true);
    try {
      const [tasks, macroActivities, githubReferences, activeTask] = await Promise.all([
        listTasks(),
        listMacroActivities(),
        listGitHubReferences(),
        getActiveTask()
      ]);
      startTransition(() => {
        setState({
          tasks,
          macroActivities,
          githubReferences,
          activeTaskId: activeTask.task?.id ?? null,
          syncedAt: new Date()
        });
        setError(null);
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load tasks.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadGlobalTasks();
  }, []);

  const macroActivityLookup = new Map(
    state.macroActivities.map((macroActivity) => [macroActivity.id, macroActivity])
  );
  const githubReferenceLookup = new Map(
    state.githubReferences.map((githubReference) => [githubReference.id, githubReference])
  );
  const usedGithubReferenceIds = new Set(
    state.tasks.flatMap((task) => (task.github_reference_id ? [task.github_reference_id] : []))
  );
  const filteredTasks = state.tasks.filter((task) => {
    const description = task.description ?? "";
    const macroActivityName = task.macro_activity_id
      ? macroActivityLookup.get(task.macro_activity_id)?.name ?? ""
      : "";
    const githubReference = task.github_reference_id
      ? githubReferenceLookup.get(task.github_reference_id)
      : null;
    const githubLabel = githubReference ? formatGitHubReference(githubReference) : "";
    const searchText =
      `${task.title} ${description} ${macroActivityName} ${githubLabel}`.toLowerCase();
    const queryMatches =
      deferredQuery.trim().length === 0 ||
      searchText.includes(deferredQuery.trim().toLowerCase());
    const statusMatches =
      statusFilter === "open"
        ? !["done", "archived"].includes(task.status)
        : task.status === statusFilter;
    const priorityMatches = priorityFilter === "all" || task.priority === priorityFilter;
    const waitingMatches =
      waitingFilter === "all" || task.waiting_reason === waitingFilter;
    const macroActivityMatches =
      macroActivityFilter === "all" ||
      (macroActivityFilter === "none"
        ? task.macro_activity_id === null
        : task.macro_activity_id === macroActivityFilter);

    return (
      queryMatches &&
      statusMatches &&
      priorityMatches &&
      waitingMatches &&
      macroActivityMatches
    );
  });

  function handleStatusFilterChange(event: ChangeEvent<HTMLSelectElement>) {
    setStatusFilter(event.target.value as TaskStatusFilter);
  }

  async function handleBeginTask(taskId: string) {
    setBusyTaskId(taskId);
    try {
      if (state.activeTaskId && state.activeTaskId !== taskId) {
        await switchTask(state.activeTaskId, taskId);
      } else if (!state.activeTaskId) {
        await startTask(taskId);
      }
      await loadGlobalTasks();
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "Failed to start task.");
    } finally {
      setBusyTaskId(null);
    }
  }

  const backlogTasks = state.tasks.filter((task) => task.status === "inbox");
  const readyTasks = state.tasks.filter((task) => task.status === "ready");
  const waitingTasks = state.tasks.filter((task) => task.status === "waiting");
  const blockedTasks = state.tasks.filter((task) => task.status === "blocked");
  const workflowLanes: Array<{ label: string; tasks: Task[]; empty: string }> = [
    { label: "Backlog", tasks: backlogTasks, empty: "No backlog tasks." },
    { label: "Ready", tasks: readyTasks, empty: "No ready tasks." },
    { label: "Waiting", tasks: waitingTasks, empty: "No waiting tasks." },
    { label: "Blocked", tasks: blockedTasks, empty: "No blocked tasks." }
  ];

  return (
    <main className="page-shell">
      <section className="hero hero--compact task-page-hero">
        <div>
          <p className="eyebrow">Global tasks</p>
          <h1>Task load</h1>
        </div>
        <div className="task-hero-actions">
          <div className="sync-chip sync-chip--quiet">
            <span>{isLoading ? "Loading..." : "Local task index"}</span>
            <strong>
              {state.syncedAt ? formatDateTime(state.syncedAt.toISOString()) : "Sync pending"}
            </strong>
          </div>
          <button
            className="button button--accent button--round"
            onClick={() => setIsCreateDialogOpen(true)}
            type="button"
          >
            + Task
          </button>
        </div>
      </section>

      <section className="task-count-strip" aria-label="Global task counts">
        <article>
          <span>Backlog</span>
          <strong className="big-number">{backlogTasks.length}</strong>
        </article>
        <article>
          <span>Ready</span>
          <strong className="big-number">{readyTasks.length}</strong>
        </article>
        <article>
          <span>Waiting</span>
          <strong className="big-number">{countByStatus(state.tasks, "waiting")}</strong>
        </article>
      </section>

      <section className="task-lane-grid" aria-label="Task workflow lanes">
        {workflowLanes.map((lane) => (
          <article className="task-lane" key={lane.label}>
            <div className="task-lane__header">
              <span>{lane.label}</span>
              <strong>{lane.tasks.length}</strong>
            </div>
            {lane.tasks.length > 0 ? (
              <ul>
                {lane.tasks.slice(0, 3).map((task) => (
                  <li key={task.id}>
                    <button onClick={() => onOpenTask(task.id)} type="button">
                      <strong>{task.title}</strong>
                      <span>{task.priority}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{lane.empty}</p>
            )}
          </article>
        ))}
      </section>

      <section className="panel panel--wide task-list-panel">
        <div className="panel-header">
          <div>
            <p className="section-kicker">Task index</p>
            <h2>{filteredTasks.length} tasks shown</h2>
          </div>
          <label className="search-field">
            <span>Search</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Title, macro-activity, issue, or notes"
              value={query}
            />
          </label>
        </div>

        <div className="filter-grid" aria-label="Task filters">
          <label>
            <span>Status</span>
            <select onChange={handleStatusFilterChange} value={statusFilter}>
              {taskStatusFilters.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Priority</span>
            <select
              onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
              value={priorityFilter}
            >
              {priorityFilters.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Waiting</span>
            <select
              onChange={(event) => setWaitingFilter(event.target.value as WaitingFilter)}
              value={waitingFilter}
            >
              {waitingFilters.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Macro</span>
            <select
              onChange={(event) => setMacroActivityFilter(event.target.value)}
              value={macroActivityFilter}
            >
              <option value="all">All macro-activities</option>
              <option value="none">No macro-activity</option>
              {state.macroActivities.map((macroActivity) => (
                <option key={macroActivity.id} value={macroActivity.id}>
                  {macroActivity.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? <div className="banner banner--error">{error}</div> : null}
        {isLoading ? <div className="banner">Loading tasks...</div> : null}

        <div className="table-frame">
          <table className="task-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>State</th>
                <th>References</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task) => {
                const macroActivity = task.macro_activity_id
                  ? macroActivityLookup.get(task.macro_activity_id)
                  : null;
                const githubReference = task.github_reference_id
                  ? githubReferenceLookup.get(task.github_reference_id)
                  : null;
                const isActiveTask = state.activeTaskId === task.id;
                const isTaskBusy = busyTaskId === task.id;

                return (
                  <tr key={task.id}>
                    <td data-label="Task">
                      <button
                        className="task-title-button"
                        onClick={() => onOpenTask(task.id)}
                        type="button"
                      >
                        {task.title}
                      </button>
                      <span>{task.description || "No description"}</span>
                    </td>
                    <td data-label="State">
                      <div className="pill-row pill-row--tight">
                        <span className={`pill pill--${task.status}`}>
                          {formatTaskStatus(task.status)}
                        </span>
                        <span className={`pill pill--priority-${task.priority}`}>
                          {task.priority}
                        </span>
                      </div>
                      <span>Waiting: {waitingLabel(task.waiting_reason)}</span>
                    </td>
                    <td data-label="References">
                      <span>{macroActivity?.name ?? "No macro-activity"}</span>
                      <span>
                        {githubReference ? (
                          <a
                            className="text-link"
                            href={githubReference.issue_url}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {formatGitHubReference(githubReference)}
                          </a>
                        ) : (
                          "No GitHub reference"
                        )}
                      </span>
                    </td>
                    <td data-label="Updated">{formatDateTime(task.updated_at)}</td>
                    <td data-label="Actions">
                      <div className="table-actions table-actions--compact">
                        {!["done", "archived"].includes(task.status) ? (
                          <button
                            className={
                              isActiveTask
                                ? "button button--inactive button--small"
                                : "button button--accent button--small"
                            }
                            disabled={busyTaskId !== null || isActiveTask}
                            onClick={() => void handleBeginTask(task.id)}
                            type="button"
                          >
                            {isActiveTask
                              ? "Active"
                              : isTaskBusy
                                ? "Working..."
                                : state.activeTaskId
                                ? "Switch"
                                : "Start"}
                          </button>
                        ) : null}
                        <button
                          className="button button--ghost button--small"
                          onClick={() => onOpenTask(task.id)}
                          type="button"
                        >
                          Detail
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {isCreateDialogOpen ? (
        <QuickActionDialog
          kicker="Create task"
          onClose={() => setIsCreateDialogOpen(false)}
          title="New task"
          wide
        >
          <TaskCreateForm
            githubReferences={state.githubReferences}
            macroActivities={state.macroActivities}
            onCancel={() => setIsCreateDialogOpen(false)}
            onCreateTask={async (input) => {
              await createTask(input);
            }}
            onCreated={() => {
              setIsCreateDialogOpen(false);
              void loadGlobalTasks();
            }}
            onError={setError}
            unavailableGithubReferenceIds={usedGithubReferenceIds}
          />
        </QuickActionDialog>
      ) : null}
    </main>
  );
}
