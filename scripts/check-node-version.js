#!/usr/bin/env node
// Ensure developer is using Node >= 18
// Allow bypass with SKIP_NODE_CHECK=true for emergency or CI compatibility
if (process.env.SKIP_NODE_CHECK === 'true') {
  console.warn('\nWARNING: SKIP_NODE_CHECK=true - skipping Node version enforcement. This may cause build/runtime errors.');
  process.exit(0);
}
const semver = (v) => v.replace(/^v/, '').split('.').map(n => parseInt(n, 10));
const [maj] = semver(process.version);
if (maj < 18) {
  console.error(`\nERROR: Node ${process.version} detected. Payroll-Jam requires Node 18 or higher (we recommend Node 20).`);
  console.error('Install via nvm:');
  console.error('  nvm install 20');
  console.error('  nvm use 20');
  console.error('\nIf you must bypass this check temporarily, run: SKIP_NODE_CHECK=true npm run build');
  process.exit(1);
}
console.log(`Node version ${process.version} OK.`);
