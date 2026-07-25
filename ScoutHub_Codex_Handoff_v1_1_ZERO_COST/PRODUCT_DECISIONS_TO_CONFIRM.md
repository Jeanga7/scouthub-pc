# Décisions institutionnelles à confirmer avant production réelle
## v1.1 — avec infrastructure pilote proposée

Ces points doivent être validés par le Commissariat/OSN et ne doivent pas être inventés par Codex.

## A. Produit et gouvernance
1. Nom officiel de la plateforme.
2. Propriétaire institutionnel du produit, du domaine et des comptes cloud.
3. Région pilote, districts/groupes pilotes et responsables habilités.
4. Rôles officiels et délégations de validation.
5. Processus d'onboarding/offboarding des responsables.
6. Conditions d'ouverture à d'autres régions puis au niveau national.

## B. Données et protection
7. Règles d'accès aux données des membres et des mineurs.
8. Base légale/notices/consentements applicables.
9. Durées de conservation.
10. Politique photo/vidéo.
11. Statistiques autorisées à être publiques.
12. Processus de correction/export/suppression.
13. Autorité responsable des incidents Safe from Harm.
14. Données réellement nécessaires aux listes nominatives et assurances.

## C. Interopérabilité
15. Place de SIGERAS :
   - source de vérité ;
   - coexistence ;
   - import/export ;
   - API éventuelle ;
   - migration future.
16. Règles nationales Scouts for SDGs / badges physiques.
17. Intégrations World Scouting autorisées officiellement.

## D. Infrastructure — proposition par défaut

### Décision technique proposée pour le pilote
- Cloudflare Workers + OpenNext ;
- Next.js ;
- Neon PostgreSQL ;
- Cloudflare R2 ;
- Clerk pour identité/session uniquement ;
- Cloudflare Queues + Cron ;
- GitHub Actions.

Cette proposition peut être utilisée pour développement/pilote technique, mais avant production avec vraies données il faut confirmer :

18. Quel compte Cloudflare institutionnel possède le Worker, R2 et le DNS ?
19. Quel compte Neon institutionnel possède la base ?
20. Quel compte Clerk institutionnel possède l'application ?
21. Quel GitHub Organization/repository est propriétaire du code ?
22. Qui détient les recovery codes / MFA / accès d'urgence ?
23. Quel domaine officiel sera utilisé ?
24. Qui reçoit les alertes de quotas/coûts ?
25. Quel responsable peut autoriser le passage d'un free tier à un plan payant ?
26. Quelle politique de sauvegarde/restauration est officiellement acceptée ?
27. Où conserver les secrets de récupération et clés de chiffrement de backup ?

## E. Règles budgétaires proposées
28. Budget pilote cible : $0/mois hors domaine.
29. Aucun add-on payant automatique.
30. Premier upgrade acceptable : Workers Paid si limites CPU/requêtes affectent le service.
31. Toute dépense récurrente doit avoir :
   - propriétaire ;
   - motif ;
   - plafond ;
   - date de revue ;
   - procédure d'arrêt/migration.

## F. UX
32. Langue V1 : français.
33. Langues futures éventuelles.
34. Niveau d'accessibilité cible.
35. Politique de fonctionnement sur faible connectivité.

Tant qu'une décision n'est pas validée :
- la traiter comme configuration/feature flag ;
- utiliser données fictives ;
- ou exclure le flux de la production.
