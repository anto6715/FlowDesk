# ADR 0002: Application Architecture Baseline

## Status

Accepted

## Context

Flow Desk must prioritize stability, recoverability, modularity, and a strong Linux-first UI. The product is single-user and local-first in `v1`.

## Decision

Adopt this baseline architecture:

- React frontend for the user interface
- Python backend exposing application services and API endpoints
- SQLite as the source of truth
- explicit separation between `WorkSession` and `ScheduledBlock`
- optional integrations behind adapters

## Consequences

Positive:

- strong fit for the reporting and workflow-heavy domain
- simple deployment in the early phases
- reliable local persistence with low operational overhead

Negative:

- two language stacks
- desktop packaging is deferred instead of solved immediately

Non-goals for `v1`:

- multi-user access
- mandatory GitHub synchronization
- mandatory scheduler integration

