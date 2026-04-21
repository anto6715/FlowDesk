import {
  startTransition,
  type ChangeEvent,
  useDeferredValue,
  useEffect,
  useState
} from "react";

import {
  createTask,
  listGitHubReferences,
  listMacroActivities,
  listTasks,
  type GitHubReference,
  type MacroActivity,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type WaitingReason
} from "../../shared/api";
import { formatGitHubReference, TaskCreateForm } from "../../shared/forms";

type TaskStatusFilter = "open" | TaskStatus;
type PriorityFilter = "all" | TaskPriority;
type WaitingFilter = "all" | WaitingReason;

interface GlobalTasksState {
  tasks: Task[];
  macroActivities: MacroActivity[];
  githubReferences: GitHubReference[];
  syncedAt: Date | null;
}

interface GlobalTasksPageProps {
  onOpenTask: (taskId: string) => void;
}

const initialState: GlobalTasksState = {
  tasks: [],
  macroActivities: [],
  githubReferences: [],
  syncedAt: null
};

const taskStatusFilters: Array<{ value: TaskStatusFilter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "inbox", label: "Inbox" },
  { value: "ready", label: "Ready" },
  { value: "in_progress", label: "In progress" },
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

function statusLabel(status: TaskStatus) {
  return status.replace(/_/g, " ");
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
  const deferredQuery = useDeferredValue(query);

  async function loadGlobalTasks() {
    setIsLoading(true);
    try {
      const [tasks, macroActivities, githubReferences] = await Promise.all([
        listTasks(),
        listMacroActivities(),
        listGitHubReferences()
      ]);
      startTransition(() => {
        setState({
          tasks,
          macroActivities,
          githubReferences,
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

  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <p className="eyebrow">Global tasks</p>
          <h1>Task load</h1>
        </div>
        <div className="sync-chip">
          <span>{isLoading ? "Loading..." : "Local task index"}</span>
          <strong>{state.syncedAt ? formatDateTime(state.syncedAt.toISOString()) : "Sync pending"}</strong>
        </div>
      </section>

      <section className="summary-grid summary-grid--tasks" aria-label="Global task counts">
        <article className="summary-card">
          <p className="section-kicker">Open</p>
          <strong className="big-number">
            {state.tasks.filter((task) => !["done", "archived"].includes(task.status)).length}
          </strong>
        </article>
        <article className="summary-card">
          <p className="section-kicker">Waiting</p>
          <strong className="big-number">{countByStatus(state.tasks, "waiting")}</strong>
        </article>
        <article className="summary-card">
          <p className="section-kicker">Urgent</p>
          <strong className="big-number">
            {state.tasks.filter((task) => task.priority === "urgent").length}
          </strong>
        </article>
      </section>

      <section className="panel panel--wide">
        <div className="panel-header">
          <div>
            <p className="section-kicker">Create task</p>
            <h2>New task</h2>
          </div>
        </div>

        <TaskCreateForm
          className="create-form create-form--tasks"
          githubReferences={state.githubReferences}
          macroActivities={state.macroActivities}
          onCreateTask={async (input) => {
            await createTask(input);
          }}
          onCreated={() => {
            void loadGlobalTasks();
          }}
          onError={setError}
          unavailableGithubReferenceIds={usedGithubReferenceIds}
        />
      </section>

      <section className="panel panel--wide">
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
                <th>Status</th>
                <th>Priority</th>
                <th>Macro</th>
                <th>GitHub</th>
                <th>Waiting</th>
                <th>Updated</th>
                <th>Open</th>
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

                return (
                  <tr key={task.id}>
                    <td>
                      <strong>{task.title}</strong>
                      <span>{task.description || "No description"}</span>
                    </td>
                    <td>
                      <span className={`pill pill--${task.status}`}>
                        {statusLabel(task.status)}
                      </span>
                    </td>
                    <td>
                      <span className={`pill pill--priority-${task.priority}`}>
                        {task.priority}
                      </span>
                    </td>
                    <td>{macroActivity?.name ?? "None"}</td>
                    <td>
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
                        "None"
                      )}
                    </td>
                    <td>{waitingLabel(task.waiting_reason)}</td>
                    <td>{formatDateTime(task.updated_at)}</td>
                    <td>
                      <button
                        className="button button--ghost button--small"
                        onClick={() => onOpenTask(task.id)}
                        type="button"
                      >
                        Detail
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
