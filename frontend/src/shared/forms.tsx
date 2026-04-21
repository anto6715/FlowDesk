import { type FormEvent, type ReactNode, useState } from "react";

import {
  createGitHubReference,
  createMacroActivity,
  type CreateExperimentInput,
  type CreateTaskInput,
  type ExperimentStatus,
  type GitHubReference,
  type MacroActivity,
  type Task,
  type TaskPriority
} from "./api";
import { parseGitHubIssueOrPullUrl } from "./github";

const priorityOptions: Array<{ value: TaskPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" }
];

const experimentStatusOptions: Array<{ value: ExperimentStatus; label: string }> = [
  { value: "running", label: "Running" },
  { value: "queued", label: "Queued" },
  { value: "draft", label: "Draft" },
  { value: "stalled", label: "Stalled" }
];

type CreateMacroActivityMode = "none" | "existing" | "new";
type CreateGitHubReferenceMode = "none" | "existing" | "new";

interface MacroActivityFormState {
  name: string;
  description: string;
  colorHex: string;
}

interface GitHubReferenceFormState {
  entryMode: "url" | "manual";
  repositoryFullName: string;
  issueNumber: string;
  issueUrl: string;
  cachedTitle: string;
}

function inferGitHubIssueUrl(repositoryFullName: string, issueNumber: number) {
  return `https://github.com/${repositoryFullName}/issues/${issueNumber}`;
}

