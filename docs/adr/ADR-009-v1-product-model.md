# ADR-009 — V1 product model and progressive evolution

Status: Proposed  
Date: 2026-09-03

## Context

Le blueprint V1 étend ScoutHub-PC à la gestion quotidienne de la Région Petite Côte : membres et Scout ID, fonctions, nominations, camps, campagnes, calendrier, communications et vitrine publique. Le système actuel possède déjà Organization, Account/Person, RoleAssignment, Project/Review, Evidence et Outbox.

## Decision

Conserver ces primitives et leur sécurité : l’organisation reste un arbre matérialisé ; Person et Account restent distincts ; RoleAssignment reste l’autorité d’accès pendant la transition ; Project/Review/Evidence et l’Outbox restent compatibles. Introduire progressivement `ScoutId`, `Position`, `Appointment`, `AdministrativeCase`, `Campaign`, événements calendrier, communications, documents et projections publiques, chacun derrière un port/use-case et avec tests de scope.

Les titres de fonction et branches sont configurables, non des enums rigides. Les permissions sont dérivées des appointments actifs, mais une période de compatibilité peut projeter les appointments vers les RoleAssignments existants. Une `AppointmentPolicy` future empêchera l’auto-validation et les nominations hors scope ; une `ProjectRoutingPolicy` future orientera Badge de Bois vers Ressources Adultes et les autres projets selon nature, configuration, scope et secteur. Les dossiers spécialisés réutilisent les invariants Project/Review/Evidence au lieu d’un big-bang rewrite.

Une Annexe est un nœud organisationnel enfant d’un Groupe avec une capacité opérationnelle proche d’un Groupe, mais sans autorité territoriale autonome. Les équipes et maîtrises sont attachées aux structures ou unités concernées et ne deviennent jamais des nœuds de l’arbre.

Les données publiques sont des snapshots explicitement publiables ; elles ne lisent jamais les enregistrements internes bruts. Les données de mineurs, médicales et Safe from Harm sont classifiées et séparées.

## Migration and compatibility

La stratégie est expand → backfill contrôlé → double lecture/écriture → contract, avec migrations réversibles autant que possible. Les UUID et identifiants existants restent valides. Aucun changement de schéma n’est livré par cette PR ; chaque nouvelle table ou contrainte aura sa migration et son ADR dédié si nécessaire.

## Consequences

Le produit peut livrer une valeur visible à chaque slice, sans déplacer les règles dans l’UI ni casser les données actuelles. Le coût est une période de projection entre Appointment et RoleAssignment, qui devra être observée et retirée seulement après migration complète.
