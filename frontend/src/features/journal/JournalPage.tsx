import { startTransition, type FormEvent, useEffect, useState } from "react";

import {
  appendJournalEntry,
  listJournalEntries,
  listTasks,
  type Note,
  type Task
} from "../../shared/api";
import { TaskSelect } from "../../shared/forms";

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
  entries: Note[];
  tasks: Task[];
  syncedAt: Date | null;
}

const initialState: JournalState = {
  entries: [],
  tasks: [],
  syncedAt: null
};

export function JournalPage() {
  const [state, setState] = useState<JournalState>(initialState);
  const [journalDay, setJournalDay] = useState(localDateKey());
  const [entryContent, setEntryContent] = useState("");
  const [entryTaskId, setEntryTaskId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAppending, setIsAppending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadJournalEntries(day: string) {
    setIsLoading(true);
    try {
      const [entries, tasks] = await Promise.all([listJournalEntries(day), listTasks()]);
      startTransition(() => {
        setState({
          entries,
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
    void loadJournalEntries(journalDay);
  }, [journalDay]);

  async function handleAppendEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (entryContent.trim().length === 0) {
      setError("Journal entry is required.");
      return;
    }

    setIsAppending(true);
    try {
      await appendJournalEntry(journalDay, entryContent.trim(), entryTaskId || null);
      setEntryContent("");
      await loadJournalEntries(journalDay);
    } catch (appendError) {
      setError(appendError instanceof Error ? appendError.message : "Failed to append entry.");
    } finally {
      setIsAppending(false);
    }
  }

  const taskLookup = new Map(state.tasks.map((task) => [task.id, task]));
  const openTasks = state.tasks.filter((task) => !["done", "archived"].includes(task.status));

  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <p className="eyebrow">Journal</p>
          <h1>{journalDay}</h1>
        </div>
        <div className="sync-chip">
          <span>{isLoading ? "Loading..." : "Daily journal"}</span>
          <strong>{state.syncedAt ? formatDateTime(state.syncedAt.toISOString()) : "Sync pending"}</strong>
        </div>
      </section>

      <section className="operations-grid operations-grid--journal">
        <article className="panel panel--stack">
          <div className="panel-header panel-header--compact">
            <div>
              <p className="section-kicker">Daily entries</p>
              <h2>{state.entries.length} entries</h2>
            </div>
            <label className="date-field">
              <span>Day</span>
              <input
                onChange={(event) => setJournalDay(event.target.value)}
                type="date"
                value={journalDay}
              />
            </label>
          </div>

          {error ? <div className="banner banner--error">{error}</div> : null}
          {isLoading ? <div className="banner">Loading journal...</div> : null}

          {state.entries.length > 0 ? (
            <ol className="journal-list journal-list--long">
              {state.entries.map((entry) => (
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
            <p className="empty-state">No entries for this day.</p>
          )}
        </article>

        <article className="panel panel--stack">
          <p className="section-kicker">Append</p>
          <form className="compact-form compact-form--flush" onSubmit={(event) => void handleAppendEntry(event)}>
            <TaskSelect
              includeUnassigned
              label="Linked task"
              onChange={setEntryTaskId}
              tasks={openTasks}
              value={entryTaskId}
            />
            <label>
              <span>Entry</span>
              <textarea
                onChange={(event) => setEntryContent(event.target.value)}
                placeholder="Capture the note."
                rows={10}
                value={entryContent}
              />
            </label>
            <button className="button button--accent" disabled={isAppending} type="submit">
              {isAppending ? "Appending..." : "Append entry"}
            </button>
          </form>
        </article>
      </section>
    </main>
  );
}
