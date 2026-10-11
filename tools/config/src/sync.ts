import { loadConfig, syncPackageNames } from './index.ts';

function main(): void {
  const changed = syncPackageNames(loadConfig());
  if (changed.length === 0) {
    console.log('Package names already match config.yaml.');
    return;
  }
  for (const file of changed) console.log(`updated ${file}`);
  console.log('Run npm install to refresh package-lock.json.');
}

if (import.meta.main) main();
