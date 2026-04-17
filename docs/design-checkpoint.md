# Flow Desk Design Checkpoint

## Status

- Design phase completed
- Bootstrap started
- Level 1 approved
- Level 2 approved
- Level 3 approved
- Level 4 approved
- Level 5 approved
- Product name selected: `Flow Desk`
- Repo layout selected: one repo with `backend/` and `frontend/`
- Milestone 1 in progress: backend persistence baseline and initial schema

## Level 1: Scope And Domain Model

### Product framing

The product is a local-first HPC task cockpit. It is not just a timer tool: it must connect human work, experiments, notes, source code context, and reporting.

### Core entities

- Task
- MacroActivity
- WorkSession
- ScheduledBlock
- Experiment
- Note
- GitHubReference
- ArtifactReference

### Key modeling decisions

#### Human work time vs experiment runtime

These must remain separate.

A task can have many work sessions over time. A user may:

- start working on Task A
- launch one or more experiments linked to Task A
- pause Task A because the work is now waiting on experiment results
- switch to Task B

Therefore, time reports must use `WorkSession` records rather than experiment runtime.

#### Task session model

A task supports repeated start/pause/resume/stop cycles through multiple `WorkSession` entries.

Typical pause reasons include:

- waiting experiment result
- waiting PR review or merge
- waiting issue feedback
- waiting code contribution from someone else
- manual reprioritization

These reasons should be represented explicitly rather than hidden in free text.

`ScheduledBlock` is separate from `WorkSession`.

- `WorkSession` = historical fact
- `ScheduledBlock` = future plan or intended allocation on the calendar

#### Task state

Keep both a workflow state and a waiting/attention concept.

Candidate workflow states:

- Inbox
- Ready
- In Progress
- Waiting
- Blocked
- Done
- Archived

Candidate waiting reasons:

- experiment_running
- experiment_stalled
- pr_feedback
- issue_feedback
- external_contribution
- researcher_input
- other

#### Experiment state

Candidate states:

- Draft
- Queued
- Running
- Stalled
- Succeeded
- Failed
- Cancelled
- Unknown

`Stalled` is important in the HPC context. It represents a run that is not progressing and needs manual intervention before it can resume. This may trigger follow-up work, communication with collaborators, or even creation of a new linked task.

#### Task-to-experiment relationship

- One task can have zero, one, or many experiments
- An experiment belongs to one primary task in v1
- Additional linked tasks may be introduced later if needed

#### Notes model

Support three note scopes in v1:

- Daily journal entries for general notes
- Task notes
- Experiment notes

The daily journal should follow a Logseq-like approach:

- one journal entry per day
- timeline of quick notes and observations
- optional links to tasks and experiments

This keeps "global notes" usable without mixing them into task-specific logs.

### Minimum experiment metadata for v1

- linked task
- instruction / purpose
- work directory
- source repository path
- branch
- commit hash
- version / revision label
- launcher command or script path
- start time / end time
- scheduler or job ID if available
- outcome summary
- links to logs and results

### GitHub integration stance for v1

Reference-first, not deep synchronization.

- Store GitHub issue URL/repo/issue number as the canonical reference
- Keep the app functional even without GitHub API access
- Consider richer sync only in a later phase

### Must-have v1 capabilities

- create and organize tasks
- assign task priority
- group tasks by macro-activity
- create multiple work sessions per task
- pause and resume tasks cleanly
- mark waiting reason explicitly
- register and monitor experiments manually
- capture experiment metadata
- show running and stalled experiments
- capture daily journal notes
- capture task notes
- capture experiment notes
- schedule future task blocks in calendar view
- generate reports by task and macro-activity
- provide a strong current-state overview

## Level 2: UX And Interaction Model

### UX position

The product should feel like an operational cockpit for technical work rather than a generic to-do app. The UI must make the current state obvious:

- what I am working on now
- what is running in background
- what is waiting on me
- what is waiting on others
- what needs attention because something stalled or failed

### Primary interaction principles

