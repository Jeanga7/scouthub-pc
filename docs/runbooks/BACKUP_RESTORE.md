# Runbook — Backup & Restore

## Objectifs pilote

- RPO cible : 24 h
- RTO cible : 4 h
- restauration testée au moins mensuellement

## PostgreSQL

### Backup quotidien proposé

GitHub Actions scheduled workflow :
1. récupère `DATABASE_URL` depuis GitHub Environment ;
2. exécute `pg_dump --format=custom` ;
3. calcule SHA-256 ;
4. chiffre l'archive ;
5. upload vers bucket R2 privé `backups/database/YYYY/MM/DD/` ;
6. écrit un manifest ;
7. supprime les archives dépassant la rétention autorisée ;
8. alerte en cas d'échec.

### Rétention pilote

- 7 backups quotidiens
- 4 backups hebdomadaires

Adapter selon politique de données.

## Restoration test

1. créer base Neon temporaire ou PostgreSQL local isolé ;
2. télécharger backup ;
3. vérifier checksum ;
4. déchiffrer ;
5. `pg_restore` ;
6. exécuter migrations/readiness checks ;
7. vérifier tables critiques ;
8. détruire environnement de test ;
9. documenter résultat.

Ne jamais restaurer une base contenant de vraies données sensibles sur un poste non autorisé.

## R2

Pour chaque objet important, DB conserve :
- object key ;
- checksum ;
- MIME ;
- size ;
- owner/scope ;
- status.

Les objets publics doivent être dérivés de contenus autorisés et séparables des originaux privés.

## Incident : suppression accidentelle

1. suspendre purge automatique ;
2. vérifier soft-delete/status DB ;
3. rechercher version/backup disponible ;
4. restaurer avec nouvelle key si nécessaire ;
5. journaliser l'action ;
6. notifier Data Officer si données personnelles concernées.

## Backup secrets

- secrets uniquement dans GitHub Environment/protected store ;
- accès minimal ;
- rotation périodique ;
- clé de chiffrement séparée du bucket ;
- ne jamais écrire la DB URL dans les logs.

## Validation mensuelle

- dernier backup réussi ?
- taille plausible ?
- checksum ?
- restoration test récent ?
- quota R2 ?
- secret encore valide ?
