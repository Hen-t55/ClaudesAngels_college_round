import { build } from 'esbuild';

await build({
  entryPoints: ['src/content/index.ts'],
  bundle: true,
  outfile: 'dist/content.js',
  format: 'iife',
  target: 'chrome116',
  logLevel: 'info',
});

await build({
  entryPoints: ['src/background/index.ts'],
  bundle: true,
  outfile: 'dist/background.js',
  format: 'iife',
  target: 'chrome116',
  logLevel: 'info',
});

console.log('✓ content.js and background.js built');