- One primary active task at a time in v1 for accurate time tracking
- Multiple experiments may run concurrently across tasks
- Switching tasks should be frictionless and explicit
- Waiting should be a first-class action, not a workaround
- Notes should be available everywhere with low capture friction
- Reports should be readable without manual cleanup

### Primary screens

#### 1. Home / Today cockpit

The landing page should answer the current operational questions immediately.

Main panels:

- active task
- recent task switches
- running experiments
- stalled experiments
- waiting tasks
- daily journal timeline
- quick actions

This should be the reference point during the day.

#### 2. Task board / task list

A structured view to browse and manage tasks.

Possible groupings:

- by macro-activity
- by status
- by priority
- by waiting reason

Each task row/card should expose:

- title
- GitHub issue reference
- macro-activity
- priority
- current state
- current waiting reason if any
- last worked timestamp
- active or recent experiment badges

#### 2b. Global task view

This should be distinct from the macro-activity-oriented organization view.

Purpose:

- see all tasks in one place
- understand total workload at a glance
- detect overload, neglected work, or poor prioritization

The emphasis is awareness and triage rather than detailed drill-down.

Recommended capabilities:

- show all non-archived tasks in one unified view
- support lightweight filters without forcing navigation through macro-activities
- highlight aging tasks, too many waiting tasks, and too many concurrent priorities
- allow bulk review of status, priority, and waiting reason

This can be implemented as a dense list or table in v1.

#### 2c. Calendar view

The product should include a calendar-oriented planning view.

Purpose:

- see work sessions as activities on a calendar
- plan upcoming work
- schedule tasks explicitly
- move planned items to a different slot
- inspect what is next

Recommended content in v1:

- past work sessions rendered on the calendar
- future planned task blocks
- quick scheduling from the calendar
- drag/move rescheduling if the chosen UI framework supports it cleanly

Important distinction:

- completed work sessions are factual historical records
- scheduled task blocks are plans and should be modeled separately from actual tracked work

This means the calendar should support both:

- historical timeline
- future schedule

#### 3. Task detail workspace

A task page should act as the operational hub for a single work item.

Sections:

- task summary
- GitHub reference
- status and priority
- work session history
- linked experiments
- task notes
- related journal references
- linked artifacts and paths

Primary actions:

- start work
- pause work
- resume work
- mark waiting
- add note
- register experiment
- open linked paths

#### 4. Experiment view

An experiment should have a dedicated detail view rather than being buried inside a task.

Sections:

- status
- linked task
- instruction / purpose
- workdir and code paths
- branch / commit / version
- command or launcher
- scheduler/job identifiers
- logs/results links
- experiment notes
- timeline of state changes

This is the place to inspect running, failed, and stalled experiments.

#### 5. Journal view

Global notes should be represented as a daily journal, inspired by Logseq.

Requirements:

- one page per day
- fast append of entries
- timestamps on entries
- optional links to tasks and experiments
- lightweight structure, not heavy form filling

#### 6. Reports view

Reports need to be first-class, not an export afterthought.

Core report cuts:

- by day / week / month / custom range
- by task
- by macro-activity
- by priority
- by waiting time vs active work time

### Key workflows

#### Start working on a task

- select task from Today or Task list
- press Start
- system opens a new work session
- task becomes the active task

#### Switch to another task

- press Pause or Switch
- optionally choose reason
- current work session closes
- new task starts immediately

This interaction must be extremely fast because it will happen often.

#### Wait on experiment

- pause task with reason `experiment_running`
- optionally register or link the active experiment
- task moves to Waiting
- experiment remains visible in the Home cockpit

#### Handle stalled experiment

- experiment moves to `Stalled`
- it is surfaced prominently in Home
- user can add notes, link communication, or create a follow-up task

#### Capture notes

- quick entry from Today
- inline entry inside task
- inline entry inside experiment
- journal remains the default place for general notes

#### Generate reports

- choose date range and resolution
- switch aggregation between tasks and macro-activities
- distinguish active work from waiting context

### UX recommendations for v1

