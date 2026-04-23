import { startTransition, useEffect, useState } from "react";

import {
  createJournalNoteBlock,
  listJournalNoteBlocks,
  listTasks,
  updateNoteBlock,
  type NoteBlock,
  type Task
} from "../../shared/api";
import {
  BulletNoteCard,
  BulletNoteEditor,
  primaryTaskIdForNoteBlock
} from "../../shared/notes";

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

interface JournalState {
  blocks: NoteBlock[];
  tasks: Task[];
  syncedAt: Date | null;
}

const initialState: JournalState = {
  blocks: [],
  tasks: [],
  syncedAt: null
};

interface JournalPageProps {
  onOpenTask: (taskId: string) => void;
}

export function JournalPage({ onOpenTask }: JournalPageProps) {
  const [state, setState] = useState<JournalState>(initialState);
  const [journalDay, setJournalDay] = useState(localDateKey());
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadJournalBlocks(day: string) {
    setIsLoading(true);
    try {
      const [blocks, tasks] = await Promise.all([listJournalNoteBlocks(day), listTasks()]);
      startTransition(() => {
        setState({
          blocks,
          tasks,
          syncedAt: new Date()
        });
        setError(null);
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load journal.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    setEditingBlockId(null);
    void loadJournalBlocks(journalDay);
  }, [journalDay]);

  async function handleCreateBullet(input: {
    contentMarkdown: string;
    references: Array<{ target_type: "task" | "experiment"; target_id: string }>;
  }) {
    await createJournalNoteBlock(journalDay, {
      content_markdown: input.contentMarkdown,
      references: input.references
    });
    await loadJournalBlocks(journalDay);
  }

  async function handleUpdateBullet(
    blockId: string,
    input: {
      contentMarkdown: string;
      references: Array<{ target_type: "task" | "experiment"; target_id: string }>;
    }
  ) {
    await updateNoteBlock(blockId, {
      content_markdown: input.contentMarkdown,
      references: input.references
    });
    setEditingBlockId(null);
    await loadJournalBlocks(journalDay);
  }

  const taskLookup = new Map(state.tasks.map((task) => [task.id, task]));
  const openTasks = state.tasks.filter((task) => !["done", "archived"].includes(task.status));
  const editingBlock =
    editingBlockId !== null
      ? state.blocks.find((block) => block.id === editingBlockId) ?? null
      : null;

  return (
    <main className="page-shell">
      <section className="hero hero--compact journal-hero">
        <div>
          <p className="eyebrow">Journal</p>
          <h1>{journalDay}</h1>
        </div>
        <div className="task-hero-actions">
          <label className="date-field date-field--inline">
            <span>Day</span>
            <input
              onChange={(event) => setJournalDay(event.target.value)}
              type="date"
              value={journalDay}
            />
          </label>
          <div className="sync-chip sync-chip--quiet">
            <span>{isLoading ? "Loading..." : "Bullet journal"}</span>
            <strong>
              {state.syncedAt ? formatDateTime(state.syncedAt.toISOString()) : "Sync pending"}
            </strong>
          </div>
        </div>
      </section>

      {error ? <div className="banner banner--error">{error}</div> : null}
      {isLoading ? <div className="banner">Loading journal...</div> : null}

      <section className="journal-workspace">
        <article className="panel panel--stack journal-composer-panel">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Daily writing</p>
              <h2>New bullet</h2>
            </div>
          </div>
          <BulletNoteEditor
            onError={setError}
            onSubmit={handleCreateBullet}
            placeholder="Capture the next bullet, markdown and #tags included."
            submitLabel="Add bullet"
            submittingLabel="Adding..."
            tasks={openTasks}
          />
        </article>

        <article className="panel panel--stack journal-entry-panel">
          <div className="panel-header panel-header--compact">
            <div>
              <p className="section-kicker">Daily bullets</p>
              <h2>{state.blocks.length} bullets</h2>
            </div>
          </div>

          {state.blocks.length > 0 ? (
            <ol className="journal-list journal-list--long">
              {state.blocks.map((block) =>
                editingBlock?.id === block.id ? (
                  <li className="bullet-note bullet-note--editing" key={block.id}>
                    <BulletNoteEditor
                      autoFocus
                      compact
                      initialContent={block.content_markdown}
                      initialTaskId={primaryTaskIdForNoteBlock(block)}
                      onCancel={() => setEditingBlockId(null)}
                      onError={setError}
                      onSubmit={(input) => handleUpdateBullet(block.id, input)}
                      submitLabel="Save bullet"
                      submittingLabel="Saving..."
                      tasks={openTasks}
                    />
                  </li>
                ) : (
                  <BulletNoteCard
                    block={block}
                    key={block.id}
                    onEdit={(nextBlock) => setEditingBlockId(nextBlock.id)}
                    onOpenTask={onOpenTask}
                    taskLookup={taskLookup}
                  />
                )
              )}
            </ol>
          ) : (
            <p className="empty-state">No bullets for this day.</p>
          )}
        </article>
      </section>
    </main>
  );
}
