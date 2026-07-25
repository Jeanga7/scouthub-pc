# ScoutHub Region

Plateforme numerique regionale du scoutisme. Ce depot est bootstrappe pour la
Slice 1 ajoute le modele Organization Tree : tenant NSO, region, district
optionnel, groupe, unite, hierarchy path, audit et administration locale de
demonstration.

## Prerequis

- Node.js 24.
- pnpm 10.34.4.
- Docker pour PostgreSQL local.

Le depot fournit `.node-version` et `.nvmrc` avec la valeur `24`.

## Demarrage local

```bash
make install
make db-up
make migrate
make db-seed-dev
make dev
```

La base locale ecoute sur `localhost:5433` pour eviter les conflits avec une
installation PostgreSQL existante.

Routes principales :

- `http://localhost:3000/`
- `http://localhost:3000/app`
- `http://localhost:3000/app/organizations`
- `http://localhost:3000/api/v1/health`
- `POST /api/v1/organizations/root`
- `POST /api/v1/organizations`
- `GET/PATCH /api/v1/organizations/:id`
- `POST /api/v1/organizations/:id/activate`
- `POST /api/v1/organizations/:id/move`
- `GET /api/v1/organizations/:id/children`
- `GET /api/v1/organizations/:id/ancestors`
- `GET /api/v1/organizations/:id/descendants`

La console locale Organization exige :

```bash
APP_ENV=local
ENABLE_DEV_ADMIN=true
```

En `preview` et `production`, le dev-admin est refuse meme si le flag vaut
`true`. Slice 2 remplacera ce mecanisme par authentification et policies.

## Gates

```bash
make lint
make typecheck
make test
make test-integration
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

Conventions :

- `local` : `.env` ou `.env.development` non commite, PostgreSQL Docker.
- `test` : variables CI et PostgreSQL ephemere.
- `preview` : variables runtime Cloudflare, donnees fictives uniquement.
- `production` : variables/secrets Cloudflare proteges, `DATABASE_URL` secret.

## Infrastructure

Local/test utilise PostgreSQL Docker. La production vise Neon PostgreSQL,
Cloudflare Workers, R2, Queues/Cron et Clerk, toujours derriere des
ports/adapters. La seule configuration Wrangler active est
`apps/web/wrangler.jsonc`; elle ne declare pas encore R2, Queues ou Cron.
Aucune ressource cloud ni service payant n'est cree automatiquement.

## Seed fictif

`make db-seed-dev` applique uniquement des donnees synthetiques locales :
deux tenants fictifs, un chemin avec district et un chemin sans district. La
commande refuse `preview` et `production`.

## Decisions Slice 1

- `TEAM` est reserve et non creatable.
- Le path materialise est textuel et base sur les UUIDs.
- Aucun endpoint `DELETE` ni politique d'archivage n'est invente.
- L'audit `audit_event` est append-only et ecrit dans la meme transaction que
  les mutations Organization.
