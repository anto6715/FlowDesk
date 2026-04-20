import { startTransition, type FormEvent, useEffect, useState } from "react";

import {
  addTaskNote,
  listGitHubReferences,
  listMacroActivities,
  listExperiments,
  listScheduledBlocks,
  listTaskNotes,
  listTasks,
  listTaskWorkSessions,
  updateGitHubReference,
  updateTask,
  type Experiment,
  type GitHubReference,
  type MacroActivity,
  type Note,
  type ScheduledBlock,
  type Task,
  type TaskPriority,
  type WorkSession
} from "../../shared/api";
import { parseGitHubIssueOrPullUrl } from "../../shared/github";

interface TaskDetailPageProps {
  taskId: string;
  onBack: () => void;
}

interface TaskDetailState {
  tasks: Task[];
  macroActivities: MacroActivity[];
  githubReferences: GitHubReference[];
  task: Task | null;
  macroActivity: MacroActivity | null;
  githubReference: GitHubReference | null;
  workSessions: WorkSession[];
  experiments: Experiment[];
  scheduledBlocks: ScheduledBlock[];
  notes: Note[];
  syncedAt: Date | null;
}

const initialState: TaskDetailState = {
  tasks: [],
  macroActivities: [],
  githubReferences: [],
  task: null,
  macroActivity: null,
  githubReference: null,
  workSessions: [],
  experiments: [],
  scheduledBlocks: [],
  notes: [],
  syncedAt: null
};

interface MetadataFormState {
  title: string;
  description: string;
  priority: TaskPriority;
  macroActivityId: string;
  githubReferenceId: string;
  githubEntryMode: "url" | "manual";
  githubRepositoryFullName: string;
  githubIssueNumber: string;
  githubIssueUrl: string;
  githubCachedTitle: string;
}

const initialMetadataForm: MetadataFormState = {
  title: "",
  description: "",
  priority: "normal",
  macroActivityId: "",
  githubReferenceId: "",
  githubEntryMode: "url",
  githubRepositoryFullName: "",
  githubIssueNumber: "",
  githubIssueUrl: "",
  githubCachedTitle: ""
};

