import { startTransition, type FormEvent, useEffect, useState } from "react";

import {
  addTaskNote,
  listExperiments,
  listGitHubReferences,
  listMacroActivities,
  listScheduledBlocks,
  listTaskNotes,
  listTasks,
  listTaskWorkSessions,
  type Experiment,
  type GitHubReference,
  type MacroActivity,
  type Note,
  type ScheduledBlock,
  type Task,
  type WorkSession
} from "../../shared/api";

interface TaskDetailPageProps {
  taskId: string;
  onBack: () => void;
}

interface TaskDetailState {
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
  task: null,
  macroActivity: null,
  githubReference: null,
  workSessions: [],
  experiments: [],
  scheduledBlocks: [],
  notes: [],
  syncedAt: null
};

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
  const [isAddingNote, setIsAddingNote] = useState(false);
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
          task,
          macroActivity,
          githubReference,
          workSessions,
          experiments,
          scheduledBlocks,
          notes,
          syncedAt: new Date()
        });
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
