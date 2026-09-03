# ScoutHub-PC — Design System V1

## Direction

Mobile-first, blanc dominant, bleu profond comme marque, surfaces gris très légères, typographie nette et institutionnelle. Le scoutisme est présent par la confiance, le terrain et des accents sobres, jamais par une esthétique enfantine. Les interfaces privilégient hiérarchie, lisibilité, accessibilité WCAG, états explicites et actions atteignables au pouce.

## Tokens

- **Couleurs :** `brand.950 #071A33`, `brand.800 #123B68`, `brand.600 #1769AA`, `brand.100 #E8F2FA`, `surface #FFFFFF`, `canvas #F6F8FB`, `border #DCE4EC`, `text #102033`, `muted #5E6D7E`, `success #19764A`, `warning #B06A00`, `danger #B42318`.
- **Typographie :** `typography.fontFamily.ui` est une system sans ; `fontSize` expose metadata `0.75rem`, body `1rem`, lead `1.125rem`, title `1.75rem`, display `3.5rem` ; `fontWeight` va de 400 à 700 ; `lineHeight` expose tight 1.15, normal 1.5, relaxed 1.6 ; letter spacing tight -0.02em, normal 0, wide 0.04em. Jamais de texte uniquement en capitales.
- **Espacement :** échelle 4, 8, 12, 16, 24, 32, 48, 64 px.
- **Rayons :** 6 px contrôles, 10 px cartes, 16 px panneaux, 999 px pills/avatar.
- **Ombres :** `0 1px 2px #1020330D`, `0 8px 24px #10203312`, réservées aux éléments en élévation.
- **Breakpoints :** 0–639 mobile, 640–1023 tablette, 1024+ desktop ; contenu max 1200 px.
- **Z-index :** base 0, sticky 10, topbar 20, sheet 30, modal 40, toast 50.
- **Motion :** 120–180 ms ease-out pour feedback ; 240 ms pour sheets ; respecter `prefers-reduced-motion`.
- **Focus et contrôles :** `focus.ringColor #1769AA`, largeur 3 px, offset 2 px ; `control.minTouchSize 44px`.

## Composants cibles

Button, IconButton, Input, Select, Textarea, Search, Card, StatCard, StatusBadge, Avatar, MemberCard, ProjectCard, ActivityCard, Timeline, Tabs, BottomNav, Sidebar, Topbar, Sheet, Modal, Toast, EmptyState, Skeleton, DataTable, MobileList, Calendar, FileUploader et CommandPalette.

Chaque composant doit exposer focus visible, nom accessible, état disabled/loading/error/empty pertinent et variantes limitées. Les actions destructives demandent confirmation et restent autorisées côté serveur.

## Responsive et contenu

Le mobile est conçu en premier. Un tableau desktop ne doit jamais être simplement compressé : il devient `MobileList` ou des cartes selon le contexte. Les formulaires sont en une colonne, les actions principales dans la zone du pouce, la navigation mobile utilise `BottomNav`, le desktop une `Sidebar` et une `Topbar`, les overlays deviennent `Sheet` sur petit écran. Touch targets : minimum 44 × 44 px. Les états loading, erreur et vide sont obligatoires ; aucun JSON ou stack trace ne doit apparaître dans le parcours normal.

## Fondation d’implémentation

Les tokens sont exportés par `@scouthub/ui` comme valeurs typées réutilisables. Les applications peuvent les projeter en CSS variables sans imposer de framework visuel. Cette PR ne remplace pas les écrans existants ; elle établit les valeurs et conventions compatibles pour les prochaines slices.
