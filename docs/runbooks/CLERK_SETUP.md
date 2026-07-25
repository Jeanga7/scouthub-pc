# Clerk Setup Runbook

ScoutHub-PC uses Clerk for identity only. Business roles, scopes and permissions stay in PostgreSQL.

## Manual Setup

1. Create or select the Clerk application for ScoutHub-PC.
2. Provide the public `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` during `opennextjs-cloudflare build` for the targeted environment. Next.js embeds `NEXT_PUBLIC_*` values into the client bundle; this key is public but must match the Clerk environment being built.
3. Store the Secret Key only as the Cloudflare runtime secret `CLERK_SECRET_KEY`.
4. Set the sign-in URL to `/sign-in`.
5. Set the sign-up URL to `/sign-up`.
6. Configure allowed redirect URLs for the local, preview and production origins.
7. Set `APP_ORIGIN` explicitly for each environment. Server runtime refuses to start without it.
8. If a preview or deployment must accept more than one origin, set `CLERK_AUTHORIZED_PARTIES` to a comma-separated list of explicit origins. Do not derive this from an HTTP `Host` header.
9. Enable restricted or invitation-only sign-up.
10. Do not enable Clerk Organizations for ScoutHub organization, role or permission modeling.
11. Do not store ScoutHub business roles, permissions, tenant ids or scope organization ids in Clerk metadata.
12. Review MFA/session policies with the institution before requiring MFA globally.

## Metadata Boundary

Clerk invitation metadata may contain only the opaque pointer:

```text
scouthub_invitation_id
```

This value is not a permission. ScoutHub validates the local invitation and creates local RoleAssignments only during idempotent provisioning.

## Environment Notes

- `local`: `.env` is not committed; fake providers are used in tests.
- `test`: no real Clerk network calls.
- `preview`: build-time `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is supplied for the preview Clerk application; runtime variables/secrets are configured in Cloudflare.
- `production`: build-time `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is supplied for the production Clerk application; runtime variables/secrets are configured in Cloudflare, with `DATABASE_URL` and `CLERK_SECRET_KEY` stored as secrets.

CI must not depend on a real Clerk account or live Clerk API.
Never put `CLERK_SECRET_KEY` in a frontend build environment or committed file.
