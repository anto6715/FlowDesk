import { startTransition, type FormEvent, useEffect, useState } from "react";

import {
  createScheduledBlock,
  listScheduledBlocks,
  listTasks,
  type ScheduledBlock,
  type Task
} from "../../shared/api";

interface CalendarState {
  tasks: Task[];
  scheduledBlocks: ScheduledBlock[];
  syncedAt: Date | null;
}

interface ScheduleFormState {
  taskId: string;
  titleOverride: string;
  startsAt: string;
  endsAt: string;
}

const initialState: CalendarState = {
  tasks: [],
  scheduledBlocks: [],
  syncedAt: null
};

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

function toDateTimeLocalValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getDefaultScheduleWindow(dayKey: string) {
  const todayKey = localDateKey();
  const startsAt = dayKey === todayKey ? new Date() : new Date(`${dayKey}T09:00:00`);
  if (dayKey === todayKey) {
    startsAt.setMinutes(startsAt.getMinutes() < 30 ? 30 : 60, 0, 0);
  }
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

  return {
    startsAt: toDateTimeLocalValue(startsAt),
    endsAt: toDateTimeLocalValue(endsAt)
  };
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

export function CalendarPage() {
  const [state, setState] = useState<CalendarState>(initialState);
  const [calendarDay, setCalendarDay] = useState(localDateKey());
  const [isLoading, setIsLoading] = useState(true);
  const [isScheduling, setIsScheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(() => {
    const defaultWindow = getDefaultScheduleWindow(localDateKey());
    return {
      taskId: "",
      titleOverride: "",
      startsAt: defaultWindow.startsAt,
      endsAt: defaultWindow.endsAt
    };
  });

  async function loadCalendar(day: string) {
    setIsLoading(true);
    try {
      const dayBounds = localDayBounds(day);
      const [tasks, scheduledBlocks] = await Promise.all([
        listTasks(),
        listScheduledBlocks({
          ends_after: dayBounds.startsAt,
          starts_before: dayBounds.endsAt
        })
      ]);
      startTransition(() => {
        setState({
          tasks,
          scheduledBlocks,
          syncedAt: new Date()
        });
        setError(null);
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load calendar.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCalendar(calendarDay);
    const defaultWindow = getDefaultScheduleWindow(calendarDay);
    setScheduleForm((current) => ({
      ...current,
      startsAt: defaultWindow.startsAt,
      endsAt: defaultWindow.endsAt
    }));
  }, [calendarDay]);

  const openTasks = state.tasks.filter((task) => !["done", "archived"].includes(task.status));
  const selectedTaskId = scheduleForm.taskId || openTasks[0]?.id || "";
  const taskLookup = new Map(state.tasks.map((task) => [task.id, task]));

  async function handleCreateScheduledBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedTaskId.length === 0) {
      setError("Pick a task before scheduling a block.");
      return;
    }

    setIsScheduling(true);
    try {
      await createScheduledBlock({
        task_id: selectedTaskId,
        title_override: scheduleForm.titleOverride.trim() || undefined,
        starts_at: new Date(scheduleForm.startsAt).toISOString(),
        ends_at: new Date(scheduleForm.endsAt).toISOString()
      });
      const defaultWindow = getDefaultScheduleWindow(calendarDay);
      setScheduleForm({
        taskId: selectedTaskId,
        titleOverride: "",
        startsAt: defaultWindow.startsAt,
        endsAt: defaultWindow.endsAt
      });
      await loadCalendar(calendarDay);
    } catch (scheduleError) {
      setError(scheduleError instanceof Error ? scheduleError.message : "Failed to schedule block.");
    } finally {
      setIsScheduling(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <p className="eyebrow">Calendar</p>
          <h1>{calendarDay}</h1>
        </div>
        <div className="sync-chip">
          <span>{isLoading ? "Loading..." : "Planning feed"}</span>
          <strong>{state.syncedAt ? formatDateTime(state.syncedAt.toISOString()) : "Sync pending"}</strong>
        </div>
      </section>

      <section className="operations-grid operations-grid--calendar">
        <article className="panel panel--stack">
          <div className="panel-header panel-header--compact">
            <div>
              <p className="section-kicker">Planned blocks</p>
              <h2>{state.scheduledBlocks.length} blocks</h2>
            </div>
            <label className="date-field">
              <span>Day</span>
              <input
                onChange={(event) => setCalendarDay(event.target.value)}
                type="date"
                value={calendarDay}
              />
            </label>
          </div>

          {error ? <div className="banner banner--error">{error}</div> : null}
          {isLoading ? <div className="banner">Loading calendar...</div> : null}

          {state.scheduledBlocks.length > 0 ? (
            <ul className="entity-list entity-list--timeline">
              {state.scheduledBlocks.map((block) => (
                <li className="entity-row" key={block.id}>
                  <div>
                    <strong>
                      {block.title_override ?? taskLookup.get(block.task_id)?.title ?? "Untitled block"}
                    </strong>
                    <span>{taskLookup.get(block.task_id)?.title ?? "Unknown task"}</span>
                  </div>
                  <time>{formatTimeRange(block.starts_at, block.ends_at)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No planned blocks for this day.</p>
          )}
        </article>

        <article className="panel panel--stack">
          <p className="section-kicker">Schedule</p>
          <form className="compact-form compact-form--flush" onSubmit={(event) => void handleCreateScheduledBlock(event)}>
            <label>
              <span>Task</span>
              <select
                disabled={openTasks.length === 0}
                onChange={(event) =>
                  setScheduleForm((current) => ({ ...current, taskId: event.target.value }))
                }
                value={selectedTaskId}
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
              <span>Title override</span>
              <input
                onChange={(event) =>
                  setScheduleForm((current) => ({
                    ...current,
                    titleOverride: event.target.value
                  }))
                }
                placeholder="Optional calendar label"
                value={scheduleForm.titleOverride}
              />
            </label>
            <div className="inline-grid">
              <label>
                <span>Start</span>
                <input
                  onChange={(event) =>
                    setScheduleForm((current) => ({ ...current, startsAt: event.target.value }))
                  }
                  type="datetime-local"
                  value={scheduleForm.startsAt}
                />
              </label>
              <label>
                <span>End</span>
                <input
                  onChange={(event) =>
                    setScheduleForm((current) => ({ ...current, endsAt: event.target.value }))
                  }
                  type="datetime-local"
                  value={scheduleForm.endsAt}
                />
              </label>
            </div>
            <button
              className="button button--accent"
              disabled={isScheduling || selectedTaskId.length === 0}
              type="submit"
            >
              {isScheduling ? "Scheduling..." : "Schedule block"}
            </button>
          </form>
        </article>
      </section>
    </main>
  );
}
