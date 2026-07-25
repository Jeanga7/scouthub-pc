# ADR-003 — Organization Hierarchy

Status: Accepted

Date: 2026-07-25

## Context

Slice 1 introduces the first business model: the ScoutHub organization tree. The model must support a national association root, regions, optional districts, groups and units without assuming that every group is under a district.

## Decision

ScoutHub uses a generic `organization` table. Each tenant is rooted by one `NSO` organization where `organization.id == organization.tenant_id`, `parent_id IS NULL`, `depth = 0` and `path = /<nso-id>/`.

All descendant organizations keep the same `tenant_id`; the database is shared across tenants. Repository APIs always require `tenantId`, so a UUID alone is never enough to read or mutate an internal organization.

Slice 1 allows these parent/child pairs:

- `NSO -> REGION`
- `REGION -> DISTRICT`
- `REGION -> GROUP`
- `DISTRICT -> GROUP`
- `GROUP -> UNIT`

`TEAM` remains a recognized domain type but is reserved until an institutional decision defines where it belongs. Slice 1 rejects `TEAM` creation.

The hierarchy uses a text materialized path built from UUIDs:

```text
/<nso-id>/
/<nso-id>/<region-id>/
/<nso-id>/<region-id>/<group-id>/
```

Codes and names are deliberately excluded from the path so renames do not rewrite a subtree. `depth` is stored with the row for deterministic queries and display.

We do not use PostgreSQL `ltree` in Slice 1. A portable text path with indexes is enough for the pilot and avoids adding an extension. The PostgreSQL index on `(tenant_id, path text_pattern_ops)` is chosen because descendant queries use `path LIKE '<uuid-prefix>%'`; `text_pattern_ops` keeps that prefix search indexable across collations.

Moving an organization is transactional. The repository locks the moved node, the new parent and the subtree rows, validates tenant, type and cycle rules, then rewrites paths and depths for the subtree in the same transaction as the audit event.

`audit_event` is append-only and records minimal metadata. It stores no HTTP body, no secret and no full resource copy.

Slice 1 exposes a temporary dev-admin surface only when `APP_ENV` is `local` or `test` and `ENABLE_DEV_ADMIN=true`. Preview and production refuse it even if the flag is set. Slice 2 will replace this with real authentication and server-side policies.

No delete endpoint or archive policy is implemented in Slice 1 because retention rules are not yet specified.

## Consequences

- Districts are optional.
- Cross-tenant parent references are rejected by repository logic and by a composite database foreign key.
- Descendant queries can use `tenant_id` and path prefix filters.
- A subtree move updates all descendant paths and depths but preserves IDs and codes.
- Future slices can add membership, roles and authorization without changing the core organization identity model.
