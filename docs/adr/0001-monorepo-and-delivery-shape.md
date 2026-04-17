# ADR 0001: Monorepo And Delivery Shape

## Status

Accepted

## Context

Flow Desk is a single-user local-first product with one evolving domain model. In the early phases, the frontend, backend, schema, and UI workflows will change together frequently.

## Decision

Use one Git repository with separate top-level `backend/` and `frontend/` directories.

Deliver the first usable version as a local-first web application, while keeping the system ready for desktop packaging later.

## Consequences

Positive:

- schema and UI changes can land atomically
- one release flow in the early project stage
- simpler versioning and lower coordination overhead

Negative:

- frontend and backend histories are not isolated
- the repository contains two technology stacks

Follow-up:

- keep a strict API boundary between frontend and backend
- revisit desktop packaging after the core workflows stabilize

