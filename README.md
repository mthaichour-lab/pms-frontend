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

Le chart `deploy/helm/pms-frontend` livre l'image Next.js standalone séparément
du backend, avec secrets injectés, endpoint `/api/health`, probes Kubernetes,
filesystem en lecture seule, anti-affinité et PodDisruptionBudget.
