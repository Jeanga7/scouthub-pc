# ScoutHub Région — Codex Handoff v1.1
## Zero-Cost Serverless Pivot

Ce dossier est la source de départ recommandée pour lancer ScoutHub avec Codex.

> Architecture pilote : **Next.js + Cloudflare Workers/OpenNext + Neon PostgreSQL + Cloudflare R2 + Clerk + Cloudflare Queues/Cron**.

NestJS/Fastify ont été retirés du MVP afin de ne pas imposer un serveur Node permanent ni une dépense d'hébergement dès le pilote.

---

## 1. Avant toute ligne de code

1. Lire `AGENTS.md`.
2. Lire `docs/MASTER_SPEC.md`, surtout les sections 16, 17, 25, 26, 27, 32 et 40.
3. Lire `docs/adr/ADR-002-zero-cost-serverless-infrastructure.md`.
4. Ne jamais utiliser de vraies données personnelles de mineurs pendant le développement.
5. Ne jamais activer un service payant sans décision explicite du Product Owner.

---

## 2. Architecture du pilote

```text
Internet
   │
Cloudflare
   │
Next.js / Workers
   │
   ├── public routes
   ├── /app private console
   └── /api/v1
        │
        ├── Clerk → identité uniquement
        ├── Neon PostgreSQL → métier / permissions / audit
        ├── R2 → preuves / documents
        └── Queues + Cron → async / rappels
```

### Principe important

**Clerk ne gère pas notre hiérarchie scout.**

Région, District, Groupe, Unité, rôles, mandats et scopes sont des données ScoutHub dans PostgreSQL.

---

## 3. Structure cible du repo

```text
scouthub/
├── apps/
│   └── web/
├── packages/
│   ├── domain/
│   ├── application/
│   ├── infrastructure/
│   ├── authz/
│   ├── contracts/
│   ├── ui/
│   ├── config/
│   ├── observability/
│   └── test-utils/
├── database/
├── docs/
├── infra/
├── AGENTS.md
├── wrangler.jsonc
├── docker-compose.yml
├── pnpm-workspace.yaml
└── turbo.json
```

---

## 4. Ordre de construction

0. Foundation + Workers compatibility.
1. Infrastructure adapters.
2. Organization tree.
3. Identity/invitation/authorization.
4. Project draft.
5. Workflow & regional review.
6. Evidence + direct R2 uploads.
7. Scouts for SDGs configuration.
8. Impact follow-up.
9. Report snapshot.
10. Public impact portal.
11. Hardening / backups / quotas / runbooks.

Ne démarrer Membership/Assurance qu'après décision sur la coexistence avec SIGERAS.

---

## 5. Stack cible

- pnpm + Turborepo
- Node.js 24 LTS pour le toolchain
- TypeScript strict
- Next.js 16.x supporté
- Cloudflare Workers + OpenNext
- Wrangler
- PostgreSQL
- Neon en production
- PostgreSQL Docker en local/test
- Drizzle ORM
- Zod
- Cloudflare R2
- Clerk pour identité/session
- Cloudflare Queues
- Cloudflare Cron Triggers
- Vitest
- Playwright
- GitHub Actions

Toujours utiliser des versions patchées/supportées au jour du bootstrap.

---

## 6. Budget pilote

Objectif : **$0/mois** d'infrastructure au lancement.

Les free tiers sont des contraintes opérationnelles, pas des SLA. Le premier upgrade acceptable est typiquement Workers Paid si l'usage réel le justifie ; ne complexifiez pas l'architecture pour éviter quelques dollars lorsque la plateforme a démontré sa valeur.

Voir :
- `docs/runbooks/COST_GUARDRAILS.md`
- `docs/runbooks/DEPLOYMENT_ZERO_COST.md`
- `docs/runbooks/BACKUP_RESTORE.md`

---

## 7. Première commande à donner à Codex

Copier/coller le contenu de :

`PROMPT_BOOTSTRAP_CODEX.md`

Le bootstrap doit rester **Phase 0 uniquement**.

---

## 8. Principe de pilotage

Le premier démonstrateur doit prouver :

**portabilité + permissions + workflow + audit + coût contrôlé**

et non la quantité de fonctionnalités.
