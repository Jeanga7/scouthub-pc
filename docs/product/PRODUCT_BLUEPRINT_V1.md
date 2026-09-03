# ScoutHub-PC — Product Blueprint V1

**Statut :** proposition de référence produit · **Périmètre :** Région Scoute Petite Côte

## 1. Vision et principes

ScoutHub-PC est la plateforme numérique de fonctionnement de la Région Scoute Petite Côte. Elle digitalise l’administration régionale dans le respect de la hiérarchie scoute, améliore les remontées d’information, coordonne districts et groupes, suit membres, responsables et formations, instruit projets et camps, consolide statistiques et reporting, et fournit un calendrier, des communications et une vitrine publique premium. La plateforme est mobile-first, quotidienne pour les responsables et conçue pour valoriser l’impact régional auprès des partenaires.

La région Petite Côte est le seul périmètre produit V1. Les données de démonstration restent fictives et aucune règle ne doit dépendre d’un nombre fixe de districts.

## 2. Organisation et maîtrises

La hiérarchie cible est : **Région → Districts → Groupes → Annexes éventuelles → Unités / branches**. Les unités actuelles sont Jaune, Verte et Rouge, mais branches et types doivent rester administrables. Le domaine conserve les contraintes : REGION contient DISTRICT, DISTRICT contient GROUP, GROUP contient ANNEX ou UNIT, ANNEX contient UNIT. Une Annexe reste rattachée à son Groupe principal et sous la responsabilité du Chef de Groupe ; elle n’est pas un niveau hiérarchique.

Chaque niveau peut avoir une équipe : Commissaire régional, titulaires, adjoints et conseillers ; responsables de district, coordonnateurs de branches/secteurs et adjoints ; Chef de Groupe, assistants, Chefs d’Unité et assistants. La maîtrise de groupe désigne cette équipe et n’ajoute aucun niveau à l’arbre.

## 3. Personnes, comptes et Scout ID

`Person` représente un individu scout ; `Account` est un moyen de connexion facultatif. La cardinalité cible est **Person 1 — 0..1 Account** par contexte de connexion. Un mineur peut donc être membre sans compte.

Chaque personne reçoit un Scout ID régional permanent, par exemple `PC-00001234`, indépendant du numéro d’assurance annuel. Le profil conserve Scout ID, identité, naissance, sexe, contacts/adresse nécessaires, structure et unité actuelles, statut, assurance annuelle, fonctions et historiques de fonctions/structures, formations, progression et informations administratives utiles. Les données de mineurs sont sensibles : droits de pilotage et accès aux données personnelles sont distincts.

## 4. Fonctions et nominations

Le modèle cible est **Person → Appointment → Position → Scope → Status → dates de validité**. Une personne peut cumuler plusieurs fonctions, par exemple Chef de Groupe X et Coordonnateur Vert du District Y. Une nomination conserve fonction, structure/périmètre, titulaire ou adjoint, proposant, validateur, début, fin, statut et historique.

Le catalogue de `Position` est configurable : commissaires régionaux et de branche, Ressources Adultes, conseillers, commissaires/coordonnateurs de district, Chef et assistant Chef de Groupe, Chef et assistant Chef d’Unité. Chaque position porte niveau, secteur, branche éventuelle, statut titulaire/adjoint, permissions et autorité de validation. Les titres ne sont pas une enum rigide.

Un Chef de Groupe peut affecter librement les responsables de son groupe. Au-dessus du groupe, la nomination exige la validation hiérarchique correspondante. Les permissions découlent des fonctions actives ; elles ne sont pas saisies personne par personne et une usurpation doit être impossible.

## 5. Autorisation

ScoutHub applique un RBAC scopé par périmètre : **fonction active → permissions → scope → descendants autorisés**. Un Chef de Groupe gère son groupe, ses unités et annexes, ses membres, activités, camps et projets. Un Commissaire de District voit son district et ses groupes, consulte les statistiques, coordonne le calendrier et instruit les dossiers de camp. La Région consolide, supervise, communique et administre la structure.

Masquer un lien dans l’UI n’est jamais une autorisation. Toute règle critique reste vérifiée côté serveur avec rôle, scope, relation, état de la ressource et sensibilité des données.

## 6. Dossiers administratifs, camps et projets

Un moteur conceptuel `AdministrativeCase` (non implémenté dans cette PR) pourra porter camps, projets, devoirs Badge de Bois et futures demandes. Un dossier de camp de Groupe est déposé au moins deux mois avant, examiné par le District, remonté à la Région pour information, puis validé ou renvoyé avec modifications au Groupe. Un camp de District suit District → Région → validation/modifications → District.

Un dossier contient dates, lieu, responsables, participants, dossier et pièces, commentaires, historique et décision. Les projets prioritaires sont le projet Programme Jeune/partenariat (instruction Programme Jeune) et le devoir Badge de Bois (Ressources Adultes). Le modèle `Project/Review/Evidence` actuel est conservé et étendu progressivement ; le type de dossier choisit le workflow compétent.

## 7. Ressources adultes et passeport

Le futur passeport du responsable regroupera niveau de formation, stages/camps structurés, qualifications, fonctions exercées, devoir Badge de Bois, projet exécuté, validation finale et historique. Ce module n’est pas développé dans cette PR.

## 8. Campagnes de remontée

`Campaign` est un module générique : par exemple « État nominatif 2027 », destiné à tous les groupes, avec membres, responsables, branches, assurance, formations et champs administratifs. Le Groupe complète, le District suit/commente et la Région agrège. Le même moteur servira états nominatifs, statistiques annuelles, rapport annuel, inventaires, besoins de formation et enquêtes.

