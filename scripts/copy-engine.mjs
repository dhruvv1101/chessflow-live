import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const engineNames = ['stockfish-19-lite-single', 'stockfish-19-single', 'stockfish-19'];
const source = join(root, 'node_modules', 'stockfish', 'bin');
const target = join(root, 'public', 'engine');
mkdirSync(target, { recursive: true });
for (const engineName of engineNames) {
  for (const extension of ['js', 'wasm']) {
    copyFileSync(join(source, `${engineName}.${extension}`), join(target, `${engineName}.${extension}`));
  }
}
copyFileSync(join(root, 'node_modules', 'stockfish', 'Copying.txt'), join(root, 'NOTICE-STOCKFISH-LICENSE.txt'));
console.log(`Copied Stockfish Lite and Full single/multi-thread builds and its GPL license.`);
