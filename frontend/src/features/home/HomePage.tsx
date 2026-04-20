import {
  startTransition,
  type FormEvent,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState
} from "react";

import {
  appendJournalEntry,
  createGitHubReference,
  createMacroActivity,
  createScheduledBlock,
  createTask,
  getActiveTask,
  listExperiments,
  listGitHubReferences,
  listJournalEntries,
  listMacroActivities,
  listScheduledBlocks,
  listTasks,
  pauseTask,
  registerExperiment,
  startTask,
  switchTask,
  type Experiment,
  type ExperimentStatus,
  type GitHubReference,
  type MacroActivity,
  type Note,
  type ScheduledBlock,
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

const experimentStatusOptions: Array<{ value: ExperimentStatus; label: string }> = [
  { value: "running", label: "Running" },
  { value: "queued", label: "Queued" },
  { value: "draft", label: "Draft" },
  { value: "stalled", label: "Stalled" }
];

interface DashboardState {
  tasks: Task[];
  macroActivities: MacroActivity[];
  githubReferences: GitHubReference[];
  activeTask: Task | null;
  activeSessionStartedAt: string | null;
  runningExperiments: Experiment[];
  stalledExperiments: Experiment[];
  scheduledBlocks: ScheduledBlock[];
  journalEntries: Note[];
  journalDay: string;
  syncedAt: Date | null;
}

const initialState: DashboardState = {
  tasks: [],
  macroActivities: [],
  githubReferences: [],
  activeTask: null,
  activeSessionStartedAt: null,
  runningExperiments: [],
  stalledExperiments: [],
  scheduledBlocks: [],
  journalEntries: [],
  journalDay: localDateKey(),
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

function formatTimeRange(startsAt: string, endsAt: string) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    timeStyle: "short"
  });

  return `${formatter.format(new Date(startsAt))} - ${formatter.format(new Date(endsAt))}`;
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

function formatGitHubReference(reference: GitHubReference) {
  const title = reference.cached_title ? ` - ${reference.cached_title}` : "";
  return `${reference.repository_full_name}#${reference.issue_number}${title}`;
}

