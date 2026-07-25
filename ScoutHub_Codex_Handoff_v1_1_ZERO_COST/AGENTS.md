# ScoutHub Coding Rules — v1.1 Zero-Cost Serverless

## Source of truth
- Read `docs/MASTER_SPEC.md` before any architectural or functional change.
- Do not invent business rules.
- If code conflicts with `MASTER_SPEC.md`, stop and document the conflict.
- Treat institutional decisions marked "to confirm" as configuration/open decisions, not facts.

## Architecture
- Start as a modular monolith.
- Pilot deployable: **one `apps/web` Next.js application** on Cloudflare Workers via OpenNext.
- No NestJS/Fastify in the MVP.
- No new microservice without an ADR and demonstrated operational need.
- `domain` and `application` MUST NOT import Cloudflare, Clerk, Neon, R2 or Wrangler SDKs.
- External providers are accessed only through ports/adapters.
- PostgreSQL is the transactional source of truth.
- `Person` and `Account` are separate concepts.
- Clerk provides identity/session only; ScoutHub owns roles, organization scopes and permissions.
- Cloudflare Queues + Cron are the async primitives; never assume a permanent Node.js process.
- External platforms (Scouts for SDGs, ScoutPass, SIGERAS, etc.) use explicit integration ports.
- Never scrape or depend on undocumented external APIs.

## Provider boundaries
Use interfaces such as:
- `IdentityProvider`
- `ObjectStorage`
- `AsyncQueue`
- `NotificationGateway`
- repository ports per domain

Provider-specific code belongs under `packages/infrastructure/*`.

Forbidden examples:
- calling `env.MY_BUCKET.put()` from a domain/use-case;
- using Clerk organization roles as ScoutHub role assignments;
- importing Neon driver inside React components;
- encoding Cloudflare-specific types into domain entities.

## Cost guardrails
- Pilot infrastructure target: **$0/month** excluding an optional domain.
- Never enable a paid plan, premium add-on or persistent paid resource without Product Owner approval.
- Never add Redis, Kafka, a VPS, Kubernetes or a third-party SaaS "for convenience" without an ADR.
- Prefer caching, compression, direct-to-R2 uploads and asynchronous processing before scaling spend.
- Monitor Workers requests/CPU, R2 storage/operations, Neon storage/CU-hours/egress, Clerk MRUs and Queue operations.
- Reaching a free-tier limit is a reason to evaluate a controlled upgrade, not to introduce fragile hacks.

## Security & privacy
- Treat data concerning minors as P3 by default.
- Never use real minor data in development, fixtures, screenshots, tests, demos or seed files.
- Never log secrets, session tokens, identity documents, sensitive payloads or safeguarding details.
- Add negative authorization tests for every scoped resource.
- Validate uploads server-side and strip unsafe metadata where required.
- Public pages MUST read only explicitly publishable snapshots/projections, never raw internal records.
- Destructive/privacy-sensitive actions require audit events.
- Default deny.

## Authorization
- A role alone never grants global access: evaluate role + organization scope + relationship + resource state + data classification.
- All authorization is enforced server-side.
- Do not implement UI-only authorization.
- A group administrator must not access another group's private records unless an explicit higher scope permits it.

## Cloudflare/Workers compatibility
- Avoid Node-only native dependencies unsupported by Workers.
- Validate the OpenNext/Workers build on every PR.
- Do not perform heavy PDF/image/CPU work synchronously in user requests.
- Large files upload directly to R2 using short-lived signed URLs.
- Use Queue consumers for asynchronous work.
- Scheduled work uses Cron Triggers.
- Database migrations run from CI/deployment jobs, not at Worker startup.

## Database
- Drizzle + explicit SQL migrations.
- Every schema change requires a migration.
- Production migrations must be backward-compatible where possible.
- Use expand → migrate → contract for risky changes.
- Do not put binary files in PostgreSQL.
- Keep file metadata/checksums in PostgreSQL and objects in R2.

## Async reliability
For business-critical async work:
1. write business state and `outbox_event` in the same DB transaction;
2. dispatch via scheduled worker;
3. enqueue to Cloudflare Queues;
4. make consumers idempotent;
5. record processing attempts/outcomes.

## Quality
- TypeScript strict.
- No `any` without an explicit, justified comment.
- Tests are required for domain rules, workflows and authorization boundaries.
- Prefer deterministic state machines over ad-hoc status mutation.
- Run lint, typecheck, tests, migrations and Cloudflare/OpenNext build before declaring a task complete.

## Scope discipline
- Implement only the requested vertical slice.
- Do not add speculative modules "for later".
- Prefer boring, maintainable solutions.
- Do not prematurely introduce event sourcing or distributed systems.

## Documentation
- Update/create the relevant ADR when an architectural decision changes.
- Update `docs/MASTER_SPEC.md` only when the Product Owner approves the product/architecture change.
- Keep API contracts documented/generated.
- Update runbooks for deployment, backup, costs and operationally sensitive components.

## Completion gate
A task is not complete unless:
1. acceptance criteria are satisfied;
2. positive and negative tests pass;
3. lint/typecheck/tests/Workers build pass;
4. migrations work from a clean PostgreSQL database;
5. authorization boundaries are tested;
6. no critical security TODO remains;
7. no unapproved paid dependency was introduced;
8. documentation affected by the change is updated.
