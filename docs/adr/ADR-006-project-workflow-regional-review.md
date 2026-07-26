# ADR-006 — Project Workflow & Regional Review

## Status

Accepted.

## Context

Slice 4 introduces the first controlled workflow for ScoutHub-PC Projects. Evidence, uploads, execution tracking, final review, notifications, queues, cron triggers and public publication remain out of scope.

## Decision

Project status changes are handled only by explicit workflow use cases:

- `DRAFT -> READY_FOR_REVIEW`
- `READY_FOR_REVIEW -> IN_REVIEW`
- `IN_REVIEW -> CHANGES_REQUESTED`
- `CHANGES_REQUESTED -> READY_FOR_REVIEW`
- `IN_REVIEW -> APPROVED_FOR_EXECUTION`
- `IN_REVIEW -> REJECTED`

No generic status update endpoint is exposed. Project content can be edited only in `DRAFT` and `CHANGES_REQUESTED`.

Each submission creates a new `approval_request` for workflow `PROJECT` and stage `INITIAL_REVIEW`. A partial unique index prevents two simultaneous pending requests for the same project/stage. Resubmission after changes creates a new request and never reopens the previous cycle.

Each terminal review decision creates one immutable `approval_decision`. A unique constraint ensures at most one decision per request. `CHANGES_REQUESTED` and `REJECTED` require a plain text reason.

Every project status change creates an immutable `state_transition`. Review comments are stored in `project_comment`, are append-only, and are bound to an approval request so comments remain attached to the review cycle where they were written.

Authorization uses the existing same-assignment model: a single active role assignment must provide tenant, permission and organization scope coverage for the project owner organization path. Regional review decisions are granted to `REGIONAL_PROGRAMME_REVIEWER`, not to `REGIONAL_ADMIN`.

Authors cannot review their own submission. The guard applies when the reviewer is the project creator or the account that submitted the approval request.

Workflow mutations lock rows in a stable order: Project first, then ApprovalRequest. This keeps transitions atomic and avoids preventable deadlocks.

## Consequences

The review queue is derived from pending approval requests and SQL-filtered by reviewer scope paths. Review history is assembled from requests, decisions, comments and transitions without rewriting history.

Slice 4 persists the business facts needed for future notifications, but does not send notifications and does not create outbox events. Async delivery remains Slice 6.

Evidence requests are represented only as comments or request-changes reasons until Slice 5 defines files and storage.

Reviewer transfer, final review and execution states are deliberately deferred.
