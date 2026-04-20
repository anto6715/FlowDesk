import {
  startTransition,
  type FormEvent,
  useEffect,
  useEffectEvent,
  useState
} from "react";

import {
  appendJournalEntry,
  createGitHubReference,
  createMacroActivity,
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
import { parseGitHubIssueOrPullUrl } from "../../shared/github";

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

interface MacroActivityFormState {
  name: string;
  description: string;
  colorHex: string;
}

interface GitHubReferenceFormState {
  entryMode: "url" | "manual";
  repositoryFullName: string;
  issueNumber: string;
  issueUrl: string;
  cachedTitle: string;
}

type CreateMacroActivityMode = "none" | "existing" | "new";
type CreateGitHubReferenceMode = "none" | "existing" | "new";
type HomeQuickAction = "task" | "note" | "experiment" | null;

export function HomePage() {
  const [dashboard, setDashboard] = useState<DashboardState>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isRegisteringExperiment, setIsRegisteringExperiment] = useState(false);
  const [isAppendingJournal, setIsAppendingJournal] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quickAction, setQuickAction] = useState<HomeQuickAction>(null);
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
  const [githubReferenceForm, setGitHubReferenceForm] = useState<GitHubReferenceFormState>({
    entryMode: "url",
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
  const [journalTaskId, setJournalTaskId] = useState("");

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
      ] = await Promise.all([
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
        const parsedReference =
          githubReferenceForm.entryMode === "url"
            ? parseGitHubIssueOrPullUrl(githubReferenceForm.issueUrl)
            : null;
        const repositoryFullName =
          parsedReference?.repositoryFullName ?? githubReferenceForm.repositoryFullName.trim();
        const issueNumber =
          parsedReference?.issueNumber ?? Number.parseInt(githubReferenceForm.issueNumber, 10);
        const issueUrl =
          parsedReference?.issueUrl ||
          githubReferenceForm.issueUrl.trim() ||
          inferGitHubIssueUrl(repositoryFullName, issueNumber);

        if (repositoryFullName.length === 0) {
          setError("GitHub repository is required.");
          return;
        }
        if (githubReferenceForm.entryMode === "url" && parsedReference === null) {
          setError("Paste a valid GitHub issue or pull request URL.");
          return;
        }
        if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
          setError("GitHub issue or PR number must be a positive integer.");
          return;
        }

        const reference = await createGitHubReference({
          repository_full_name: repositoryFullName,
          issue_number: issueNumber,
          issue_url: issueUrl,
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
      setCreateGitHubReferenceId("");
      setCreateGitHubReferenceMode("none");
      setMacroActivityForm({
        name: "",
        description: "",
        colorHex: macroActivityForm.colorHex
      });
      setGitHubReferenceForm({
        entryMode: "url",
        repositoryFullName: "",
        issueNumber: "",
        issueUrl: "",
        cachedTitle: ""
      });
      setQuickAction(null);
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

  function resolveTaskSelection(selectedTaskId: string) {
    return (
      selectedTaskId ||
      dashboard.activeTask?.id ||
      dashboard.tasks.find((task) => !["done", "archived"].includes(task.status))?.id ||
      ""
    );
  }

  function openQuickAction(action: Exclude<HomeQuickAction, null>) {
    if (action === "note" && journalTaskId.length === 0 && dashboard.activeTask) {
      setJournalTaskId(dashboard.activeTask.id);
    }
    if (action === "experiment" && experimentTaskId.length === 0) {
      setExperimentTaskId(resolveTaskSelection(""));
    }
    setQuickAction(action);
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
      setQuickAction(null);
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

  async function handleAppendJournalEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (journalEntry.trim().length === 0) {
      setError("Journal entry is required.");
      return;
    }

    setIsAppendingJournal(true);
    try {
      await appendJournalEntry(dashboard.journalDay, journalEntry.trim(), journalTaskId || null);
      setJournalEntry("");
      setQuickAction(null);
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
  const readyTasks = openTasks.filter((task) => task.id !== activeTaskId).slice(0, 4);
  const latestJournalEntries = [...dashboard.journalEntries]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, 3);
  const nextScheduledBlocks = [...dashboard.scheduledBlocks]
    .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime())
    .slice(0, 2);
  const attentionExperiments = [
    ...dashboard.stalledExperiments,
    ...dashboard.runningExperiments
  ].slice(0, 3);
  const defaultExperimentTaskId = experimentTaskId || resolveTaskSelection("");

  return (
    <main className="page-shell page-shell--home">
      <section className="hero hero--compact">
        <div>
          <p className="eyebrow">Home</p>
          <h1>Today</h1>
        </div>
        <div className="home-toolbar">
          <div className="home-action-group" aria-label="Quick actions">
            <button
              className="button button--accent button--mini"
              onClick={() => openQuickAction("task")}
              type="button"
            >
              + Task
            </button>
            <button
              className="button button--ghost button--mini"
              onClick={() => openQuickAction("note")}
              type="button"
            >
              + Note
            </button>
            <button
              className="button button--ghost button--mini"
              onClick={() => openQuickAction("experiment")}
              type="button"
            >
              + Experiment
            </button>
          </div>
          <div className="sync-chip sync-chip--quiet">
            <span>{isRefreshing ? "Refreshing..." : "Live local state"}</span>
            <strong>
              {dashboard.syncedAt ? formatDateTime(dashboard.syncedAt.toISOString()) : "Sync pending"}
            </strong>
          </div>
        </div>
      </section>

      {error ? <div className="banner banner--error">{error}</div> : null}
      {isLoading ? <div className="banner">Loading Flow Desk...</div> : null}

      <section className="home-dashboard-grid" aria-label="Today workspace">
        <article className="summary-card summary-card--spotlight home-active-card">
          <p className="section-kicker">Active task</p>
          {dashboard.activeTask ? (
            <>
              <h2>{dashboard.activeTask.title}</h2>
              <p className="summary-copy">
                {dashboard.activeTask.description || "No description yet."}
              </p>
              <div className="pill-row">
                <span className={`pill pill--${dashboard.activeTask.status}`}>
                  {statusLabel(dashboard.activeTask.status)}
                </span>
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
              <div className="action-row home-active-actions">
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
              <details className="home-waiting-details">
                <summary>Move to waiting</summary>
                <div className="waiting-bar waiting-bar--compact">
                  <label>
                    <span>Reason</span>
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
              </details>
            </>
          ) : (
            <>
              <h2>No task is active</h2>
              <p className="summary-copy">
                Start one of the ready tasks or create a new task when the next action is clear.
              </p>
              {readyTasks.length > 0 ? (
                <ul className="entity-list home-ready-list">
                  {readyTasks.map((task) => (
                    <li className="entity-row" key={task.id}>
                      <div>
                        <strong>{task.title}</strong>
                        <span>{statusLabel(task.status)}</span>
                      </div>
                      <button
                        className="button button--accent button--small"
                        disabled={busyTaskId === task.id}
                        onClick={() => void handleStartTask(task.id)}
                        type="button"
                      >
                        {busyTaskId === task.id ? "Starting..." : "Start"}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-ribbon">No ready tasks yet</div>
              )}
            </>
          )}
        </article>

        <article className="panel panel--stack home-journal-panel">
          <div className="panel-header panel-header--compact">
            <div>
              <p className="section-kicker">Journal</p>
              <h2>{dashboard.journalDay}</h2>
            </div>
            <button
              className="button button--ghost button--mini"
              onClick={() => openQuickAction("note")}
              type="button"
            >
              + Note
            </button>
          </div>

          {latestJournalEntries.length > 0 ? (
            <ol className="journal-list">
              {latestJournalEntries.map((entry) => (
                <li key={entry.id}>
                  <time>{formatDateTime(entry.created_at)}</time>
                  {entry.task_id ? (
                    <span className="note-link-chip">
                      {taskLookup.get(entry.task_id)?.title ?? "Linked task"}
                    </span>
                  ) : null}
                  <p>{entry.content}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state">No journal entries yet today.</p>
          )}
        </article>

        <article className="panel panel--stack home-next-panel">
          <div className="panel-header panel-header--compact">
            <div>
              <p className="section-kicker">Next up</p>
              <h2>Context</h2>
            </div>
            <span className="count-chip">{openTasks.length}</span>
          </div>

          <div className="home-context-stack">
            <section>
              <div className="home-mini-header">
                <h3>Planned today</h3>
                <span>{dashboard.scheduledBlocks.length}</span>
              </div>
              {nextScheduledBlocks.length > 0 ? (
                <ul className="entity-list entity-list--timeline">
                  {nextScheduledBlocks.map((block) => (
                    <li className="entity-row" key={block.id}>
                      <div>
                        <strong>
                          {block.title_override ??
                            taskLookup.get(block.task_id)?.title ??
                            "Untitled block"}
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
            </section>

            <section>
              <div className="home-mini-header">
                <h3>Experiments</h3>
                <span>{dashboard.runningExperiments.length + dashboard.stalledExperiments.length}</span>
              </div>
              {attentionExperiments.length > 0 ? (
                <ul className="entity-list">
                  {attentionExperiments.map((experiment) => (
                    <li
                      className={
                        experiment.status === "stalled"
                          ? "entity-row entity-row--alert"
                          : "entity-row"
                      }
                      key={experiment.id}
                    >
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
                <p className="empty-state">No running or stalled experiments.</p>
              )}
            </section>

            {dashboard.activeTask ? (
              <section>
                <div className="home-mini-header">
                  <h3>Ready tasks</h3>
                  <span>{readyTasks.length}</span>
                </div>
                {readyTasks.length > 0 ? (
                  <ul className="entity-list home-ready-list">
                    {readyTasks.map((task) => (
                      <li className="entity-row" key={task.id}>
                        <div>
                          <strong>{task.title}</strong>
                          <span>
                            {statusLabel(task.status)} - {task.priority}
                          </span>
                        </div>
                        <button
                          className="button button--ghost button--small"
                          disabled={busyTaskId === task.id}
                          onClick={() => void handleSwitchTask(task.id)}
                          type="button"
                        >
                          {busyTaskId === task.id ? "Switching..." : "Switch"}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-state">No other ready tasks.</p>
                )}
              </section>
            ) : null}

            <ul className="home-metric-row" aria-label="Task counts">
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
          </div>
        </article>
      </section>

      {quickAction ? (
        <div className="home-action-overlay" onMouseDown={() => setQuickAction(null)}>
          <article
            aria-labelledby={`home-${quickAction}-title`}
            aria-modal="true"
            className={
              quickAction === "task"
                ? "panel home-action-dialog home-action-dialog--wide"
                : "panel home-action-dialog"
            }
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="panel-header">
              <div>
                <p className="section-kicker">Quick action</p>
                <h2 id={`home-${quickAction}-title`}>
                  {quickAction === "task"
                    ? "New task"
                    : quickAction === "note"
                      ? "New note"
                      : "New experiment"}
                </h2>
              </div>
              <button
                className="button button--ghost button--small"
                onClick={() => setQuickAction(null)}
                type="button"
              >
                Close
              </button>
            </div>

            {quickAction === "task" ? (
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
                      {dashboard.macroActivities.map((macroActivity) => (
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
                    <div className="segmented-control">
                      <button
                        className={
                          githubReferenceForm.entryMode === "url"
                            ? "segmented-control__item segmented-control__item--active"
                            : "segmented-control__item"
                        }
                        onClick={() =>
                          setGitHubReferenceForm((current) => ({ ...current, entryMode: "url" }))
                        }
                        type="button"
                      >
                        Paste URL
                      </button>
                      <button
                        className={
                          githubReferenceForm.entryMode === "manual"
                            ? "segmented-control__item segmented-control__item--active"
                            : "segmented-control__item"
                        }
                        onClick={() =>
                          setGitHubReferenceForm((current) => ({
                            ...current,
                            entryMode: "manual"
                          }))
                        }
                        type="button"
                      >
                        Manual
                      </button>
                    </div>
                    {githubReferenceForm.entryMode === "url" ? (
                      <label>
                        <span>GitHub issue or PR URL</span>
                        <input
                          onChange={(event) =>
                            setGitHubReferenceForm((current) => ({
                              ...current,
                              issueUrl: event.target.value
                            }))
                          }
                          placeholder="https://github.com/org/project/issues/42"
                          value={githubReferenceForm.issueUrl}
                        />
                      </label>
                    ) : (
                      <>
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
                          <span>Issue or PR number</span>
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
                      </>
                    )}
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
                ) : null}
                <div className="form-actions">
                  <button
                    className="button button--ghost"
                    onClick={() => setQuickAction(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button className="button button--accent" disabled={isCreating} type="submit">
                    {isCreating ? "Creating..." : "Create task"}
                  </button>
                </div>
              </form>
            ) : null}

            {quickAction === "note" ? (
              <form
                className="compact-form compact-form--flush"
                onSubmit={(event) => void handleAppendJournalEntry(event)}
              >
                <label>
                  <span>Linked task</span>
                  <select
                    onChange={(event) => setJournalTaskId(event.target.value)}
                    value={journalTaskId}
                  >
                    <option value="">No linked task</option>
                    {openTasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Quick note</span>
                  <textarea
                    onChange={(event) => setJournalEntry(event.target.value)}
                    placeholder="Capture the observation while it is fresh."
                    rows={6}
                    value={journalEntry}
                  />
                </label>
                <div className="form-actions">
                  <button
                    className="button button--ghost"
                    onClick={() => setQuickAction(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="button button--accent"
                    disabled={isAppendingJournal}
                    type="submit"
                  >
                    {isAppendingJournal ? "Appending..." : "Append entry"}
                  </button>
                </div>
              </form>
            ) : null}

            {quickAction === "experiment" ? (
              <form
                className="compact-form compact-form--flush"
                onSubmit={(event) => void handleRegisterExperiment(event)}
              >
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
                    rows={4}
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
                <div className="form-actions">
                  <button
                    className="button button--ghost"
                    onClick={() => setQuickAction(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="button button--accent"
                    disabled={isRegisteringExperiment || defaultExperimentTaskId.length === 0}
                    type="submit"
                  >
                    {isRegisteringExperiment ? "Registering..." : "Register experiment"}
                  </button>
                </div>
              </form>
            ) : null}
          </article>
        </div>
      ) : null}
    </main>
  );
}