- Prefer timeline plus detail panes over deeply nested navigation
- Favor a left navigation with a strong main workspace
- Keep quick actions always visible
- Keep `Today`, `Global Tasks`, and `Calendar` as top-level navigation items
- Use color carefully for states:
  - active
  - waiting
  - running
  - stalled
  - failed
- Make important paths, commits, and issue references clickable

### Important v1 UX decision

I recommend enforcing one active human task at a time in v1.

That gives:

- simpler mental model
- cleaner reports
- fewer accidental overlaps

At the same time, allow many experiments to be active concurrently.

## Level 3: Architecture And Persistence Model

### Architectural goals

The architecture should optimize for:

- local-first reliability
- crash resilience
- simple recovery
- low operational complexity
- modular evolution toward future integrations

This product does not need distributed systems complexity in v1. It needs trustworthy local behavior.

### Recommended application shape for v1

I recommend a desktop-first local application with three layers:

1. Presentation layer
2. Application/service layer
3. Persistence layer

Conceptually:

- UI handles visualization and user interaction
- application layer enforces domain rules and workflows
- persistence layer stores durable state and exposes repositories

This should be treated as a single-user local system in v1.

### Deployment shape options

#### Option A. Local web app

- backend runs locally
- frontend runs in browser

Pros:

- simplest UI technology path
- fast iteration
- strong charting/calendar ecosystem

Cons:

- less native desktop feel
- browser tab is a weaker product identity for a daily cockpit

#### Option B. Desktop shell + web UI

- desktop container
- web frontend rendered inside the app
- local embedded backend or local service

Pros:

- good UX for a daily-use application
- native-feeling app window
- still benefits from modern web UI ecosystem

Cons:

- more packaging complexity than a pure local web app

#### Option C. Native desktop GUI toolkit

- single-process or tightly coupled desktop app

Pros:

- strong native integration
- fewer moving parts in some stacks

Cons:

- usually weaker velocity for modern, rich UI
- calendar/reporting/polished layout work is often slower

### Architecture recommendation

I recommend `Option B`: desktop shell + web UI, with a local-first embedded database.

Reason:

- you explicitly care a lot about UI quality
- this app benefits from calendar, timelines, tables, reporting, and dense interactive views
- local persistence is enough for v1
- this shape preserves a path toward Linux first and possible macOS support later

### Runtime decomposition

The internal modules should be separated like this:

- task management
- time tracking
- experiment registry
- journal and notes
- planning/calendar
- reporting
- integration adapters
- backup and recovery

These are logical boundaries first. They can live in one repo and one deployable app in v1.

### Persistence recommendation

I recommend `SQLite` as the primary system database for v1.

Reason:

- excellent local-first fit
- mature and reliable
- transactional
- easy backup story
- no external service to manage
- very good performance for a single-user productivity tool

Recommended practices:

- enable WAL mode
- use foreign keys
- store timestamps in UTC with local rendering in UI
- use explicit migrations from the start
- keep immutable history where it matters

### Storage split

Use three storage categories:

#### 1. Relational database

Use SQLite for:

- tasks
- macro-activities
- work sessions
- scheduled blocks
- experiments
- notes metadata
- links between entities
- reportable facts
- state transitions

#### 2. Filesystem attachments

Use a managed app data directory for:

- exported reports
- backups
- optional local attachments in future
- imported snapshots if needed

Do not store large logs or experiment outputs inside SQLite in v1. Store paths and references.

#### 3. Configuration store

Store user-level configuration separately from operational data:

- theme/preferences
- path defaults
- GitHub integration settings
- scheduler naming conventions

This can still be inside SQLite or in a small config file, but conceptually it should be separated.

### Recoverability strategy

Recoverability should be deliberate, not accidental.

Recommended safeguards:

- every state-changing action runs inside a transaction
- autosave by default
- append-only audit records for important transitions
- startup integrity checks
- periodic automatic local backups
- import/export of complete data snapshots

Examples of transitions worth recording:

- task started
- task paused
- waiting reason changed
- experiment state changed
- scheduled block moved

This does not require full event sourcing. A simple audit/history table is enough in v1.

