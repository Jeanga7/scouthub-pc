# Runbook — Déploiement Zero-Cost

## Objectif

Déployer ScoutHub sans serveur permanent, en gardant le chemin de production reproductible.

## Services

- GitHub repository
- Cloudflare Workers
- Cloudflare R2
- Neon PostgreSQL
- Clerk
- GitHub Actions

## Environnements

### Local
- PostgreSQL Docker
- Next.js dev
- Wrangler local bindings
- Clerk dev ou adapter test
- données synthétiques

### Production pilote
- Worker production
- Neon production project
- R2 private bucket
- Clerk production instance
- Queues/Cron

## Secrets minimum

- `DATABASE_URL`
- Clerk publishable/secret keys
- Cloudflare deploy token dans GitHub
- variables de bucket/queue via bindings
- clé de chiffrement backup si utilisée

Ne jamais stocker les secrets dans le repo.

## Première configuration

1. Créer les comptes institutionnels.
2. Activer MFA.
3. Créer Neon project.
4. Créer R2 bucket privé.
5. Créer Worker/Queues.
6. Créer Clerk application.
7. Configurer GitHub Environment `production`.
8. Définir secrets.
9. Exécuter migrations.
10. Déployer Worker.
11. Smoke test.
12. Vérifier logs.
13. Vérifier aucune donnée réelle de mineur dans seed.

## Pipeline

```text
PR
→ lint
→ typecheck
→ tests
→ clean DB migrations
→ OpenNext/Workers build

main / release
→ approval
→ backup pré-déploiement si migration sensible
→ migrate
→ deploy Wrangler
→ smoke
→ monitor
```

## Smoke tests

- `/` retourne 200 ;
- `/api/v1/health` retourne healthy ;
- route `/app` non authentifiée refuse/redirige ;
- DB query simple fonctionne ;
- R2 signed URL peut être créée dans environnement test ;
- aucun endpoint public ne retourne de PII.

## Rollback application

- conserver le dernier déploiement sain ;
- rollback Worker via Cloudflare deployment versions ;
- ne pas rollback DB destructivement sans runbook.

## Rollback DB

Préférer migrations backward-compatible.

Pour incident grave :
1. bloquer écritures si nécessaire ;
2. restaurer backup vers base temporaire ;
3. valider intégrité ;
4. basculer connection string seulement après décision ;
5. audit incident.

## Domaine

Pendant développement/pilote :
- `*.workers.dev` acceptable.

Avant diffusion institutionnelle :
- utiliser domaine officiel ;
- Cloudflare DNS/TLS ;
- définir SPF/DKIM si envoi e-mail via domaine.

## Gate production

Aucune production avec données réelles avant :
- propriétaires des comptes confirmés ;
- MFA activé ;
- policy données validée ;
- backup testé ;
- authz négatif testé ;
- privacy review ;
- incident contacts définis.