const priorityOptions: Array<{ value: TaskPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" }
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

function formatDuration(workSession: WorkSession) {
  if (workSession.ended_at === null) {
    return "Active";
  }

  const elapsedMs = Math.max(
    new Date(workSession.ended_at).getTime() - new Date(workSession.started_at).getTime(),
    0
  );
  const totalMinutes = Math.floor(elapsedMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
}

function statusLabel(value: string | null) {
  return value === null ? "none" : value.replace(/_/g, " ");
}

function formatGitHubReference(reference: GitHubReference) {
  const title = reference.cached_title ? ` - ${reference.cached_title}` : "";
  return `${reference.repository_full_name}#${reference.issue_number}${title}`;
}

function buildMetadataForm(
  task: Task | null,
  githubReference: GitHubReference | null
): MetadataFormState {
  if (task === null) {
    return initialMetadataForm;
  }

  return {
    title: task.title,
    description: task.description ?? "",
    priority: task.priority,
    macroActivityId: task.macro_activity_id ?? "",
    githubReferenceId: task.github_reference_id ?? "",
    githubEntryMode: "url",
    githubRepositoryFullName: githubReference?.repository_full_name ?? "",
    githubIssueNumber: githubReference ? String(githubReference.issue_number) : "",
    githubIssueUrl: githubReference?.issue_url ?? "",
    githubCachedTitle: githubReference?.cached_title ?? ""
  };
}

function formatTimeRange(startsAt: string, endsAt: string) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
  return `${formatter.format(new Date(startsAt))} - ${formatter.format(new Date(endsAt))}`;
}

export function TaskDetailPage({ taskId, onBack }: TaskDetailPageProps) {
  const [state, setState] = useState<TaskDetailState>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [metadataForm, setMetadataForm] =
    useState<MetadataFormState>(initialMetadataForm);
  const [noteContent, setNoteContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadTaskDetail() {
    setIsLoading(true);
    try {
      const [
        tasks,
        macroActivities,
        githubReferences,
        workSessions,
        experiments,
        scheduledBlocks,
        notes
      ] = await Promise.all([
        listTasks(),
        listMacroActivities(),
        listGitHubReferences(),
        listTaskWorkSessions(taskId),
        listExperiments({ task_id: taskId }),
        listScheduledBlocks({ task_id: taskId }),
        listTaskNotes(taskId)
      ]);
      const task = tasks.find((item) => item.id === taskId) ?? null;
      const macroActivity =
        task?.macro_activity_id !== null && task?.macro_activity_id !== undefined
          ? macroActivities.find((item) => item.id === task.macro_activity_id) ?? null
          : null;
      const githubReference =
        task?.github_reference_id !== null && task?.github_reference_id !== undefined
          ? githubReferences.find((item) => item.id === task.github_reference_id) ?? null
          : null;

      startTransition(() => {
        setState({
          tasks,
          macroActivities,
          githubReferences,
          task,
          macroActivity,
          githubReference,
          workSessions,
          experiments,
          scheduledBlocks,
          notes,
          syncedAt: new Date()
        });
        setMetadataForm(buildMetadataForm(task, githubReference));
        setError(task === null ? "Task was not found." : null);
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load task detail.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadTaskDetail();
  }, [taskId]);

  function handleGitHubReferenceSelection(referenceId: string) {
    const reference =
      referenceId.length > 0
        ? state.githubReferences.find((item) => item.id === referenceId) ?? null
        : null;

    setMetadataForm((current) => ({
      ...current,
      githubReferenceId: referenceId,
      githubEntryMode: "url",
      githubRepositoryFullName: reference?.repository_full_name ?? "",
      githubIssueNumber: reference ? String(reference.issue_number) : "",
      githubIssueUrl: reference?.issue_url ?? "",
      githubCachedTitle: reference?.cached_title ?? ""
    }));
  }

  async function handleSaveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.task === null) {
      return;
    }
    if (metadataForm.title.trim().length === 0) {
      setError("Task title is required.");
      return;
    }

    const githubReferenceId = metadataForm.githubReferenceId || null;
    setIsSavingMetadata(true);
    try {
      if (githubReferenceId !== null) {
        const selectedReference =
          state.githubReferences.find((reference) => reference.id === githubReferenceId) ?? null;
        const parsedReference =
          metadataForm.githubEntryMode === "url"
            ? parseGitHubIssueOrPullUrl(metadataForm.githubIssueUrl)
            : null;
        const repositoryFullName =
          parsedReference?.repositoryFullName ??
          metadataForm.githubRepositoryFullName.trim();
        const issueNumber =
          parsedReference?.issueNumber ??
          Number.parseInt(metadataForm.githubIssueNumber, 10);
        const issueUrl =
          parsedReference?.issueUrl ||
          metadataForm.githubIssueUrl.trim() ||
          `https://github.com/${repositoryFullName}/issues/${issueNumber}`;

        if (repositoryFullName.length === 0) {
          setError("GitHub repository is required.");
          return;
        }
        if (metadataForm.githubEntryMode === "url" && parsedReference === null) {
          setError("Paste a valid GitHub issue or pull request URL.");
          return;
        }
        if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
          setError("GitHub issue or PR number must be a positive integer.");
          return;
        }

        if (
          selectedReference === null ||
          selectedReference.repository_full_name !== repositoryFullName ||
          selectedReference.issue_number !== issueNumber ||
          selectedReference.issue_url !== issueUrl ||
          (selectedReference.cached_title ?? "") !== metadataForm.githubCachedTitle.trim()
        ) {
          await updateGitHubReference(githubReferenceId, {
            repository_full_name: repositoryFullName,
            issue_number: issueNumber,
            issue_url: issueUrl,
            cached_title: metadataForm.githubCachedTitle.trim() || null
          });
        }
      }

      await updateTask(state.task.id, {
        title: metadataForm.title.trim(),
        description: metadataForm.description.trim() || null,
        priority: metadataForm.priority,
        macro_activity_id: metadataForm.macroActivityId || null,
        github_reference_id: githubReferenceId
      });
      await loadTaskDetail();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update task.");
    } finally {
      setIsSavingMetadata(false);
    }
  }

  async function handleAddNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (noteContent.trim().length === 0) {
      setError("Task note is required.");
      return;
    }

    setIsAddingNote(true);
    try {
      await addTaskNote(taskId, noteContent.trim());
      setNoteContent("");
      await loadTaskDetail();
    } catch (noteError) {
      setError(noteError instanceof Error ? noteError.message : "Failed to add task note.");
    } finally {
      setIsAddingNote(false);
    }
  }

  const task = state.task;
  const unavailableGithubReferenceIds = new Set(
    state.tasks.flatMap((item) =>
      item.id !== task?.id && item.github_reference_id ? [item.github_reference_id] : []
    )
  );
  const availableGithubReferences = state.githubReferences.filter(
    (reference) =>
      !unavailableGithubReferenceIds.has(reference.id) ||
      reference.id === metadataForm.githubReferenceId
  );
  const selectedGithubReference =
    metadataForm.githubReferenceId.length > 0
      ? state.githubReferences.find((reference) => reference.id === metadataForm.githubReferenceId) ??
        null
      : null;

  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <p className="eyebrow">Task detail</p>
          <h1>{task?.title ?? "Task"}</h1>
        </div>
        <div className="sync-chip">
          <span>{isLoading ? "Loading..." : "Task workspace"}</span>
          <strong>{state.syncedAt ? formatDateTime(state.syncedAt.toISOString()) : "Sync pending"}</strong>
        </div>
      </section>

      <div className="action-row action-row--top">
        <button className="button button--ghost" onClick={onBack} type="button">
          Back to tasks
        </button>
      </div>

      {error ? <div className="banner banner--error">{error}</div> : null}
      {isLoading ? <div className="banner">Loading task detail...</div> : null}

      {task ? (
        <>
          <section className="detail-grid">
            <article className="summary-card summary-card--spotlight">
              <p className="section-kicker">Summary</p>
              <h2>{task.title}</h2>
              <p className="summary-copy">{task.description || "No description yet."}</p>
              <div className="pill-row">
                <span className={`pill pill--${task.status}`}>{statusLabel(task.status)}</span>
                <span className={`pill pill--priority-${task.priority}`}>{task.priority}</span>
              </div>
              <div className="context-row">
                <span>Waiting: {statusLabel(task.waiting_reason)}</span>
                <span>Created: {formatDateTime(task.created_at)}</span>
                <span>Updated: {formatDateTime(task.updated_at)}</span>
              </div>
            </article>

            <article className="summary-card">
              <p className="section-kicker">References</p>
              <div className="reference-list">
                <div>
                  <span>Macro-activity</span>
                  <strong>{state.macroActivity?.name ?? "None"}</strong>
                </div>
                <div>
                  <span>GitHub</span>
                  {state.githubReference ? (
                    <a
                      className="text-link"
                      href={state.githubReference.issue_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {formatGitHubReference(state.githubReference)}
                    </a>
                  ) : (
                    <strong>None</strong>
                  )}
                </div>
              </div>
              <form className="compact-form metadata-form" onSubmit={(event) => void handleSaveMetadata(event)}>
                <label>
                  <span>Title</span>
                  <input
                    onChange={(event) =>
                      setMetadataForm((current) => ({ ...current, title: event.target.value }))
                    }
                    value={metadataForm.title}
                  />
                </label>
                <label>
                  <span>Description</span>
                  <textarea
                    onChange={(event) =>
                      setMetadataForm((current) => ({
                        ...current,
                        description: event.target.value
                      }))
                    }
                    rows={4}
                    value={metadataForm.description}
                  />
                </label>
                <div className="inline-grid inline-grid--metadata">
                  <label>
                    <span>Priority</span>
                    <select
                      onChange={(event) =>
                        setMetadataForm((current) => ({
                          ...current,
                          priority: event.target.value as TaskPriority
                        }))
                      }
                      value={metadataForm.priority}
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
                        setMetadataForm((current) => ({
                          ...current,
                          macroActivityId: event.target.value
                        }))
                      }
                      value={metadataForm.macroActivityId}
                    >
                      <option value="">No macro-activity</option>
                      {state.macroActivities.map((macroActivity) => (
                        <option key={macroActivity.id} value={macroActivity.id}>
                          {macroActivity.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  <span>GitHub reference</span>
                  <select
                    onChange={(event) => handleGitHubReferenceSelection(event.target.value)}
                    value={metadataForm.githubReferenceId}
                  >
                    <option value="">No GitHub reference</option>
                    {availableGithubReferences.map((reference) => (
                      <option key={reference.id} value={reference.id}>
                        {formatGitHubReference(reference)}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedGithubReference ? (
                  <div className="embedded-form-grid">
                    <div className="segmented-control">
                      <button
                        className={
                          metadataForm.githubEntryMode === "url"
                            ? "segmented-control__item segmented-control__item--active"
                            : "segmented-control__item"
                        }
                        onClick={() =>
                          setMetadataForm((current) => ({
                            ...current,
                            githubEntryMode: "url"
                          }))
                        }
                        type="button"
                      >
                        Paste URL
                      </button>
                      <button
                        className={
                          metadataForm.githubEntryMode === "manual"
                            ? "segmented-control__item segmented-control__item--active"
                            : "segmented-control__item"
                        }
                        onClick={() =>
                          setMetadataForm((current) => ({
                            ...current,
                            githubEntryMode: "manual"
                          }))
                        }
                        type="button"
                      >
                        Manual
                      </button>
                    </div>
                    {metadataForm.githubEntryMode === "url" ? (
                      <label>
                        <span>GitHub issue or PR URL</span>
                        <input
                          onChange={(event) =>
                            setMetadataForm((current) => ({
                              ...current,
                              githubIssueUrl: event.target.value
                            }))
                          }
                          value={metadataForm.githubIssueUrl}
                        />
                      </label>
                    ) : (
                      <>
                        <label>
                          <span>Repository</span>
                          <input
                            onChange={(event) =>
                              setMetadataForm((current) => ({
                                ...current,
                                githubRepositoryFullName: event.target.value
                              }))
                            }
                            value={metadataForm.githubRepositoryFullName}
                          />
                        </label>
                        <label>
                          <span>Issue or PR number</span>
                          <input
                            min="1"
                            onChange={(event) =>
                              setMetadataForm((current) => ({
                                ...current,
                                githubIssueNumber: event.target.value
                              }))
                            }
                            type="number"
                            value={metadataForm.githubIssueNumber}
                          />
                        </label>
                      </>
                    )}
                    <label>
                      <span>Title</span>
                      <input
                        onChange={(event) =>
                          setMetadataForm((current) => ({
                            ...current,
                            githubCachedTitle: event.target.value
                          }))
                        }
                        value={metadataForm.githubCachedTitle}
                      />
                    </label>
                  </div>
                ) : null}
                <button className="button button--accent" disabled={isSavingMetadata} type="submit">
                  {isSavingMetadata ? "Saving..." : "Save metadata"}
                </button>
              </form>
            </article>
          </section>

          <section className="operations-grid operations-grid--detail">
            <article className="panel panel--stack">
              <div className="panel-header panel-header--compact">
                <div>
                  <p className="section-kicker">Work sessions</p>
                  <h2>{state.workSessions.length} sessions</h2>
                </div>
              </div>
              {state.workSessions.length > 0 ? (
                <ul className="entity-list entity-list--timeline">
                  {state.workSessions.map((workSession) => (
                    <li className="entity-row" key={workSession.id}>
                      <div>
                        <strong>{formatDuration(workSession)}</strong>
                        <span>
                          {formatDateTime(workSession.started_at)} to{" "}
                          {formatDateTime(workSession.ended_at)}
                        </span>
                      </div>
                      <span className="pill">{statusLabel(workSession.end_reason)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">No work sessions recorded yet.</p>
              )}
            </article>

            <article className="panel panel--stack">
              <div className="panel-header panel-header--compact">
                <div>
                  <p className="section-kicker">Experiments</p>
                  <h2>{state.experiments.length} linked runs</h2>
                </div>
              </div>
              {state.experiments.length > 0 ? (
                <ul className="entity-list">
                  {state.experiments.map((experiment) => (
                    <li className="entity-row" key={experiment.id}>
                      <div>
                        <strong>{experiment.title}</strong>
                        <span>{experiment.instruction || "No instruction"}</span>
                      </div>
                      <span className={`pill pill--${experiment.status}`}>
                        {experiment.status}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">No experiments linked to this task.</p>
              )}
            </article>

            <article className="panel panel--stack">
              <div className="panel-header panel-header--compact">
                <div>
                  <p className="section-kicker">Planned blocks</p>
                  <h2>{state.scheduledBlocks.length} blocks</h2>
                </div>
              </div>
              {state.scheduledBlocks.length > 0 ? (
                <ul className="entity-list entity-list--timeline">
                  {state.scheduledBlocks.map((block) => (
                    <li className="entity-row" key={block.id}>
                      <div>
                        <strong>{block.title_override ?? task.title}</strong>
                        <span>{formatTimeRange(block.starts_at, block.ends_at)}</span>
                      </div>
                      <span className={`pill pill--${block.status}`}>{block.status}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">No planned blocks for this task.</p>
              )}
            </article>

            <article className="panel panel--stack">
              <div className="panel-header panel-header--compact">
                <div>
                  <p className="section-kicker">Task notes</p>
                  <h2>{state.notes.length} notes</h2>
                </div>
              </div>

              {state.notes.length > 0 ? (
                <ol className="journal-list journal-list--long">
                  {state.notes.map((note) => (
                    <li key={note.id}>
                      <time>{formatDateTime(note.created_at)}</time>
                      <p>{note.content}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="empty-state">No task notes yet.</p>
              )}

              <form
                className="compact-form"
                onSubmit={(event) => void handleAddNote(event)}
              >
                <label>
                  <span>Add note</span>
                  <textarea
                    onChange={(event) => setNoteContent(event.target.value)}
                    placeholder="Capture task-specific context."
                    rows={5}
                    value={noteContent}
                  />
                </label>
                <button className="button button--accent" disabled={isAddingNote} type="submit">
                  {isAddingNote ? "Adding..." : "Add note"}
                </button>
              </form>
            </article>
          </section>
        </>
      ) : null}
    </main>
  );
}