## 9. Calendrier et communication

Un événement Groupe est visible au Groupe, au District et à la Région selon les règles ; un événement District au District et à la Région ; un événement régional selon son audience. Une évolution détectera les conflits avec événements de groupe/district/région et échéances administratives.

La communication fournit annonces, notifications, rappels, calendrier, commentaires contextuels, documents et audiences ciblées (Région, district, groupe, branche, fonction, équipe régionale ou utilisateurs). Elle ne cherche pas à reproduire WhatsApp.

## 10. Documents et partenaires

Le module documentaire transversal reste simple : stockage d’objets, métadonnées, catégories, permissions et versions simples pour circulaires/modèles régionaux, rapports de district et documents administratifs/camps de groupe. Il ne devient pas un clone de Google Drive.

Le futur domaine Partenaire portera organisation, contacts, domaine d’intervention, projets soutenus, conventions, dons, financements et historique.

## 11. Protection et classification

Les données générales suivent l’accès hiérarchique normal ; les données personnelles de mineurs ont un accès restreint ; les données médicales éventuelles sont très restreintes. Les futurs incidents Safe from Harm seront compartimentés. Aucun module d’incident n’est créé dans cette PR.

## 12. Vitrine publique

La vitrine sera dynamique et administrable, avec une direction originale ScoutHub/Petite Côte : blanc dominant, bleu profond, compositions éditoriales, photographies fortes, formes géométriques, cartes d’actions, chiffres d’impact, partenaires, CTA sobres. Sections : Hero, Région, domaines d’action, chiffres clés, projets terrain, impact, actualités, partenaires, appel à partenariat et contact.

Une publication suit la boucle **Projet interne → exécution → Evidence → validation → candidat à publication → validation Communication/Région → page publique**. Les projections publiques ne lisent jamais les dossiers internes bruts.

## 13. Architecture de l’information

Sur mobile : **Aujourd’hui · Membres · + · Calendrier · Plus**. Le bouton `+` est contextuel aux permissions. Sur desktop : Aujourd’hui, puis Pilotage (Structure, Membres, Statistiques), Activité (Calendrier, Activités/Camps, Projets), Gestion (Campagnes, Communications, Documents, Formations), Administration (Fonctions & nominations, Accès, Configuration). Les entrées sont filtrées par capacité sans remplacer l’autorisation serveur.

« Aujourd’hui » est un centre d’actions contextualisé au rôle et au scope : actions à traiter, échéances, projets/camps incomplets, nominations à valider, prochains événements et statistiques de contexte. Ce n’est pas un mur de graphiques.

## 14. Périmètre

**V1 :** structure, membres/Scout ID, fonctions/nominations, dashboards hiérarchiques, projets, Evidence, reviews, camps principaux, calendrier, campagnes essentielles, communications simples, statistiques principales, vitrine publique dynamique et design system premium.

**V1.1 :** formations avancées, documents enrichis, partenaires, reporting avancé et automatisations.

**V2 :** parents, fonctions jeunes enrichies, Safe from Harm dédié, recommandations, analytics avancés et intégrations externes.

## 15. Roadmap visible sur 14 jours

| Jours | Slice | Valeur utilisateur | Backend / frontend / tests | Definition of Done |
|---|---|---|---|---|
| 1–2 | Modèle membres & Scout ID | retrouver une personne durablement | Person/ID, recherche mobile, tests de confidentialité | création, recherche et isolation validées |
| 3–4 | Structure & nominations | voir qui est responsable de quoi | positions/appointments, arbre et affectation | validation hiérarchique et négatifs d’accès |
| 5 | Aujourd’hui | savoir quoi traiter maintenant | agrégats existants, cartes d’actions | contenu contextualisé par persona |
| 6–7 | Projets & Evidence V1 | instruire et prouver une action | extensions Project/Review, cartes/timeline | cycle complet avec tests d’autorisation |
| 8–9 | Camps / dossiers | déposer et suivre un camp | première verticale AdministrativeCase | dépôt, commentaires, décision, historique |
| 10 | Calendrier | coordonner les échéances | événements et scopes, calendrier responsive | visibilité hiérarchique testée |
| 11 | Campagne nominative | remonter des informations fiables | Campaign et progression | Groupe → District → Région démontré |
| 12 | Communications simples | informer la bonne audience | annonces/audiences, inbox légère | ciblage et absence de fuite validés |
| 13 | Vitrine dynamique | montrer l’impact publiable | projection publique, pages éditoriales | publication approuvée uniquement |
| 14 | Stabilisation & accessibilité | utiliser V1 tous les jours | responsive, performance, observabilité | smoke mobile/desktop, gates verts |

Chaque slice apporte une interaction visible ; l’infrastructure ne précède pas indéfiniment la valeur produit.

## 16. Écarts avec l’existant et migration

L’existant fournit déjà Organization hiérarchique, Account/Person, RoleAssignment scopé, Project, Review, Evidence, Outbox et providers. On les conserve comme primitives compatibles. `Appointment/Position`, Scout ID, Campaign, AdministrativeCase, calendrier, communications, projections publiques et partenaires sont des extensions graduelles. RoleAssignment reste l’autorité pendant la transition ; il ne sera pas remplacé en big-bang.

Les migrations suivront expand → backfill contrôlé → double lecture/écriture si nécessaire → contract. Les données actuelles restent lisibles ; chaque évolution sera précédée d’un ADR et de tests d’autorisation. Aucun changement DB n’est requis par cette PR.
