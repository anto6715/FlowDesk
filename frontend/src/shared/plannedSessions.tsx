import { type FormEvent, useEffect, useState } from "react";

import {
  getActiveTask,
  moveScheduledBlock,
  setScheduledBlockStatus,
  startTask,
  switchTask,
  type ScheduledBlock,
  type ScheduledBlockStatus,
  type Task
} from "./api";
import { QuickActionDialog } from "./forms";
import { formatScheduledBlockStatus } from "./labels";

interface PlannedSessionDialogProps {
  onChanged: () => Promise<void> | void;
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
  scheduledBlock: ScheduledBlock;
  showOpenTaskAction?: boolean;
  tasks: Task[];
}

interface TimeFormState {
  startsAt: string;
  endsAt: string;
}

function toDateTimeLocalValue(iso: string) {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function PlannedSessionDialog({
  onChanged,
  onClose,
  onOpenTask,
  scheduledBlock,
  showOpenTaskAction = true,
  tasks
}: PlannedSessionDialogProps) {
  const [timeForm, setTimeForm] = useState<TimeFormState>(() => ({
    startsAt: toDateTimeLocalValue(scheduledBlock.starts_at),
    endsAt: toDateTimeLocalValue(scheduledBlock.ends_at)
  }));
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [isStartingTask, setIsStartingTask] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkedTask = tasks.find((task) => task.id === scheduledBlock.task_id) ?? null;
  const isLinkedTaskActive = activeTaskId === scheduledBlock.task_id;
  const canStartTask = linkedTask !== null && !["done", "archived"].includes(linkedTask.status);

  useEffect(() => {
    setTimeForm({
      startsAt: toDateTimeLocalValue(scheduledBlock.starts_at),
      endsAt: toDateTimeLocalValue(scheduledBlock.ends_at)
    });
    setError(null);
  }, [scheduledBlock.id, scheduledBlock.starts_at, scheduledBlock.ends_at]);

  useEffect(() => {
    let isCurrent = true;

    async function loadActiveTask() {
      try {
        const active = await getActiveTask();
        if (isCurrent) {
          setActiveTaskId(active.task?.id ?? null);
        }
      } catch {
        if (isCurrent) {
          setActiveTaskId(null);
        }
      }
    }

    void loadActiveTask();

    return () => {
      isCurrent = false;
    };
  }, [scheduledBlock.id]);

  async function handleMove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startsAt = new Date(timeForm.startsAt);
    const endsAt = new Date(timeForm.endsAt);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      setError("Start and end times are required.");
      return;
    }
    if (endsAt <= startsAt) {
      setError("End time must be after start time.");
      return;
    }

    setIsMoving(true);
    try {
      await moveScheduledBlock(scheduledBlock.id, {
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString()
      });
      setError(null);
      await onChanged();
    } catch (moveError) {
      setError(getErrorMessage(moveError, "Failed to reschedule planned session."));
    } finally {
      setIsMoving(false);
    }
  }

  async function handleStatusChange(status: ScheduledBlockStatus) {
    setIsChangingStatus(true);
    try {
      await setScheduledBlockStatus(scheduledBlock.id, { status });
      setError(null);
      await onChanged();
    } catch (statusError) {
      setError(getErrorMessage(statusError, "Failed to update planned session."));
    } finally {
      setIsChangingStatus(false);
    }
  }

  async function handleStartTask() {
    if (linkedTask === null || !canStartTask) {
      return;
    }

    setIsStartingTask(true);
    try {
      const active = await getActiveTask();
      if (active.task?.id === linkedTask.id) {
        setActiveTaskId(linkedTask.id);
        return;
      }
      if (active.task) {
        await switchTask(active.task.id, linkedTask.id);
      } else {
        await startTask(linkedTask.id);
      }
      setActiveTaskId(linkedTask.id);
      setError(null);
      await onChanged();
    } catch (startError) {
      setError(getErrorMessage(startError, "Failed to start planned task."));
    } finally {
      setIsStartingTask(false);
    }
  }

  function handleOpenTask() {
    onClose();
    onOpenTask(scheduledBlock.task_id);
  }

  return (
    <QuickActionDialog
      kicker="Planned session"
      onClose={onClose}
      title={scheduledBlock.title_override ?? linkedTask?.title ?? "Untitled planned session"}
      wide
    >
      <div className="planned-session-dialog">
        {error ? <div className="banner banner--error">{error}</div> : null}

        <div className="planned-session-summary" aria-label="Planned session details">
          <div>
            <span>Task</span>
            <strong>{linkedTask?.title ?? "Unknown task"}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{formatScheduledBlockStatus(scheduledBlock.status)}</strong>
          </div>
          <div>
            <span>Current time</span>
            <strong>
              {formatDateTime(scheduledBlock.starts_at)} to {formatDateTime(scheduledBlock.ends_at)}
            </strong>
          </div>
        </div>

        <form className="compact-form compact-form--flush" onSubmit={(event) => void handleMove(event)}>
          <div className="schedule-time-grid">
            <label>
              <span>Start</span>
              <input
                onChange={(event) =>
                  setTimeForm((current) => ({ ...current, startsAt: event.target.value }))
                }
                type="datetime-local"
                value={timeForm.startsAt}
              />
            </label>
            <label>
              <span>End</span>
              <input
                onChange={(event) =>
                  setTimeForm((current) => ({ ...current, endsAt: event.target.value }))
                }
                type="datetime-local"
                value={timeForm.endsAt}
              />
            </label>
          </div>
          <div className="form-actions">
            <button className="button button--accent" disabled={isMoving} type="submit">
              {isMoving ? "Rescheduling..." : "Reschedule"}
            </button>
          </div>
        </form>

        <div className="planned-session-actions" aria-label="Planned session actions">
          {showOpenTaskAction ? (
            <button className="button button--ghost" onClick={handleOpenTask} type="button">
              Open task
            </button>
          ) : null}
          <button
            className={isLinkedTaskActive ? "button button--inactive" : "button button--accent"}
            disabled={!canStartTask || isLinkedTaskActive || isStartingTask}
            onClick={() => void handleStartTask()}
            type="button"
          >
            {isLinkedTaskActive
              ? "Task active"
              : isStartingTask
                ? "Starting..."
                : activeTaskId
                  ? "Switch to task"
                  : "Start task"}
          </button>
          {scheduledBlock.status === "planned" ? (
            <>
              <button
                className="button button--ghost"
                disabled={isChangingStatus}
                onClick={() => void handleStatusChange("completed")}
                type="button"
              >
                Complete session
              </button>
              <button
                className="button button--warning"
                disabled={isChangingStatus}
                onClick={() => void handleStatusChange("canceled")}
                type="button"
              >
                Cancel session
              </button>
            </>
          ) : (
            <button
              className="button button--ghost"
              disabled={isChangingStatus}
              onClick={() => void handleStatusChange("planned")}
              type="button"
            >
              Reopen session
            </button>
          )}
        </div>
      </div>
    </QuickActionDialog>
  );
}
