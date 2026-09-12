import { spawn } from 'node:child_process';

const port = 31_338;
const child = spawn(process.execPath, ['.next/standalone/server.js'], {
  env: { ...process.env, HOSTNAME: '127.0.0.1', PORT: String(port), NEXTAUTH_SECRET: 'smoke-only-secret' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
try {
  const response = await waitFor(`http://127.0.0.1:${port}/api/health`);
  const body = await response.json();
  if (body.status !== 'ok' || body.service !== 'pms-web') throw new Error('Unexpected frontend health payload');
  if (response.headers.get('cache-control') !== 'no-store') throw new Error('Health response must not be cached');
  console.log('Next standalone server started and health smoke test passed.');
} finally {
  child.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]);
}

async function waitFor(url) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next server exited before startup:\n${logs}`);
    try { const response = await fetch(url); if (response.ok) return response; } catch { /* startup race */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Next startup timed out:\n${logs}`);
}
