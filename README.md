# ScoutHub-PC

Plateforme numerique regionale du scoutisme. Ce depot est bootstrappe pour la
Slice 2 ajoute l'identite Clerk, le modele Account/Person, les invitations
adultes et l'autorisation ScoutHub portee par PostgreSQL.

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
- `http://localhost:3000/app/admin/access`
- `http://localhost:3000/sign-in`
- `http://localhost:3000/sign-up`
- `http://localhost:3000/api/v1/health`
- `GET /api/v1/me`
- `POST/GET /api/v1/invitations`
- `POST /api/v1/invitations/:id/revoke`
- `POST/GET /api/v1/role-assignments`
- `POST /api/v1/role-assignments/:id/revoke`
- `POST /api/v1/organizations`
- `GET/PATCH /api/v1/organizations/:id`
- `POST /api/v1/organizations/:id/activate`
- `POST /api/v1/organizations/:id/move`
- `GET /api/v1/organizations/:id/children`
- `GET /api/v1/organizations/:id/ancestors`
- `GET /api/v1/organizations/:id/descendants`

Les routes `/app/*` et les APIs internes utilisent maintenant Clerk pour
l'authentification et les RoleAssignments ScoutHub en PostgreSQL pour
l'autorisation. Le bootstrap initial d'un RegionalAdmin se fait uniquement par
CLI, pas par endpoint public.

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

Clerk doit etre configure manuellement en mode restricted/invitation-only. Voir
`docs/runbooks/CLERK_SETUP.md` et `docs/runbooks/IDENTITY_BOOTSTRAP.md`.

## Infrastructure

Local/test utilise PostgreSQL Docker. La production vise Neon PostgreSQL,
Cloudflare Workers, R2, Queues/Cron et Clerk, toujours derriere des
ports/adapters. La seule configuration Wrangler active est
`apps/web/wrangler.jsonc`; elle ne declare pas encore R2, Queues ou Cron.
Aucune ressource cloud ni service payant n'est cree automatiquement.

## Seed fictif

`make db-seed-dev` applique uniquement des donnees synthetiques locales :
deux tenants fictifs, un chemin avec district et un chemin sans district. La
commande exige `APP_ENV=local` ou `APP_ENV=test`. En `local`, elle refuse une
`DATABASE_URL` distante afin d'eviter tout seed accidentel hors PostgreSQL local.

## Decisions Slice 1

- `TEAM` est reserve et non creatable.
- Le path materialise est textuel et base sur les UUIDs.
- Aucun endpoint `DELETE` ni politique d'archivage n'est invente.
- L'audit `audit_event` est append-only et ecrit dans la meme transaction que
  les mutations Organization.
