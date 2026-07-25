# Runbook — Secrets Rotation

## Secrets concernés

- Cloudflare API token
- Neon credentials / DATABASE_URL
- Clerk secret key
- backup encryption key
- notification provider secrets futurs

## Principes

- least privilege ;
- environnements séparés ;
- aucun secret dans repo/logs ;
- rotation après départ d'un administrateur ;
- rotation après suspicion d'exposition ;
- accès d'urgence documenté.

## Rotation

1. créer nouveau secret ;
2. configurer en parallèle si fournisseur le permet ;
3. déployer ;
4. smoke test ;
5. révoquer ancien ;
6. vérifier logs ;
7. audit event/documentation.

## Emergency

Si secret exposé publiquement :
- considérer compromis ;
- révoquer immédiatement ;
- ne pas simplement supprimer le commit ;
- rechercher usages ;
- analyser logs/actions ;
- documenter incident.