### Domain write model

The write path should go through application services, not directly from UI to database.

Examples:

- `start_task(task_id)`
- `pause_task(task_id, reason)`
- `switch_task(from_task_id, to_task_id, reason)`
- `register_experiment(task_id, metadata)`
- `set_experiment_state(experiment_id, state)`
- `create_scheduled_block(task_id, start, end)`

This is important for consistency:

- only one active human task
- proper closing of sessions
- task/exercise status synchronization where required
- clean audit history

### Read model

The read side can stay simple in v1:

- normalized tables for source of truth
- query views or dedicated read services for dashboards and reports

The Home cockpit will likely need aggregated read queries such as:

- current active task
- running experiments
- stalled experiments
- waiting tasks grouped by reason
- today journal entries
- today's planned blocks

### Offline and resilience stance

The system should be fully usable offline in v1.

External integrations must degrade gracefully:

- GitHub unavailable: local task still works
- HPC scheduler unavailable: experiment remains manually managed
- filesystem path missing: metadata remains, path marked unavailable

### Integration boundary design

Future integrations should sit behind adapters:

- GitHub adapter
- scheduler adapter
- git/repository metadata adapter

The core app should not depend on these integrations to function.

### Concurrency assumptions

For v1, assume:

- single user
- one app instance should be preferred
- database-level protection should still guard against corruption

If multiple windows are allowed later, keep a single shared source of truth and explicit refresh behavior.

### Data lifecycle

Suggested lifecycle:

- active records for current work
- archived records for completed/stale tasks
- soft-delete avoided unless strongly needed

Archiving is safer than deletion for a reporting-heavy application.

### Reporting implications

Reports should be built from durable facts:

- work sessions
- scheduled blocks
- task metadata over time
- experiment state history where relevant

Do not compute reports from volatile UI state.

### Architecture recommendation summary

For v1, the strongest baseline is:

- single-user local-first desktop app
- web-based UI in a desktop shell
- application service layer with explicit domain actions
- SQLite as source of truth
- audit/history tables for critical transitions
- filesystem backups and export/import

## Level 4: Contracts And Integration Boundaries

### Purpose of this level

This level defines:

- domain invariants the app must enforce
- write/read boundaries between UI and core logic
- persistence guarantees
- import/export contracts
- external integration scope and limits

The goal is to prevent accidental ambiguity later.

### Domain contracts

#### 1. Human work contract

- at most one active human task at a time in v1
- a task may have many work sessions
- a work session belongs to exactly one task
- work sessions are factual records and cannot overlap with another active work session
- pausing or switching task closes the active work session

#### 2. Planning contract

- scheduled blocks are plans, not evidence of work
- scheduled blocks must never be counted as spent time in reports
- scheduled blocks may be moved, resized, or removed without affecting historical work data

#### 3. Task state contract

- task workflow state is separate from work session state
- a task may be `Waiting` without an active work session
- waiting reason should be explicit when entering waiting state
- completed tasks are closed for new work unless explicitly reopened

#### 4. Experiment contract

- an experiment belongs to one primary task in v1
- experiments may exist without an active human work session
- experiment runtime does not contribute to time-spent reports
- experiment state changes must be historized
- `Stalled` means intervention is required before progress can continue

#### 5. Notes contract

- daily journal entries are general notes by day
- task notes belong to a task
- experiment notes belong to an experiment
- journal entries may link to tasks and experiments without becoming owned by them

### Application service contracts

The UI should not write directly to storage. All state changes go through application services.

Representative commands:

- `create_task`
- `update_task_metadata`
- `start_task`
- `pause_task`
- `switch_task`
- `set_task_waiting`
- `resume_task`
- `complete_task`
- `create_scheduled_block`
- `move_scheduled_block`
- `register_experiment`
- `set_experiment_state`
- `append_journal_entry`
- `add_task_note`
- `add_experiment_note`

Expected behavior:

- commands are transactional
- failed commands do not leave partial state behind
- commands return stable identifiers and enough state for UI refresh

### Read-model contracts

