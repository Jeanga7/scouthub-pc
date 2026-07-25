# Local Infrastructure

Phase 0 uses only PostgreSQL in Docker for local development and tests.

```bash
docker compose up -d postgres
pnpm db:migrate
```

No remote provider is required for local bootstrap.
