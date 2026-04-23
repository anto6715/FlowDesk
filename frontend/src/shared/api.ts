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

export type ExperimentStatus =
  | "draft"
  | "queued"
  | "running"
  | "stalled"
  | "succeeded"
  | "failed"
  | "canceled"
  | "unknown";

export type ScheduledBlockStatus = "planned" | "completed" | "canceled";

export type NoteScope = "daily_journal" | "task" | "experiment";

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

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  macro_activity_id?: string | null;
  github_reference_id?: string | null;
}

export interface MacroActivity {
  id: string;
  name: string;
  description: string | null;
  color_hex: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface CreateMacroActivityInput {
  name: string;
  description?: string | null;
  color_hex?: string | null;
}

export interface GitHubReference {
  id: string;
  repository_full_name: string;
  issue_number: number;
  issue_url: string;
  cached_title: string | null;
  cached_state: string | null;
  cached_labels: string[] | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateGitHubReferenceInput {
  repository_full_name: string;
  issue_number: number;
  issue_url: string;
  cached_title?: string | null;
  cached_state?: string | null;
  cached_labels?: string[] | null;
}

export interface UpdateGitHubReferenceInput {
  repository_full_name?: string;
  issue_number?: number;
  issue_url?: string;
  cached_title?: string | null;
  cached_state?: string | null;
  cached_labels?: string[] | null;
}

export interface Experiment {
  id: string;
  task_id: string;
  title: string;
  instruction: string | null;
  status: ExperimentStatus;
  work_dir: string | null;
  repository_path: string | null;
  branch_name: string | null;
  commit_hash: string | null;
  version_label: string | null;
  launch_command: string | null;
  scheduler_name: string | null;
  scheduler_job_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  outcome_summary: string | null;
  log_path: string | null;
  result_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateExperimentInput {
  task_id: string;
  title: string;
  instruction?: string | null;
  status?: ExperimentStatus;
  work_dir?: string | null;
  repository_path?: string | null;
  branch_name?: string | null;
  commit_hash?: string | null;
  version_label?: string | null;
  launch_command?: string | null;
  scheduler_name?: string | null;
  scheduler_job_id?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  outcome_summary?: string | null;
  log_path?: string | null;
  result_path?: string | null;
}

export interface UpdateExperimentStateInput {
  status: ExperimentStatus;
  started_at?: string | null;
  ended_at?: string | null;
  outcome_summary?: string | null;
}

export interface ScheduledBlock {
  id: string;
  task_id: string;
  title_override: string | null;
  starts_at: string;
  ends_at: string;
  status: ScheduledBlockStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateScheduledBlockInput {
  task_id: string;
  title_override?: string | null;
  starts_at: string;
  ends_at: string;
}

export interface MoveScheduledBlockInput {
  starts_at: string;
  ends_at: string;
}

export interface UpdateScheduledBlockStatusInput {
  status: ScheduledBlockStatus;
}

export interface Note {
  id: string;
  scope: NoteScope;
  journal_day: string | null;
  task_id: string | null;
  experiment_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
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

function withQuery(path: string, params: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, value);
    }
  });

  const query = search.toString();
  return query.length > 0 ? `${path}?${query}` : path;
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

export async function updateTask(taskId: string, input: UpdateTaskInput): Promise<Task> {
  return request<Task>(`/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function listMacroActivities(): Promise<MacroActivity[]> {
  return request<MacroActivity[]>("/macro-activities");
}

export async function createMacroActivity(
  input: CreateMacroActivityInput
): Promise<MacroActivity> {
  return request<MacroActivity>("/macro-activities", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function listGitHubReferences(): Promise<GitHubReference[]> {
  return request<GitHubReference[]>("/github-references");
}

export async function createGitHubReference(
  input: CreateGitHubReferenceInput
): Promise<GitHubReference> {
  return request<GitHubReference>("/github-references", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateGitHubReference(
  referenceId: string,
  input: UpdateGitHubReferenceInput
): Promise<GitHubReference> {
  return request<GitHubReference>(`/github-references/${referenceId}`, {
    method: "PATCH",
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

export async function listTaskWorkSessions(taskId: string): Promise<WorkSession[]> {
  return request<WorkSession[]>(`/tasks/${taskId}/work-sessions`);
}

export async function listExperiments(options?: {
  task_id?: string | null;
  status?: ExperimentStatus | null;
}): Promise<Experiment[]> {
  return request<Experiment[]>(
    withQuery("/experiments", {
      task_id: options?.task_id,
      status: options?.status
    })
  );
}

export async function getExperiment(experimentId: string): Promise<Experiment> {
  return request<Experiment>(`/experiments/${experimentId}`);
}

export async function registerExperiment(input: CreateExperimentInput): Promise<Experiment> {
  return request<Experiment>("/experiments", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function setExperimentState(
  experimentId: string,
  input: UpdateExperimentStateInput
): Promise<Experiment> {
  return request<Experiment>(`/experiments/${experimentId}/state`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function listScheduledBlocks(options?: {
  task_id?: string | null;
  status?: ScheduledBlockStatus | null;
  starts_before?: string | null;
  ends_after?: string | null;
}): Promise<ScheduledBlock[]> {
  return request<ScheduledBlock[]>(
    withQuery("/scheduled-blocks", {
      task_id: options?.task_id,
      status: options?.status,
      starts_before: options?.starts_before,
      ends_after: options?.ends_after
    })
  );
}

export async function createScheduledBlock(
  input: CreateScheduledBlockInput
): Promise<ScheduledBlock> {
  return request<ScheduledBlock>("/scheduled-blocks", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function moveScheduledBlock(
  scheduledBlockId: string,
  input: MoveScheduledBlockInput
): Promise<ScheduledBlock> {
  return request<ScheduledBlock>(`/scheduled-blocks/${scheduledBlockId}/move`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function setScheduledBlockStatus(
  scheduledBlockId: string,
  input: UpdateScheduledBlockStatusInput
): Promise<ScheduledBlock> {
  return request<ScheduledBlock>(`/scheduled-blocks/${scheduledBlockId}/status`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function listJournalEntries(journalDay: string): Promise<Note[]> {
  return request<Note[]>(`/journal/${journalDay}/entries`);
}

export async function appendJournalEntry(
  journalDay: string,
  content: string,
  taskId?: string | null
): Promise<Note> {
  return request<Note>(`/journal/${journalDay}/entries`, {
    method: "POST",
    body: JSON.stringify({ content, task_id: taskId ?? null })
  });
}

export async function listTaskNotes(taskId: string): Promise<Note[]> {
  return request<Note[]>(`/tasks/${taskId}/notes`);
}

export async function addTaskNote(taskId: string, content: string): Promise<Note> {
  return request<Note>(`/tasks/${taskId}/notes`, {
    method: "POST",
    body: JSON.stringify({ content })
  });
}

export async function listExperimentNotes(experimentId: string): Promise<Note[]> {
  return request<Note[]>(`/experiments/${experimentId}/notes`);
}

export async function addExperimentNote(experimentId: string, content: string): Promise<Note> {
  return request<Note>(`/experiments/${experimentId}/notes`, {
    method: "POST",
    body: JSON.stringify({ content })
  });
}