The UI should read from dedicated query services or repository methods, not reconstruct complex state client-side.

Required read models for v1:

- Home / Today summary
- Global task overview
- Calendar feed
- Task detail
- Experiment detail
- Journal-by-day
- Report aggregations

This keeps UI logic lighter and preserves consistency.

### Persistence contracts

- SQLite is the source of truth in v1
- schema changes must go through explicit migrations
- timestamps stored in UTC
- foreign-key integrity enforced
- critical transitions recorded in history tables
- archive is preferred over delete

Deletion contract:

- hard delete should be avoided for reportable entities
- archival keeps reports stable and protects history

### Import/export contracts

The app should support a clean data portability boundary from the start.

Recommended v1 contracts:

- full snapshot export/import for recovery and migration
- CSV export for reports
- JSON export for structured data interchange if needed

Snapshot export should include:

- schema/app version
- tasks
- macro-activities
- work sessions
- scheduled blocks
- experiments
- notes
- history records
- integration references

### GitHub integration boundary

#### v1 recommendation

GitHub should be optional and reference-first.

Minimum contract:

- store repository identifier
- store issue number
- store issue URL
- allow opening the issue from the UI

Optional cached metadata later:

- issue title
- issue state
- labels

Rules:

- core task creation must not depend on GitHub availability
- GitHub sync failure must not block local work
- imported metadata should be treated as advisory, not authoritative over local task state

This last point is important: a GitHub issue being open or closed is not the same thing as your personal task state.

### Git/repository metadata boundary

The app should support linking a task or experiment to local code context without requiring deep git automation in v1.

Minimum contract:

- repository path
- branch name
- commit hash
- optional version/tag label

The app may populate these manually in v1 and automate them later.

### HPC / scheduler integration boundary

Scheduler integration should be deferred but designed for.

Future adapter contract might expose:

- job identifier
- scheduler name
- queue/state
- submission time
- start/end time
- link to logs or workdir

For v1:

- all scheduler fields are optional
- experiment tracking must remain usable with manual entry only

### UI-to-core boundary

The frontend should treat the backend/core as authoritative for:

- active task resolution
- task switching semantics
- report calculations
- experiment state transitions
- calendar/history separation

The frontend should be responsible for:

- presentation
- local interaction state
- optimistic UX only where safe

### Error-handling contract

User-facing operations should fail safely.

Rules:

- no partial task switch
- no orphan work session left active after failed switch
- no report corruption if an experiment update fails
- explicit user-visible error messages
- recovery path should preserve previous valid state

### Versioning contract

Even in v1, internal and exported data should carry version information.

Recommended versioning points:

- database schema version
- snapshot export version
- integration adapter version where relevant

This reduces migration pain later.

### Security and privacy boundary

For v1, security requirements are local-user oriented rather than multi-tenant.

Assumptions:

- single local user
- no remote sync in v1
- local file permissions provide baseline protection

However:

- tokens for future GitHub integration must be stored separately from main data where possible
- sensitive local paths should not be leaked into exports unless included intentionally

### Contract summary for v1

The v1 contract set should guarantee:

- reliable local time tracking
- explicit separation of work, waiting, experiments, and planning
- optional integrations with graceful degradation
- stable reporting from historical facts
- import/export and migration readiness

## Level 5: Delivery Plan

### Delivery principle

Keep the product architecture desktop-capable, but avoid taking packaging complexity too early.

Recommended delivery path:

1. build v1 as a local-first web application for Linux
2. keep the frontend and backend boundaries clean
3. add a desktop wrapper after the core workflows are stable

This is a delivery optimization, not a domain or contract change.

### Recommended stack

#### Backend

- Python
- FastAPI
- SQLAlchemy 2.x
- Alembic
- SQLite

Rationale:

- strongest fit with current team skills
- fast iteration on domain logic and reporting
- mature persistence and migration tooling

#### Frontend

- TypeScript
- React
- TanStack Router
- TanStack Query
- TanStack Table
- FullCalendar

Rationale:

