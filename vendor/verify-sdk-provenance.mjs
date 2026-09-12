import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const frontendRoot = resolve(import.meta.dirname, "..");
const backendRoot = resolve(
  process.env["PMS_BACKEND_CONTEXT"] ??
    resolve(frontendRoot, "..", "pms-backend"),
);
const manifest = JSON.parse(
  await readFile(resolve(frontendRoot, "vendor/manifest.json"), "utf8"),
);
const backendPackage = JSON.parse(
  await readFile(
    resolve(backendRoot, "packages/pms-api-client/package.json"),
    "utf8",
  ),
);
const checks = [
  ["package", manifest.package, backendPackage.name],
  ["version", manifest.version, backendPackage.version],
  [
    "artifact SHA-256",
    manifest.artifactSha256,
    await sha256(
      resolve(backendRoot, `bank-pms-api-client-${manifest.version}.tgz`),
    ),
  ],
  [
    "vendored artifact SHA-256",
    manifest.artifactSha256,
    await sha256(
      resolve(
        frontendRoot,
        `vendor/bank-pms-api-client-${manifest.version}.tgz`,
      ),
    ),
  ],
  [
    "OpenAPI contract SHA-256",
    manifest.contractSha256,
    await sha256(resolve(backendRoot, manifest.sourceContract)),
  ],
];
const failures = checks
  .filter(([, expected, actual]) => expected !== actual)
  .map(
    ([name, expected, actual]) =>
      `${name}: expected ${expected}, received ${actual}`,
  );
if (failures.length)
  throw new Error(
    `SDK provenance verification failed:\n${failures.join("\n")}`,
  );
console.log(
  `SDK ${manifest.package}@${manifest.version} matches the backend artifact and OpenAPI provenance.`,
);

async function sha256(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}
