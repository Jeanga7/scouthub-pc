# ScoutHub-PC

Plateforme numérique de pilotage du scoutisme régional. Le pilote local présente les organisations, projets, validations et preuves avec des données entièrement fictives.

## Prerequis

- Node.js 24.
- pnpm 10.34.4.
- Docker pour PostgreSQL local.

Le depot fournit `.node-version` et `.nvmrc` avec la valeur `24`.

## Démarrage local rapide

```bash
make install
cp .env.example .env
make demo-setup
make dev
```

Ouvrir **http://localhost:3000** puis « Accéder à ScoutHub ». Trois personas seedés sont disponibles : Administratrice régionale (organisations et administration), Responsable de groupe (projets, soumission et Evidence), et Reviewer régional (file de validation et décisions).

Le navigateur ne fournit qu’un identifiant opaque dans un cookie HttpOnly SameSite=Lax. Account, Person, rôle, permissions, tenant et périmètre sont toujours résolus depuis PostgreSQL. Ce mode est strictement limité à `APP_ENV=local`.

Démarrage manuel équivalent :

```bash
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

Hors local, les routes privées utilisent Clerk pour l’identité et les RoleAssignments PostgreSQL pour l’autorisation. Le bootstrap initial d’un RegionalAdmin reste exclusivement disponible par CLI.

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

En local, Clerk et R2 peuvent rester vides : le provider d’identité local et le LocalObjectStorage same-origin sont sélectionnés. Preview, staging et production exigent Clerk et R2 et échouent fermés si la configuration manque. Voir
`docs/runbooks/CLERK_SETUP.md` et `docs/runbooks/IDENTITY_BOOTSTRAP.md`.

## Infrastructure

Local/test utilise PostgreSQL Docker. La production vise Neon PostgreSQL,
Cloudflare Workers, R2, Queues/Cron et Clerk, toujours derriere des
ports/adapters. La seule configuration Wrangler active est
`apps/web/wrangler.jsonc`; elle ne declare pas encore R2, Queues ou Cron.
Aucune ressource cloud ni service payant n'est cree automatiquement.

## Seed fictif

`make db-seed-dev` applique uniquement des données synthétiques locales :
deux tenants fictifs, une hiérarchie Petite Côte, trois personas adultes, trois projets (`DRAFT`, `READY_FOR_REVIEW`, `APPROVED_FOR_EXECUTION`) et un historique de revue. La
commande exige `APP_ENV=local` ou `APP_ENV=test`. En `local`, elle refuse une
`DATABASE_URL` distante afin d'eviter tout seed accidentel hors PostgreSQL local.

## Decisions Slice 1

- `TEAM` est reserve et non creatable.
- Le path materialise est textuel et base sur les UUIDs.
- Aucun endpoint `DELETE` ni politique d'archivage n'est invente.
- L'audit `audit_event` est append-only et ecrit dans la meme transaction que
  les mutations Organization.
