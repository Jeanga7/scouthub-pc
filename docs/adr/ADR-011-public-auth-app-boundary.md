# ADR-011 — Public / Auth / App Boundary

## Statut

Accepté pour la fondation V1.

## Décision

ScoutHub-PC utilise un même domaine avec deux espaces explicites :

- les routes publiques sont hors de `/app` et restent consultables anonymement ;
- toutes les routes `/app/*` sont privées et exigent une identité authentifiée,
  sauf l'identité locale explicitement activée par `APP_ENV=local`.

Le layout public et le layout applicatif sont distincts mais partagent les
tokens, la typographie et l'identité de marque du design system. Le layout
public ne contient ni sidebar interne ni navigation opérationnelle.

Les futures données publiques ne liront jamais directement `Person`,
`ScoutProfile`, `Membership`, `Appointment`, `RoleAssignment`, les preuves
privées, les projets bruts ou les dossiers administratifs. Elles proviendront
uniquement de projections explicitement publiées, par exemple
`PublicProject`, `PublicArticle`, `PublicImpactMetric`, `PublicPartner` et
`PublicMedia`, via des routes `/api/public/*` ou des requêtes de projection
dédiées.

Clerk reste la source d'authentification hors local. L'identité locale et le
sélecteur de personas ne sont disponibles qu'en environnement local et ne
modifient pas la frontière de sécurité de production.

## Conséquences

Les APIs `/api/v1/*` restent privées et continuent d'appliquer leur protection
serveur. Une page publique ne peut pas rendre une API interne publique par
effet de bord.
