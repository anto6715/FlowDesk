import { startTransition, useEffect, useState } from "react";

import {
  listExperiments,
  listTagBacklinks,
  listTasks,
  type Experiment,
  type NoteBlock,
  type Task
} from "../../shared/api";
import { BulletNoteCard } from "../../shared/notes";

function formatDateTime(iso: string | null) {
  if (iso === null) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));
}

interface TagDetailPageProps {
  onBack: () => void;
  onOpenExperiment: (experimentId: string) => void;
  onOpenTag: (tagName: string) => void;
  onOpenTask: (taskId: string) => void;
  tagName: string;
}

interface TagDetailState {
  blocks: NoteBlock[];
  experiments: Experiment[];
  tasks: Task[];
  syncedAt: Date | null;
}

const initialState: TagDetailState = {
  blocks: [],
  experiments: [],
  tasks: [],
  syncedAt: null
};

export function TagDetailPage({
  onBack,
  onOpenExperiment,
  onOpenTag,
  onOpenTask,
  tagName
}: TagDetailPageProps) {
  const [state, setState] = useState<TagDetailState>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTagDetail() {
      setIsLoading(true);
      try {
        const [blocks, experiments, tasks] = await Promise.all([
          listTagBacklinks(tagName),
          listExperiments(),
          listTasks()
        ]);
        startTransition(() => {
          setState({
            blocks,
            experiments,
            tasks,
            syncedAt: new Date()
          });
          setError(null);
        });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load tag view.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadTagDetail();
  }, [tagName]);

  const taskLookup = new Map(state.tasks.map((task) => [task.id, task]));
  const experimentLookup = new Map(
    state.experiments.map((experiment) => [experiment.id, experiment])
  );

  return (
    <main className="page-shell">
      <section className="hero hero--compact journal-hero">
        <div>
          <p className="eyebrow">Tag view</p>
          <h1>#{tagName}</h1>
        </div>
        <div className="task-hero-actions">
          <button className="button button--ghost" onClick={onBack} type="button">
            Back
          </button>
          <div className="sync-chip sync-chip--quiet">
            <span>{isLoading ? "Loading..." : "Tagged bullets"}</span>
            <strong>
              {state.syncedAt ? formatDateTime(state.syncedAt.toISOString()) : "Sync pending"}
            </strong>
          </div>
        </div>
      </section>

      {error ? <div className="banner banner--error">{error}</div> : null}
      {isLoading ? <div className="banner">Loading tag view...</div> : null}

      <section className="journal-workspace">
        <article className="panel panel--stack journal-entry-panel">
          <div className="panel-header panel-header--compact">
            <div>
              <p className="section-kicker">Tagged bullets</p>
              <h2>{state.blocks.length} matches</h2>
            </div>
          </div>

          {state.blocks.length > 0 ? (
            <ol className="journal-list journal-list--long">
              {state.blocks.map((block) => (
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
            <p className="empty-state">No bullets carry this tag yet.</p>
          )}
        </article>
      </section>
    </main>
  );
}
