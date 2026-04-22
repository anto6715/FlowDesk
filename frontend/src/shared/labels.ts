import { type TaskStatus } from "./api";

const taskStatusLabels: Record<TaskStatus, string> = {
  inbox: "Backlog",
  ready: "Ready",
  in_progress: "Active",
  waiting: "Waiting",
  blocked: "Blocked",
  done: "Done",
  archived: "Archived"
};

export function formatTaskStatus(status: TaskStatus) {
  return taskStatusLabels[status];
}

export function plannedSessionCountLabel(count: number) {
  return count === 1 ? "1 planned session" : `${count} planned sessions`;
}
