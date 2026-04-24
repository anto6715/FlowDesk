import { startTransition, type FormEvent, useEffect, useState } from "react";

import {
  addExperimentNote,
  getExperiment,
  listExperimentBacklinks,
  listExperimentNotes,
  listTasks,
  type Experiment,
  type Note,
  type NoteBlock,
  type Task
} from "../../shared/api";
import { formatTaskStatus } from "../../shared/labels";
import { BulletNoteCard } from "../../shared/notes";

interface ExperimentDetailPageProps {
  experimentId: string;
  onBack: () => void;
  onOpenExperiment: (experimentId: string) => void;
  onOpenTag: (tagName: string) => void;
  onOpenTask: (taskId: string) => void;
}

interface ExperimentDetailState {
  experiment: Experiment | null;
  linkedTask: Task | null;
  tasks: Task[];
  notes: Note[];
  backlinks: NoteBlock[];
  syncedAt: Date | null;
}

const initialState: ExperimentDetailState = {
  experiment: null,
  linkedTask: null,
  tasks: [],
  notes: [],
  backlinks: [],
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

function formatDuration(experiment: Experiment) {
  if (experiment.started_at === null) {
    return "Not started";
  }
  if (experiment.ended_at === null) {
    return "Running or open-ended";
  }

  const elapsedMs = Math.max(
    new Date(experiment.ended_at).getTime() - new Date(experiment.started_at).getTime(),
    0
  );
  const totalMinutes = Math.floor(elapsedMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
}

function noteWasEdited(note: Note) {
  return Math.abs(new Date(note.updated_at).getTime() - new Date(note.created_at).getTime()) > 1000;
}

function shortenId(id: string) {
  return id.slice(0, 8);
}

function formatTaskIdentity(task: Task) {
  return `${task.title} • ${shortenId(task.id)}`;
}

function formatRecordedValue(value: string | null, emptyLabel = "Not recorded") {
  return value && value.trim().length > 0 ? value : emptyLabel;
}

function compareByUpdatedDesc(left: { updated_at: string }, right: { updated_at: string }) {
  return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
}

function compareByCreatedDesc(left: { created_at: string }, right: { created_at: string }) {
  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
}

export function ExperimentDetailPage({
  experimentId,
  onBack,
  onOpenExperiment,
  onOpenTag,
  onOpenTask
}: ExperimentDetailPageProps) {
  const [state, setState] = useState<ExperimentDetailState>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadExperimentDetail() {
    setIsLoading(true);
    try {
      const [experiment, tasks, notes, backlinks] = await Promise.all([
        getExperiment(experimentId),
        listTasks(),
        listExperimentNotes(experimentId),
        listExperimentBacklinks(experimentId)
      ]);
      startTransition(() => {
        setState({
          experiment,
          linkedTask: tasks.find((task) => task.id === experiment.task_id) ?? null,
          tasks,
          notes,
          backlinks,
          syncedAt: new Date()
        });
        setError(null);
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load experiment detail.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadExperimentDetail();
  }, [experimentId]);

  async function handleAddNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (noteContent.trim().length === 0) {
      setError("Experiment comment is required.");
      return;
    }

    setIsAddingNote(true);
    try {
      await addExperimentNote(experimentId, noteContent.trim());
      setNoteContent("");
      await loadExperimentDetail();
    } catch (noteError) {
      setError(noteError instanceof Error ? noteError.message : "Failed to add experiment note.");
    } finally {
      setIsAddingNote(false);
    }
  }

  const experiment = state.experiment;
  const linkedTask = state.linkedTask;
  const sortedNotes = [...state.notes].sort(compareByUpdatedDesc);
  const sortedBacklinks = [...state.backlinks].sort(compareByCreatedDesc);
  const taskLookup = new Map(state.tasks.map((task) => [task.id, task]));
  const experimentLookup = new Map(
    (state.experiment ? [state.experiment] : []).map((item) => [item.id, item])
  );

  return (
    <main className="page-shell">
      <section className="hero hero--compact task-detail-hero">
        <div>
          <p className="eyebrow">Experiment detail</p>
          <h1>{experiment?.title ?? "Experiment"}</h1>
        </div>
        <div className="task-hero-actions">
          <button className="button button--ghost" onClick={onBack} type="button">
            Back to experiments
          </button>
          {linkedTask ? (
            <button
              className="button button--ghost"
              onClick={() => onOpenTask(linkedTask.id)}
              type="button"
            >
              Open linked task
            </button>
          ) : null}
          <div className="sync-chip sync-chip--quiet">
            <span>{isLoading ? "Loading..." : "Run workspace"}</span>
            <strong>
              {state.syncedAt ? formatDateTime(state.syncedAt.toISOString()) : "Sync pending"}
            </strong>
          </div>
        </div>
      </section>

      {error ? <div className="banner banner--error">{error}</div> : null}
      {isLoading ? <div className="banner">Loading experiment detail...</div> : null}

      {experiment ? (
        <section className="task-detail-workspace">
          <div className="task-detail-main">
            <article className="summary-card summary-card--spotlight task-summary-card experiment-summary-card">
              <p className="section-kicker">Run workspace</p>
              <div className="experiment-summary-card__head">
                <div>
                  <h2>{experiment.title}</h2>
                  <p className="summary-copy">
                    {experiment.outcome_summary ||
                      experiment.instruction ||
                      "No outcome summary or instruction has been recorded yet."}
                  </p>
                </div>
                <div className="pill-row pill-row--tight">
                  <span className={`pill pill--${experiment.status}`}>{experiment.status}</span>
                  {linkedTask ? (
                    <span className={`pill pill--${linkedTask.status}`}>
                      {formatTaskStatus(linkedTask.status)}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="context-row">
                <span>Experiment id: {shortenId(experiment.id)}</span>
                <span>
                  Linked task:{" "}
                  {linkedTask ? formatTaskIdentity(linkedTask) : "Unknown task"}
                </span>
                <span>Version: {formatRecordedValue(experiment.version_label)}</span>
              </div>

              <div className="stat-strip">
                <div>
                  <span>Duration</span>
                  <strong>{formatDuration(experiment)}</strong>
                </div>
                <div>
                  <span>Comments</span>
                  <strong>{sortedNotes.length}</strong>
                </div>
                <div>
                  <span>Backlinks</span>
                  <strong>{sortedBacklinks.length}</strong>
                </div>
              </div>

              <div className="task-overview-actions">
                {linkedTask ? (
                  <button
                    className="button button--ghost"
                    onClick={() => onOpenTask(linkedTask.id)}
                    type="button"
                  >
                    Open linked task
                  </button>
                ) : null}
              </div>
            </article>

            <article className="panel panel--stack experiment-code-board">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Run brief</p>
                  <h2>Instruction and command</h2>
                </div>
              </div>

              <div className="experiment-code-stack">
                <section className="experiment-code-section">
                  <div className="experiment-section-header">
                    <h3 className="mini-title">Instruction</h3>
                  </div>
                  <pre className="code-panel">
                    {experiment.instruction || "No instruction recorded."}
                  </pre>
                </section>

                <section className="experiment-code-section">
                  <div className="experiment-section-header">
                    <h3 className="mini-title">Launch command</h3>
                  </div>
                  <pre className="code-panel">
                    {experiment.launch_command || "No launcher command recorded."}
                  </pre>
                </section>
              </div>
            </article>

            <article className="panel panel--stack task-notes-board">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Comments</p>
                  <h2>{sortedNotes.length} experiment comments</h2>
                </div>
              </div>

              <form
                className="compact-form compact-form--flush experiment-comment-composer"
                onSubmit={(event) => void handleAddNote(event)}
              >
                <label>
                  <span>Add comment</span>
                  <textarea
                    onChange={(event) => setNoteContent(event.target.value)}
                    placeholder="Capture what changed, what failed, or what you need to remember."
                    rows={5}
                    value={noteContent}
                  />
                </label>
                <div className="form-actions">
                  <button className="button button--accent" disabled={isAddingNote} type="submit">
                    {isAddingNote ? "Adding..." : "Add comment"}
                  </button>
                </div>
              </form>

              {sortedNotes.length > 0 ? (
                <ol className="comment-list">
                  {sortedNotes.map((note) => (
                    <li className="comment-card" key={note.id}>
                      <div className="comment-card__meta">
                        <time>{formatDateTime(note.created_at)}</time>
                        {noteWasEdited(note) ? (
                          <span>Edited {formatDateTime(note.updated_at)}</span>
                        ) : null}
                      </div>
                      <p className="comment-card__content">{note.content}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="empty-state">No experiment comments yet.</p>
              )}
            </article>

            <article className="panel panel--stack">
              <div className="panel-header panel-header--compact">
                <div>
                  <p className="section-kicker">Backlinks</p>
                  <h2>{sortedBacklinks.length} linked journal bullets</h2>
                </div>
              </div>
              {sortedBacklinks.length > 0 ? (
                <ol className="journal-list journal-list--long">
                  {sortedBacklinks.map((block) => (
                    <BulletNoteCard
                      block={block}
                      experimentLookup={experimentLookup}
                      key={block.id}
                      onOpenExperiment={onOpenExperiment}
                      onOpenTag={onOpenTag}
                      onOpenTask={onOpenTask}
                      taskLookup={taskLookup}
                    />
                  ))}
                </ol>
              ) : (
                <p className="empty-state">No journal bullets link to this experiment yet.</p>
              )}
            </article>
          </div>

          <aside className="task-detail-side">
            <article className="panel panel--stack task-context-panel">
              <div className="panel-header panel-header--compact">
                <div>
                  <p className="section-kicker">Run metadata</p>
                  <h2>Lifecycle</h2>
                </div>
              </div>
              <div className="reference-list">
                <div>
                  <span>Status</span>
                  <strong>{experiment.status}</strong>
                </div>
                <div>
                  <span>Started</span>
                  <strong>{formatDateTime(experiment.started_at)}</strong>
                </div>
                <div>
                  <span>Ended</span>
                  <strong>{formatDateTime(experiment.ended_at)}</strong>
                </div>
                <div>
                  <span>Created</span>
                  <strong>{formatDateTime(experiment.created_at)}</strong>
                </div>
                <div>
                  <span>Updated</span>
                  <strong>{formatDateTime(experiment.updated_at)}</strong>
                </div>
                <div>
                  <span>Scheduler</span>
                  <strong>
                    {experiment.scheduler_name || "None"}
                    {experiment.scheduler_job_id ? ` #${experiment.scheduler_job_id}` : ""}
                  </strong>
                </div>
                <div>
                  <span>Version</span>
                  <strong>{formatRecordedValue(experiment.version_label)}</strong>
                </div>
              </div>
            </article>

            <article className="panel panel--stack">
              <div className="panel-header panel-header--compact">
                <div>
                  <p className="section-kicker">Execution context</p>
                  <h2>Paths and source</h2>
                </div>
              </div>

              <div className="experiment-field-list">
                <section>
                  <span>Work directory</span>
                  <pre className="code-panel code-panel--compact">
                    {formatRecordedValue(experiment.work_dir)}
                  </pre>
                </section>
                <section>
                  <span>Repository path</span>
                  <pre className="code-panel code-panel--compact">
                    {formatRecordedValue(experiment.repository_path)}
                  </pre>
                </section>
                <section>
                  <span>Branch</span>
                  <pre className="code-panel code-panel--compact">
                    {formatRecordedValue(experiment.branch_name)}
                  </pre>
                </section>
                <section>
                  <span>Commit hash</span>
                  <pre className="code-panel code-panel--compact">
                    {formatRecordedValue(experiment.commit_hash)}
                  </pre>
                </section>
              </div>
            </article>

            <article className="panel panel--stack">
              <div className="panel-header panel-header--compact">
                <div>
                  <p className="section-kicker">Artifacts and outcome</p>
                  <h2>Outputs</h2>
                </div>
              </div>

              <div className="experiment-field-list">
                <section>
                  <span>Outcome summary</span>
                  <div className="experiment-copy-card">
                    <p>{experiment.outcome_summary || "No outcome summary recorded."}</p>
                  </div>
                </section>
                <section>
                  <span>Log path</span>
                  <pre className="code-panel code-panel--compact">
                    {formatRecordedValue(experiment.log_path)}
                  </pre>
                </section>
                <section>
                  <span>Result path</span>
                  <pre className="code-panel code-panel--compact">
                    {formatRecordedValue(experiment.result_path)}
                  </pre>
                </section>
              </div>
            </article>
          </aside>
        </section>
      ) : null}
    </main>
  );
}
