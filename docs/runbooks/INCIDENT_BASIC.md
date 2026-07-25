# Runbook — Incident Basic

## Priorités

1. protéger les personnes ;
2. stopper la fuite/corruption ;
3. préserver les preuves ;
4. restaurer le service ;
5. documenter ;
6. notifier les responsables appropriés.

## Catégories

- disponibilité ;
- auth/compte ;
- fuite de données ;
- suppression/corruption ;
- upload malveillant ;
- coût/quota ;
- intégration externe.

## Actions immédiates

### Fuite de données suspectée
- désactiver route/feature concernée ;
- révoquer sessions/tokens si nécessaire ;
- conserver logs ;
- ne pas copier de données sensibles dans tickets publics ;
- notifier responsable données/Safe from Harm selon nature ;
- analyser scope.

### Compte admin compromis
- révoquer sessions Clerk ;
- désactiver `account` ScoutHub ;
- rotation secrets si nécessaire ;
- audit role assignments/actions.

### Quota free-tier atteint
- identifier ressource ;
- désactiver fonction non critique si nécessaire ;
- ne pas basculer automatiquement sur plan payant ;
- Product Owner décide upgrade/optimisation.

## Postmortem

Pour incident sérieux :
- timeline ;
- impact ;
- cause racine ;
- données concernées ;
- correction ;
- tests ajoutés ;
- action préventive ;
- propriétaire/date.
