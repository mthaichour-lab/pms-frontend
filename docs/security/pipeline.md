# Chaîne de confiance CI du frontend

La CI analyse le TypeScript avec CodeQL, audite les dépendances de production,
détecte les secrets et erreurs de configuration avec Trivy, puis construit une
seule image Docker immuable identifiée par le SHA Git.

Le bundle promu contient l'image exportée, son SHA-256, son SBOM SPDX JSON, le
rapport Trivy et une signature Sigstore keyless liée au workflow GitHub. Cette
image doit être importée et déployée telle quelle, sans reconstruction dans les
environnements aval.
