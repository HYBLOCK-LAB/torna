import { readFileSync, writeFileSync } from 'node:fs';

// Generated interface only; never exports bytecode, keys, addresses or transaction signatures.
const source = new URL('../out/Torna.sol/Torna.json', import.meta.url);
const destination = new URL('../../../shared/abi/Torna.json', import.meta.url);
const artifact = JSON.parse(readFileSync(source, 'utf8'));
if (!Array.isArray(artifact.abi)) throw new Error('Compile Torna before exporting its ABI');
const output = `${JSON.stringify(artifact.abi, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (readFileSync(destination, 'utf8') !== output) {
    throw new Error('Stale Torna ABI: run corepack pnpm --filter @torna/contracts export:abi');
  }
  console.log('Shared Torna ABI matches the compiled artifact.');
} else {
  writeFileSync(destination, output);
  console.log('Exported shared/abi/Torna.json from the compiled Torna artifact.');
}
