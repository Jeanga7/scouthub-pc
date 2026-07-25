# ScoutHub Region

Plateforme numerique regionale du scoutisme. Ce depot est bootstrappe pour la
Phase 0 uniquement : fondation monorepo, Next.js full-stack, Cloudflare Workers
via OpenNext, PostgreSQL local, Drizzle et packages d'architecture minimaux.

## Prerequis

- Node.js 24 recommande pour respecter la specification cible.
- pnpm 10.34.4.
- Docker pour PostgreSQL local.

Le runtime local actuel peut utiliser Node.js >= 20.19, mais la CI cible Node 24.

## Demarrage local

```bash
make install
make db-up
make migrate
make dev
```

La base locale ecoute sur `localhost:5433` pour eviter les conflits avec une
installation PostgreSQL existante.

Routes Phase 0 :

- `http://localhost:3000/`
- `http://localhost:3000/app`
- `http://localhost:3000/api/v1/health`

## Gates

```bash
make lint
make typecheck
make test
make build
make build-workers
make migrate
```

Commande complete de verification locale :

```bash
make ci
```

## Variables d'environnement

Copier les valeurs fictives de `.env.example` dans un fichier local non commite
si necessaire. Aucun secret reel ne doit etre commite.

## Infrastructure

Local/test utilise PostgreSQL Docker. La production vise Neon PostgreSQL,
Cloudflare Workers, R2, Queues/Cron et Clerk, toujours derriere des
ports/adapters. Les fichiers `wrangler.jsonc` declarent les bindings attendus,
mais aucune ressource cloud ni service payant n'est cree automatiquement.
