import {
  startTransition,
  type ChangeEvent,
  type FormEvent,
  useDeferredValue,
  useEffect,
  useState
} from "react";

import {
  createGitHubReference,
  createMacroActivity,
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

type TaskStatusFilter = "open" | TaskStatus;
type PriorityFilter = "all" | TaskPriority;
type WaitingFilter = "all" | WaitingReason;
type CreateMacroActivityMode = "none" | "existing" | "new";
type CreateGitHubReferenceMode = "none" | "existing" | "new";

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

interface MacroActivityFormState {
  name: string;
  description: string;
  colorHex: string;
}

interface GitHubReferenceFormState {
  repositoryFullName: string;
  issueNumber: string;
  issueUrl: string;
  cachedTitle: string;
}

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

const priorityOptions: Array<{ value: TaskPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" }
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

function formatGitHubReference(reference: GitHubReference) {
  const title = reference.cached_title ? ` - ${reference.cached_title}` : "";
  return `${reference.repository_full_name}#${reference.issue_number}${title}`;
}

function inferGitHubIssueUrl(repositoryFullName: string, issueNumber: number) {
  return `https://github.com/${repositoryFullName}/issues/${issueNumber}`;
}

function countByStatus(tasks: Task[], status: TaskStatus) {
  return tasks.filter((task) => task.status === status).length;
}

export function GlobalTasksPage({ onOpenTask }: GlobalTasksPageProps) {
  const [state, setState] = useState<GlobalTasksState>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>("open");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [waitingFilter, setWaitingFilter] = useState<WaitingFilter>("all");
  const [macroActivityFilter, setMacroActivityFilter] = useState("all");
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createPriority, setCreatePriority] = useState<TaskPriority>("normal");
  const [createMacroActivityMode, setCreateMacroActivityMode] =
    useState<CreateMacroActivityMode>("none");
  const [createMacroActivityId, setCreateMacroActivityId] = useState("");
  const [createGitHubReferenceMode, setCreateGitHubReferenceMode] =
    useState<CreateGitHubReferenceMode>("none");
  const [createGitHubReferenceId, setCreateGitHubReferenceId] = useState("");
  const [macroActivityForm, setMacroActivityForm] = useState<MacroActivityFormState>({
    name: "",
    description: "",
    colorHex: "#0F6D61"
  });
  const [githubReferenceForm, setGitHubReferenceForm] =
    useState<GitHubReferenceFormState>({
      repositoryFullName: "",
      issueNumber: "",
      issueUrl: "",
      cachedTitle: ""
    });
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
  const availableGithubReferences = state.githubReferences.filter(
    (reference) => !usedGithubReferenceIds.has(reference.id)
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

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createTitle.trim().length === 0) {
      setError("Task title is required.");
      return;
    }

    setIsCreating(true);
    try {
      let macroActivityId: string | null = null;
      if (createMacroActivityMode === "existing") {
        if (createMacroActivityId.length === 0) {
          setError("Pick a macro-activity or choose a different macro mode.");
          return;
        }
        macroActivityId = createMacroActivityId;
      }
      if (createMacroActivityMode === "new") {
        if (macroActivityForm.name.trim().length === 0) {
          setError("Macro-activity name is required.");
          return;
        }
        const macroActivity = await createMacroActivity({
          name: macroActivityForm.name.trim(),
          description: macroActivityForm.description.trim() || undefined,
          color_hex: macroActivityForm.colorHex
        });
        macroActivityId = macroActivity.id;
      }

      let githubReferenceId: string | null = null;
      if (createGitHubReferenceMode === "existing") {
        if (createGitHubReferenceId.length === 0) {
          setError("Pick a GitHub reference or choose a different GitHub mode.");
          return;
        }
        githubReferenceId = createGitHubReferenceId;
      }
      if (createGitHubReferenceMode === "new") {
        const repositoryFullName = githubReferenceForm.repositoryFullName.trim();
        const issueNumber = Number.parseInt(githubReferenceForm.issueNumber, 10);

        if (repositoryFullName.length === 0) {
          setError("GitHub repository is required.");
          return;
        }
        if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
          setError("GitHub issue number must be a positive integer.");
          return;
        }

        const reference = await createGitHubReference({
          repository_full_name: repositoryFullName,
          issue_number: issueNumber,
          issue_url:
            githubReferenceForm.issueUrl.trim() ||
            inferGitHubIssueUrl(repositoryFullName, issueNumber),
          cached_title: githubReferenceForm.cachedTitle.trim() || undefined
        });
        githubReferenceId = reference.id;
      }

      await createTask({
        title: createTitle.trim(),
        description: createDescription.trim() || undefined,
        priority: createPriority,
        macro_activity_id: macroActivityId,
        github_reference_id: githubReferenceId
      });

      setCreateTitle("");
      setCreateDescription("");
      setCreatePriority("normal");
      setCreateMacroActivityMode("none");
      setCreateMacroActivityId("");
      setCreateGitHubReferenceMode("none");
      setCreateGitHubReferenceId("");
      setMacroActivityForm({
        name: "",
        description: "",
        colorHex: macroActivityForm.colorHex
      });
      setGitHubReferenceForm({
        repositoryFullName: "",
        issueNumber: "",
        issueUrl: "",
        cachedTitle: ""
      });
      await loadGlobalTasks();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create task.");
    } finally {
      setIsCreating(false);
    }
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

        <form className="create-form create-form--tasks" onSubmit={(event) => void handleCreateTask(event)}>
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
              placeholder="Capture the next concrete action."
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
          <label>
            <span>Macro-activity</span>
            <select
              onChange={(event) =>
                setCreateMacroActivityMode(event.target.value as CreateMacroActivityMode)
              }
              value={createMacroActivityMode}
            >
              <option value="none">No macro-activity</option>
              <option value="existing">Use existing</option>
              <option value="new">Create new</option>
            </select>
          </label>
          {createMacroActivityMode === "existing" ? (
            <label>
              <span>Existing macro-activity</span>
              <select
                onChange={(event) => setCreateMacroActivityId(event.target.value)}
                value={createMacroActivityId}
              >
                <option value="">Pick macro-activity</option>
                {state.macroActivities.map((macroActivity) => (
                  <option key={macroActivity.id} value={macroActivity.id}>
                    {macroActivity.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {createMacroActivityMode === "new" ? (
            <div className="embedded-form-grid">
              <label>
                <span>New macro name</span>
                <input
                  onChange={(event) =>
                    setMacroActivityForm((current) => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                  placeholder="Coupled model runs"
                  value={macroActivityForm.name}
                />
              </label>
              <label>
                <span>Description</span>
                <input
                  onChange={(event) =>
                    setMacroActivityForm((current) => ({
                      ...current,
                      description: event.target.value
                    }))
                  }
                  placeholder="Optional scope note"
                  value={macroActivityForm.description}
                />
              </label>
              <label>
                <span>Color</span>
                <input
                  onChange={(event) =>
                    setMacroActivityForm((current) => ({
                      ...current,
                      colorHex: event.target.value
                    }))
                  }
                  type="color"
                  value={macroActivityForm.colorHex}
                />
              </label>
            </div>
          ) : null}
          <label>
            <span>GitHub reference</span>
            <select
              onChange={(event) =>
                setCreateGitHubReferenceMode(event.target.value as CreateGitHubReferenceMode)
              }
              value={createGitHubReferenceMode}
            >
              <option value="none">No GitHub reference</option>
              <option value="existing">Use existing</option>
              <option value="new">Create new</option>
            </select>
          </label>
          {createGitHubReferenceMode === "existing" ? (
            <label>
              <span>Existing GitHub reference</span>
              <select
                onChange={(event) => setCreateGitHubReferenceId(event.target.value)}
                value={createGitHubReferenceId}
              >
                <option value="">Pick GitHub reference</option>
                {availableGithubReferences.map((reference) => (
                  <option key={reference.id} value={reference.id}>
                    {formatGitHubReference(reference)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {createGitHubReferenceMode === "new" ? (
            <div className="embedded-form-grid">
              <label>
                <span>Repository</span>
                <input
                  onChange={(event) =>
                    setGitHubReferenceForm((current) => ({
                      ...current,
                      repositoryFullName: event.target.value
                    }))
                  }
                  placeholder="org/project"
                  value={githubReferenceForm.repositoryFullName}
                />
              </label>
              <label>
                <span>Issue</span>
                <input
                  min="1"
                  onChange={(event) =>
                    setGitHubReferenceForm((current) => ({
                      ...current,
                      issueNumber: event.target.value
                    }))
                  }
                  placeholder="42"
                  type="number"
                  value={githubReferenceForm.issueNumber}
                />
              </label>
              <label>
                <span>Title</span>
                <input
                  onChange={(event) =>
                    setGitHubReferenceForm((current) => ({
                      ...current,
                      cachedTitle: event.target.value
                    }))
                  }
                  placeholder="Optional"
                  value={githubReferenceForm.cachedTitle}
                />
              </label>
              <label>
                <span>Issue URL</span>
                <input
                  onChange={(event) =>
                    setGitHubReferenceForm((current) => ({
                      ...current,
                      issueUrl: event.target.value
                    }))
                  }
                  placeholder="Auto-filled if left blank"
                  value={githubReferenceForm.issueUrl}
                />
              </label>
            </div>
          ) : null}
          <button className="button button--accent" disabled={isCreating} type="submit">
            {isCreating ? "Creating..." : "Create task"}
          </button>
        </form>
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
