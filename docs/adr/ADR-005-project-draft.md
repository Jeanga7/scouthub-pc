# ADR-005 — Project Draft

Status: Accepted

Date: 2026-07-25

## Context

Slice 3 introduces the first Projects & Impact business object. It must allow authorized adults to create and maintain internal project drafts without starting the workflow, evidence, public portal, Scouts for SDGs or impact follow-up slices.

## Decision

`Project` ownership belongs to an `Organization`, not to the Account that created the draft. The owner is stored as `owner_org_id` and Slice 3 accepts only active `GROUP` and `UNIT` owners. `created_by_account_id` is audit and traceability only; it does not grant permanent access. `project_lead_person_id` is initialized from the authenticated actor's tenant `Person`.

Slice 3 creates only `DRAFT` projects. It does not expose submit, review, approval, request changes, publication or state transition tables. Visibility can be set only to `PRIVATE` or `INTERNAL`; public publication remains owned by Slice 10.

The project code is a stable ScoutHub-PC technical reference such as `PRJ-XXXXXXXX`. It is not an official OSN numbering scheme. `internal_slug` is tenant-unique and human-readable, but it is not public and is never an authorization mechanism.

Project authorization is provider-neutral and extends `@scouthub/authz`. A `ProjectResource` is authorized through its owner Organization path. Permission and scope must come from the same active RoleAssignment, preserving the Slice 2 invariant.

Slice 3 adds only:

- `project.create`
- `project.read`
- `project.update`

`UNIT_LEADER` and `GROUP_ADMIN` may create, read and update drafts in their organization scope. District, regional programme, regional admin and national observer roles receive read-only access according to their scopes. `PLATFORM_ADMIN` remains non-business by default.

`PROJECT_CONTRIBUTOR` remains reserved. Existing RoleAssignments scope to Organizations, and a Project is not an Organization; ScoutHub-PC does not put Project IDs into `scope_org_id`.

Updates use optimistic concurrency through `version`. PATCH is partial: omitted fields are kept, explicit `null` clears nullable fields, and a stale `expectedVersion` conflicts.

The list endpoint filters in PostgreSQL using the owner organization materialized path. It must not load all projects and filter in application code.

## Out of Scope

- workflow and regional review;
- submission, approval and state transition logs;
- participants and youth data;
- evidence, media, R2 and signed uploads;
- Scouts for SDGs initiatives/challenges;
- indicators and impact follow-up;
- public project snapshots or pages;
- queues, cron, outbox or custom Worker.

## Consequences

- Group work remains owned by the Group/Unit, while regional roles can read without silently rewriting drafts.
- A creator loses access when their active role assignment no longer covers the owner organization.
- Future project collaboration needs a dedicated model instead of overloading Organization-scoped RoleAssignments.
