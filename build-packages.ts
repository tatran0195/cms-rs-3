import { spawnSync } from 'child_process';

const packages = [
  'cli',
  'design-system',
  'email',
  'i18n',
  'logger',
  'shared',
  'storage',
  'validators',
];

console.log('Building all packages with tsdown (powered by rolldown)...');
const start = performance.now();

for (const pkg of packages) {
  console.log(`\n📦 Building @cms/${pkg}...`);
  const res = spawnSync('bun', ['run', '--bun', 'tsdown'], {
    cwd: `packages/${pkg}`,
    stdio: 'inherit',
    env: process.env,
  });
  if (res.status !== 0) {
    console.error(`❌ Build failed for @cms/${pkg}`);
    process.exit(res.status || 1);
  }
}

const duration = ((performance.now() - start) / 1000).toFixed(2);
console.log(`\n✨ All packages built successfully in ${duration}s!`);
