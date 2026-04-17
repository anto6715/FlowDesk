export type TaskStatus =
  | "inbox"
  | "ready"
  | "in_progress"
  | "waiting"
  | "blocked"
  | "done"
  | "archived";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type WaitingReason =
  | "experiment_running"
  | "experiment_stalled"
  | "pr_feedback"
  | "issue_feedback"
  | "external_contribution"
  | "researcher_input"
  | "other";

export type WorkSessionEndReason =
  | "paused"
  | "switched"
  | "waiting"
  | "blocked"
  | "completed"
  | "other";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  waiting_reason: WaitingReason | null;
  macro_activity_id: string | null;
  github_reference_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  archived_at: string | null;
}

export interface WorkSession {
  id: string;
  task_id: string;
  started_at: string;
  ended_at: string | null;
  end_reason: WorkSessionEndReason | null;
  created_at: string;
}

export interface ActiveTaskResponse {
  task: Task | null;
  work_session: WorkSession | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority: TaskPriority;
  macro_activity_id?: string | null;
  github_reference_id?: string | null;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new ApiError(payload?.detail ?? "The request failed.", response.status);
  }

  return (await response.json()) as T;
}

export async function listTasks(): Promise<Task[]> {
  return request<Task[]>("/tasks");
}

export async function getActiveTask(): Promise<ActiveTaskResponse> {
  return request<ActiveTaskResponse>("/tasks/active");
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  return request<Task>("/tasks", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function startTask(taskId: string): Promise<void> {
  await request(`/tasks/${taskId}/start`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function pauseTask(
  taskId: string,
  payload: {
    end_reason: WorkSessionEndReason;
    waiting_reason?: WaitingReason | null;
  }
): Promise<void> {
  await request(`/tasks/${taskId}/pause`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function switchTask(fromTaskId: string, toTaskId: string): Promise<void> {
  await request("/tasks/switch", {
    method: "POST",
    body: JSON.stringify({
      from_task_id: fromTaskId,
      to_task_id: toTaskId
    })
  });
}
