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
- Current priority is continued UI polish before broad new backend/product features.
- Next UI slice should start with experiment detail/comments, then Journal note editing and smarter task linking, then planned-session edit/reschedule/cancel interactions.

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

### Slice 2. Experiment detail and comments

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

### Slice 3. Journal editing and task references

Status: planned.

Scope:

- Allow editing existing daily journal notes.
- Improve task linking from journal writing, preferably with a lightweight `#` task-reference picker.
- Do not assume task titles are globally unique unless the backend contract is explicitly changed.

Acceptance:

- Existing notes can be corrected without leaving the Journal flow.
- Task links are easier to add than using a raw dropdown for every note.

### Slice 4. Planned-session interaction polish

Status: planned.

Scope:

- Add edit/reschedule/cancel affordances for planned sessions from Calendar and task detail.
- Preserve the backend `ScheduledBlock` naming internally.
- Keep visible user-facing language as `Planned session`.

Acceptance:

- A planned session is not just a static calendar item.
- Start/end inputs remain non-overlapping on mobile and desktop.

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
