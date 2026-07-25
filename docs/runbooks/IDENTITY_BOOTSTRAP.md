# Identity Bootstrap Runbook

The first RegionalAdmin cannot be invited by another RegionalAdmin, so Slice 2 provides a manual CLI bootstrap. There is no public HTTP bootstrap endpoint.

## Command

```bash
BOOTSTRAP_CONFIRM=true \
CLERK_USER_ID=user_xxx \
BOOTSTRAP_EMAIL=admin@example.test \
BOOTSTRAP_FIRST_NAME=Admin \
BOOTSTRAP_LAST_NAME=Regional \
TENANT_ID=<nso-uuid> \
REGION_ORG_ID=<region-uuid> \
DATABASE_URL=postgres://... \
pnpm identity:bootstrap-regional-admin
```

## Preconditions

- The tenant NSO already exists.
- `REGION_ORG_ID` belongs to the tenant.
- The Clerk user exists and the provided email is verified in Clerk.
- No active RegionalAdmin already exists for that region.
- The command is run by an operator authorized by the institution.

## Safety Rules

- `BOOTSTRAP_CONFIRM=true` is mandatory.
- The command must not log database credentials, Clerk secrets or tokens.
- A second active RegionalAdmin bootstrap for the same region is refused.
- Break-glass replacement of the last RegionalAdmin is outside Slice 2.

## Post-Run Checks

1. Confirm an `ACTIVE` Account exists for the provider subject.
2. Confirm one Person exists in the expected tenant.
3. Confirm one active `REGIONAL_ADMIN` RoleAssignment scoped to the region.
4. Confirm an audit event records the bootstrap assignment.
