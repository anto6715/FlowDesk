import {
  startTransition,
  useEffect,
  useEffectEvent,
  useState
} from "react";

import {
  createJournalNoteBlock,
  createTask,
  getActiveTask,
  listExperiments,
  listGitHubReferences,
  listJournalNoteBlocks,
  listMacroActivities,
  listScheduledBlocks,
  listTasks,
  pauseTask,
  registerExperiment,
  startTask,
  switchTask,
  updateNoteBlock,
  type Experiment,
  type GitHubReference,
  type MacroActivity,
  type NoteBlock,
  type ScheduledBlock,
  type Task,
  type WaitingReason
} from "../../shared/api";
import {
  ExperimentCreateForm,
  formatGitHubReference,
  QuickActionDialog,
  TaskCreateForm
} from "../../shared/forms";
import { formatScheduledBlockStatus, formatTaskStatus } from "../../shared/labels";
import {
  BulletNoteCard,
  BulletNoteEditor,
  primaryTaskIdForNoteBlock
} from "../../shared/notes";
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
  experiments: Experiment[];
  scheduledBlocks: ScheduledBlock[];
  journalBlocks: NoteBlock[];
  journalDay: string;
  syncedAt: Date | null;
}

const initialState: DashboardState = {
  tasks: [],
  macroActivities: [],
  githubReferences: [],
  activeTask: null,
  activeSessionStartedAt: null,
  experiments: [],
  scheduledBlocks: [],
  journalBlocks: [],
  journalDay: localDateKey(),
  syncedAt: null
};

type HomeQuickAction =
  | { kind: "task" }
  | { kind: "note-create" }
  | { kind: "note-edit"; block: NoteBlock }
  | { kind: "experiment" }
  | null;

function formatDateTime(iso: string | null) {
  if (iso === null) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));
}

function formatDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date(year, month - 1, day));
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

function taskIsOpen(task: Task) {
  return !["done", "archived"].includes(task.status);
}

function shortenId(id: string) {
  return id.slice(0, 8);
}

function formatTaskIdentity(task: Task) {
  return `${task.title} • ${shortenId(task.id)}`;
}

function compareByUpdatedDesc(left: { updated_at: string }, right: { updated_at: string }) {
  return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
}

function compareByStartsAt(left: ScheduledBlock, right: ScheduledBlock) {
  return new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime();
}

function noteHasTaskLink(block: NoteBlock, taskId: string) {
  return block.links.some(
    (link) => link.target_type === "task" && link.target_id === taskId
  );
}

function taskQueueSummary(task: Task) {
  const parts = [formatTaskStatus(task.status), task.priority, shortenId(task.id)];
  if (task.waiting_reason !== null) {
    parts.splice(1, 0, waitingLabel(task.waiting_reason));
  }
  return parts.join(" · ");
}

interface HomePageProps {
  onOpenExperiment: (experimentId: string) => void;
  onOpenTag: (tagName: string) => void;
  onOpenTask: (taskId: string) => void;
}

