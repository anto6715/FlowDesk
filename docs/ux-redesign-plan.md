# Flow Desk UX Redesign Plan

## Purpose

This plan tracks the current UI redesign effort. It is the authoritative resume point for future sessions after `AGENTS.md`.

## Working rule

- Proceed one point at a time.
- Do not switch to the next point without asking the user first.
- Pause backend feature work unless the current UI point requires a small contract change.
- Keep existing backend contracts intact where possible.
- Verify and commit each point before asking to continue.

## Current status

- Point 1 completed in `1ec4268`.
- Point 2 completed in `7160403`.
- Point 3 completed in `980f66a`.
- Point 4 completed in `5e25f8d`.
- Point 5 completed in `4d6bf09`.
- Point 6 completed in `d9336fe`.
- UX redesign pass is complete.
- Post-redesign task workflow UI polish completed in `e7ae703`.
- Planned-session interaction polish completed in `ba3540a`.
- V2 Point 1 workbench interaction architecture completed in `f8eb66d`.
- V2 Point 2 note block backend foundation completed in `154f024`.
- V2 Point 3 bullet journal UI completed in `44605d3`.
- Current priority is Flow Desk v2 workbench redesign, not isolated page polish.
- Do not start broad reporting/export work until the workbench and note-linking model are usable.
- Next implementation point is V2 Point 4. Ask the user before starting it.

## Redesign goals

- Reduce visual density across all views.
- Make Home a low-distraction cockpit, not a command dashboard.
- Hide creation/edit forms behind explicit actions.
- Make notes and daily writing first-class, especially in task detail.
- Keep navigation one-click and visible.
- Make mobile layouts non-overflowing and usable.

## Point-by-point plan

### Point 1. Shell/layout foundation and hidden-action pattern

Scope:

- Fix hidden panels/forms so collapsed Home actions are truly hidden.
- Establish a reusable hidden-action pattern for forms that should not occupy the page by default.
- Tighten left navigation and app shell sizing.
- Fix obvious mobile horizontal overflow from shell/select/form layout.

Acceptance:

- Home default view shows only active task and journal-oriented content.
- Hidden task/experiment/schedule forms do not appear until opened.
- Mobile screenshots do not show page-level horizontal overflow.
- `npm run build`, backend tests, and `git diff --check` pass.

### Point 2. Redesigned Home

Status: completed in `7160403`.

Scope:

- Reduce Home to active task, latest journal notes, and compact next-up context.
- Replace always-visible forms with modal/drawer actions.
- Re-evaluate whether scheduled blocks belong on Home by default.

Acceptance:

- First viewport is calm and immediately understandable.
- `+ Task`, `+ Note`, and `+ Experiment` are available without dominating the screen.

### Point 3. Shared form and action components

Status: completed in `980f66a`.

Scope:

- Introduce shared patterns for task creation, experiment creation, GitHub reference entry, task selector, and action drawers/modals.
- Remove duplicated form implementations where practical.

Acceptance:

- The same GitHub URL-first form behavior is used everywhere.
- Task and experiment creation look and behave consistently.

### Point 4. Redesigned Tasks and Task Detail

Status: completed in `5e25f8d`.

Scope:

- Make Tasks a focused task management workspace.
- Make Task Detail notes-first, with metadata/editing secondary.
- Move dense metadata behind an explicit edit action or secondary panel.

Acceptance:

- Task notes are prominent without scrolling past metadata.
- Task editing is available but not visually dominant.

### Point 5. Redesigned Journal, Experiments, and Calendar

Status: completed in `4d6bf09`.

Scope:

- Journal: make daily writing primary and task linking lightweight.
- Experiments: make run registry scannable and creation secondary.
- Calendar: keep real calendar timeline; move scheduling into compact action UI.

Acceptance:

- Each view has one clear primary job.
- Creation forms no longer dominate default layouts.

### Point 6. Visual and mobile polish

Status: completed in `d9336fe`.

Scope:

- Screenshot pass across desktop and mobile.
- Fix typography scale, card density, form spacing, select overflow, table overflow, and empty states.
- Update README/AGENTS with final state and next steps.

Acceptance:

- Browser screenshot pass has no obvious layout overlap or horizontal page overflow.
- Verification passes.

## Post-Redesign Feedback Slices

### Slice 1. Task workflow language and planned-session navigation

Status: completed in `e7ae703`.

Scope:

- Use `Backlog` as the visible label for backend `inbox` tasks without adding a new model.
- Rename visible planned block language to `Planned sessions` while keeping the backend `ScheduledBlock` contract intact.
- Add Backlog/Ready/Waiting/Blocked lanes to the Tasks workspace.
- Add Start/Switch actions from the Tasks table.
- Let planned sessions on Home and Calendar open the linked task detail.