- strong ecosystem for dense productivity UIs
- excellent fit for cockpit, reports, table-heavy views, and calendar workflows
- good long-term flexibility for desktop wrapping later

#### Packaging / developer workflow

- local development with separate frontend and backend processes
- `uv` for Python project management
- `pytest` for backend tests
- frontend test stack to be selected during bootstrap, likely Vitest plus component testing

#### Desktop packaging later

- Tauri as the preferred desktop wrapper once v1 workflows stabilize

Reason:

- smaller footprint and native-webview model
- supports Linux and macOS
- flexible enough to wrap the web frontend and communicate with local backend or sidecar processes

### Stack alternatives considered

#### Alternative A: PySide6 / QML only

Pros:

- mostly one language
- strong desktop integration
- Qt Quick supports fluid UIs

Cons:

- slower access to rich calendar/table/reporting ecosystem
- likely slower UI iteration for this specific product

#### Alternative B: Tauri-first from day one

Pros:

- strongest desktop identity early

Cons:

- packaging and process-integration complexity too early
- raises delivery risk before the workflows are validated

### Naming

- Product name: `Flow Desk`
- Repo slug: `flow-desk`
- Recommended Python package: `flowdesk`

### Proposed repo structure

#### Repo topology recommendation

Recommended for v1:

- one Git repository
- two main application areas inside it: frontend and backend

Reason:

- this is one product with one domain model
- frontend and backend contracts will evolve together rapidly in early development
- schema changes, API changes, and UI changes should land atomically
- local-first packaging later will benefit from coordinated versioning

When a split into two repos could make sense later:

- separate teams own frontend and backend independently
- the backend becomes a reusable platform for multiple clients
- release cadence becomes meaningfully different
- API compatibility must be versioned independently from the UI

For now, separate repos would add overhead without enough benefit.

- `backend/`
- `frontend/`
- `docs/`
- `scripts/`
- `tests/`
- `artifacts/`

Suggested internal structure:

- `backend/src/runboard/`
- `backend/alembic/`
- `frontend/src/app/`
- `frontend/src/features/`
- `frontend/src/shared/`
- `docs/adr/`
- `docs/design/`

### Architecture-to-repo mapping

Backend modules:

- tasks
- work_sessions
- scheduled_blocks
- experiments
- notes
- reports
- integrations
- backup

Frontend feature areas:

- today
- global_tasks
- calendar
- task_detail
- experiment_detail
- journal
- reports
- settings

### First milestones

#### Milestone 0. Bootstrap

- initialize repo
- choose name
- create ADRs
- set up tooling, linting, formatting, tests, and migrations
- create app shell and navigation skeleton

#### Milestone 1. Core domain and durability

- implement schema and migrations
- implement task/work-session/scheduled-block contracts
- implement backup/export/import baseline
- add seed/demo data path

#### Milestone 2. Today cockpit and task timing

- active task
- start/pause/switch flows
- waiting reasons
- recent activity

#### Milestone 3. Experiments

- experiment registry
- running/stalled/failed lifecycle
- task linkage
- experiment detail screen

#### Milestone 4. Notes and journal

- daily journal
- task notes
- experiment notes
- cross-links

#### Milestone 5. Global tasks and calendar

- dense all-task overview
- scheduling blocks
- drag/move planning
- next-up visibility

#### Milestone 6. Reports

- date-range filtering
- task and macro-activity aggregation
- active time vs waiting context
- export

#### Milestone 7. GitHub references

- issue URL/repo/number support
- open issue from UI
- optional metadata caching later

#### Milestone 8. Desktop packaging

- wrap with Tauri
- Linux packaging first
- macOS validation later

### What should be built first

Do not start with GitHub integration or scheduler integration.

Build order should be:

1. domain model and migrations
2. write-path services enforcing contracts
3. Today cockpit with task timing
4. experiment model and views
5. calendar and reports

This keeps the highest-risk product logic under control early.

### Additional design points to explicitly keep

Two additional concerns should remain visible during implementation:

- test strategy
- release/backup strategy

These are now included in the milestone plan rather than treated as separate design levels.
