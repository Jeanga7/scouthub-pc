# Architecture Decision Records

Les ADR documentent les décisions techniques structurantes.

## Actifs

- `ADR-002-zero-cost-serverless-infrastructure.md` — architecture pilote Cloudflare/Neon/R2/Clerk.
- Les autres décisions synthétiques sont listées dans `../MASTER_SPEC.md`, section 32.

## Règle

Créer un ADR séparé lorsqu'une décision :
- modifie le runtime ;
- ajoute une dépense récurrente ;
- introduit un nouveau fournisseur critique ;
- change la base de données ;
- change le modèle d'identité/autorisation ;
- introduit un microservice ;
- modifie une frontière de sécurité.