export function formatGitHubReference(reference: GitHubReference) {
  const title = reference.cached_title ? ` - ${reference.cached_title}` : "";
  return `${reference.repository_full_name}#${reference.issue_number}${title}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

interface FormActionsProps {
  cancelLabel?: string;
  disabled?: boolean;
  onCancel?: () => void;
  submitLabel: string;
  submittingLabel: string;
  isSubmitting: boolean;
}

function FormActions({
  cancelLabel = "Cancel",
  disabled,
  onCancel,
  submitLabel,
  submittingLabel,
  isSubmitting
}: FormActionsProps) {
  if (!onCancel) {
    return (
      <button className="button button--accent" disabled={disabled || isSubmitting} type="submit">
        {isSubmitting ? submittingLabel : submitLabel}
      </button>
    );
  }

  return (
    <div className="form-actions">
      <button className="button button--ghost" onClick={onCancel} type="button">
        {cancelLabel}
      </button>
      <button className="button button--accent" disabled={disabled || isSubmitting} type="submit">
        {isSubmitting ? submittingLabel : submitLabel}
      </button>
    </div>
  );
}

interface TaskSelectProps {
  disabled?: boolean;
  emptyLabel?: string;
  includeUnassigned?: boolean;
  label?: string;
  noSelectionLabel?: string;
  onChange: (taskId: string) => void;
  tasks: Task[];
  value: string;
}

export function TaskSelect({
  disabled,
  emptyLabel = "No open tasks",
  includeUnassigned = false,
  label = "Task",
  noSelectionLabel = "No linked task",
  onChange,
  tasks,
  value
}: TaskSelectProps) {
  return (
    <label>
      <span>{label}</span>
      <select
        disabled={disabled ?? (!includeUnassigned && tasks.length === 0)}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {includeUnassigned ? <option value="">{noSelectionLabel}</option> : null}
        {!includeUnassigned && tasks.length === 0 ? <option value="">{emptyLabel}</option> : null}
        {tasks.map((task) => (
          <option key={task.id} value={task.id}>
            {task.title}
          </option>
        ))}
      </select>
    </label>
  );
}

interface QuickActionDialogProps {
  children: ReactNode;
  kicker?: string;
  onClose: () => void;
  title: string;
  wide?: boolean;
}

export function QuickActionDialog({
  children,
  kicker = "Quick action",
  onClose,
  title,
  wide
}: QuickActionDialogProps) {
  return (
    <div className="home-action-overlay" onMouseDown={onClose}>
      <article
        aria-labelledby="quick-action-dialog-title"
        aria-modal="true"
        className={wide ? "panel home-action-dialog home-action-dialog--wide" : "panel home-action-dialog"}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="panel-header">
          <div>
            <p className="section-kicker">{kicker}</p>
            <h2 id="quick-action-dialog-title">{title}</h2>
          </div>
          <button className="button button--ghost button--small" onClick={onClose} type="button">
            Close
          </button>
        </div>
        {children}
      </article>
    </div>
  );
}

interface TaskCreateFormProps {
  className?: string;
  descriptionPlaceholder?: string;
  githubReferences: GitHubReference[];
  macroActivities: MacroActivity[];
  onCancel?: () => void;
  onCreated?: () => void;
  onCreateTask: (input: CreateTaskInput) => Promise<void>;
  onError: (message: string) => void;
  unavailableGithubReferenceIds?: Set<string>;
}

export function TaskCreateForm({
  className = "create-form",
  descriptionPlaceholder = "Capture the next concrete action.",
  githubReferences,
  macroActivities,
  onCancel,
  onCreated,
  onCreateTask,
  onError,
  unavailableGithubReferenceIds = new Set()
}: TaskCreateFormProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [macroActivityMode, setMacroActivityMode] = useState<CreateMacroActivityMode>("none");
  const [macroActivityId, setMacroActivityId] = useState("");
  const [gitHubReferenceMode, setGitHubReferenceMode] =
    useState<CreateGitHubReferenceMode>("none");
  const [gitHubReferenceId, setGitHubReferenceId] = useState("");
  const [macroActivityForm, setMacroActivityForm] = useState<MacroActivityFormState>({
    name: "",
    description: "",
    colorHex: "#0F6D61"
  });
  const [gitHubReferenceForm, setGitHubReferenceForm] = useState<GitHubReferenceFormState>({
    entryMode: "url",
    repositoryFullName: "",
    issueNumber: "",
    issueUrl: "",
    cachedTitle: ""
  });

  const availableGitHubReferences = githubReferences.filter(
    (reference) =>
      !unavailableGithubReferenceIds.has(reference.id) || reference.id === gitHubReferenceId
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (title.trim().length === 0) {
      onError("Task title is required.");
      return;
    }

    setIsCreating(true);
    try {
      let resolvedMacroActivityId: string | null = null;
      if (macroActivityMode === "existing") {
        if (macroActivityId.length === 0) {
          onError("Pick a macro-activity or choose a different macro mode.");
          return;
        }
        resolvedMacroActivityId = macroActivityId;
      }
      if (macroActivityMode === "new") {
        if (macroActivityForm.name.trim().length === 0) {
          onError("Macro-activity name is required.");
          return;
        }
        const macroActivity = await createMacroActivity({
          name: macroActivityForm.name.trim(),
          description: macroActivityForm.description.trim() || undefined,
          color_hex: macroActivityForm.colorHex
        });
        resolvedMacroActivityId = macroActivity.id;
      }

      let resolvedGitHubReferenceId: string | null = null;
      if (gitHubReferenceMode === "existing") {
        if (gitHubReferenceId.length === 0) {
          onError("Pick a GitHub reference or choose a different GitHub mode.");
          return;
        }
        resolvedGitHubReferenceId = gitHubReferenceId;
      }
      if (gitHubReferenceMode === "new") {
        const parsedReference =
          gitHubReferenceForm.entryMode === "url"
            ? parseGitHubIssueOrPullUrl(gitHubReferenceForm.issueUrl)
            : null;
        const repositoryFullName =
          parsedReference?.repositoryFullName ?? gitHubReferenceForm.repositoryFullName.trim();
        const issueNumber =
          parsedReference?.issueNumber ?? Number.parseInt(gitHubReferenceForm.issueNumber, 10);
        const issueUrl =
          parsedReference?.issueUrl ||
          gitHubReferenceForm.issueUrl.trim() ||
          inferGitHubIssueUrl(repositoryFullName, issueNumber);

        if (repositoryFullName.length === 0) {
          onError("GitHub repository is required.");
          return;
        }
        if (gitHubReferenceForm.entryMode === "url" && parsedReference === null) {
          onError("Paste a valid GitHub issue or pull request URL.");
          return;
        }
        if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
          onError("GitHub issue or PR number must be a positive integer.");
          return;
        }

        const reference = await createGitHubReference({
          repository_full_name: repositoryFullName,
          issue_number: issueNumber,
          issue_url: issueUrl,
          cached_title: gitHubReferenceForm.cachedTitle.trim() || undefined
        });
        resolvedGitHubReferenceId = reference.id;
      }

      await onCreateTask({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        macro_activity_id: resolvedMacroActivityId,
        github_reference_id: resolvedGitHubReferenceId
      });

      setTitle("");
      setDescription("");
      setPriority("normal");
      setMacroActivityMode("none");
      setMacroActivityId("");
      setGitHubReferenceMode("none");
      setGitHubReferenceId("");
      setMacroActivityForm({
        name: "",
        description: "",
        colorHex: macroActivityForm.colorHex
      });
      setGitHubReferenceForm({
        entryMode: "url",
        repositoryFullName: "",
        issueNumber: "",
        issueUrl: "",
        cachedTitle: ""
      });
      onCreated?.();
    } catch (createError) {
      onError(getErrorMessage(createError, "Failed to create task."));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <form className={className} onSubmit={(event) => void handleSubmit(event)}>
      <label>
        <span>Title</span>
        <input
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Investigate stalled coupled run"
          value={title}
        />
      </label>
      <label>
        <span>Description</span>
        <textarea
          onChange={(event) => setDescription(event.target.value)}
          placeholder={descriptionPlaceholder}
          rows={4}
          value={description}
        />
      </label>
      <label>
        <span>Priority</span>
        <select onChange={(event) => setPriority(event.target.value as TaskPriority)} value={priority}>
          {priorityOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Macro-activity</span>
        <select
          onChange={(event) => setMacroActivityMode(event.target.value as CreateMacroActivityMode)}
          value={macroActivityMode}
        >
          <option value="none">No macro-activity</option>
          <option value="existing">Use existing</option>
          <option value="new">Create new</option>
        </select>
      </label>
      {macroActivityMode === "existing" ? (
        <label>
          <span>Existing macro-activity</span>
          <select onChange={(event) => setMacroActivityId(event.target.value)} value={macroActivityId}>
            <option value="">Pick macro-activity</option>
            {macroActivities.map((macroActivity) => (
              <option key={macroActivity.id} value={macroActivity.id}>
                {macroActivity.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {macroActivityMode === "new" ? (
        <div className="embedded-form-grid">
          <label>
            <span>New macro name</span>
            <input
              onChange={(event) =>
                setMacroActivityForm((current) => ({
                  ...current,
                  name: event.target.value
                }))
              }
              placeholder="Coupled model runs"
              value={macroActivityForm.name}
            />
          </label>
          <label>
            <span>Description</span>
            <input
              onChange={(event) =>
                setMacroActivityForm((current) => ({
                  ...current,
                  description: event.target.value
                }))
              }
              placeholder="Optional scope note"
              value={macroActivityForm.description}
            />
          </label>
          <label>
            <span>Color</span>
            <input
              onChange={(event) =>
                setMacroActivityForm((current) => ({
                  ...current,
                  colorHex: event.target.value
                }))
              }
              type="color"
              value={macroActivityForm.colorHex}
            />
          </label>
        </div>
      ) : null}
      <label>
        <span>GitHub reference</span>
        <select
          onChange={(event) =>
            setGitHubReferenceMode(event.target.value as CreateGitHubReferenceMode)
          }
          value={gitHubReferenceMode}
        >
          <option value="none">No GitHub reference</option>
          <option value="existing">Use existing</option>
          <option value="new">Create new</option>
        </select>
      </label>
      {gitHubReferenceMode === "existing" ? (
        <label>
          <span>Existing GitHub reference</span>
          <select
            onChange={(event) => setGitHubReferenceId(event.target.value)}
            value={gitHubReferenceId}
          >
            <option value="">Pick GitHub reference</option>
            {availableGitHubReferences.map((reference) => (
              <option key={reference.id} value={reference.id}>
                {formatGitHubReference(reference)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {gitHubReferenceMode === "new" ? (
        <div className="embedded-form-grid">
          <div className="segmented-control">
            <button
              className={
                gitHubReferenceForm.entryMode === "url"
                  ? "segmented-control__item segmented-control__item--active"
                  : "segmented-control__item"
              }
              onClick={() =>
                setGitHubReferenceForm((current) => ({ ...current, entryMode: "url" }))
              }
              type="button"
            >
              Paste URL
            </button>
            <button
              className={
                gitHubReferenceForm.entryMode === "manual"
                  ? "segmented-control__item segmented-control__item--active"
                  : "segmented-control__item"
              }
              onClick={() =>
                setGitHubReferenceForm((current) => ({ ...current, entryMode: "manual" }))
              }
              type="button"
            >
              Manual
            </button>
          </div>
          {gitHubReferenceForm.entryMode === "url" ? (
            <label>
              <span>GitHub issue or PR URL</span>
              <input
                onChange={(event) =>
                  setGitHubReferenceForm((current) => ({
                    ...current,
                    issueUrl: event.target.value
                  }))
                }
                placeholder="https://github.com/org/project/issues/42"
                value={gitHubReferenceForm.issueUrl}
              />
            </label>
          ) : (
            <>
              <label>
                <span>Repository</span>
                <input
                  onChange={(event) =>
                    setGitHubReferenceForm((current) => ({
                      ...current,
                      repositoryFullName: event.target.value
                    }))
                  }
                  placeholder="org/project"
                  value={gitHubReferenceForm.repositoryFullName}
                />
              </label>
              <label>
                <span>Issue or PR number</span>
                <input
                  min="1"
                  onChange={(event) =>
                    setGitHubReferenceForm((current) => ({
                      ...current,
                      issueNumber: event.target.value
                    }))
                  }
                  placeholder="42"
                  type="number"
                  value={gitHubReferenceForm.issueNumber}
                />
              </label>
            </>
          )}
          <label>
            <span>Title</span>
            <input
              onChange={(event) =>
                setGitHubReferenceForm((current) => ({
                  ...current,
                  cachedTitle: event.target.value
                }))
              }
              placeholder="Optional"
              value={gitHubReferenceForm.cachedTitle}
            />
          </label>
        </div>
      ) : null}
      <FormActions
        isSubmitting={isCreating}
        onCancel={onCancel}
        submitLabel="Create task"
        submittingLabel="Creating..."
      />
    </form>
  );
}

interface ExperimentCreateFormProps {
  buttonVariant?: "accent" | "ghost";
  className?: string;
  fixedTaskId?: string;
  onCancel?: () => void;
  onError: (message: string) => void;
  onRegister: (input: CreateExperimentInput) => Promise<void>;
  onRegistered?: () => void;
  tasks?: Task[];
}

export function ExperimentCreateForm({
  buttonVariant = "accent",
  className = "compact-form compact-form--flush",
  fixedTaskId,
  onCancel,
  onError,
  onRegister,
  onRegistered,
  tasks = []
}: ExperimentCreateFormProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [status, setStatus] = useState<ExperimentStatus>("running");
  const selectedTaskId = fixedTaskId ?? (taskId || tasks[0]?.id || "");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedTaskId.length === 0) {
      onError("Pick a task before registering an experiment.");
      return;
    }
    if (title.trim().length === 0) {
      onError("Experiment title is required.");
      return;
    }

    setIsRegistering(true);
    try {
      await onRegister({
        task_id: selectedTaskId,
        title: title.trim(),
        instruction: instruction.trim() || undefined,
        status
      });
      setTitle("");
      setInstruction("");
      setStatus("running");
      onRegistered?.();
    } catch (registerError) {
      onError(getErrorMessage(registerError, "Failed to register experiment."));
    } finally {
      setIsRegistering(false);
    }
  }

  return (
    <form className={className} onSubmit={(event) => void handleSubmit(event)}>
      {fixedTaskId ? null : (
        <TaskSelect
          onChange={setTaskId}
          tasks={tasks}
          value={selectedTaskId}
        />
      )}
      <label>
        <span>Title</span>
        <input
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Scaling run 256 ranks"
          value={title}
        />
      </label>
      <label>
        <span>Instruction</span>
        <textarea
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="What this run should prove or disprove."
          rows={4}
          value={instruction}
        />
      </label>
      <label>
        <span>Status</span>
        <select onChange={(event) => setStatus(event.target.value as ExperimentStatus)} value={status}>
          {experimentStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className={onCancel ? "form-actions" : undefined}>
        {onCancel ? (
          <button className="button button--ghost" onClick={onCancel} type="button">
            Cancel
          </button>
        ) : null}
        <button
          className={`button button--${buttonVariant}`}
          disabled={isRegistering || selectedTaskId.length === 0}
          type="submit"
        >
          {isRegistering ? "Registering..." : "Register experiment"}
        </button>
      </div>
    </form>
  );
}
