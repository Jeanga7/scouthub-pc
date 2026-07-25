# Hosting & Data Boundaries — Security Note

## Trust boundaries

### Cloudflare
Trafic, Worker, R2, Queues, logs.

### Neon
Données transactionnelles PostgreSQL.

### Clerk
Identité/session des utilisateurs adultes.

### GitHub
Code, CI/CD, secrets de déploiement protégés.

Aucun fournisseur unique ne doit être la seule source de vérité de toutes les dimensions.

## Data minimization

- fichiers binaires → R2 ;
- metadata/permissions → PostgreSQL ;
- identité auth → Clerk ;
- roles/scopes → PostgreSQL ;
- public content → snapshots approuvés.

## Public/private boundary

Une route publique :
- ne query pas `person` directement ;
- ne retourne pas `membership` ;
- ne retourne pas contacts ;
- ne retourne pas données de mineurs ;
- consomme `public_project_snapshot` et agrégats publics.

## Provider identifiers

Stocker uniquement des identifiants externes opaques :
- `clerk_user_id` via table/link appropriée ;
- object keys R2 ;
- external integration ids.

Ne jamais rendre un ID fournisseur nécessaire aux règles métier.

## Logs

Les logs Cloudflare ne doivent pas inclure PII sensibles.
Utiliser IDs opaques et request IDs.

## Signed URLs

- durée courte ;
- scope minimal ;
- upload key générée serveur ;
- validation après upload ;
- téléchargement privé signé ;
- jamais rendre bucket privé public.

## Future national scale

Avant expansion nationale :
- réévaluer transferts internationaux de données ;
- contrats/DPA ;
- exigences OSN ;
- data residency ;
- SLA ;
- accès support fournisseurs ;
- comptes institutionnels.
