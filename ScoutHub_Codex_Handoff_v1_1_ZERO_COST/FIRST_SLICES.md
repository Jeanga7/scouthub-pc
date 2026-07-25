# Plan des premières slices — v1.1 Zero-Cost Serverless

## Slice 0 — Foundation & Workers compatibility
**But :** repo reproductible, build Cloudflare valide, aucun serveur permanent.

Livrables :
- pnpm/Turborepo ;
- `apps/web` Next.js ;
- OpenNext/Workers ;
- Wrangler ;
- `/api/v1/health` ;
- PostgreSQL Docker local ;
- Drizzle migrations ;
- packages domain/application/infrastructure ;
- env validation ;
- CI ;
- aucun NestJS/Fastify/Redis/Kafka.

**Gate :** `pnpm build` + build Workers/OpenNext passent.

---

## Slice 0.1 — Provider ports & adapters skeleton
**But :** garantir la portabilité avant le métier.

Livrables :
- `IdentityProvider` ;
- `ObjectStorage` ;
- `AsyncQueue` ;
- repository ports ;
- fake adapters de tests ;
- dossiers Clerk/R2/Neon/Queues préparés sans couplage domaine.

**Gate :** `packages/domain` et `packages/application` n'importent aucun SDK fournisseur.

---

## Slice 1 — Organization tree
**But :** Région → District → Groupe → Unité et scopes.

Livrables :
- schema ;
- seed fictif ;
- CRUD minimal admin ;
- descendants/ancêtres ;
- audit ;
- tests de scope.

---

## Slice 2 — Identity, invitation & authorization
**But :** un adulte authentifié ne voit que ce que son rôle et son scope autorisent.

Livrables :
- Clerk adapter ;
- `Account` / `Person` séparés ;
- invitation/provisioning ;
- role assignments ScoutHub en DB ;
- policy service ;
- tests cross-group négatifs ;
- aucun usage de Clerk Organizations comme modèle scout.

---

## Slice 3 — Project draft
**But :** créer, éditer et consulter un projet dans son scope.

Livrables :
- Project ;
- ownership ;
- draft form ;
- list/detail ;
- audit events.

---

## Slice 4 — Workflow & regional review
**But :** remplacer les échanges WhatsApp par un processus traçable.

États minimum :
`DRAFT → SUBMITTED → CHANGES_REQUESTED / APPROVED → IN_PROGRESS → REPORTING → READY_TO_PUBLISH → PUBLISHED → FOLLOW_UP → CLOSED`

Livrables :
- transitions ;
- comments/review ;
- immutable history ;
- negative transition tests.

---

## Slice 5 — Evidence + R2
**But :** stocker les preuves sans proxyfier de gros fichiers par l'application.

Livrables :
- direct-to-R2 signed upload ;
- MIME/taille/checksum ;
- metadata DB ;
- ownership/visibility ;
- audit ;
- suppression contrôlée ;
- normalisation async éventuelle par Queue.

**Gate :** aucun gros binaire en PostgreSQL.

---

## Slice 6 — Async foundation
**But :** traitements fiables en environnement serverless.

Livrables :
- `outbox_event` ;
- Cron dispatcher ;
- Cloudflare Queue producer/consumer ;
- idempotency ;
- retries ;
- observability.

---

## Slice 7 — Scouts for SDGs configuration
**But :** challenges configurables/versionnés.

Livrables :
- Initiative ;
- ChallengeDefinition ;
- RequirementDefinition ;
- effective dates ;
- project challenge selection.

---

## Slice 8 — Impact follow-up
**But :** passer de l'activité à la donnée d'impact.

Livrables :
- IndicatorDefinition ;
- observations ;
- due dates ;
- exemple survie reboisement ;
- rappels Queue/Cron.

---

## Slice 9 — Report snapshot
**But :** état figé, vérifiable et publiable.

Livrables :
- report snapshot/version ;
- review status ;
- génération lourde asynchrone si nécessaire ;
- stockage R2.

---

## Slice 10 — Public impact portal
**But :** exposer uniquement des données explicitement publiables.

Livrables :
- `public_project_snapshot` ;
- project stories ;
- agrégats cachés ;
- aucune PII brute ;
- tests anti-leak.

---

## Slice 11 — Operational hardening
**But :** rendre le pilote exploitable.

Livrables :
- quota/cost dashboard/checklist ;
- Workers observability ;
- backup quotidien DB → R2 ;
- restore test ;
- rate limits ;
- security headers ;
- runbooks ;
- secret rotation ;
- production readiness checklist.

---

# Stop condition

Ne pas démarrer Membership, Assurance, Events ou Youth Programme complet avant :
1. pilote Projects & Impact utilisé ;
2. architecture SIGERAS clarifiée ;
3. décisions data/privacy institutionnelles validées.