Acceptance:

- Existing backend contracts remain intact.
- `npm run build`, backend tests, `git diff --check`, and browser overflow smoke pass all pass.

### Slice 2. Planned-session interaction polish

Status: completed in `ba3540a`.

Scope:

- Add a management dialog for planned sessions from Home, Calendar, and task detail.
- Expose reschedule, complete, cancel/reopen, and linked-task start/switch actions.
- Preserve the backend `ScheduledBlock` naming internally.
- Keep visible user-facing language as `Planned session`.

Acceptance:

- A planned session is not just a static calendar item.
- Start/end inputs remain non-overlapping on mobile and desktop.
- Browser interaction check can open a Calendar planned session and find Reschedule, Cancel session, and Start/Switch task actions.

### Slice 3. Experiment detail and comments

Status: next, ask before starting.

Scope:

- Add an experiment detail view.
- Make experiment instruction and launch command easy to inspect as code-like text.
- Surface experiment-scoped notes/comments in the detail view.
- Keep experiment creation secondary, not a dominant page form.

Acceptance:

- An experiment can be opened from the registry.
- Experiment notes are visible and appendable from experiment detail.
- Long commands/instructions do not break layout on desktop or mobile.

### Slice 4. Journal editing and task references

Status: planned.

Scope:

- Allow editing existing daily journal notes.
- Improve task linking from journal writing, preferably with a lightweight `#` task-reference picker.
- Do not assume task titles are globally unique unless the backend contract is explicitly changed.

Acceptance:

- Existing notes can be corrected without leaving the Journal flow.
- Task links are easier to add than using a raw dropdown for every note.

## Flow Desk V2 Workbench Plan

### Why V2, Not A Rewrite

Decision:

- Do not restart from scratch.
- Keep the current backend domain: tasks, work sessions, experiments, planned sessions, references, and notes.
- Treat the weak part as the frontend interaction model plus the note model.
- Build a v2 workbench and linked-note layer inside the current repo, then retire older page patterns gradually.

Reasoning:

- The existing domain entities are still aligned with the product.
- Reporting needs the structured task/experiment/time data already present.
- A full rewrite would delay the same product decisions and risk losing working persistence/API behavior.

### V2 Product Direction

Flow Desk should feel like an integrated workbench, not a collection of independent pages.

Primary principles:

- Entities are clickable everywhere: task, experiment, planned session, journal bullet, tag, and GitHub reference.
- The user should rarely need left navigation to continue a workflow.
- Home should be the main workbench: journal, selected/current task, and operational context.
- Notes are working memory, not a separate side feature.
- Tags and references inside notes become reporting dimensions.
- Structured reporting remains the key differentiator from Logseq/Todoist-like tools.

Reference products to keep in mind:

- Logseq: bullet journal, backlinks, markdown, tag-first note flow.
- Todoist: fast task capture, low-friction triage, clear task states.
- ClickClick or command-style launchers: quick actions and fast switching without page hunting.

### V2 Medium Note Scope

Target scope:

- Editable daily bullet notes.
- Markdown content per bullet.
- `#tag` support inside notes.
- Task and experiment references from notes.
- Backlinks from task/experiment/tag views to related note bullets.
- Reusable note components in Home, Journal, Task Detail, and Experiment Detail.
- Reporting can later aggregate by task, experiment, time session, and note tags.

Explicitly out of scope for the first pass:

- Full Logseq clone behavior.
- Arbitrary graph visualization.
- Block transclusion.
- Complex nested block drag/reorder.
- Collaborative editing.

### V2 Data Direction

Likely model evolution:

- Add `NoteBlock` or equivalent block-level note entity:
  - `id`
  - `journal_day`
  - `content_markdown`
  - `parent_id` nullable, for future nested bullets
  - `sort_order`
  - timestamps
- Add parsed note links:
  - `note_block_id`
  - `target_type`: `task`, `experiment`, `tag`
  - `target_id` for structured entities
  - `tag_name` for tags

Compatibility rule:

- Preserve or migrate current notes deliberately.
- Do not remove current note APIs until the new note block APIs and UI cover existing behavior.
- Do not assume task titles are unique; references must resolve to stable ids even if display text uses titles.

Point 2 implementation note:

- Daily journal note blocks are now paired with legacy `notes` rows during the transition.
- Legacy journal entry writes backfill note blocks immediately so pre-Point-3 frontend flows still preserve the new note graph data.
- Block updates keep the paired legacy journal row content in sync, but multi-entity backlinks should be treated as the source of truth for v2 note navigation.

