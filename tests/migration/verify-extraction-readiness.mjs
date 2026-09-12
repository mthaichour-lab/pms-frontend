import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const frontendRoot = resolve(import.meta.dirname, "..", "..");
const backendRoot = resolve(
  process.env["PMS_BACKEND_CONTEXT"] ?? join(frontendRoot, "..", "pms-backend"),
);
const failures = [];

for (const [name, root] of [
  ["frontend", frontendRoot],
  ["backend", backendRoot],
]) {
  for (const file of await runtimeFiles(root)) {
    const content = await readFile(file, "utf8");
    const forbiddenReferences = [
      {
        label: "legacy workspace path",
        pattern: new RegExp(
          `(?:[a-z]:|\\.\\.)[\\\\/][^\\n"']*${["pms", "platform"].join("-")}`,
          "i",
        ),
      },
      {
        label: "Helm deployment path",
        pattern: new RegExp(["deploy", "helm"].join("[\\\\/]"), "i"),
      },
      {
        label: ["kube", "ctl command"].join(""),
        pattern: new RegExp(`\\b${["kube", "ctl"].join("")}\\b`, "i"),
      },
      {
        label: "Kubernetes API",
        pattern: new RegExp(`${["apiVersion:", "apps/v1"].join("\\s*")}`, "i"),
      },
      {
        label: "Nx workspace",
        pattern: new RegExp(`\\b${["nx", "json"].join("\\.")}\\b`, "i"),
      },
    ];
    for (const forbidden of forbiddenReferences) {
      if (forbidden.pattern.test(content))
        failures.push(
          `${name} runtime reference ${forbidden.label}: ${relative(root, file)}`,
        );
    }
  }
}

const frontendCi = await readFile(
  join(frontendRoot, ".github/workflows/ci.yml"),
  "utf8",
);
const backendCi = await readFile(
  join(backendRoot, ".github/workflows/ci.yml"),
  "utf8",
);
for (const [label, content, markers] of [
  [
    "frontend CI",
    frontendCi,
    ["sdk:verify-provenance", "frontend-e2e", "pms-backend/compose.local.yaml"],
  ],
  [
    "backend CI",
    backendCi,
    ["e2e:real", "compose.e2e.yaml", "database:verify-seeds"],
  ],
])
  for (const marker of markers)
    if (!content.includes(marker)) failures.push(`${label} missing ${marker}`);

if (failures.length)
  throw new Error(`Extraction readiness failed:\n${failures.join("\n")}`);
console.log(
  "Extraction readiness passed: no legacy runtime references and both real-integration gates are wired.",
);

async function runtimeFiles(root) {
  const files = [];
  await visit(root);
  return files;
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (
        entry.isDirectory() &&
        [
          ".git",
          ".next",
          "node_modules",
          "graphify-out",
          "docs",
          "coverage",
          "dist",
        ].includes(entry.name)
      )
        continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (isRuntimeFile(path)) files.push(path);
    }
  }
}

function isRuntimeFile(path) {
  return (
    [".js", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".yaml", ".yml"].includes(
      extname(path),
    ) || ["Dockerfile", "package.json"].includes(path.split(/[\\/]/).at(-1))
  );
}
