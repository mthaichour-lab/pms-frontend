# pms-frontend

Frontend PMS Next.js : interface, BFF, session Keycloak, design system et SDK
TypeScript généré depuis le contrat publié par `pms-backend`.

Le navigateur ne conserve aucun access token et n'exécute aucune règle
financière faisant autorité.

Ce dépôt est initialisé de manière additive depuis le workspace transitoire
`pms-platform`; le retrait de `apps/web` interviendra après validation E2E.

Le BFF consomme `@bank/pms-api-client` comme artefact versionné. Pour la
migration locale, le tarball contrôlé est placé sous `vendor/`; la cible CI
utilise le registre privé configuré par `.npmrc.example`.

`pnpm run sdk:verify-provenance` compare la version, le contrat OpenAPI et le
SHA-256 du tarball avec un paquet fraîchement généré dans le dépôt backend
voisin. La CI bloque donc tout client embarqué obsolète ou non traçable.

`pnpm run migration:verify-readiness` inspecte les fichiers exécutables et les
configurations des deux dépôts. Il bloque toute référence résiduelle au
monorepo, à Nx ou à Kubernetes et exige les scénarios d'intégration réels des
deux pipelines.

Le fichier `compose.yaml` livre l'image Next.js standalone séparément du
backend. Il rejoint le réseau Docker `pms-network`, injecte les secrets depuis
`.env.compose`, expose `/api/health` et exécute le conteneur en lecture seule,
sans privilèges ni capabilities Linux. Démarrer d'abord le Compose backend,
puis exécuter `docker compose up -d --build` dans ce dépôt.

En local, copier `.env.local.example` vers `.env.local`, remplacer le secret,
puis lancer le frontend après le profil local du backend :

```sh
docker compose --env-file .env.local -f compose.yaml -f compose.local.yaml up -d --build
```

Le scénario d'intégration complet démarre le backend voisin, Keycloak,
PostgreSQL et le frontend. Il injecte dans une session BFF un jeton réellement
signé par Keycloak puis vérifie la lecture PostgreSQL à travers Next.js et l'API :

```sh
cp ../pms-backend/.env.local.example ../pms-backend/.env.local
cp ../pms-backend/.env.compose.example ../pms-backend/.env.compose
pnpm run e2e:real
pnpm run e2e:real:down
```

Le script injecte le contexte frontend et un secret de session reserve au test.
Il utilise le projet Compose `pms-frontend-e2e`, son propre reseau et ses propres
volumes. Il couvre les catalogues, les creations client/produit/pool, la
souscription avec depot et solde, une simulation de taux, puis le financement,
l'activation et l'allocation d'un actif de recette et le refus d'une
sur-allocation. Les donnees de recette necessaires sont inserees uniquement
dans la base isolee de cette pile. Le journal
d'allocation etant immuable, lancer `e2e:real:down` avant une nouvelle recette
complete ; cette commande supprime uniquement la pile de recette.
