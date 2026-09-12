import { readFile, readdir } from 'node:fs/promises';

const app = new URL('../../src/app/', import.meta.url);
const policy = await readFile(new URL('../../src/auth/navigation-access.ts', import.meta.url), 'utf8');
const managedRoutes = new Set([...policy.matchAll(/^\s*'([^']+)':\s*\[/gm)].map((match) => match[1]));
const entries = await readdir(app, { withFileTypes: true });
const publicRoutes = new Set(['/', '/forbidden']);
const pages = ['/'];
for (const entry of entries) {
  if (!entry.isDirectory() || entry.name === 'api') continue;
  const children = await readdir(new URL(`${entry.name}/`, app));
  if (children.includes('page.tsx')) pages.push(`/${entry.name}`);
}
const unclassified = pages.filter((route) => !publicRoutes.has(route) && !managedRoutes.has(route));
if (unclassified.length) {
  console.error(`Business pages missing a role classification: ${unclassified.join(', ')}`);
  process.exitCode = 1;
} else console.log(`Page access coverage: ${pages.length - publicRoutes.size}/${pages.length - publicRoutes.size} business pages classified.`);
