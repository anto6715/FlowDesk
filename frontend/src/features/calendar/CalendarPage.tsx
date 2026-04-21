import { startTransition, type FormEvent, useEffect, useState } from "react";

import {
  createScheduledBlock,
  listScheduledBlocks,
  listTasks,
  type ScheduledBlock,
  type Task
} from "../../shared/api";
import { QuickActionDialog, TaskSelect } from "../../shared/forms";

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

const calendarStartHour = 6;
const calendarEndHour = 22;
const calendarStartMinute = calendarStartHour * 60;
const calendarEndMinute = calendarEndHour * 60;
const calendarVisibleMinutes = calendarEndMinute - calendarStartMinute;

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

function formatHourLabel(hour: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric"
  }).format(new Date(2024, 0, 1, hour));
}

function minutesFromLocalDayStart(dayKey: string, iso: string) {
  const dayStart = new Date(`${dayKey}T00:00:00`);
  return Math.round((new Date(iso).getTime() - dayStart.getTime()) / 60000);
}

export function CalendarPage() {
  const [state, setState] = useState<CalendarState>(initialState);
  const [calendarDay, setCalendarDay] = useState(localDateKey());
  const [isLoading, setIsLoading] = useState(true);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
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
  const hourRows = Array.from(
    { length: calendarEndHour - calendarStartHour + 1 },
    (_, index) => calendarStartHour + index
  );
  const visibleBlocks = state.scheduledBlocks.flatMap((block) => {
    const rawStartMinute = minutesFromLocalDayStart(calendarDay, block.starts_at);
    const rawEndMinute = minutesFromLocalDayStart(calendarDay, block.ends_at);
    if (rawEndMinute <= calendarStartMinute || rawStartMinute >= calendarEndMinute) {
      return [];
    }

    const startsAt = Math.max(rawStartMinute, calendarStartMinute);
    const endsAt = Math.min(rawEndMinute, calendarEndMinute);
    const top = ((startsAt - calendarStartMinute) / calendarVisibleMinutes) * 100;
    const height = (Math.max(endsAt - startsAt, 30) / calendarVisibleMinutes) * 100;

    return [{
      block,
      top,
      height: Math.min(height, 100 - top)
    }];
  });

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
      setIsScheduleDialogOpen(false);
    } catch (scheduleError) {
      setError(scheduleError instanceof Error ? scheduleError.message : "Failed to schedule block.");
    } finally {
      setIsScheduling(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero hero--compact calendar-hero">
        <div>
          <p className="eyebrow">Calendar</p>
          <h1>{calendarDay}</h1>
        </div>
        <div className="task-hero-actions">
          <label className="date-field date-field--inline">
            <span>Day</span>
            <input
              onChange={(event) => setCalendarDay(event.target.value)}
              type="date"
              value={calendarDay}
            />
          </label>
          <button
            className="button button--accent button--round"
            onClick={() => setIsScheduleDialogOpen(true)}
            type="button"
          >
            + Block
          </button>
          <div className="sync-chip sync-chip--quiet">
            <span>{isLoading ? "Loading..." : "Planning feed"}</span>
            <strong>
              {state.syncedAt ? formatDateTime(state.syncedAt.toISOString()) : "Sync pending"}
            </strong>
          </div>
        </div>
      </section>

      <section className="calendar-workspace">
        <article className="panel panel--stack calendar-board-panel">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Planned blocks</p>
              <h2>{state.scheduledBlocks.length} blocks</h2>
            </div>
          </div>

          {error ? <div className="banner banner--error">{error}</div> : null}
          {isLoading ? <div className="banner">Loading calendar...</div> : null}

          <div className="calendar-day-board">
            <div className="calendar-time-column" aria-hidden="true">
              {hourRows.map((hour) => (
                <span key={hour}>{formatHourLabel(hour)}</span>
              ))}
            </div>
            <div className="calendar-timeline">
              {hourRows.slice(0, -1).map((hour) => (
                <span className="calendar-hour-line" key={hour} />
              ))}
              {visibleBlocks.map(({ block, top, height }) => (
                <article
                  className="calendar-block"
                  key={block.id}
                  style={{
                    top: `${top}%`,
                    height: `${height}%`
                  }}
                >
                  <strong>
                    {block.title_override ?? taskLookup.get(block.task_id)?.title ?? "Untitled block"}
                  </strong>
                  <span>{taskLookup.get(block.task_id)?.title ?? "Unknown task"}</span>
                  <time>{formatTimeRange(block.starts_at, block.ends_at)}</time>
                </article>
              ))}
              {state.scheduledBlocks.length === 0 ? (
                <p className="calendar-empty">No planned blocks for this day.</p>
              ) : null}
            </div>
          </div>

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
          ) : null}
        </article>
      </section>

      {isScheduleDialogOpen ? (
        <QuickActionDialog
          kicker="Schedule"
          onClose={() => setIsScheduleDialogOpen(false)}
          title="New block"
          wide
        >
          <form
            className="compact-form compact-form--flush"
            onSubmit={(event) => void handleCreateScheduledBlock(event)}
          >
            <TaskSelect
              onChange={(taskId) => setScheduleForm((current) => ({ ...current, taskId }))}
              tasks={openTasks}
              value={selectedTaskId}
            />
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
            <div className="schedule-time-grid">
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
        </QuickActionDialog>
      ) : null}
    </main>
  );
}
