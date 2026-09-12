import { access, readFile } from "node:fs/promises";

const failures = [];
try {
  await access(".next/standalone/server.js");
} catch {
  failures.push("missing Next standalone server");
}
const dockerfile = await readFile("Dockerfile", "utf8");
for (const fragment of [
  "COPY vendor/bank-pms-api-client-1.0.0.tgz",
  "/workspace/.next/standalone",
  "USER pms",
]) {
  if (!dockerfile.includes(fragment))
    failures.push(`Dockerfile control: ${fragment}`);
}
const compose = await readFile("compose.yaml", "utf8");
for (const fragment of [
  "read_only: true",
  "no-new-privileges:true",
  "cap_drop:",
  "healthcheck:",
  "init: true",
  "external: true",
]) {
  if (!compose.includes(fragment))
    failures.push(`frontend Docker Compose control: ${fragment}`);
}
const composeEnvironment = await readFile(".env.compose.example", "utf8");
for (const name of [
  "NEXTAUTH_URL=",
  "NEXTAUTH_SECRET=",
  "OIDC_ISSUER=",
  "OIDC_CLIENT_ID=",
  "CORE_API_URL=",
]) {
  if (!composeEnvironment.includes(name))
    failures.push(`missing frontend environment contract: ${name}`);
}
const localCompose = await readFile("compose.local.yaml", "utf8");
for (const fragment of [
  "NEXTAUTH_URL: http://localhost:",
  "OIDC_ISSUER: http://localhost:",
  "CORE_API_URL: http://api:3001",
  "localhost:host-gateway",
]) {
  if (!localCompose.includes(fragment))
    failures.push(`frontend local Compose control: ${fragment}`);
}
const e2eCompose = await readFile("compose.e2e.yaml", "utf8");
for (const fragment of [
  "frontend-e2e:",
  "condition: service_healthy",
  "no-new-privileges:true",
  "cap_drop:",
  "real-bff-integration.mjs",
]) {
  if (!e2eCompose.includes(fragment))
    failures.push(`frontend E2E Compose control: ${fragment}`);
}
const realE2e = await readFile("tests/e2e/real-bff-integration.mjs", "utf8");
for (const fragment of [
  "next-auth/jwt",
  "OIDC_TOKEN_URL",
  "/api/core/reference-data/currencies/DZD",
  "frontend.e2e.real_bff.passed",
]) {
  if (!realE2e.includes(fragment))
    failures.push(`frontend real integration proof: ${fragment}`);
}
const sdkManifest = JSON.parse(await readFile("vendor/manifest.json", "utf8"));
for (const name of ["artifactSha256", "contractSha256"]) {
  if (!/^[0-9a-f]{64}$/.test(sdkManifest[name] ?? ""))
    failures.push(`invalid SDK provenance digest: ${name}`);
}
if (failures.length) {
  console.error(
    `Frontend runtime verification failed:\n${failures.join("\n")}`,
  );
  process.exitCode = 1;
} else
  console.log(
    "Next standalone artifact and Docker Compose security controls verified.",
  );
