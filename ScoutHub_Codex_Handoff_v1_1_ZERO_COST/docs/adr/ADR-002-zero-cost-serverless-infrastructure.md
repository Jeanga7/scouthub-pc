# ADR-002 — Zero-Cost Serverless Infrastructure

- **Status:** Accepted for pilot
- **Date:** 2026-07-25
- **Owners:** Product Owner + Technical Lead
- **Decision scope:** Pilot / Projects & Impact MVP

## Context

La région ne dispose pas actuellement d'un budget récurrent suffisant pour exploiter un VPS, un cluster ou plusieurs services payants. ScoutHub doit néanmoins :
- rester accessible publiquement ;
- stocker des données relationnelles ;
- gérer des fichiers/preuves ;
- assurer authentification et permissions ;
- supporter des traitements asynchrones ;
- évoluer sans réécriture majeure.

Le besoin réel du pilote est modéré et irrégulier. Une infrastructure allumée 24/7 serait donc économiquement inefficace.

## Decision

Le pilote utilise :

| Besoin | Choix |
|---|---|
| Full-stack | Next.js |
| Runtime | Cloudflare Workers via OpenNext |
| Base | Neon PostgreSQL |
| ORM | Drizzle |
| Fichiers | Cloudflare R2 |
| Identité | Clerk |
| Autorisation | ScoutHub PostgreSQL + policy engine |
| Async | Cloudflare Queues |
| Schedules | Cloudflare Cron Triggers |
| CI/CD | GitHub Actions + Wrangler |
| Local DB | PostgreSQL Docker |
| Observability | Cloudflare Workers Logs/Traces |

Objectif économique : **$0/mois au pilote**, hors domaine éventuel.

## Important constraints

1. Clerk est un fournisseur d'identité, pas le modèle d'organisation ScoutHub.
2. Le domaine ne dépend pas de Cloudflare/Clerk/Neon/R2.
3. Les fichiers sont uploadés directement vers R2.
4. Les traitements lourds ne s'exécutent pas dans la requête utilisateur.
5. Les migrations DB sont exécutées depuis CI/deployment.
6. Les tâches fiables utilisent outbox + Queue + idempotence.
7. Les pages publiques consomment uniquement des snapshots explicitement publiables.
8. Aucun service payant n'est activé sans approbation Product Owner.

## Current free-tier assumptions

Référence : 25 juillet 2026. Les fournisseurs peuvent modifier leurs conditions.

### Cloudflare Workers
- Free plan disponible ;
- 100 000 requêtes/jour ;
- CPU Free limité ;
- Workers Paid commence actuellement autour de $5/mois.

### R2
- 10 GB-month gratuits ;
- 1M Class A/mois ;
- 10M Class B/mois ;
- egress Internet gratuit.

### Queues
- 10 000 opérations/jour sur Free ;
- rétention Free 24 h.

### Neon
- 0,5 GB par projet Free ;
- 50 CU-hours/mois/projet ;
- 5 GB egress/mois.

### Clerk
- jusqu'à 50 000 MRU/app sur Hobby au tarif actuel.

## Consequences

### Positive
- pas de serveur à administrer ;
- coût initial quasi nul ;
- scalabilité graduelle ;
- PostgreSQL conservé ;
- déploiement rapide ;
- bon fit avec usage associatif irrégulier.

### Negative / Risks
- limites CPU du Workers Free ;
- free tiers sans SLA institutionnel fort ;
- plusieurs fournisseurs ;
- restauration/backup à mettre en place ;
- besoin de vigilance sur compatibilité Node/Workers ;
- risque de vendor lock-in si adapters mal respectés.

## Mitigations
- ports/adapters ;
- monitoring quotas ;
- cache public ;
- queue async ;
- compression images ;
- tests build Workers ;
- backups DB indépendants ;
- exports de données documentés ;
- upgrade payant contrôlé plutôt que hack.

## Rejected alternatives

### VPS gratuit / auto-hébergement
Rejeté pour production : disponibilité, patching, sécurité, backups, panne électrique/Internet.

### Render Free
Rejeté comme fondation de production : contraintes free-tier et dépendance à une instance serveur.

### Supabase-only
Bonne alternative, mais l'architecture choisit des services séparés et PostgreSQL portable. Peut être reconsidéré.

### Cloudflare D1
Rejeté pour le cœur transactionnel : SQLite semantics et ambition relationnelle/évolutive.

### NestJS/Fastify server permanent
Rejeté pour le MVP : impose un runtime serveur permanent ou une couche supplémentaire.

### Kubernetes / microservices
Hors proportion.

## Exit strategy

ScoutHub doit pouvoir migrer :
- Neon → autre PostgreSQL ;
- R2 → S3/MinIO ;
- Clerk → autre IdP ;
- Workers → Node/container.

La migration ne doit pas modifier les règles métier.

## Review triggers

Revoir cet ADR si :
- Workers Free limite régulièrement l'application ;
- Neon Free > 80 % stockage/compute ;
- R2 > 80 % stockage free ;
- besoin SLA institutionnel ;
- ouverture nationale ;
- exigences de résidence/souveraineté des données ;
- incident fournisseur ;
- coûts cumulés dépassent une alternative plus simple.
