import { readFileSync } from 'node:fs';

const read = file => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const { dependencies } = read('package.json');
const packages = read('package-lock.json').packages;
const runtime = read('deploy/runtime/package.json');
const lock = read('deploy/runtime/package-lock.json').packages;
if (Object.keys(dependencies).length !== Object.keys(runtime.dependencies).length) throw Error('Runtime dependency list mismatch');
for (const name of Object.keys(dependencies)) {
  const required = packages['node_modules/' + name].version;
  if (runtime.dependencies[name] !== required || lock['node_modules/' + name].version !== required) {
    throw Error(`Runtime dependency pin mismatch: ${name}`);
  }
}
for (const bad of ['drizzle-kit', 'vite', 'vitest']) {
  if (lock['node_modules/' + bad]) throw Error(`Unexpected tool in runtime tree: ${bad}`);
}
