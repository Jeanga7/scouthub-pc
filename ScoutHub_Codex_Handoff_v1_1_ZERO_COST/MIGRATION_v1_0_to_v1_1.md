# Migration documentaire — v1.0 → v1.1 Zero-Cost Serverless

## Objectif

Remplacer l'architecture `Next.js + NestJS/Fastify + serveur permanent` par une architecture pilote serverless et quasi gratuite.

## Fichiers à remplacer à la racine

Remplacer :
- `AGENTS.md`
- `README_START_HERE.md`
- `PROMPT_BOOTSTRAP_CODEX.md`
- `FIRST_SLICES.md`
- `PRODUCT_DECISIONS_TO_CONFIRM.md`

## Fichier maître

Remplacer :
- `docs/MASTER_SPEC.md`

## Nouveaux fichiers à ajouter

### ADR
- `docs/adr/ADR-002-zero-cost-serverless-infrastructure.md`
- remplacer `docs/adr/README.md`

### Runbooks
- `docs/runbooks/DEPLOYMENT_ZERO_COST.md`
- `docs/runbooks/BACKUP_RESTORE.md`
- `docs/runbooks/COST_GUARDRAILS.md`
- `docs/runbooks/INCIDENT_BASIC.md`
- `docs/runbooks/SECRETS_ROTATION.md`
- remplacer `docs/runbooks/README.md`

### Security
- `docs/security/HOSTING_DATA_BOUNDARIES.md`
- remplacer `docs/security/README.md`

## Changements d'architecture majeurs

### Supprimé du MVP
- `apps/console`
- `apps/portal`
- `apps/api`
- NestJS
- Fastify comme API séparée
- `pg-boss`
- serveur Node permanent

### Nouveau
- `apps/web` unique
- Next.js full-stack
- Cloudflare Workers/OpenNext
- Neon PostgreSQL
- R2
- Clerk identity-only
- Queues + Cron
- transactional outbox
- adapters fournisseurs
- cost guardrails

## Ce qui ne change pas

- monolithe modulaire ;
- PostgreSQL ;
- Drizzle ;
- TypeScript strict ;
- RBAC + scopes + contexte ;
- Person ≠ Account ;
- comptes adultes MVP ;
- protections données mineurs ;
- Projects & Impact comme wedge ;
- trajectoire Membership/Administration plus tard ;
- interopérabilité SIGERAS/World Scouting.

## Action recommandée

Si aucun code n'a encore été écrit :
1. supprimer l'ancien handoff ;
2. copier intégralement le dossier v1.1 ;
3. créer le repo ;
4. lancer Codex avec `PROMPT_BOOTSTRAP_CODEX.md`.

Si du code v1.0 existe déjà :
1. ne pas écraser aveuglément ;
2. comparer architecture ;
3. créer une branche `architecture/zero-cost-serverless`;
4. migrer slice par slice ;
5. supprimer NestJS/Fastify uniquement après validation des routes et tests.
