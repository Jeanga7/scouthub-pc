# ADR-004 — Identity and Authorization

Status: Accepted

Date: 2026-07-25

## Context

Slice 2 replaces the temporary Slice 1 development administration bypass with real authentication and authorization. ScoutHub-PC must know who the user is, which local Account and Person are linked to the provider identity, which role assignments are active, and whether the requested action is allowed on the requested organization scope.

## Decision

Clerk is used as an identity provider only. It handles login, sessions, invitation delivery, account recovery and provider-side suspension. ScoutHub does not use Clerk Organizations, Clerk organization roles or Clerk organization permissions. Business roles, organization scopes, permissions and mandate history live in PostgreSQL.

The Next.js bridge uses Clerk middleware only to expose authentication state. Authorization remains resource-side in Route Handlers and application use cases. For the current Cloudflare/OpenNext target, ScoutHub-PC keeps `middleware.ts` instead of Next 16 `proxy.ts` because OpenNext Cloudflare does not support Node middleware/proxy output yet. This runtime workaround must be revisited when OpenNext supports Next.js proxy middleware on Workers.

`Account` and `Person` are separate concepts:

- `Account` is the technical application identity linked to a provider subject.
- `Person` is the minimal adult person record inside a tenant.
- `account_person_link` links an Account to one Person per tenant.

Accounts are adult-only in Slice 2. Invitations require an explicit adult eligibility attestation, recorded locally and audited. The attestation is an administrative confirmation for ScoutHub-PC access, not a legal proof of age.

Authorization uses local tables:

- `role_definition`
- `permission_definition`
- `role_permission`
- `role_assignment`

Role assignments are historized and never hard-deleted. A role is active only when its start/end dates allow it and it has not been revoked. Expiration is checked synchronously by the backend; no Cron is required for permissions to expire.

Organization scopes reuse the Slice 1 materialized path. A scoped actor may access the scope organization and descendants only when the resource path starts with the active assignment scope path. Same tenant alone never grants access.

`PLATFORM_ADMIN` is deliberately not a business super-admin. It does not receive organization or P2/P3 business data access by default.

Invitations are local first, then external:

1. ScoutHub validates actor permission and scope.
2. ScoutHub creates Person, Account and local invitation in a DB transaction.
3. ScoutHub asks Clerk to create the external invitation with only `scouthub_invitation_id` metadata.
4. ScoutHub stores the external invitation id and marks the local invitation `PENDING`.

The DB transaction and Clerk invitation are not atomic. If Clerk fails, the local invitation becomes `FAILED` and no RoleAssignment is created. If a later external cleanup fails, local state remains authoritative and prevents phantom permissions.

Provisioning is idempotent on the first authenticated request. A valid Clerk session without an existing ScoutHub Account must point to a pending local invitation. The provisioning transaction validates invitation status, expiry, email verification and email match, then links the provider subject, activates the Account, creates the intended RoleAssignment and accepts the invitation. A replay does not create duplicate Accounts, Persons or RoleAssignments.

Restricted Clerk sign-up is required operationally, but it is defense in depth. A Clerk user created without a ScoutHub invitation has no local Account or RoleAssignment and receives no business access.

The first RegionalAdmin is created by a manual CLI bootstrap script. No public HTTP bootstrap endpoint exists. The script refuses to run without explicit confirmation and refuses a second active RegionalAdmin bootstrap for the same region.

## Consequences

- Clerk SDK imports are limited to infrastructure/provider bridge code and Next.js auth UI.
- `packages/domain` and `packages/application` remain provider-neutral.
- Authorization is recalculated from PostgreSQL per request.
- Revoked, expired or suspended local state denies access even if a provider session is still technically valid.
- No webhook is required for Slice 2 authentication.
- No R2, Queue, Cron or custom Worker resource is introduced.
