import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const backendRoot = resolve(projectRoot, "../pms-backend");
const composeProject = "pms-frontend-e2e";
const isDown = process.argv[2] === "down";
const environment = {
  ...process.env,
  // The frontend context cannot be reliably expressed with shell syntax on
  // both Windows and Unix. Compose needs an absolute host path to build and
  // mount the real BFF integration probe.
  PMS_FRONTEND_CONTEXT: process.env.PMS_FRONTEND_CONTEXT ?? projectRoot,
  // This value is only used by the local E2E Compose project. A caller may
  // override it, while production deployments still require their own secret.
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? "pms-local-e2e-session-secret",
  // Keep the disposable E2E stack independent from a developer's local PMS
  // instance or database. These host ports are not used for service-to-service
  // traffic inside Compose.
  POSTGRES_PORT: process.env.POSTGRES_PORT ?? "55432",
  RABBITMQ_PORT: process.env.RABBITMQ_PORT ?? "55672",
  RABBITMQ_MANAGEMENT_PORT: process.env.RABBITMQ_MANAGEMENT_PORT ?? "55673",
  KEYCLOAK_PORT: process.env.KEYCLOAK_PORT ?? "58080",
  PMS_API_PORT: process.env.PMS_API_PORT ?? "53001",
  PMS_BACKEND_IMAGE: "pms-backend:frontend-e2e",
};
const composeArguments = [
  "compose",
  "--project-name", composeProject,
  "--project-directory", backendRoot,
  "--env-file", resolve(backendRoot, ".env.local"),
  "-f", resolve(backendRoot, "compose.yaml"),
  "-f", resolve(backendRoot, "compose.local.yaml"),
  "-f", resolve(projectRoot, "compose.e2e.yaml"),
  "--profile", "local-seed",
  ...(isDown
    ? ["down", "--volumes", "--remove-orphans"]
    : ["up", "--build", "--abort-on-container-exit", "--exit-code-from", "frontend-e2e", "frontend-e2e"]),
];

const result = spawnSync(process.platform === "win32" ? "docker.exe" : "docker", composeArguments, {
  cwd: projectRoot,
  env: environment,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
