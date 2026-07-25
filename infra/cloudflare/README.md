# Cloudflare Pilot Notes

The pilot target is Cloudflare Workers through OpenNext.

The only active Wrangler configuration is `apps/web/wrangler.jsonc`. Run Cloudflare/OpenNext commands from `apps/web` or through the root pnpm scripts that target `@scouthub/web`.

Slice 0 keeps the OpenNext generated Worker as the runtime entrypoint. It exports `fetch` only and does not declare unused Cloudflare bindings.

Planned activation:

- R2 bindings are introduced in Slice 5 with evidence upload.
- A custom Worker entrypoint with `queue()` and `scheduled()` handlers is introduced in Slice 6.
- Cloudflare Queues and Cron Triggers remain inactive until that custom Worker exists.

Runtime variables and secrets for preview/production are supplied by Cloudflare. `DATABASE_URL` is always a secret and must not be committed or hardcoded in `wrangler.jsonc`.