function inferGitHubIssueUrl(repositoryFullName: string, issueNumber: number) {
  return `https://github.com/${repositoryFullName}/issues/${issueNumber}`;
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDayBounds(dayKey: string) {
  const startsAt = new Date(`${dayKey}T00:00:00`);
  const endsAt = new Date(startsAt);
  endsAt.setDate(startsAt.getDate() + 1);

  return {
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString()
  };
}

function toDateTimeLocalValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getDefaultScheduleWindow() {
  const startsAt = new Date();
  startsAt.setMinutes(startsAt.getMinutes() < 30 ? 30 : 60, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

  return {
    startsAt: toDateTimeLocalValue(startsAt),
    endsAt: toDateTimeLocalValue(endsAt)
  };
}

interface ScheduleFormState {
  taskId: string;
  titleOverride: string;
  startsAt: string;
  endsAt: string;
}

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

export function HomePage() {
  const [dashboard, setDashboard] = useState<DashboardState>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isRegisteringExperiment, setIsRegisteringExperiment] = useState(false);
  const [isSchedulingBlock, setIsSchedulingBlock] = useState(false);
  const [isAppendingJournal, setIsAppendingJournal] = useState(false);
  const [isCreatingMacroActivity, setIsCreatingMacroActivity] = useState(false);
  const [isCreatingGitHubReference, setIsCreatingGitHubReference] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createPriority, setCreatePriority] = useState<TaskPriority>("normal");
  const [createMacroActivityId, setCreateMacroActivityId] = useState("");
  const [createGitHubReferenceId, setCreateGitHubReferenceId] = useState("");
  const [macroActivityForm, setMacroActivityForm] = useState<MacroActivityFormState>({
    name: "",
    description: "",
    colorHex: "#0F6D61"
  });
  const [githubReferenceForm, setGitHubReferenceForm] = useState<GitHubReferenceFormState>({
    repositoryFullName: "",
    issueNumber: "",
    issueUrl: "",
    cachedTitle: ""
  });
  const [waitingReason, setWaitingReason] = useState<WaitingReason>("experiment_running");
  const [experimentTaskId, setExperimentTaskId] = useState("");
  const [experimentTitle, setExperimentTitle] = useState("");
  const [experimentInstruction, setExperimentInstruction] = useState("");
  const [experimentStatus, setExperimentStatus] = useState<ExperimentStatus>("running");
  const [journalEntry, setJournalEntry] = useState("");
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(() => {
    const defaultWindow = getDefaultScheduleWindow();
    return {
      taskId: "",
      titleOverride: "",
      startsAt: defaultWindow.startsAt,
      endsAt: defaultWindow.endsAt
    };
  });
  const deferredQuery = useDeferredValue(query);

  async function loadDashboard(options?: { background?: boolean }) {
    if (options?.background) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const journalDay = localDateKey();
      const dayBounds = localDayBounds(journalDay);
      const [
        tasks,
        macroActivities,
        githubReferences,
        active,
        runningExperiments,
        stalledExperiments,
        scheduledBlocks,
        journalEntries
      ] =
        await Promise.all([
          listTasks(),
          listMacroActivities(),
          listGitHubReferences(),
          getActiveTask(),
          listExperiments({ status: "running" }),
          listExperiments({ status: "stalled" }),
          listScheduledBlocks({
            status: "planned",
            ends_after: dayBounds.startsAt,
            starts_before: dayBounds.endsAt
          }),
          listJournalEntries(journalDay)
        ]);
      startTransition(() => {
        setDashboard({
          tasks,
          macroActivities,
          githubReferences,
          activeTask: active.task,
          activeSessionStartedAt: active.work_session?.started_at ?? null,
          runningExperiments,
          stalledExperiments,
          scheduledBlocks,
          journalEntries,
          journalDay,
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
        priority: createPriority,
        macro_activity_id: createMacroActivityId || null,
        github_reference_id: createGitHubReferenceId || null
      });
      setCreateTitle("");
      setCreateDescription("");
      setCreatePriority("normal");
      setCreateGitHubReferenceId("");
      await loadDashboard({ background: true });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create task.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleCreateMacroActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (macroActivityForm.name.trim().length === 0) {
      setError("Macro-activity name is required.");
      return;
    }

    setIsCreatingMacroActivity(true);
    try {
      const macroActivity = await createMacroActivity({
        name: macroActivityForm.name.trim(),
        description: macroActivityForm.description.trim() || undefined,
        color_hex: macroActivityForm.colorHex
      });
      setMacroActivityForm({
        name: "",
        description: "",
        colorHex: macroActivityForm.colorHex
      });
      setCreateMacroActivityId(macroActivity.id);
      await loadDashboard({ background: true });
    } catch (macroActivityError) {
      setError(
        macroActivityError instanceof Error
          ? macroActivityError.message
          : "Failed to create macro-activity."
      );
    } finally {
      setIsCreatingMacroActivity(false);
    }
  }

  async function handleCreateGitHubReference(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

    setIsCreatingGitHubReference(true);
    try {
      const reference = await createGitHubReference({
        repository_full_name: repositoryFullName,
        issue_number: issueNumber,
        issue_url:
          githubReferenceForm.issueUrl.trim() || inferGitHubIssueUrl(repositoryFullName, issueNumber),
        cached_title: githubReferenceForm.cachedTitle.trim() || undefined
      });
      setGitHubReferenceForm({
        repositoryFullName: "",
        issueNumber: "",
        issueUrl: "",
        cachedTitle: ""
      });
      setCreateGitHubReferenceId(reference.id);
      await loadDashboard({ background: true });
    } catch (githubReferenceError) {
      setError(
        githubReferenceError instanceof Error
          ? githubReferenceError.message
          : "Failed to create GitHub reference."
      );
    } finally {
      setIsCreatingGitHubReference(false);
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

  function resolveTaskSelection(selectedTaskId: string) {
    return (
      selectedTaskId ||
      dashboard.activeTask?.id ||
      dashboard.tasks.find((task) => !["done", "archived"].includes(task.status))?.id ||
      ""
    );
  }

  async function handleRegisterExperiment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const taskId = resolveTaskSelection(experimentTaskId);
    if (taskId.length === 0) {
      setError("Pick a task before registering an experiment.");
      return;
    }
    if (experimentTitle.trim().length === 0) {
      setError("Experiment title is required.");
      return;
    }

    setIsRegisteringExperiment(true);
    try {
      await registerExperiment({
        task_id: taskId,
        title: experimentTitle.trim(),
        instruction: experimentInstruction.trim() || undefined,
        status: experimentStatus
      });
      setExperimentTitle("");
      setExperimentInstruction("");
      setExperimentStatus("running");
      await loadDashboard({ background: true });
    } catch (experimentError) {
      setError(
        experimentError instanceof Error
          ? experimentError.message
          : "Failed to register experiment."
      );
    } finally {
      setIsRegisteringExperiment(false);
    }
  }

  async function handleCreateScheduledBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const taskId = resolveTaskSelection(scheduleForm.taskId);
    if (taskId.length === 0) {
      setError("Pick a task before scheduling a block.");
      return;
    }
    if (scheduleForm.startsAt.length === 0 || scheduleForm.endsAt.length === 0) {
      setError("Scheduled blocks require start and end times.");
      return;
    }

    setIsSchedulingBlock(true);
    try {
      await createScheduledBlock({
        task_id: taskId,
        title_override: scheduleForm.titleOverride.trim() || undefined,
        starts_at: new Date(scheduleForm.startsAt).toISOString(),
        ends_at: new Date(scheduleForm.endsAt).toISOString()
      });
      const defaultWindow = getDefaultScheduleWindow();
      setScheduleForm({
        taskId: taskId,
        titleOverride: "",
        startsAt: defaultWindow.startsAt,
        endsAt: defaultWindow.endsAt
      });
      await loadDashboard({ background: true });
    } catch (scheduleError) {
      setError(
        scheduleError instanceof Error ? scheduleError.message : "Failed to schedule block."
      );
    } finally {
      setIsSchedulingBlock(false);
    }
  }

  async function handleAppendJournalEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (journalEntry.trim().length === 0) {
      setError("Journal entry is required.");
      return;
    }

    setIsAppendingJournal(true);
    try {
      await appendJournalEntry(dashboard.journalDay, journalEntry.trim());
      setJournalEntry("");
      await loadDashboard({ background: true });
    } catch (journalError) {
      setError(journalError instanceof Error ? journalError.message : "Failed to append entry.");
    } finally {
      setIsAppendingJournal(false);
    }
  }

  const openTasks = dashboard.tasks.filter((task) => !["done", "archived"].includes(task.status));
  const activeTaskId = dashboard.activeTask?.id ?? null;
  const taskLookup = new Map(dashboard.tasks.map((task) => [task.id, task]));
  const macroActivityLookup = new Map(
    dashboard.macroActivities.map((macroActivity) => [macroActivity.id, macroActivity])
  );
  const githubReferenceLookup = new Map(
    dashboard.githubReferences.map((githubReference) => [githubReference.id, githubReference])
  );
  const usedGithubReferenceIds = new Set(
    dashboard.tasks.flatMap((task) => (task.github_reference_id ? [task.github_reference_id] : []))
  );
  const availableGithubReferences = dashboard.githubReferences.filter(
    (reference) =>
      !usedGithubReferenceIds.has(reference.id) || reference.id === createGitHubReferenceId
  );
  const defaultExperimentTaskId = resolveTaskSelection(experimentTaskId);
  const defaultScheduleTaskId = resolveTaskSelection(scheduleForm.taskId);

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
              <div className="context-row">
                <span>
                  Macro:{" "}
                  {dashboard.activeTask.macro_activity_id
                    ? macroActivityLookup.get(dashboard.activeTask.macro_activity_id)?.name ??
                      "Unknown"
                    : "None"}
                </span>
                <span>
                  GitHub:{" "}
                  {dashboard.activeTask.github_reference_id
                    ? githubReferenceLookup.get(dashboard.activeTask.github_reference_id)
                      ? formatGitHubReference(
                          githubReferenceLookup.get(
                            dashboard.activeTask.github_reference_id
                          ) as GitHubReference
                        )
                      : "Unknown"
                    : "None"}
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
            <label>
              <span>Macro-activity</span>
              <select
                onChange={(event) => setCreateMacroActivityId(event.target.value)}
                value={createMacroActivityId}
              >
                <option value="">No macro-activity</option>
                {dashboard.macroActivities.map((macroActivity) => (
                  <option key={macroActivity.id} value={macroActivity.id}>
                    {macroActivity.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>GitHub reference</span>
              <select
                onChange={(event) => setCreateGitHubReferenceId(event.target.value)}
                value={createGitHubReferenceId}
              >
                <option value="">No GitHub reference</option>
                {availableGithubReferences.map((reference) => (
                  <option key={reference.id} value={reference.id}>
                    {formatGitHubReference(reference)}
                  </option>
                ))}
              </select>
            </label>
            <button className="button button--accent" disabled={isCreating} type="submit">
              {isCreating ? "Creating..." : "Create task"}
            </button>
          </form>
          <div className="reference-tools">
            <form
              className="compact-form"
              onSubmit={(event) => void handleCreateMacroActivity(event)}
            >
              <p className="mini-title">New macro-activity</p>
              <label>
                <span>Name</span>
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
              <button
                className="button button--ghost"
                disabled={isCreatingMacroActivity}
                type="submit"
              >
                {isCreatingMacroActivity ? "Adding..." : "Add macro"}
              </button>
            </form>

            <form
              className="compact-form"
              onSubmit={(event) => void handleCreateGitHubReference(event)}
            >
              <p className="mini-title">New GitHub reference</p>
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
              <div className="inline-grid">
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
              </div>
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
              <button
                className="button button--ghost"
                disabled={isCreatingGitHubReference}
                type="submit"
              >
                {isCreatingGitHubReference ? "Adding..." : "Add GitHub ref"}
              </button>
            </form>
          </div>
        </article>
      </section>

      {error ? <div className="banner banner--error">{error}</div> : null}

      <section className="operations-grid" aria-label="Today operations">
        <article className="panel panel--stack">
          <div className="panel-header panel-header--compact">
            <div>
              <p className="section-kicker">Experiments</p>
              <h2>Runs needing attention</h2>
            </div>
            <span className="count-chip">
              {dashboard.runningExperiments.length + dashboard.stalledExperiments.length}
            </span>
          </div>

          <div className="split-list">
            <div>
              <h3>Running</h3>
              {dashboard.runningExperiments.length > 0 ? (
                <ul className="entity-list">
                  {dashboard.runningExperiments.map((experiment) => (
                    <li className="entity-row" key={experiment.id}>
                      <div>
                        <strong>{experiment.title}</strong>
                        <span>{taskLookup.get(experiment.task_id)?.title ?? "Unknown task"}</span>
                      </div>
                      <span className={`pill pill--${experiment.status}`}>
                        {experiment.status}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">No running experiments.</p>
              )}
            </div>

            <div>
              <h3>Stalled</h3>
              {dashboard.stalledExperiments.length > 0 ? (
                <ul className="entity-list">
                  {dashboard.stalledExperiments.map((experiment) => (
                    <li className="entity-row entity-row--alert" key={experiment.id}>
                      <div>
                        <strong>{experiment.title}</strong>
                        <span>{taskLookup.get(experiment.task_id)?.title ?? "Unknown task"}</span>
                      </div>
                      <span className={`pill pill--${experiment.status}`}>
                        {experiment.status}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">No stalled experiments.</p>
              )}
            </div>
          </div>

          <form className="compact-form" onSubmit={(event) => void handleRegisterExperiment(event)}>
            <label>
              <span>Task</span>
              <select
                disabled={openTasks.length === 0}
                onChange={(event) => setExperimentTaskId(event.target.value)}
                value={defaultExperimentTaskId}
              >
                {openTasks.length === 0 ? <option value="">No open tasks</option> : null}
                {openTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Title</span>
              <input
                onChange={(event) => setExperimentTitle(event.target.value)}
                placeholder="Scaling run 256 ranks"
                value={experimentTitle}
              />
            </label>
            <label>
              <span>Instruction</span>
              <textarea
                onChange={(event) => setExperimentInstruction(event.target.value)}
                placeholder="What this run should prove or disprove."
                rows={3}
                value={experimentInstruction}
              />
            </label>
            <label>
              <span>Status</span>
              <select
                onChange={(event) => setExperimentStatus(event.target.value as ExperimentStatus)}
                value={experimentStatus}
              >
                {experimentStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button button--accent"
              disabled={isRegisteringExperiment || defaultExperimentTaskId.length === 0}
              type="submit"
            >
              {isRegisteringExperiment ? "Registering..." : "Register experiment"}
            </button>
          </form>
        </article>

        <article className="panel panel--stack">
          <div className="panel-header panel-header--compact">
            <div>
              <p className="section-kicker">Planned today</p>
              <h2>Scheduled blocks</h2>
            </div>
            <span className="count-chip">{dashboard.scheduledBlocks.length}</span>
          </div>

          {dashboard.scheduledBlocks.length > 0 ? (
            <ul className="entity-list entity-list--timeline">
              {dashboard.scheduledBlocks.map((block) => (
                <li className="entity-row" key={block.id}>
                  <div>
                    <strong>
                      {block.title_override ?? taskLookup.get(block.task_id)?.title ?? "Untitled block"}
                    </strong>
                    <span>{taskLookup.get(block.task_id)?.title ?? "Unknown task"}</span>
                  </div>
                  <time>{formatTimeRange(block.starts_at, block.ends_at)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No planned blocks for today.</p>
          )}

          <form className="compact-form" onSubmit={(event) => void handleCreateScheduledBlock(event)}>
            <label>
              <span>Task</span>
              <select
                disabled={openTasks.length === 0}
                onChange={(event) =>
                  setScheduleForm((current) => ({ ...current, taskId: event.target.value }))
                }
                value={defaultScheduleTaskId}
              >
                {openTasks.length === 0 ? <option value="">No open tasks</option> : null}
                {openTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Title override</span>
              <input
                onChange={(event) =>
                  setScheduleForm((current) => ({
                    ...current,
                    titleOverride: event.target.value
                  }))
                }
                placeholder="Optional calendar label"
                value={scheduleForm.titleOverride}
              />
            </label>
            <div className="inline-grid">
              <label>
                <span>Start</span>
                <input
                  onChange={(event) =>
                    setScheduleForm((current) => ({ ...current, startsAt: event.target.value }))
                  }
                  type="datetime-local"
                  value={scheduleForm.startsAt}
                />
              </label>
              <label>
                <span>End</span>
                <input
                  onChange={(event) =>
                    setScheduleForm((current) => ({ ...current, endsAt: event.target.value }))
                  }
                  type="datetime-local"
                  value={scheduleForm.endsAt}
                />
              </label>
            </div>
            <button
              className="button button--ghost"
              disabled={isSchedulingBlock || defaultScheduleTaskId.length === 0}
              type="submit"
            >
              {isSchedulingBlock ? "Scheduling..." : "Schedule block"}
            </button>
          </form>
        </article>

        <article className="panel panel--stack">
          <div className="panel-header panel-header--compact">
            <div>
              <p className="section-kicker">Journal</p>
              <h2>{dashboard.journalDay}</h2>
            </div>
            <span className="count-chip">{dashboard.journalEntries.length}</span>
          </div>

          {dashboard.journalEntries.length > 0 ? (
            <ol className="journal-list">
              {dashboard.journalEntries.map((entry) => (
                <li key={entry.id}>
                  <time>{formatDateTime(entry.created_at)}</time>
                  <p>{entry.content}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state">No journal entries yet today.</p>
          )}

          <form className="compact-form" onSubmit={(event) => void handleAppendJournalEntry(event)}>
            <label>
              <span>Quick note</span>
              <textarea
                onChange={(event) => setJournalEntry(event.target.value)}
                placeholder="Capture the observation while it is fresh."
                rows={5}
                value={journalEntry}
              />
            </label>
            <button className="button button--accent" disabled={isAppendingJournal} type="submit">
              {isAppendingJournal ? "Appending..." : "Append entry"}
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
                  <span>
                    Macro:{" "}
                    {task.macro_activity_id
                      ? macroActivityLookup.get(task.macro_activity_id)?.name ?? "Unknown"
                      : "None"}
                  </span>
                  <span>
                    GitHub:{" "}
                    {task.github_reference_id
                      ? githubReferenceLookup.get(task.github_reference_id)
                        ? formatGitHubReference(
                            githubReferenceLookup.get(task.github_reference_id) as GitHubReference
                          )
                        : "Unknown"
                      : "None"}
                  </span>
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