export function HomePage({ onOpenExperiment, onOpenTag, onOpenTask }: HomePageProps) {
  const [dashboard, setDashboard] = useState<DashboardState>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quickAction, setQuickAction] = useState<HomeQuickAction>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedScheduledBlockId, setSelectedScheduledBlockId] = useState<string | null>(null);
  const [waitingReason, setWaitingReason] = useState<WaitingReason>("experiment_running");

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
        experiments,
        scheduledBlocks,
        journalBlocks
      ] = await Promise.all([
        listTasks(),
        listMacroActivities(),
        listGitHubReferences(),
        getActiveTask(),
        listExperiments(),
        listScheduledBlocks({
          status: "planned",
          ends_after: dayBounds.startsAt,
          starts_before: dayBounds.endsAt
        }),
        listJournalNoteBlocks(journalDay)
      ]);

      startTransition(() => {
        setDashboard({
          tasks,
          macroActivities,
          githubReferences,
          activeTask: active.task,
          activeSessionStartedAt: active.work_session?.started_at ?? null,
          experiments,
          scheduledBlocks,
          journalBlocks,
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

  useEffect(() => {
    if (selectedTaskId === null) {
      return;
    }

    const selectedTask = dashboard.tasks.find((task) => task.id === selectedTaskId) ?? null;
    if (selectedTask === null || !taskIsOpen(selectedTask)) {
      setSelectedTaskId(null);
    }
  }, [dashboard.tasks, selectedTaskId]);

  async function handleBeginTask(taskId: string) {
    if (dashboard.activeTask?.id === taskId) {
      return;
    }

    setBusyTaskId(taskId);
    try {
      if (dashboard.activeTask !== null) {
        await switchTask(dashboard.activeTask.id, taskId);
      } else {
        await startTask(taskId);
      }

      await loadDashboard({ background: true });
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "Failed to begin task.");
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
    setQuickAction(action);
  }

  async function handleSaveJournalBlock(input: {
    contentMarkdown: string;
    references: Array<{ target_type: "task" | "experiment"; target_id: string }>;
  }) {
    if (quickAction?.kind === "note-edit") {
      await updateNoteBlock(quickAction.block.id, {
        content_markdown: input.contentMarkdown,
        references: input.references
      });
    } else {
      await createJournalNoteBlock(dashboard.journalDay, {
        content_markdown: input.contentMarkdown,
        references: input.references
      });
    }

    setQuickAction(null);
    await loadDashboard({ background: true });
  }

  const openTasks = dashboard.tasks.filter(taskIsOpen);
  const activeTaskId = dashboard.activeTask?.id ?? null;
  const selectedTask =
    selectedTaskId !== null
      ? dashboard.tasks.find((task) => task.id === selectedTaskId) ?? null
      : null;
  const backlogTasks = openTasks.filter((task) => task.status === "inbox");
  const readyTasks = openTasks.filter((task) => task.status === "ready");
  const waitingTasks = openTasks.filter((task) => task.status === "waiting");
  const blockedTasks = openTasks.filter((task) => task.status === "blocked");
  const focusTask =
    selectedTask ??
    dashboard.activeTask ??
    readyTasks[0] ??
    backlogTasks[0] ??
    waitingTasks[0] ??
    blockedTasks[0] ??
    openTasks[0] ??
    null;
  const focusTaskId = focusTask?.id ?? null;
  const isFocusedTaskActive = focusTaskId !== null && focusTaskId === activeTaskId;
  const hasPinnedTaskFocus =
    focusTaskId !== null && selectedTaskId !== null && selectedTaskId === focusTaskId;
  const canBeginFocusedTask =
    focusTask !== null && taskIsOpen(focusTask) && focusTask.id !== activeTaskId;
  const latestJournalBlocks = [...dashboard.journalBlocks]
    .sort(compareByUpdatedDesc)
    .slice(0, 6);
  const nextScheduledBlocks = [...dashboard.scheduledBlocks]
    .sort(compareByStartsAt)
    .slice(0, 4);
  const runningExperiments = dashboard.experiments.filter(
    (experiment) => experiment.status === "running"
  );
  const stalledExperiments = dashboard.experiments.filter(
    (experiment) => experiment.status === "stalled"
  );
  const attentionExperiments = [...stalledExperiments, ...runningExperiments]
    .sort(compareByUpdatedDesc)
    .slice(0, 4);
  const selectedScheduledBlock =
    selectedScheduledBlockId !== null
      ? dashboard.scheduledBlocks.find((block) => block.id === selectedScheduledBlockId) ?? null
      : null;
  const taskLookup = new Map(dashboard.tasks.map((task) => [task.id, task]));
  const macroActivityLookup = new Map(
    dashboard.macroActivities.map((macroActivity) => [macroActivity.id, macroActivity])
  );
  const githubReferenceLookup = new Map(
    dashboard.githubReferences.map((githubReference) => [githubReference.id, githubReference])
  );
  const experimentLookup = new Map(
    dashboard.experiments.map((experiment) => [experiment.id, experiment])
  );
  const usedGithubReferenceIds = new Set(
    dashboard.tasks.flatMap((task) => (task.github_reference_id ? [task.github_reference_id] : []))
  );
  const journalLinkedTaskCount = new Set(
    dashboard.journalBlocks.flatMap((block) =>
      block.links
        .filter((link) => link.target_type === "task" && link.target_id !== null)
        .map((link) => link.target_id as string)
    )
  ).size;
  const focusTaskJournalBlocks = focusTask
    ? [...dashboard.journalBlocks]
        .filter((block) => noteHasTaskLink(block, focusTask.id))
        .sort(compareByUpdatedDesc)
        .slice(0, 2)
    : [];
  const focusTaskJournalCount = focusTask
    ? dashboard.journalBlocks.filter((block) => noteHasTaskLink(block, focusTask.id)).length
    : 0;
  const focusTaskExperiments = focusTask
    ? dashboard.experiments
        .filter((experiment) => experiment.task_id === focusTask.id)
        .sort(compareByUpdatedDesc)
        .slice(0, 3)
    : [];
  const focusTaskExperimentCount = focusTask
    ? dashboard.experiments.filter((experiment) => experiment.task_id === focusTask.id).length
    : 0;
  const focusTaskScheduledBlocks = focusTask
    ? dashboard.scheduledBlocks
        .filter((block) => block.task_id === focusTask.id)
        .sort(compareByStartsAt)
        .slice(0, 3)
    : [];
  const focusTaskScheduledCount = focusTask
    ? dashboard.scheduledBlocks.filter((block) => block.task_id === focusTask.id).length
    : 0;
  const focusMacroActivity =
    focusTask?.macro_activity_id !== null && focusTask !== null
      ? macroActivityLookup.get(focusTask.macro_activity_id)
      : null;
  const focusGitHubReference =
    focusTask?.github_reference_id !== null && focusTask !== null
      ? githubReferenceLookup.get(focusTask.github_reference_id)
      : null;
  const queueSections: Array<{
    count: number;
    empty: string;
    tasks: Task[];
    title: string;
  }> = [
    {
      title: "Backlog",
      count: backlogTasks.length,
      tasks: backlogTasks.slice(0, 4),
      empty: "No backlog tasks."
    },
    {
      title: "Ready",
      count: readyTasks.length,
      tasks: readyTasks.slice(0, 4),
      empty: "No ready tasks."
    },
    {
      title: "Waiting",
      count: waitingTasks.length,
      tasks: waitingTasks.slice(0, 4),
      empty: "No waiting tasks."
    },
    {
      title: "Blocked",
      count: blockedTasks.length,
      tasks: blockedTasks.slice(0, 3),
      empty: "No blocked tasks."
    }
  ];

  return (
    <main className="page-shell page-shell--home">
      <section className="hero hero--compact">
        <div>
          <p className="eyebrow">Home</p>
          <h1>Workbench</h1>
          <p className="home-hero-copy">
            {formatDayKey(dashboard.journalDay)}. Journal, task focus, and live operational context
            stay on one screen.
          </p>
        </div>
        <div className="home-toolbar">
          <div className="home-action-group" aria-label="Quick actions">
            <button
              className="button button--accent button--mini"
              onClick={() => openQuickAction({ kind: "task" })}
              type="button"
            >
              + Task
            </button>
            <button
              className="button button--ghost button--mini"
              onClick={() => openQuickAction({ kind: "note-create" })}
              type="button"
            >
              + Note
            </button>
            <button
              className="button button--ghost button--mini"
              onClick={() => openQuickAction({ kind: "experiment" })}
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

      <section className="home-overview-strip" aria-label="Workbench overview">
        <article>
          <span>Bullets today</span>
          <strong>{dashboard.journalBlocks.length}</strong>
        </article>
        <article>
          <span>Task-linked bullets</span>
          <strong>{journalLinkedTaskCount}</strong>
        </article>
        <article>
          <span>Backlog</span>
          <strong>{backlogTasks.length}</strong>
        </article>
        <article>
          <span>Ready</span>
          <strong>{readyTasks.length}</strong>
        </article>
        <article>
          <span>Waiting</span>
          <strong>{waitingTasks.length}</strong>
        </article>
        <article>
          <span>Stalled runs</span>
          <strong>{stalledExperiments.length}</strong>
        </article>
        <article>
          <span>Planned today</span>
          <strong>{dashboard.scheduledBlocks.length}</strong>
        </article>
      </section>

      <section className="home-workbench-grid" aria-label="Today workspace">
        <article className="panel panel--stack home-journal-workbench">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Today journal</p>
              <h2>{dashboard.journalDay}</h2>
            </div>
            <div className="home-panel-actions">
              <span className="count-chip">{dashboard.journalBlocks.length}</span>
              <button
                className="button button--ghost button--small"
                onClick={() => openQuickAction({ kind: "note-create" })}
                type="button"
              >
                + Note
              </button>
            </div>
          </div>

          {latestJournalBlocks.length > 0 ? (
            <ol className="journal-list journal-list--long">
              {latestJournalBlocks.map((block) => (
                <BulletNoteCard
                  block={block}
                  experimentLookup={experimentLookup}
                  key={block.id}
                  onEdit={(nextBlock) => setQuickAction({ kind: "note-edit", block: nextBlock })}
                  onOpenExperiment={onOpenExperiment}
                  onOpenTag={onOpenTag}
                  onOpenTask={onOpenTask}
                  taskLookup={taskLookup}
                />
              ))}
            </ol>
          ) : (
            <p className="empty-state">No journal bullets yet today.</p>
          )}
        </article>

        <article className="summary-card summary-card--spotlight home-focus-panel">
          <p className="section-kicker">
            {isFocusedTaskActive
              ? "Active task"
              : hasPinnedTaskFocus
                ? "Selected task"
                : "Home focus"}
          </p>

          {focusTask ? (
            <>
              <div className="home-focus-header">
                <div>
                  <h2>{focusTask.title}</h2>
                  <p className="summary-copy">
                    {focusTask.description || "No description yet."}
                  </p>
                </div>
                {hasPinnedTaskFocus ? (
                  <button
                    className="button button--ghost button--small"
                    onClick={() => setSelectedTaskId(null)}
                    type="button"
                  >
                    {dashboard.activeTask ? "Follow active task" : "Clear focus"}
                  </button>
                ) : null}
              </div>

              <div className="pill-row home-focus-status">
                <span className={`pill pill--${focusTask.status}`}>
                  {formatTaskStatus(focusTask.status)}
                </span>
                <span className={`pill pill--priority-${focusTask.priority}`}>
                  {focusTask.priority}
                </span>
                {isFocusedTaskActive ? (
                  <span className="pill pill--ready">Live on Home</span>
                ) : hasPinnedTaskFocus ? (
                  <span className="pill pill--queued">Pinned on Home</span>
                ) : (
                  <span className="pill pill--inbox">Queue-selected</span>
                )}
              </div>

              <div className="context-row">
                <span>Task id: {shortenId(focusTask.id)}</span>
                <span>Macro: {focusMacroActivity?.name ?? "None"}</span>
                <span>
                  GitHub:{" "}
                  {focusGitHubReference ? (
                    <a
                      className="text-link"
                      href={focusGitHubReference.issue_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {formatGitHubReference(focusGitHubReference)}
                    </a>
                  ) : (
                    "None"
                  )}
                </span>
              </div>

              <div className="stat-strip">
                <div>
                  <span>{isFocusedTaskActive ? "Elapsed" : "Updated"}</span>
                  <strong>
                    {isFocusedTaskActive
                      ? formatElapsed(dashboard.activeSessionStartedAt)
                      : formatDateTime(focusTask.updated_at)}
                  </strong>
                </div>
                <div>
                  <span>Bullets today</span>
                  <strong>{focusTaskJournalCount}</strong>
                </div>
                <div>
                  <span>Experiments</span>
                  <strong>{focusTaskExperimentCount}</strong>
                </div>
              </div>

              <div className="action-row home-focus-actions home-focus-actions--utility">
                <button
                  className="button button--ghost"
                  onClick={() => onOpenTask(focusTask.id)}
                  type="button"
                >
                  Open detail
                </button>
                <button
                  className="button button--ghost"
                  onClick={() => openQuickAction({ kind: "note-create" })}
                  type="button"
                >
                  Add linked note
                </button>
                <button
                  className="button button--ghost"
                  onClick={() => openQuickAction({ kind: "experiment" })}
                  type="button"
                >
                  New experiment
                </button>
              </div>

              {isFocusedTaskActive ? (
                <>
                  <div className="action-row home-focus-actions">
                    <button
                      className="button button--ghost"
                      disabled={busyTaskId === focusTask.id}
                      onClick={() => void handlePauseActiveTask("pause")}
                      type="button"
                    >
                      Pause
                    </button>
                    <button
                      className="button button--accent"
                      disabled={busyTaskId === focusTask.id}
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
                        disabled={busyTaskId === focusTask.id}
                        onClick={() => void handlePauseActiveTask("waiting")}
                        type="button"
                      >
                        Wait
                      </button>
                    </div>
                  </details>
                </>
              ) : canBeginFocusedTask ? (
                <div className="action-row home-focus-actions">
                  <button
                    className="button button--accent"
                    disabled={busyTaskId === focusTask.id}
                    onClick={() => void handleBeginTask(focusTask.id)}
                    type="button"
                  >
                    {busyTaskId === focusTask.id
                      ? dashboard.activeTask
                        ? "Switching..."
                        : "Starting..."
                      : dashboard.activeTask
                        ? "Switch now"
                        : "Start now"}
                  </button>
                </div>
              ) : null}

              <div className="home-focus-stack">
                <section className="home-focus-section">
                  <div className="home-mini-header">
                    <h3>Linked bullets today</h3>
                    <span>{focusTaskJournalCount}</span>
                  </div>
                  {focusTaskJournalBlocks.length > 0 ? (
                    <ol className="journal-list journal-list--compact">
                      {focusTaskJournalBlocks.map((block) => (
                        <BulletNoteCard
                          block={block}
                          experimentLookup={experimentLookup}
                          key={block.id}
                          onEdit={(nextBlock) => setQuickAction({ kind: "note-edit", block: nextBlock })}
                          onOpenExperiment={onOpenExperiment}
                          onOpenTag={onOpenTag}
                          onOpenTask={onOpenTask}
                          taskLookup={taskLookup}
                        />
                      ))}
                    </ol>
                  ) : (
                    <p className="empty-state">No bullets linked to this task today.</p>
                  )}
                </section>

                <section className="home-focus-section">
                  <div className="home-mini-header">
                    <h3>Task experiments</h3>
                    <span>{focusTaskExperimentCount}</span>
                  </div>
                  {focusTaskExperiments.length > 0 ? (
                    <ul className="entity-list">
                      {focusTaskExperiments.map((experiment) => (
                        <li
                          className={
                            experiment.status === "stalled"
                              ? "entity-row entity-row--alert"
                              : "entity-row"
                          }
                          key={experiment.id}
                        >
                          <button
                            className="entity-row__body-button"
                            onClick={() => onOpenExperiment(experiment.id)}
                            type="button"
                          >
                            <strong>{experiment.title}</strong>
                            <span>{formatDateTime(experiment.updated_at)}</span>
                          </button>
                          <div className="entity-row__meta-stack">
                            <span className={`pill pill--${experiment.status}`}>{experiment.status}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="empty-state">No experiments registered for this task.</p>
                  )}
                </section>

                <section className="home-focus-section">
                  <div className="home-mini-header">
                    <h3>Planned sessions</h3>
                    <span>{focusTaskScheduledCount}</span>
                  </div>
                  {focusTaskScheduledBlocks.length > 0 ? (
                    <ul className="entity-list entity-list--timeline">
                      {focusTaskScheduledBlocks.map((block) => (
                        <li className="entity-row" key={block.id}>
                          <button
                            className="entity-row__body-button"
                            onClick={() => setSelectedScheduledBlockId(block.id)}
                            type="button"
                          >
                            <strong>
                              {block.title_override ?? formatTaskIdentity(focusTask)}
                            </strong>
                            <span>{formatTimeRange(block.starts_at, block.ends_at)}</span>
                          </button>
                          <div className="entity-row__meta-stack">
                            <span className={`pill pill--${block.status}`}>
                              {formatScheduledBlockStatus(block.status)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="empty-state">No planned sessions for this task today.</p>
                  )}
                </section>
              </div>
            </>
          ) : (
            <>
              <h2>No task in focus</h2>
              <p className="summary-copy">
                Create a task or pull one from Backlog to make Home the place you continue work.
              </p>
              <div className="action-row home-focus-actions">
                <button
                  className="button button--accent"
                  onClick={() => openQuickAction({ kind: "task" })}
                  type="button"
                >
                  + Task
                </button>
                <button
                  className="button button--ghost"
                  onClick={() => openQuickAction({ kind: "note-create" })}
                  type="button"
                >
                  + Note
                </button>
              </div>
            </>
          )}
        </article>

        <article className="panel panel--stack home-queue-panel">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Task context</p>
              <h2>Queues</h2>
            </div>
            <span className="count-chip">{openTasks.length}</span>
          </div>

          <div className="home-queue-stack">
            {queueSections.map((section) => (
              <section key={section.title}>
                <div className="home-mini-header">
                  <h3>{section.title}</h3>
                  <span>{section.count}</span>
                </div>
                {section.tasks.length > 0 ? (
                  <ul className="entity-list">
                    {section.tasks.map((task) => {
                      const isFocused = focusTaskId === task.id;
                      const isActive = activeTaskId === task.id;
                      const canBeginTask = taskIsOpen(task) && task.id !== activeTaskId;

                      return (
                        <li
                          className={
                            isFocused
                              ? "entity-row home-queue-row home-queue-row--focused"
                              : "entity-row home-queue-row"
                          }
                          key={task.id}
                        >
                          <button
                            className="entity-row__body-button"
                            onClick={() => setSelectedTaskId(task.id)}
                            type="button"
                          >
                            <strong>{task.title}</strong>
                            <span>{taskQueueSummary(task)}</span>
                          </button>
                          <div className="home-row-actions">
                            {canBeginTask ? (
                              <button
                                className="button button--accent button--small"
                                disabled={busyTaskId === task.id}
                                onClick={() => void handleBeginTask(task.id)}
                                type="button"
                              >
                                {busyTaskId === task.id
                                  ? activeTaskId
                                    ? "Switching..."
                                    : "Starting..."
                                  : activeTaskId
                                    ? "Switch"
                                    : "Start"}
                              </button>
                            ) : isActive ? (
                              <button
                                className="button button--inactive button--small"
                                disabled
                                type="button"
                              >
                                Active
                              </button>
                            ) : null}
                            <button
                              className="button button--ghost button--small"
                              onClick={() => onOpenTask(task.id)}
                              type="button"
                            >
                              Open
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="empty-state">{section.empty}</p>
                )}
              </section>
            ))}
          </div>
        </article>

        <article className="panel panel--stack home-operations-panel">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Operational context</p>
              <h2>Runs and plan</h2>
            </div>
            <span className="count-chip">
              {runningExperiments.length + stalledExperiments.length + dashboard.scheduledBlocks.length}
            </span>
          </div>

          <div className="home-queue-stack">
            <section>
              <div className="home-mini-header">
                <h3>Running and stalled experiments</h3>
                <span>{runningExperiments.length + stalledExperiments.length}</span>
              </div>
              {attentionExperiments.length > 0 ? (
                <ul className="entity-list">
                  {attentionExperiments.map((experiment) => {
                    const linkedTask = taskLookup.get(experiment.task_id) ?? null;

                    return (
                      <li
                        className={
                          experiment.status === "stalled"
                            ? "entity-row entity-row--alert"
                            : "entity-row"
                        }
                        key={experiment.id}
                      >
                        <button
                          className="entity-row__body-button"
                          onClick={() => onOpenExperiment(experiment.id)}
                          type="button"
                        >
                          <strong>{experiment.title}</strong>
                          <span>
                            {linkedTask ? formatTaskIdentity(linkedTask) : "Unknown task"}
                          </span>
                        </button>
                        <div className="home-row-actions">
                          {linkedTask ? (
                            <button
                              className="button button--ghost button--small"
                              onClick={() => setSelectedTaskId(linkedTask.id)}
                              type="button"
                            >
                              Focus task
                            </button>
                          ) : null}
                          <span className={`pill pill--${experiment.status}`}>{experiment.status}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="empty-state">No running or stalled experiments.</p>
              )}
            </section>

            <section>
              <div className="home-mini-header">
                <h3>Planned sessions today</h3>
                <span>{dashboard.scheduledBlocks.length}</span>
              </div>
              {nextScheduledBlocks.length > 0 ? (
                <ul className="entity-list entity-list--timeline">
                  {nextScheduledBlocks.map((block) => {
                    const linkedTask = taskLookup.get(block.task_id) ?? null;

                    return (
                      <li className="entity-row" key={block.id}>
                        <button
                          className="entity-row__body-button"
                          onClick={() => setSelectedScheduledBlockId(block.id)}
                          type="button"
                        >
                          <strong>
                            {block.title_override ??
                              (linkedTask ? formatTaskIdentity(linkedTask) : "Untitled planned session")}
                          </strong>
                          <span>{formatTimeRange(block.starts_at, block.ends_at)}</span>
                        </button>
                        <div className="home-row-actions">
                          {linkedTask ? (
                            <button
                              className="button button--ghost button--small"
                              onClick={() => setSelectedTaskId(linkedTask.id)}
                              type="button"
                            >
                              Focus task
                            </button>
                          ) : null}
                          <span className={`pill pill--${block.status}`}>
                            {formatScheduledBlockStatus(block.status)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="empty-state">No planned sessions for today.</p>
              )}
            </section>
          </div>
        </article>
      </section>

      {quickAction ? (
        <QuickActionDialog
          onClose={() => setQuickAction(null)}
          title={
            quickAction.kind === "task"
              ? "New task"
              : quickAction.kind === "note-edit"
                ? "Edit note"
                : quickAction.kind === "note-create"
                  ? "New note"
                  : "New experiment"
          }
          wide={quickAction.kind === "task"}
        >
          {quickAction.kind === "task" ? (
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

          {quickAction.kind === "note-create" || quickAction.kind === "note-edit" ? (
            <BulletNoteEditor
              autoFocus
              compact
              experiments={dashboard.experiments}
              initialContent={
                quickAction.kind === "note-edit" ? quickAction.block.content_markdown : ""
              }
              initialTaskId={
                quickAction.kind === "note-edit"
                  ? primaryTaskIdForNoteBlock(quickAction.block)
                  : focusTaskId ?? ""
              }
              onCancel={() => setQuickAction(null)}
              onError={setError}
              onSubmit={handleSaveJournalBlock}
              placeholder="Capture the next note with markdown, #tags, and references."
              submitLabel={quickAction.kind === "note-edit" ? "Save note" : "Add note"}
              submittingLabel={quickAction.kind === "note-edit" ? "Saving..." : "Adding..."}
              tasks={openTasks}
            />
          ) : null}

          {quickAction.kind === "experiment" ? (
            <ExperimentCreateForm
              fixedTaskId={focusTaskId ?? undefined}
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
