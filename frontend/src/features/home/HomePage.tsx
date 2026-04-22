import {
  startTransition,
  type FormEvent,
  useEffect,
  useEffectEvent,
  useState
} from "react";

import {
  appendJournalEntry,
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
  type GitHubReference,
  type MacroActivity,
  type Note,
  type ScheduledBlock,
  type Task,
  type WaitingReason
} from "../../shared/api";
import {
  ExperimentCreateForm,
  formatGitHubReference,
  QuickActionDialog,
  TaskCreateForm,
  TaskSelect
} from "../../shared/forms";
import { formatScheduledBlockStatus, formatTaskStatus } from "../../shared/labels";
import { PlannedSessionDialog } from "../../shared/plannedSessions";

const waitingOptions: Array<{ value: WaitingReason; label: string }> = [
  { value: "experiment_running", label: "Experiment running" },
  { value: "experiment_stalled", label: "Experiment stalled" },
  { value: "pr_feedback", label: "Waiting PR feedback" },
  { value: "issue_feedback", label: "Waiting issue feedback" },
  { value: "external_contribution", label: "Waiting external contribution" },
  { value: "researcher_input", label: "Waiting researcher input" },
  { value: "other", label: "Other" }
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

function waitingLabel(value: WaitingReason | null) {
  if (value === null) {
    return "none";
  }

  return value.replace(/_/g, " ");
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

type HomeQuickAction = "task" | "note" | "experiment" | null;

interface HomePageProps {
  onOpenTask: (taskId: string) => void;
}

export function HomePage({ onOpenTask }: HomePageProps) {
  const [dashboard, setDashboard] = useState<DashboardState>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAppendingJournal, setIsAppendingJournal] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quickAction, setQuickAction] = useState<HomeQuickAction>(null);
  const [selectedScheduledBlockId, setSelectedScheduledBlockId] = useState<string | null>(null);
  const [waitingReason, setWaitingReason] = useState<WaitingReason>("experiment_running");
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

  function openQuickAction(action: Exclude<HomeQuickAction, null>) {
    if (action === "note" && journalTaskId.length === 0 && dashboard.activeTask) {
      setJournalTaskId(dashboard.activeTask.id);
    }
    setQuickAction(action);
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
  const readyTasks = openTasks
    .filter((task) => task.id !== activeTaskId && task.status === "ready")
    .slice(0, 4);
  const latestJournalEntries = [...dashboard.journalEntries]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, 3);
  const nextScheduledBlocks = [...dashboard.scheduledBlocks]
    .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime())
    .slice(0, 2);
  const selectedScheduledBlock =
    selectedScheduledBlockId !== null
      ? dashboard.scheduledBlocks.find((block) => block.id === selectedScheduledBlockId) ?? null
      : null;
  const attentionExperiments = [
    ...dashboard.stalledExperiments,
    ...dashboard.runningExperiments
  ].slice(0, 3);

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
                  {formatTaskStatus(dashboard.activeTask.status)}
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
                Start a ready task or open the Tasks workspace to pick from Backlog.
              </p>
              {readyTasks.length > 0 ? (
                <ul className="entity-list home-ready-list">
                  {readyTasks.map((task) => (
                    <li className="entity-row" key={task.id}>
                      <div>
                        <strong>{task.title}</strong>
                        <span>{formatTaskStatus(task.status)}</span>
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
                <h3>Planned sessions today</h3>
                <span>{dashboard.scheduledBlocks.length}</span>
              </div>
              {nextScheduledBlocks.length > 0 ? (
                <ul className="entity-list entity-list--timeline">
                  {nextScheduledBlocks.map((block) => (
                    <li className="entity-row" key={block.id}>
                      <button
                        className="entity-row__body-button"
                        onClick={() => setSelectedScheduledBlockId(block.id)}
                        type="button"
                      >
                        <strong>
                          {block.title_override ??
                            taskLookup.get(block.task_id)?.title ??
                            "Untitled planned session"}
                        </strong>
                        <span>{taskLookup.get(block.task_id)?.title ?? "Unknown task"}</span>
                      </button>
                      <div className="entity-row__meta-stack">
                        <time>{formatTimeRange(block.starts_at, block.ends_at)}</time>
                        <span className={`pill pill--${block.status}`}>
                          {formatScheduledBlockStatus(block.status)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">No planned sessions for today.</p>
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
                            {formatTaskStatus(task.status)} - {task.priority}
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
                <span>Backlog</span>
                <strong>{countByStatus(dashboard.tasks, "inbox")}</strong>
              </li>
              <li>
                <span>Waiting</span>
                <strong>{countByStatus(dashboard.tasks, "waiting")}</strong>
              </li>
              <li>
                <span>Planned</span>
                <strong>{dashboard.scheduledBlocks.length}</strong>
              </li>
            </ul>
          </div>
        </article>
      </section>

      {quickAction ? (
        <QuickActionDialog
          onClose={() => setQuickAction(null)}
          title={
            quickAction === "task"
              ? "New task"
              : quickAction === "note"
                ? "New note"
                : "New experiment"
          }
          wide={quickAction === "task"}
        >
          {quickAction === "task" ? (
            <TaskCreateForm
              descriptionPlaceholder="Capture what you need to do next, not the whole project context."
              githubReferences={dashboard.githubReferences}
              macroActivities={dashboard.macroActivities}
              onCancel={() => setQuickAction(null)}
              onCreated={() => {
                setQuickAction(null);
                void loadDashboard({ background: true });
              }}
              onCreateTask={async (input) => {
                await createTask(input);
              }}
              onError={setError}
              unavailableGithubReferenceIds={usedGithubReferenceIds}
            />
          ) : null}

          {quickAction === "note" ? (
            <form
              className="compact-form compact-form--flush"
              onSubmit={(event) => void handleAppendJournalEntry(event)}
            >
              <TaskSelect
                includeUnassigned
                label="Linked task"
                onChange={setJournalTaskId}
                tasks={openTasks}
                value={journalTaskId}
              />
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
            <ExperimentCreateForm
              onCancel={() => setQuickAction(null)}
              onError={setError}
              onRegister={async (input) => {
                await registerExperiment(input);
              }}
              onRegistered={() => {
                setQuickAction(null);
                void loadDashboard({ background: true });
              }}
              tasks={openTasks}
            />
          ) : null}
        </QuickActionDialog>
      ) : null}

      {selectedScheduledBlock ? (
        <PlannedSessionDialog
          onChanged={() => loadDashboard({ background: true })}
          onClose={() => setSelectedScheduledBlockId(null)}
          onOpenTask={onOpenTask}
          scheduledBlock={selectedScheduledBlock}
          tasks={dashboard.tasks}
        />
      ) : null}
    </main>
  );
}