### V2 Point 1. Workbench Interaction Architecture

Status: completed in `f8eb66d`.

Scope:

- Define the new primary app shell behavior.
- Make Home a workbench rather than a dashboard.
- Add a selected-entity/inspector pattern or equivalent detail surface.
- Make every visible task reference open task detail or the inspector.
- Make every visible experiment reference open experiment detail.
- Show newly created Backlog tasks immediately in Home context.
- Reduce dependence on left navigation for normal workflows.

Acceptance:

- Creating a Backlog task from Home leaves it visible on Home immediately.
- From Home, task detail is reachable directly from task rows/cards.
- From task detail, experiment detail is reachable directly from experiment rows/cards.
- The user can follow task -> experiment -> notes/context without returning to the left nav.
- No backend contract change unless strictly required.

### V2 Point 2. Note Block Backend Foundation

Status: completed in `154f024`.

Scope:

- Add block-level note persistence and migrations.
- Add note link/tag parsing on create/update.
- Add APIs for daily note blocks, block update, and backlink queries.
- Keep old note behavior working or provide a clear migration path.

Acceptance:

- A daily bullet can be created, edited, and reloaded.
- `#tag` references are stored/queryable.
- Task/experiment links use stable ids, not title uniqueness.
- Existing backend tests remain green and new note-block tests cover parsing and backlinks.

### V2 Point 3. Bullet Journal UI

Status: completed in `44605d3`.

Scope:

- Build a reusable bullet note editor component.
- Support markdown writing and rendering.
- Support editing existing bullets.
- Use the same component in Journal and Home.
- Keep keyboard interaction simple and reliable before adding advanced shortcuts.

Acceptance:

- Existing notes can be edited.
- Daily journal feels like a bullet stream, not isolated form submissions.
- Markdown is readable in display mode and editable in edit mode.
- Mobile layout remains usable.

Implementation notes:

- Home quick note actions and the Journal workspace now share the same block editor.
- The frontend now reads and updates daily `note_blocks` directly while leaving legacy journal rows as a backend-managed compatibility bridge.
- Editing is intentionally simple: textarea-based markdown, optional linked task selection, and lightweight save shortcuts before adding richer note-reference insertion.

### V2 Point 4. Tags, References, And Backlinks

Status: next, ask before starting.

Scope:

- Add `#tag` recognition and tag browsing.
- Add lightweight task/experiment reference insertion from notes.
- Add backlink panels on task and experiment detail.
- Add a tag view or filtered note view for all bullets with a tag.

Acceptance:

- From a note, the user can reference a tag without leaving the note flow.
- From a task, the user can see linked journal bullets.
- From an experiment, the user can see linked journal bullets.
- From a tag, the user can see all matching note bullets.

### V2 Point 5. Home Workbench Redesign

Status: planned.

Scope:

- Rebuild Home around:
  - Today bullet journal
  - active or selected task
  - Backlog/Ready/Waiting context
  - running/stalled experiments
  - planned sessions
- Make Home the default place to continue work, not just observe state.
- Keep creation actions lightweight and contextual.

Acceptance:

- Home shows newly created Backlog tasks.
- Home supports opening task and experiment details directly.
- Notes and task context are visible together without feeling crowded.
- The default page feels operational and serious, not toy-like.

### V2 Point 6. Experiment Detail And Comments

Status: planned.

Scope:

- Add experiment detail view.
- Display instruction and launch command as code-friendly content.
- Surface experiment-scoped comments/notes.
- Show linked task, backlinks, artifacts/log paths, and run metadata.

Acceptance:

- Experiment detail is reachable from task detail and experiment registry.
- Long commands/instructions do not break desktop or mobile layout.
- Experiment notes/comments are visible and appendable.

### V2 Point 7. Reporting Integration

Status: planned after workbench/note foundations.

Scope:

- Use structured tasks, experiments, work sessions, and note tags together.
- Start with simple read models before complex charts.
- Let tags become reporting filters/dimensions.

Acceptance:

- A report can answer what work happened by task/macro-activity.
- A report can include related notes/tags for context.
- Tags can help summarize themes across tasks and experiments.

### V2 Coordination Rule

- Proceed point by point.
- Ask the user before starting each V2 point.
- Keep checkpoint commits after each point.
- Update this plan and `AGENTS.md` whenever the active point or order changes.
- Prefer a working integrated slice over broad partial rewrites.

## Verification per point

Run before each checkpoint commit:

```bash
cd backend
uv run ruff check .
uv run pytest

cd ../frontend
npm run build

cd ..
git diff --check
```

Use browser screenshots for UX acceptance when layout changes are involved.
