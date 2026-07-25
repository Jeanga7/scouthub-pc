# Runbook — Cost Guardrails

## Objectif

Maintenir le pilote à **$0/mois** tant que cela ne dégrade pas la fiabilité, puis permettre un upgrade maîtrisé.

## Règle n°1

**Codex ne peut pas activer une dépense.**

Tout service payant ou upgrade exige :
- raison ;
- coût estimé ;
- propriétaire budgétaire ;
- alternative ;
- date de revue ;
- validation Product Owner.

## Tableau mensuel

| Ressource | Seuil attention | Seuil décision |
|---|---:|---:|
| Workers requests | 70% quota | 85% |
| Workers CPU errors | premiers incidents | récurrents |
| Neon storage | 70% | 85% |
| Neon CU-hours | 70% | 85% |
| Neon egress | 70% | 85% |
| R2 storage | 70% | 85% |
| R2 Class A/B | 70% | 85% |
| Clerk MRU | 70% | 85% |
| Queue ops | 70% | 85% |

## Avant de payer : optimisations autorisées

### Workers
- cache ;
- réduire rendu dynamique ;
- déplacer travail en Queue ;
- réduire logs inutiles ;
- optimiser requêtes.

### R2
- compression WebP/AVIF ;
- limite dimension photo ;
- déduplication hash ;
- lifecycle ;
- purge selon politique.

### Neon
- index adaptés ;
- pagination ;
- projection ;
- éviter requêtes N+1 ;
- pré-calcul agrégats publics.

### Clerk
- comptes adultes uniquement ;
- Person != Account ;
- ne pas créer compte pour chaque jeune.

## Quand payer plutôt qu'optimiser

Payer est préférable si :
- la plateforme est réellement adoptée ;
- une limite free provoque incidents ;
- le coût est faible et prévisible ;
- l'optimisation introduirait une architecture fragile.

Premier exemple acceptable :
- Workers Paid ~ $5/mois au tarif actuel.

## Budget report mensuel

Conserver :
- service ;
- plan ;
- usage ;
- coût ;
- projection 3 mois ;
- action.

Même si coût = $0, le rapport doit exister.
