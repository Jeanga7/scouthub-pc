# Prompt bootstrap — Codex v1.1

Copier/coller ce prompt dans Codex après avoir placé ce dossier à la racine du repository.

```text
Tu travailles sur ScoutHub Région, plateforme numérique régionale du scoutisme.

AVANT TOUTE MODIFICATION :
1. lis AGENTS.md ;
2. lis docs/MASTER_SPEC.md, au minimum sections 16, 17, 25, 26, 27, 32, 40 ;
3. lis docs/adr/ADR-002-zero-cost-serverless-infrastructure.md.

Objectif de cette tâche : bootstrapper Phase 0 uniquement.
Ne crée aucun module métier hors scope.

ARCHITECTURE IMPOSÉE POUR LE PILOTE :
- pnpm workspaces + Turborepo
- un seul deployable `apps/web`
- Next.js full-stack
- Cloudflare Workers via OpenNext
- Wrangler
- TypeScript strict
- PostgreSQL
- Drizzle ORM + migrations explicites
- Neon prévu pour production
- PostgreSQL Docker pour local/test
- Zod
- ports/adapters obligatoires pour fournisseurs
- Cloudflare R2 via `ObjectStorage`
- Clerk via `IdentityProvider`
- Cloudflare Queues via `AsyncQueue`
- Cron Triggers pour tâches planifiées
- domaine/application sans imports Cloudflare/Clerk/Neon/R2
- CI GitHub Actions
- aucun secret commité
- fixtures uniquement fictives

INTERDIT DANS LE MVP :
- NestJS
- Fastify comme serveur séparé
- Redis
- Kafka
- Kubernetes
- microservices
- serveur/VPS permanent
- Clerk Organizations comme source de vérité des groupes/permissions scouts
- rôle métier stocké uniquement dans Clerk metadata
- activation automatique d'un service payant

STRUCTURE CIBLE :
apps/web
packages/domain
packages/application
packages/infrastructure
packages/authz
packages/contracts
packages/ui
packages/config
packages/observability
packages/test-utils
database
docs
infra

PHASE 0 À IMPLÉMENTER :
1. monorepo pnpm/Turborepo ;
2. `apps/web` Next.js exécutable ;
3. compatibilité Cloudflare/OpenNext + `wrangler.jsonc` ;
4. route publique minimale ;
5. `/app` placeholder privé sans implémenter encore le métier ;
6. `/api/v1/health` ;
7. PostgreSQL local Docker ;
8. Drizzle schema/migrations minimum ;
9. packages architecture minimum ;
10. interfaces vides/compilables :
   - IdentityProvider
   - ObjectStorage
   - AsyncQueue
   - repositories de base si utile
11. validation des variables d'environnement ;
12. lint/typecheck/unit tests/build ;
13. GitHub Actions ;
14. README de démarrage local ;
15. aucune dépendance provider dans domain/application.

AVANT DE CODER :
- résume les décisions pertinentes de la spec ;
- propose l'arborescence/fichiers ;
- liste seulement les ambiguïtés réellement bloquantes ;
- donne les critères d'acceptation de Phase 0.

APRÈS CODAGE :
- exécute lint ;
- typecheck ;
- tests ;
- build Next.js/OpenNext pour Workers ;
- vérifie les migrations depuis une DB propre ;
- documente les commandes ;
- résume les fichiers créés ;
- vérifie qu'aucun service payant n'a été activé ;
- ne marque pas terminé si un gate échoue.

Ne commence pas Slice 1 dans cette tâche.
```
