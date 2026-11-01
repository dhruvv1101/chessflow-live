import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const viteCli = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const server = spawn(process.execPath, [viteCli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, VITE_ENGINE_API_URL: 'http://localhost:8090', VITE_ENGINE_SERVER_ENABLED: 'true' },
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
server.on('exit', (code) => { process.exitCode = code ?? 1; });
