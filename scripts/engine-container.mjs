import { spawnSync } from 'node:child_process';

const action = process.argv[2];
const name = 'chessflow-engine';
const image = 'chessflow-engine:latest';

function docker(args, { capture = false } = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', windowsHide: true });
  if (result.error) throw new Error(`Docker is unavailable: ${result.error.message}`);
  return result;
}

function dockerChecked(args) {
  const result = docker(args);
  if (result.status !== 0) throw new Error(`Docker ${args[0]} failed with exit code ${result.status}.`);
  return result;
}

function ensureDocker() {
  const result = docker(['info', '--format', '{{.ServerVersion}}'], { capture: true });
  if (result.status !== 0) throw new Error('Docker is installed but its engine is not reachable. Start Docker Desktop, then retry.');
}

async function waitForHealth() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://localhost:8090/health', { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch { /* container is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Container started but /health did not become ready within 30 seconds. Check with: npm run engine:logs');
}

try {
  if (action === 'build') {
    dockerChecked(['build', '--tag', image, './server']);
  } else if (action === 'start') {
    ensureDocker();
    const existing = docker(['inspect', '--format', '{{.State.Running}}', name], { capture: true });
    if (existing.status === 0) {
      if (existing.stdout.trim() === 'true') console.log(`Container ${name} is already running.`);
      else dockerChecked(['start', name]);
    } else {
      dockerChecked(['run', '--detach', '--rm', '--name', name, '--publish', '8090:8080', '--env', 'ALLOWED_ORIGINS=http://localhost:5173', '--env', 'GEMINI_API_KEY', image]);
    }
    await waitForHealth();
  } else if (action === 'stop') {
    ensureDocker();
    const existing = docker(['inspect', '--format', '{{.State.Running}}', name], { capture: true });
    if (existing.status !== 0) console.log(`Container ${name} is not running.`);
    else if (existing.stdout.trim() === 'true') dockerChecked(['stop', name]);
    else console.log(`Container ${name} is already stopped.`);
  } else if (action === 'logs') {
    ensureDocker();
    dockerChecked(['logs', '--follow', name]);
  } else if (action === 'check') {
    const started = performance.now();
    try {
      const response = await fetch('http://localhost:8090/health', { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      console.log(`Engine: ${body.engine}\nThreads: ${body.threads}\nHash: ${body.hash_mb} MB\nResponse time: ${Math.round(performance.now() - started)} ms`);
    } catch {
      console.error('Engine server not running at http://localhost:8090. Start it with: npm run engine:start');
      process.exitCode = 1;
    }
  } else {
    throw new Error('Use build, start, stop, logs, or check.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
