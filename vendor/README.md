# SDK backend versionné

Le tarball présent dans ce répertoire simule localement l'artefact publié par
`pms-backend`. Il est généré depuis OpenAPI, empaqueté par le backend et consommé
comme paquet immuable — aucune source ou DTO backend n'est copié dans le
frontend.

En CI bancaire, la dépendance `@bank/pms-api-client@1.0.0` sera récupérée depuis
le registre privé. Le tarball local sera retiré après mise à disposition du
registre.
