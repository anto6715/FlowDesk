import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState
} from "react";

import {
  listExperiments,
  listTasks,
  registerExperiment,
  setExperimentState,
  type Experiment,
  type ExperimentStatus,
  type Task
} from "../../shared/api";
import { ExperimentCreateForm } from "../../shared/forms";

type ExperimentStatusFilter = "all" | ExperimentStatus;

interface ExperimentsState {
  experiments: Experiment[];
  tasks: Task[];
  syncedAt: Date | null;
}

const initialState: ExperimentsState = {
  experiments: [],
  tasks: [],
  syncedAt: null
};

const statusFilters: Array<{ value: ExperimentStatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "running", label: "Running" },
  { value: "stalled", label: "Stalled" },
  { value: "queued", label: "Queued" },
  { value: "draft", label: "Draft" },
  { value: "succeeded", label: "Succeeded" },
  { value: "failed", label: "Failed" },
  { value: "canceled", label: "Canceled" },
  { value: "unknown", label: "Unknown" }
];

const transitionTargets: Array<{ value: ExperimentStatus; label: string }> = [
  { value: "running", label: "Running" },
  { value: "stalled", label: "Stalled" },
  { value: "succeeded", label: "Succeeded" },
  { value: "failed", label: "Failed" }
];

function formatDateTime(iso: string | null) {
  if (iso === null) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));
}

export function ExperimentsPage() {
  const [state, setState] = useState<ExperimentsState>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [busyExperimentId, setBusyExperimentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ExperimentStatusFilter>("all");
  const deferredQuery = useDeferredValue(query);

  async function loadExperiments() {
    setIsLoading(true);
    try {
      const [experiments, tasks] = await Promise.all([listExperiments(), listTasks()]);
      startTransition(() => {
        setState({
          experiments,
          tasks,
          syncedAt: new Date()
        });
        setError(null);
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load experiments.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadExperiments();
  }, []);

  const taskLookup = new Map(state.tasks.map((task) => [task.id, task]));
  const openTasks = state.tasks.filter((task) => !["done", "archived"].includes(task.status));
  const filteredExperiments = state.experiments.filter((experiment) => {
    const taskTitle = taskLookup.get(experiment.task_id)?.title ?? "";
    const searchText =
      `${experiment.title} ${experiment.instruction ?? ""} ${taskTitle} ${
        experiment.scheduler_job_id ?? ""
      }`.toLowerCase();
    const queryMatches =
      deferredQuery.trim().length === 0 ||
      searchText.includes(deferredQuery.trim().toLowerCase());
    const statusMatches = statusFilter === "all" || experiment.status === statusFilter;

    return queryMatches && statusMatches;
  });

  async function handleStateChange(experimentId: string, status: ExperimentStatus) {
    setBusyExperimentId(experimentId);
    try {
      await setExperimentState(experimentId, { status });
      await loadExperiments();
    } catch (stateError) {
      setError(stateError instanceof Error ? stateError.message : "Failed to update experiment.");
    } finally {
      setBusyExperimentId(null);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero hero--compact">
        <div>
          <p className="eyebrow">Experiments</p>
          <h1>Run registry</h1>
        </div>
        <div className="sync-chip">
          <span>{isLoading ? "Loading..." : "Local experiment index"}</span>
          <strong>{state.syncedAt ? formatDateTime(state.syncedAt.toISOString()) : "Sync pending"}</strong>
        </div>
      </section>

      <section className="summary-grid summary-grid--tasks" aria-label="Experiment counts">
        <article className="summary-card">
          <p className="section-kicker">Running</p>
          <strong className="big-number">
            {state.experiments.filter((experiment) => experiment.status === "running").length}
          </strong>
        </article>
        <article className="summary-card">
          <p className="section-kicker">Stalled</p>
          <strong className="big-number">
            {state.experiments.filter((experiment) => experiment.status === "stalled").length}
          </strong>
        </article>
        <article className="summary-card">
          <p className="section-kicker">Failed</p>
          <strong className="big-number">
            {state.experiments.filter((experiment) => experiment.status === "failed").length}
          </strong>
        </article>
      </section>

      <section className="panel panel--wide">
        <div className="panel-header">
          <div>
            <p className="section-kicker">Register experiment</p>
            <h2>New run</h2>
          </div>
        </div>
        <ExperimentCreateForm
          className="create-form create-form--tasks"
          onError={setError}
          onRegister={async (input) => {
            await registerExperiment(input);
          }}
          onRegistered={() => {
            void loadExperiments();
          }}
          tasks={openTasks}
        />
      </section>

      <section className="panel panel--wide">
        <div className="panel-header">
          <div>
            <p className="section-kicker">Experiment index</p>
            <h2>{filteredExperiments.length} runs shown</h2>
          </div>
          <label className="search-field">
            <span>Search</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Title, task, instruction, or job id"
              value={query}
            />
          </label>
        </div>

        <div className="filter-grid filter-grid--compact">
          <label>
            <span>Status</span>
            <select
              onChange={(event) => setStatusFilter(event.target.value as ExperimentStatusFilter)}
              value={statusFilter}
            >
              {statusFilters.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? <div className="banner banner--error">{error}</div> : null}
        {isLoading ? <div className="banner">Loading experiments...</div> : null}

        <div className="table-frame">
          <table className="task-table">
            <thead>
              <tr>
                <th>Experiment</th>
                <th>Task</th>
                <th>Status</th>
                <th>Scheduler</th>
                <th>Started</th>
                <th>Ended</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredExperiments.map((experiment) => (
                <tr key={experiment.id}>
                  <td>
                    <strong>{experiment.title}</strong>
                    <span>{experiment.instruction || "No instruction"}</span>
                  </td>
                  <td>{taskLookup.get(experiment.task_id)?.title ?? "Unknown task"}</td>
                  <td>
                    <span className={`pill pill--${experiment.status}`}>
                      {experiment.status}
                    </span>
                  </td>
                  <td>
                    {experiment.scheduler_name || "None"}
                    {experiment.scheduler_job_id ? ` #${experiment.scheduler_job_id}` : ""}
                  </td>
                  <td>{formatDateTime(experiment.started_at)}</td>
                  <td>{formatDateTime(experiment.ended_at)}</td>
                  <td>
                    <div className="table-actions">
                      {transitionTargets.map((target) => (
                        <button
                          className="button button--ghost button--small"
                          disabled={
                            busyExperimentId === experiment.id ||
                            experiment.status === target.value
                          }
                          key={target.value}
                          onClick={() => void handleStateChange(experiment.id, target.value)}
                          type="button"
                        >
                          {target.label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
