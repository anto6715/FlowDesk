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
      setError("Experiment note is required.");
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
            <article className="summary-card summary-card--spotlight task-summary-card">
              <p className="section-kicker">Run summary</p>
              <h2>{experiment.title}</h2>
              <div className="pill-row">
                <span className={`pill pill--${experiment.status}`}>{experiment.status}</span>
              </div>
              {state.linkedTask ? (
                <button
                  className="task-title-button task-title-button--large"
                  onClick={() => onOpenTask(experiment.task_id)}
                  type="button"
                >
                  {state.linkedTask.title}
                </button>
              ) : (
                <p className="summary-copy">Linked task is not available.</p>
              )}
            </article>

            <article className="panel panel--stack">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Instruction</p>
                  <h2>Run context</h2>
                </div>
              </div>
              <pre className="code-panel">{experiment.instruction || "No instruction recorded."}</pre>
              <pre className="code-panel">
                {experiment.launch_command || "No launcher command recorded."}
              </pre>
            </article>

            <article className="panel panel--stack task-notes-board">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Experiment notes</p>
                  <h2>{state.notes.length} notes</h2>
                </div>
              </div>
              <form
                className="compact-form compact-form--flush task-note-composer"
                onSubmit={(event) => void handleAddNote(event)}
              >
                <label>
                  <span>Add note</span>
                  <textarea
                    onChange={(event) => setNoteContent(event.target.value)}
                    placeholder="Capture run-specific observations."
                    rows={5}
                    value={noteContent}
                  />
                </label>
                <button className="button button--accent" disabled={isAddingNote} type="submit">
                  {isAddingNote ? "Adding..." : "Add note"}
                </button>
              </form>
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
                <p className="empty-state">No experiment notes yet.</p>
              )}
            </article>

            <article className="panel panel--stack">
              <div className="panel-header panel-header--compact">
                <div>
                  <p className="section-kicker">Backlinks</p>
                  <h2>{state.backlinks.length} linked journal bullets</h2>
                </div>
              </div>
              {state.backlinks.length > 0 ? (
                <ol className="journal-list journal-list--long">
                  {state.backlinks.map((block) => (
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
                  <p className="section-kicker">Metadata</p>
                  <h2>Run details</h2>
                </div>
              </div>
              <div className="reference-list">
                <div>
                  <span>Duration</span>
                  <strong>{formatDuration(experiment)}</strong>
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
                  <span>Scheduler</span>
                  <strong>
                    {experiment.scheduler_name || "None"}
                    {experiment.scheduler_job_id ? ` #${experiment.scheduler_job_id}` : ""}
                  </strong>
                </div>
                <div>
                  <span>Work directory</span>
                  <strong>{experiment.work_dir || "Not recorded"}</strong>
                </div>
                <div>
                  <span>Repository</span>
                  <strong>{experiment.repository_path || "Not recorded"}</strong>
                </div>
                <div>
                  <span>Branch</span>
                  <strong>{experiment.branch_name || "Not recorded"}</strong>
                </div>
                <div>
                  <span>Commit</span>
                  <strong>{experiment.commit_hash || "Not recorded"}</strong>
                </div>
                <div>
                  <span>Outcome</span>
                  <strong>{experiment.outcome_summary || "Not recorded"}</strong>
                </div>
                <div>
                  <span>Logs</span>
                  <strong>{experiment.log_path || "Not recorded"}</strong>
                </div>
                <div>
                  <span>Results</span>
                  <strong>{experiment.result_path || "Not recorded"}</strong>
                </div>
              </div>
            </article>
          </aside>
        </section>
      ) : null}
    </main>
  );
}
