import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Foundry 1.5.1 requires an absolute root for nested-repository dependency installs.
const root = fileURLToPath(new URL('..', import.meta.url));
const result = spawnSync('forge', [
  'install', '--no-git', '--shallow', '--root', root,
  'foundry-rs/forge-std@v1.9.7',
  'OpenZeppelin/openzeppelin-contracts@v5.4.0',
], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
